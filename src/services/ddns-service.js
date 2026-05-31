// DDNS 服务层 - 阿里云 DNS 动态解析
const Core = require('@alicloud/pop-core');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'ddns-config.json');

class DdnsService {
  constructor() {
    this.client = null;
    this.config = this._loadConfig();
    this._initClient();
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

  // 获取公网 IPv4 地址
  async getPublicIp() {
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
          return trimmed;
        }
      } catch (err) {
        // 尝试下一个
      }
    }
    throw new Error('无法获取公网 IP，所有服务均不可达');
  }

  // HTTP GET 请求（不依赖 express，纯 Node.js）
  _httpGet(host, path) {
    return new Promise((resolve, reject) => {
      const req = https.get({ host, path, timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
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
      DomainName: domain
    });

    const records = result.DomainRecords?.Record || [];
    if (!Array.isArray(records)) return [records];
    return records;
  }

  // 获取所有已配置的 DDNS 域名记录信息
  async getAllRecords() {
    const publicIp = await this.getPublicIp();
    const domains = this.config.domains || [];

    const records = [];
    for (const domain of domains) {
      try {
        const dnsRecords = await this.getDomainRecords(domain.name);
        for (const rec of dnsRecords) {
          if (rec.Type === 'A' && (domain.subdomain === '@' || rec.RR === domain.subdomain || domain.subdomain === '*')) {
            records.push({
              id: rec.RecordId,
              domain: domain.subdomain === '@' ? domain.name : `${domain.subdomain}.${domain.name}`,
              recordType: rec.Type,
              ip: rec.Value,
              currentPublicIp: publicIp,
              needsUpdate: rec.Value !== publicIp,
              status: rec.Status,
              updatedAt: rec.UpdateTimestamp || null,
              line: rec.Line || 'default',
              ttl: rec.TTL || 600
            });
          }
        }
      } catch (err) {
        records.push({
          domain: domain.name,
          error: err.message,
          status: 'error'
        });
      }
    }

    return { records, publicIp };
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

  // 添加域名解析记录
  async addRecord(domainName, rr, type, value, ttl = 600) {
    const result = await this._request('AddDomainRecord', {
      DomainName: domainName,
      RR: rr,
      Type: type,
      Value: value,
      TTL: ttl
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
    const publicIp = await this.getPublicIp();
    const domains = this.config.domains || [];

    for (const domain of domains) {
      try {
        const dnsRecords = await this.getDomainRecords(domain.name);
        for (const rec of dnsRecords) {
          if (rec.Type === 'A' && (domain.subdomain === '@' || rec.RR === domain.subdomain || domain.subdomain === '*')) {
            if (rec.Value !== publicIp) {
              console.log(`[DDNS] 更新: ${rec.RR}.${domain.name} ${rec.Value} → ${publicIp}`);
              await this.updateRecord(rec.RecordId, rec.RR, 'A', publicIp);
              domain.lastUpdate = new Date().toISOString();
              domain.lastIp = publicIp;
              results.push({
                domain: `${rec.RR}.${domain.name}`,
                oldIp: rec.Value,
                newIp: publicIp,
                updated: true
              });
            } else {
              results.push({
                domain: `${rec.RR}.${domain.name}`,
                currentIp: publicIp,
                updated: false,
                reason: 'IP 未变化'
              });
            }
          }
        }
      } catch (err) {
        results.push({ domain: domain.name, error: err.message, updated: false });
      }
    }

    this._saveConfig();
    return { publicIp, results };
  }

  // 配置管理
  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('[DDNS] 配置文件读取失败:', err.message);
    }
    return { domains: [], lastRefresh: null };
  }

  _saveConfig() {
    this.config.lastRefresh = new Date().toISOString();
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DDNS] 配置文件保存失败:', err.message);
    }
  }

  getDomains() { return this.config.domains || []; }

  setDomains(domains) {
    this.config.domains = domains;
    this._saveConfig();
    return this.config.domains;
  }

  addDomain(domain) {
    if (!this.config.domains) this.config.domains = [];
    const exists = this.config.domains.find(d => d.name === domain.name && d.subdomain === (domain.subdomain || '@'));
    if (exists) throw new Error('该域名已存在');

    this.config.domains.push({
      name: domain.name,
      subdomain: domain.subdomain || '@',
      recordType: domain.recordType || 'A',
      ttl: domain.ttl || 600,
      line: domain.line || 'default',
      createdAt: new Date().toISOString(),
      lastUpdate: null,
      lastIp: null
    });
    this._saveConfig();
    return this.config.domains;
  }

  removeDomain(name, subdomain = '@') {
    this.config.domains = (this.config.domains || []).filter(
      d => !(d.name === name && d.subdomain === subdomain)
    );
    this._saveConfig();
    return this.config.domains;
  }
}

// 单例
const ddnsService = new DdnsService();
module.exports = ddnsService;