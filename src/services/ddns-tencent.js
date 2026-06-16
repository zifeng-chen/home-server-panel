// DDNS - 腾讯云 DNSPod 解析服务
const https = require('https');
const crypto = require('crypto');

const sqliteService = require('./sqlite-service');

let _dbService = null;
function _getDb() {
  if (!_dbService) _dbService = require('./db-service');
  return _dbService;
}
function _syncMySQL(table) {
  const db = _getDb();
  if (db.mode === 'mysql') setImmediate(() => db.syncTable(table).catch(() => {}));
}

const DNSPOD_HOST = 'dnspod.tencentcloudapi.com';
const DNSPOD_VERSION = '2021-03-23';

class DdnsTencentService {
  constructor() {
    this.config = this._loadConfig();
  }

  // 读取凭证（.env 优先，SQLite settings 降级）
  _getCredentials() {
    return sqliteService.getTencentCredentials();
  }

  _loadConfig() {
    // 迁移旧配置：如果存在 ddns_tencent_config 旧格式，迁移到 ddns_config 表
    const legacyRaw = sqliteService._getSetting('ddns_tencent_config');
    if (legacyRaw) {
      try {
        const legacy = typeof legacyRaw === 'string' ? JSON.parse(legacyRaw) : legacyRaw;
        const domains = legacy.domains || [];
        if (domains.length > 0) {
          let migrated = 0;
          for (const d of domains) {
            // 检查是否已存在于 ddns_config 表
            const existing = sqliteService.getDdnsDomains('tencent');
            const exists = existing.some(e => e.name === d.name && e.subdomain === (d.subdomain || '@') && e.recordType === (d.recordType || 'A'));
            if (!exists) {
              sqliteService.addDdnsDomain({
                name: d.name,
                subdomain: d.subdomain || '@',
                recordType: d.recordType || 'A',
                ttl: d.ttl || 600,
                provider: 'tencent'
              });
              migrated++;
            }
          }
          console.log(`[DDNS-Tencent] 已将 ${migrated} 条域名从旧配置迁移到统一 ddns_config 表`);
        }
        // 清除旧配置
        sqliteService._setSetting('ddns_tencent_config', '');
      } catch (e) {
        console.warn('[DDNS-Tencent] 迁移旧配置失败:', e.message);
      }
    }

    // 从统一的 ddns_config 表读取 provider='tencent' 的记录
    const domains = sqliteService.getDdnsDomains('tencent');
    const lastRefresh = sqliteService.getDdnsLastRefresh();
    return { domains, lastRefresh };
  }

  _saveConfig(config) {
    this.config = config || this.config;
    sqliteService.setDdnsDomains(this.config.domains, 'tencent');
    sqliteService.setDdnsLastRefresh(this.config.lastRefresh || new Date().toISOString());
    _syncMySQL('ddns_config');
  }

  getDomains() {
    this.config.domains = sqliteService.getDdnsDomains('tencent');
    return this.config.domains;
  }

  addDomain(info) {
    const d = { ...info, provider: 'tencent' };
    sqliteService.addDdnsDomain(d);
    this.config.domains = sqliteService.getDdnsDomains('tencent');
    _syncMySQL('ddns_config');
    return this.config.domains;
  }

  removeDomain(name, subdomain, recordType) {
    sqliteService.removeDdnsDomain(name, subdomain || '@', recordType);
    this.config.domains = sqliteService.getDdnsDomains('tencent');
    _syncMySQL('ddns_config');
  }

  // ========== 腾讯云 API 请求 ==========

  async _request(action, params) {
    const creds = this._getCredentials();
    const secretId = creds.secretId;
    const secretKey = creds.secretKey;
    if (!secretId || !secretKey) throw new Error('腾讯云密钥未配置，请设置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');

    const service = 'dnspod';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    const payload = JSON.stringify(params);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${DNSPOD_HOST}\n`;
    const signedHeaders = 'content-type;host';
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    const sign = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
    const kDate = sign(`TC3${secretKey}`, date);
    const kService = sign(kDate, service);
    const kSigning = sign(kService, 'tc3_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: DNSPOD_HOST,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Host': DNSPOD_HOST,
          'X-TC-Action': action,
          'X-TC-Version': DNSPOD_VERSION,
          'X-TC-Timestamp': `${timestamp}`,
          'Authorization': authorization
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.Response.Error) {
              reject(new Error(result.Response.Error.Message || '未知错误'));
            } else {
              resolve(result.Response);
            }
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(payload);
      req.end();
    });
  }

  // ========== DNS 记录操作 ==========

  async getDomainRecords(domain) {
    const allRecords = [];
    let offset = 0;
    const limit = 3000;
    while (true) {
      const result = await this._request('DescribeRecordList', {
        Domain: domain,
        Offset: offset,
        Limit: limit
      });
      const records = result.RecordList || [];
      allRecords.push(...records);
      if (records.length < limit) break;
      offset += limit;
    }
    return allRecords;
  }

  async addRecord(domain, rr, type, value, ttl) {
    const params = {
      Domain: domain,
      RecordType: type,
      RecordLine: '默认',
      Value: value,
      TTL: ttl || 600
    };
    if (rr === '@') {
      params.RecordName = '@';
    } else {
      params.SubDomain = rr.replace(`.${domain}`, '').replace(domain, '');
    }

    const result = await this._request('CreateRecord', params);
    return result.RecordId ? { recordId: `${result.RecordId}`, domain: `${rr === '@' ? '' : rr + '.'}${domain}`, type, value } : null;
  }

  async deleteRecord(recordId, domain) {
    // recordId from our system is tx-xxxxx-xxxxx; extract the real RecordId
    const realId = recordId.includes('-') ? recordId.split('-').pop() : recordId;
    await this._request('DeleteRecord', { Domain: domain, RecordId: parseInt(realId) });
  }

  async setRecordStatus(recordId, status, domain) {
    const realId = recordId.includes('-') ? recordId.split('-').pop() : recordId;
    await this._request('ModifyRecordStatus', {
      Domain: domain,
      RecordId: parseInt(realId),
      Status: status === 'DISABLE' ? 'DISABLE' : 'ENABLE'
    });
  }

  async editRecord(recordId, domain, updates) {
    const realId = recordId.includes('-') ? recordId.split('-').pop() : recordId;
    const params = {
      Domain: domain,
      RecordId: parseInt(realId),
      RecordType: updates.type,
      Value: updates.value,
      TTL: updates.ttl || 600
    };
    if (updates.rr) {
      if (updates.rr === '@') {
        params.RecordName = '@';
      } else {
        params.SubDomain = updates.rr.replace(`.${domain}`, '').replace(domain, '');
      }
    }
    if (updates.line) params.RecordLine = updates.line;
    await this._request('ModifyRecord', params);
  }

  // ========== 获取全部记录 ==========

  async getAllRecords() {
    const [publicIpv4, publicIpv6] = await Promise.allSettled([
      this._getIpv4(),
      this._getIpv6()
    ]);

    const ipv4 = publicIpv4.status === 'fulfilled' ? publicIpv4.value : null;
    const ipv6 = publicIpv6.status === 'fulfilled' ? publicIpv6.value : null;

    // 刷新内存缓存
    this.config.domains = sqliteService.getDdnsDomains('tencent');
    const domains = this.config.domains || [];
    const records = [];

    for (const domain of domains) {
      try {
        const dnsRecords = await this.getDomainRecords(domain.name);
        for (const rec of dnsRecords) {
          const isMatch = (domain.subdomain === '@' && (rec.Name === '@' || rec.Name === ''))
            || (domain.subdomain === '*' && rec.Name === '*')
            || (rec.Name === domain.subdomain);

          if (!isMatch) continue;
          if (rec.Type !== 'A' && rec.Type !== 'AAAA') continue;

          const currentPublicIp = rec.Type === 'A' ? ipv4 : rec.Type === 'AAAA' ? ipv6 : null;
          const domainPrefix = 'tx-' + domain.name.replace(/\./g, '-');
          records.push({
            id: domainPrefix + '-' + rec.RecordId,
            domain: domain.subdomain === '@' ? domain.name : `${domain.subdomain}.${domain.name}`,
            rr: domain.subdomain,
            recordType: rec.Type,
            recordId: `${rec.RecordId}`,
            value: rec.Value,
            ip: rec.Value,
            ttl: rec.TTL,
            line: rec.Line,
            status: rec.Status,
            enabled: rec.Status === 'ENABLE',
            provider: 'tencent',
            needsUpdate: currentPublicIp !== rec.Value,
            updatedAt: rec.UpdatedOn || null,
            createdAt: new Date().toISOString()
          });
        }
      } catch (err) {
        records.push({
          id: 'tx-err-' + Date.now(),
          domain: domain.name,
          recordType: 'A',
          error: err.message,
          provider: 'tencent'
        });
      }
    }

    return { records, publicIpv4: ipv4, publicIpv6: ipv6 };
  }

  async refreshAll() {
    // 刷新内存缓存
    this.config.domains = sqliteService.getDdnsDomains('tencent');
    const domains = this.config.domains || [];
    const results = { total: domains.length, updated: 0, skipped: 0, errors: 0, results: [] };

    for (const domain of domains) {
      try {
        const dnsRecords = await this.getDomainRecords(domain.name);
        const matched = dnsRecords.filter(rec => {
          if (domain.subdomain === '@') return rec.Name === '@' || rec.Name === '';
          if (domain.subdomain === '*') return rec.Name === '*';
          return rec.Name === domain.subdomain;
        });

        if (matched.length === 0) {
          // 自动创建
          const currentIp = domain.recordType === 'AAAA'
            ? await this._getIpv6()
            : await this._getIpv4();
          if (currentIp) {
            await this.addRecord(domain.name, domain.subdomain, domain.recordType || 'A', currentIp, domain.ttl || 600);
            results.results.push({ domain: domain.name, updated: true, ip: currentIp });
            results.updated++;
          }
          continue;
        }

        for (const rec of matched) {
          const currentIp = rec.Type === 'AAAA'
            ? await this._getIpv6()
            : await this._getIpv4();
          if (currentIp && currentIp !== rec.Value) {
            await this.editRecord(`${rec.RecordId}`, domain.name, {
              type: rec.Type,
              value: currentIp,
              ttl: rec.TTL,
              rr: domain.subdomain
            });
            results.results.push({ domain: domain.name, updated: true, ip: currentIp });
            results.updated++;
          } else {
            results.results.push({ domain: domain.name, updated: false, ip: rec.Value });
            results.skipped++;
          }
        }
      } catch (err) {
        results.errors++;
        results.results.push({ domain: domain.name, error: err.message });
      }
    }

    return results;
  }

  async _getIpv4() {
    return new Promise((resolve, reject) => {
      https.get('https://api.ipify.org', { timeout: 5000 }, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(d.trim()));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  async _getIpv6() {
    return new Promise((resolve, reject) => {
      https.get('https://api6.ipify.org', { family: 6, timeout: 5000 }, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(d.trim()));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}

module.exports = new DdnsTencentService();
