// SSL 证书服务 - Let's Encrypt ACME 自动化 (via acme.sh)
const { execFile } = require('child_process');
const Core = require('@alicloud/pop-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'ssl-config.json');
const ACME_HOME = path.join(os.homedir(), '.acme.sh');
const ACME_BIN = path.join(ACME_HOME, 'acme.sh');

class SslService {
  constructor() {
    this.config = this._loadConfig();
  }

  // ========== acme.sh 检测与安装 ==========

  getAcmePath() { return ACME_BIN; }

  async checkAcme() {
    try {
      if (!fs.existsSync(ACME_BIN)) {
        return { installed: false, path: ACME_BIN };
      }
      const version = await this._execAcme('--version');
      return { installed: true, path: ACME_BIN, version: version.trim() };
    } catch (err) {
      return { installed: false, path: ACME_BIN, error: err.message };
    }
  }

  async installAcme(email) {
    if (!email) throw new Error('请提供联系邮箱');
    if (fs.existsSync(ACME_BIN)) {
      return { installed: true, message: 'acme.sh 已安装，跳过' };
    }
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(`curl -sS https://get.acme.sh | sh -s email=${email}`, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          if (fs.existsSync(ACME_BIN)) return resolve({ installed: true, message: 'acme.sh 安装完成' });
          return reject(new Error(`安装失败: ${stderr || err.message}`));
        }
        resolve({ installed: true, message: 'acme.sh 安装完成', output: stdout });
      });
    });
  }

  async installAcmeSSE(email, onProgress) {
    if (!email) throw new Error('请提供联系邮箱');
    if (fs.existsSync(ACME_BIN)) {
      onProgress('output', { text: 'acme.sh 已安装，跳过安装步骤' });
      return { installed: true, message: 'acme.sh 已安装' };
    }

    // 从 Gitee 下载（国内快）
    const tmpDir = `/tmp/acme-install-${Date.now()}`;
    const tarFile = `${tmpDir}.tar.gz`;

    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');

      const run = (cmd, callback) => {
        onProgress('output', { text: `$ ${cmd}` });
        exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
          if (stdout) onProgress('output', { text: stdout.trim() });
          if (stderr) onProgress('output', { text: stderr.trim() });
          callback(err);
        });
      };

      // Step 1: Download
      onProgress('step', { text: '📥 从 Gitee 下载 acme.sh 源码包...' });
      run(`curl -fsSL --connect-timeout 30 --max-time 120 -o ${tarFile} 'https://gitee.com/neilpang/acme.sh/repository/archive/master.tar.gz'`, (err) => {
        if (err) return reject(new Error('下载失败: ' + err.message));

        // Step 2: Extract
        onProgress('step', { text: '📦 解压源码包...' });
        run(`mkdir -p ${tmpDir} && tar -xzf ${tarFile} -C ${tmpDir} --strip-components=1 && rm ${tarFile}`, (err) => {
          if (err) return reject(new Error('解压失败: ' + err.message));

          // Step 3: Install
          onProgress('step', { text: '🔧 安装到 ~/.acme.sh...' });
          run(`cd ${tmpDir} && ./acme.sh --install --home ${ACME_HOME} --config-home ${ACME_HOME}/data --cert-home ${ACME_HOME}/certs --accountemail ${email} --nocron`, (err) => {
            if (err && !fs.existsSync(ACME_BIN)) {
              run(`rm -rf ${tmpDir}`, () => {});
              return reject(new Error('安装失败: ' + err.message));
            }

            // Step 4: Register account
            onProgress('step', { text: '🔑 注册 ZeroSSL 账户...' });
            run(`${ACME_BIN} --register-account -m ${email}`, (err) => {
              run(`rm -rf ${tmpDir}`, () => {});
              // Register failure is non-fatal
              onProgress('output', { text: err ? '注册账户警告: ' + err.message : '账户注册成功' });
              resolve({ installed: true, message: 'acme.sh v' + (this._getVersion() || '?') + ' 安装完成' });
            });
          });
        });
      });
    });
  }

  _getVersion() {
    try {
      const { execSync } = require('child_process');
      return execSync(`${ACME_BIN} --version`, { encoding: 'utf-8', timeout: 5000 }).split('\n').pop()?.trim() || '';
    } catch { return ''; }
  }

  async uninstallAcme() {
    if (!fs.existsSync(ACME_BIN)) {
      return { message: 'acme.sh 未安装，无需卸载' };
    }

    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      execFile(ACME_BIN, ['--uninstall'], { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
          // Try manual removal
          if (fs.existsSync(ACME_BIN)) {
            try {
              fs.rmSync(ACME_HOME, { recursive: true, force: true });
              return resolve({ message: 'acme.sh 已强制卸载（目录已删除）' });
            } catch (e) {
              return reject(new Error('卸载失败: ' + e.message));
            }
          }
          return reject(new Error(`卸载失败: ${stderr || err.message}`));
        }
        resolve({ message: 'acme.sh 已卸载', output: stdout });
      });
    });
  }

  // ========== DNS TXT 记录清理（避免重复申请冲突） ==========

  async _cleanDnsTxtRecords(domain, accessKeyId, accessKeySecret) {
    const client = new Core({
      accessKeyId,
      accessKeySecret,
      endpoint: 'https://alidns.aliyuncs.com',
      apiVersion: '2015-01-09'
    });

    try {
      // 1. 查询主域名对应的 Hosted Zone
      const zones = await client.request('DescribeDomains', { KeyWord: domain, SearchMode: 'EXACT' }, { method: 'POST' });
      const zoneList = zones.Domains?.Domain || [];
      if (zoneList.length === 0) return [];

      const cleaned = [];
      for (const zone of zoneList) {
        // 2. 查找 _acme-challenge 开头的 TXT 记录
        const records = await client.request('DescribeDomainRecords', {
          DomainName: zone.DomainName,
          RRKeyWord: '_acme-challenge',
          TypeKeyWord: 'TXT',
          SearchMode: 'EXACT'
        }, { method: 'POST' });

        const recordList = records.DomainRecords?.Record || [];
        for (const rec of recordList) {
          try {
            await client.request('DeleteDomainRecord', { RecordId: rec.RecordId }, { method: 'POST' });
            cleaned.push(`${rec.RR}.${zone.DomainName}`);
          } catch (e) {
            // 单条删除失败，继续清理下一条
          }
        }
      }
      return cleaned;
    } catch (e) {
      // DNS 清理失败不阻塞主流程（可能密钥无 DNS 权限）
      return [];
    }
  }

  // ========== 证书申请 ==========

  async issueCertificate(domain, options = {}) {
    if (!fs.existsSync(ACME_BIN)) {
      throw new Error('acme.sh 未安装，请先安装');
    }

    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
    if (!accessKeyId || !accessKeySecret) {
      throw new Error('阿里云密钥未配置，DNS 验证需要密钥');
    }

    // 规范化域名：去除前端可能传入的 *. 前缀，后端统一处理
    let cleanDomain = domain.replace(/^\*+\./g, '');
    if (!cleanDomain || cleanDomain.includes('*')) {
      throw new Error('域名格式无效，通配符仅支持 *.example.com 格式');
    }

    const domains = [cleanDomain];
    if (options.wildcard) {
      domains.push(`*.${cleanDomain}`);
    }

    const args = [
      '--issue',
      '--dns', 'dns_ali',
      ...domains.map(d => ['-d', d]).flat()
    ];

    const env = {
      ...process.env,
      Ali_Key: accessKeyId,
      Ali_Secret: accessKeySecret
    };

    try {
      // 清理上次申请可能残留的 DNS TXT 记录
      const cleaned = await this._cleanDnsTxtRecords(cleanDomain, accessKeyId, accessKeySecret);
      if (cleaned.length > 0) {
        console.log(`[SSL] 清理了 ${cleaned.length} 条残留 TXT 记录: ${cleaned.join(', ')}`);
      }

      const result = await this._execAcme(args.join(' '), env);
      this._addCertConfig(cleanDomain, { alias: options.alias || cleanDomain, wildcard: options.wildcard });
      return { success: true, domain: cleanDomain, message: `证书申请成功: ${cleanDomain}`, output: result };
    } catch (err) {
      throw new Error(`证书申请失败: ${err.message}`);
    }
  }

  // ========== 证书续期 ==========

  async renewCertificate(domain) {
    if (!fs.existsSync(ACME_BIN)) {
      throw new Error('acme.sh 未安装');
    }

    const env = {
      ...process.env,
      Ali_Key: process.env.ALIYUN_ACCESS_KEY_ID,
      Ali_Secret: process.env.ALIYUN_ACCESS_KEY_SECRET
    };

    try {
      const result = await this._execAcme(`--renew -d ${domain}`, env);
      return { success: true, domain, message: `证书续期成功: ${domain}`, output: result };
    } catch (err) {
      throw new Error(`证书续期失败: ${err.message}`);
    }
  }

  async renewAllCertificates() {
    if (!fs.existsSync(ACME_BIN)) throw new Error('acme.sh 未安装');

    const results = [];
    const domains = this.config.domains || [];
    
    for (const d of domains) {
      try {
        const r = await this.renewCertificate(d.domain);
        results.push({ domain: d.domain, success: true });
      } catch (err) {
        results.push({ domain: d.domain, success: false, error: err.message });
      }
    }
    return { results };
  }

  // ========== 证书列表与状态 ==========

  async listCertificates() {
    if (!fs.existsSync(ACME_BIN)) {
      return { certificates: [], acmeInstalled: false };
    }

    try {
      const output = await this._execAcme('--list');
      const certificates = this._parseListOutput(output);
      
      // 合并配置信息
      const configuredDomains = (this.config.domains || []).map(d => d.domain);
      
      return {
        certificates: certificates.map(cert => {
          const days = cert.daysRemaining;
          let status = 'valid';
          let warning = null;
          if (days !== null && days < 0) status = 'expired';
          else if (days !== null && days < 7) status = 'expiring';
          else if (days !== null && days < 30) status = 'warning';

          if (days !== null && days <= 30) {
            warning = days < 0 ? `已过期 ${Math.abs(days)} 天` : `剩余 ${days} 天`;
          }

          return {
            domain: cert.mainDomain,
            sanDomains: cert.sanDomains,
            issuer: 'Let\'s Encrypt',
            expiresAt: cert.expiresAt,
            daysRemaining: days,
            status,
            warning,
            managed: configuredDomains.includes(cert.mainDomain)
          };
        }),
        acmeInstalled: true
      };
    } catch (err) {
      return { certificates: [], acmeInstalled: true, error: err.message };
    }
  }

  // ========== 证书部署 ==========

  async deployCertificate(domain, keyFile, fullchainFile) {
    if (!fs.existsSync(ACME_BIN)) throw new Error('acme.sh 未安装');
    if (!keyFile || !fullchainFile) throw new Error('请提供 key 和 fullchain 路径');

    const reloadCmd = 'nginx -s reload 2>/dev/null || service nginx reload 2>/dev/null || true';
    const cmd = `--install-cert -d ${domain} --key-file ${keyFile} --fullchain-file ${fullchainFile} --reloadcmd "${reloadCmd}"`;
    
    try {
      await this._execAcme(cmd);
      return { success: true, domain, message: `证书已部署到 ${fullchainFile}` };
    } catch (err) {
      throw new Error(`证书部署失败: ${err.message}`);
    }
  }

  // ========== 配置管理 ==========

  _addCertConfig(domain, opts = {}) {
    if (!this.config.domains) this.config.domains = [];
    const exists = this.config.domains.find(d => d.domain === domain);
    if (!exists) {
      this.config.domains.push({
        domain,
        alias: opts.alias || domain,
        wildcard: opts.wildcard || false,
        createdAt: new Date().toISOString()
      });
      this._saveConfig();
    }
  }

  getConfigDomains() {
    return this.config.domains || [];
  }

  removeConfigDomain(domain) {
    this.config.domains = (this.config.domains || []).filter(d => d.domain !== domain);
    this._saveConfig();
  }

  // ========== 内部方法 ==========

  _execAcme(args, env = process.env) {
    return new Promise((resolve, reject) => {
      execFile(ACME_BIN, args.split(' ').filter(Boolean), {
        env,
        timeout: 120000,
        maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err) {
          // acme.sh 有时返回非0但实际成功
          const combined = stdout + stderr;
          if (combined.includes('Cert success') || combined.includes('Already exists')) {
            return resolve(combined);
          }
          return reject(new Error(stderr || err.message));
        }
        resolve(stdout);
      });
    });
  }

  _parseListOutput(output) {
    const lines = output.split('\n');
    const certificates = [];
    
    for (const line of lines) {
      if (!line.includes('|') || line.includes('Main_Domain')) continue;
      
      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 5) continue;

      // 格式: Main_Domain | KeyLength | SAN_Domains | CA | Created | Renew
      const expiresAt = this._parseAcmeDate(parts[5]);
      const daysRemaining = this._daysUntil(expiresAt);

      certificates.push({
        mainDomain: parts[0],
        keyLength: parts[1],
        sanDomains: (parts[2] || '')
          .replace(/DNS:/g, '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        ca: parts[3],
        createdAt: this._parseAcmeDate(parts[4]),
        expiresAt,
        daysRemaining
      });
    }

    return certificates;
  }

  _parseAcmeDate(dateStr) {
    if (!dateStr) return null;
    try {
      // acme.sh 日期格式: "Tue May 30 00:00:00 UTC 2026"
      return new Date(dateStr).toISOString();
    } catch {
      return null;
    }
  }

  _daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return null;
    return Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
  }

  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('[SSL] 配置文件读取失败:', err.message);
    }
    return { domains: [] };
  }

  _saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SSL] 配置文件保存失败:', err.message);
    }
  }
}

module.exports = new SslService();