// DDNS 服务层 - 阿里云 DNS 动态解析
const Core = require('@alicloud/pop-core');
const https = require('https');
const http = require('http');
const dns = require('dns');

const sqliteService = require('./sqlite-service');

class DdnsService {
  constructor() {
    this.client = null;
    this.config = this._loadConfig();
    this._initClient();
    this._cachedIpv4 = null;
    this._cachedIpv6 = null;
    this._cacheTime = 0;
  }

  // 初始化阿里云 API 客户端
  _initClient() {
    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

    if (!accessKeyId || !accessKeySecret) {
      console.warn('[DDNS] 阿里云密钥未配置，DDNS 功能不可用');
      return;
    }

    try {
      this.client = new Core({
        accessKeyId,
        accessKeySecret,
        endpoint: 'https://alidns.aliyuncs.com',
        apiVersion: '2015-01-09'
      });
      console.log('[DDNS] 阿里云 DNS 客户端初始化成功');
    } catch (err) {
      console.error('[DDNS] 客户端初始化失败:', err.message);
    }
  }

  // 获取公网 IPv4 地址（带缓存，60秒）
  async getPublicIp() {
    const now = Date.now();
    if (this._cachedIpv4 && (now - this._cacheTime) < 60000) return this._cachedIpv4;

    const services = [
      { host: 'api.ipify.org', path: '/' },
      { host: 'ifconfig.me', path: '/ip' },
      { host: 'icanhazip.com', path: '/' },
      { host: 'checkip.amazonaws.com', path: '/' },
      { host: 'ipinfo.io', path: '/ip' }
    ];

    for (const svc of services) {
      try {
        const ip = await this._httpGet(svc.host, svc.path);
        const trimmed = ip.trim();
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
          this._cachedIpv4 = trimmed;
          this._cacheTime = now;
          return trimmed;
        }
      } catch (err) { /* 尝试下一个 */ }
    }
    // 最后 fallback: 即使 dns 超时也返回缓存
    if (this._cachedIpv4) return this._cachedIpv4;
    throw new Error('无法获取公网 IPv4，所有服务均不可达');
  }

  // 获取公网 IPv6 地址
  async getPublicIpv6() {
    const services = [
      { host: 'api6.ipify.org', path: '/' },
      { host: 'ifconfig.co', path: '/', headers: { 'Accept': 'application/json' }, parser: (d) => JSON.parse(d).ip },
      { host: 'icanhazip.com', path: '/' },
      { host: 'api64.ipify.org', path: '/' }
    ];

    for (const svc of services) {
      try {
        const data = await this._httpGet(svc.host, svc.path, svc.headers, 6);
        const ip = svc.parser ? svc.parser(data) : data;
        const trimmed = ip.trim();
        if (trimmed.includes(':')) {
          return trimmed;
        }
      } catch (err) { /* 尝试下一个 */ }
    }

    // 尝试本地 IPv6 检测
    try {
      const localIpv6 = await this._getLocalIpv6();
      if (localIpv6) return localIpv6;
    } catch (e) {}

    throw new Error('无法获取公网 IPv6，所有服务均不可达');
  }

  // 从本机获取公网 IPv6
  _getLocalIpv6() {
    return new Promise((resolve, reject) => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const [name, addrs] of Object.entries(interfaces)) {
        for (const addr of addrs) {
          if (addr.family === 'IPv6' && !addr.internal && addr.scopeid === 0) {
            // 过滤掉 fe80 (link-local) 和 fd00 (ULA)
            if (!addr.address.startsWith('fe80') && !addr.address.startsWith('fd')) {
              return resolve(addr.address);
            }
          }
        }
      }
      resolve(null);
    });
  }

  // HTTP GET 请求（不依赖 express，纯 Node.js）
  _httpGet(host, path, extraHeaders, family) {
    return new Promise((resolve, reject) => {
      const options = { host, path, timeout: 5000, headers: extraHeaders || {} };
      if (family) options.family = family;
      const mod = host.includes('ipify.org') && family === 6 ? https : (host.startsWith('api6') ? https : https);
      const req = https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  // 使用 pop-core 发送阿里云 API 请求
  async _request(action, params) {
    if (!this.client) {
      throw new Error('阿里云 DNS 客户端未初始化，请检查密钥配置');
    }

    try {
      const result = await this.client.request(action, params, { method: 'POST' });
      return result;
    } catch (err) {
      console.error(`[DDNS] API 请求失败 ${action}:`, err.message);
      throw new Error(`阿里云 API 错误: ${err.message}`);
    }
  }

  // 获取域名下的所有解析记录
  async getDomainRecords(domain) {
    const result = await this._request('DescribeDomainRecords', {
      DomainName: domain,
      PageSize: 200
    });

    const records = result.DomainRecords?.Record || [];
    if (!Array.isArray(records)) return [records];
    return records;
  }

  // 获取所有已配置的 DDNS 域名记录信息
  async getAllRecords() {
    const [publicIpv4, publicIpv6] = await Promise.allSettled([
      this.getPublicIp(),
      this.getPublicIpv6()
    ]);

    const ipv4 = publicIpv4.status === 'fulfilled' ? publicIpv4.value : null;
    const ipv6 = publicIpv6.status === 'fulfilled' ? publicIpv6.value : null;

    const domains = this.config.domains || [];
    const records = [];

    for (const domain of domains) {
      try {
        const dnsRecords = await this.getDomainRecords(domain.name);
        for (const rec of dnsRecords) {
          const isMatch = (domain.subdomain === '@' && rec.RR === '@')
            || (domain.subdomain === '*' && rec.RR !== '@')
            || (rec.RR === domain.subdomain);

          if (!isMatch) continue;

          // 只返回 A 和 AAAA 记录
          if (rec.Type !== 'A' && rec.Type !== 'AAAA') continue;

          const currentPublicIp = rec.Type === 'A' ? ipv4 : rec.Type === 'AAAA' ? ipv6 : null;
          records.push({
            id: rec.RecordId,
            domain: rec.RR === '@' ? domain.name : `${rec.RR}.${domain.name}`,
            recordType: rec.Type,
            ip: rec.Value,
            currentPublicIp: currentPublicIp,
            needsUpdate: currentPublicIp ? rec.Value !== currentPublicIp : false,
            status: rec.Status,
            enabled: rec.Status === 'ENABLE',
            updatedAt: rec.UpdateTimestamp || null,
            line: rec.Line || 'default',
            ttl: rec.TTL || 600,
            rr: rec.RR
          });
        }
      } catch (err) {
        records.push({
          domain: domain.name,
          error: err.message,
          status: 'error'
        });
      }
    }

    return { records, publicIpv4: ipv4, publicIpv6: ipv6, publicIp: ipv4 || '--' };
  }

  // 更新域名解析记录
  async updateRecord(recordId, rr, type, value, ttl = 600) {
    const result = await this._request('UpdateDomainRecord', {
      RecordId: recordId,
      RR: rr,
      Type: type,
      Value: value,
      TTL: ttl
    });
    return result;
  }

  // 编辑 DNS 记录（前端友好接口）
  async editRecord(recordId, updates) {
    const params = { RecordId: recordId };
    if (updates.rr !== undefined) params.RR = updates.rr;
    if (updates.type !== undefined) params.Type = updates.type;
    if (updates.value !== undefined) params.Value = updates.value;
    if (updates.ttl !== undefined) params.TTL = updates.ttl;
    if (updates.line !== undefined) params.Line = updates.line;

    const result = await this._request('UpdateDomainRecord', params);
    return result;
  }

  // 设置记录启用/停用
  async setRecordStatus(recordId, status) {
    const result = await this._request('SetDomainRecordStatus', {
      RecordId: recordId,
      Status: status === 'ENABLE' ? 'ENABLE' : 'DISABLE'
    });
    return result;
  }

  // 添加域名解析记录
  async addRecord(domainName, rr, type, value, ttl = 600, line = 'default') {
    const result = await this._request('AddDomainRecord', {
      DomainName: domainName,
      RR: rr,
      Type: type,
      Value: value,
      TTL: ttl,
      Line: line
    });
    return result;
  }

  // 删除域名解析记录
  async deleteRecord(recordId) {
    const result = await this._request('DeleteDomainRecord', {
      RecordId: recordId
    });
    return result;
  }

  // 执行 DDNS 刷新 - 检查并更新所有需要更新的记录
  async refreshAll() {
    const results = [];
    const [publicIpv4, publicIpv6] = await Promise.allSettled([
      this.getPublicIp(),
      this.getPublicIpv6()
    ]);

    const ipv4 = publicIpv4.status === 'fulfilled' ? publicIpv4.value : null;
    const ipv6 = publicIpv6.status === 'fulfilled' ? publicIpv6.value : null;

    const domains = this.config.domains || [];

    for (const domain of domains) {
      try {
        const dnsRecords = await this.getDomainRecords(domain.name);
        for (const rec of dnsRecords) {
          const isMatch = (domain.subdomain === '@' && rec.RR === '@')
            || (domain.subdomain === '*' && rec.RR !== '@')
            || (rec.RR === domain.subdomain);
          if (!isMatch) continue;

          // 处理 A 和 AAAA 记录
          if (rec.Type !== 'A' && rec.Type !== 'AAAA') continue;

          // 禁用的记录跳过
          if (rec.Status === 'DISABLE') {
            results.push({ domain: `${rec.RR}.${domain.name}`, ip: rec.Value, updated: false, reason: '已停用' });
            continue;
          }

          const currentIp = rec.Type === 'A' ? ipv4 : rec.Type === 'AAAA' ? ipv6 : null;
          if (!currentIp) {
            results.push({ domain: `${rec.RR}.${domain.name}`, ip: rec.Value, updated: false, reason: '无法获取公网 IP' });
            continue;
          }

          if (rec.Value !== currentIp) {
            console.log(`[DDNS] 更新: ${rec.RR}.${domain.name} (${rec.Type}) ${rec.Value} → ${currentIp}`);
            await this.updateRecord(rec.RecordId, rec.RR, rec.Type, currentIp, rec.TTL);
            results.push({ domain: `${rec.RR}.${domain.name}`, type: rec.Type, oldIp: rec.Value, newIp: currentIp, updated: true });
          } else {
            results.push({ domain: `${rec.RR}.${domain.name}`, type: rec.Type, currentIp, updated: false, reason: 'IP 未变化' });
          }
        }
      } catch (err) {
        results.push({ domain: domain.name, error: err.message, updated: false });
      }
    }

    this._saveConfig();
    return { publicIpv4: ipv4, publicIpv6: ipv6, results };
  }

  // 单条刷新
  async refreshRecord(recordId) {
    const domains = this.config.domains || [];
    let record = null;

    // 找到对应记录
    for (const domain of domains) {
      try {
        const dnsRecords = await this.getDomainRecords(domain.name);
        const found = dnsRecords.find(r => r.RecordId === recordId);
        if (found) {
          record = { domain, record: found };
          break;
        }
      } catch (e) {}
    }

    if (!record) throw new Error('记录不存在');

    const rec = record.record;
    const currentIp = rec.Type === 'A'
      ? await this.getPublicIp()
      : rec.Type === 'AAAA' ? await this.getPublicIpv6() : null;

    if (!currentIp) throw new Error('无法获取公网 IP');

    if (rec.Value !== currentIp) {
      await this.updateRecord(rec.RecordId, rec.RR, rec.Type, currentIp, rec.TTL);
      return { updated: true, oldIp: rec.Value, newIp: currentIp };
    }
    return { updated: false, reason: 'IP 未变化' };
  }

  // 配置管理
  _loadConfig() {
    const domains = sqliteService.getDdnsDomains();
    const lastRefresh = sqliteService.getDdnsLastRefresh();
    return { domains, lastRefresh };
  }

  _saveConfig() {
    this.config.lastRefresh = new Date().toISOString();
    sqliteService.setDdnsDomains(this.config.domains);
    sqliteService.setDdnsLastRefresh(this.config.lastRefresh);
  }

  getDomains() { return sqliteService.getDdnsDomains(); }

  setDomains(domains) {
    sqliteService.setDdnsDomains(domains);
    this.config.domains = sqliteService.getDdnsDomains();
    return this.config.domains;
  }

  addDomain(domain) {
    sqliteService.addDdnsDomain(domain);
    this.config.domains = sqliteService.getDdnsDomains();
    return this.config.domains;
  }

  removeDomain(name, subdomain = '@', recordType) {
    sqliteService.removeDdnsDomain(name, subdomain, recordType);
    this.config.domains = sqliteService.getDdnsDomains();
    return this.config.domains;
  }
}

// 单例
const ddnsService = new DdnsService();
module.exports = ddnsService;
