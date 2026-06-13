// SSL 证书服务 - Let's Encrypt ACME 自动化 (via acme.sh)
const { execFile } = require('child_process');
const Core = require('@alicloud/pop-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
const ACME_HOME = path.join(os.homedir(), '.acme.sh');
const ACME_BIN = path.join(ACME_HOME, 'acme.sh');

class SslService {
  constructor() {
    // SQLite is the source of truth
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

    // 净化环境变量（避免 LOG_LEVEL 泄漏给 acme.sh 在 BusyBox 上报错）
    const sanEnv = { ...process.env };
    delete sanEnv.LOG_LEVEL;
    delete sanEnv.DEBUG;
    const env = {
      ...sanEnv,
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

  // SSE 实时证书申请（带进度回调）
  async issueCertificateSSE(domain, options, onProgress) {
    if (!fs.existsSync(ACME_BIN)) {
      onProgress('error', { message: 'acme.sh 未安装，请先安装' });
      return { success: false, message: 'acme.sh 未安装' };
    }

    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
    if (!accessKeyId || !accessKeySecret) {
      onProgress('error', { message: '阿里云密钥未配置' });
      return { success: false, message: '阿里云密钥未配置' };
    }

    let cleanDomain = domain.replace(/^\*+\./g, '');
    if (!cleanDomain || cleanDomain.includes('*')) {
      onProgress('error', { message: '域名格式无效' });
      return { success: false, message: '域名格式无效' };
    }

    const domains = [cleanDomain];
    if (options.wildcard) domains.push(`*.${cleanDomain}`);

    const args = [
      '--issue',
      '--dns', 'dns_ali',
      ...domains.map(d => ['-d', d]).flat()
    ];

    const sanEnv = { ...process.env };
    delete sanEnv.LOG_LEVEL;
    delete sanEnv.DEBUG;
    const env = {
      ...sanEnv,
      Ali_Key: accessKeyId,
      Ali_Secret: accessKeySecret
    };

    // 预检：证书是否已存在且有效
    const existingData = await this.listCertificates().catch(() => ({ certificates: [] }));
    const existingCerts = existingData.certificates || [];
    const existing = existingCerts.find(c => c.domain === cleanDomain);
    if (existing && existing.expiresAt && !options.force) {
      const expiresDate = new Date(existing.expiresAt);
      const daysUntil = Math.ceil((expiresDate - Date.now()) / 86400000);
      if (daysUntil > 0) {
        onProgress('step', { text: `⏭️ 证书已存在（${daysUntil} 天后到期），跳过申请` });
        return { success: true, domain: cleanDomain, message: `证书已存在，${daysUntil} 天后到期`, alreadyExists: true };
      }
    }

    if (options.force) {
      args.push('--force');
      onProgress('step', { text: '⚡ 强制重新申请（--force）...' });
    }

    onProgress('step', { text: `🔍 清理残留 DNS 记录: ${cleanDomain}...` });
    try {
      const cleaned = await this._cleanDnsTxtRecords(cleanDomain, accessKeyId, accessKeySecret);
      if (cleaned.length > 0) {
        onProgress('output', { text: `已清理 ${cleaned.length} 条残留 TXT 记录: ${cleaned.join(', ')}` });
      }
    } catch (e) {
      onProgress('output', { text: 'DNS 清理跳过: ' + e.message });
    }

    onProgress('step', { text: `📜 正在为 ${domains.join(', ')} 申请证书...` });
    onProgress('output', { text: '$ ' + ACME_BIN + ' ' + args.join(' ') });

    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      const proc = execFile(ACME_BIN, args, {
        env,
        timeout: 180000,
        maxBuffer: 1024 * 1024
      });

      let combinedOutput = '';
      proc.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) { combinedOutput += text; onProgress('output', { text }); }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) { combinedOutput += text; onProgress('output', { text }); }
      });

      proc.on('close', (code) => {
        // exit code 2 = "Domains not changed"（证书已存在且未过期）
        if (code === 0 || (code === 2 && combinedOutput.includes('Domains not changed'))) {
          const alreadyExists = code === 2;
          const msg = alreadyExists ? '证书已存在且有效，无需重新申请' : '✅ 证书申请成功！';
          onProgress('step', { text: msg });
          if (!alreadyExists) {
            this._addCertConfig(cleanDomain, { alias: options.alias || cleanDomain, wildcard: options.wildcard });
          }
          resolve({ success: true, domain: cleanDomain, message: msg, alreadyExists });
        } else {
          onProgress('error', { message: `证书申请失败 (exit code: ${code})` });
          resolve({ success: false, message: `证书申请失败 (exit code: ${code})` });
        }
      });

      proc.on('error', (err) => {
        onProgress('error', { message: err.message });
        resolve({ success: false, message: err.message });
      });
    });
  }

  // ========== 证书续期 ==========

  async renewCertificate(domain) {
    if (!fs.existsSync(ACME_BIN)) {
      throw new Error('acme.sh 未安装');
    }

    const sanEnv = { ...process.env };
    delete sanEnv.LOG_LEVEL;
    delete sanEnv.DEBUG;
    const env = {
      ...sanEnv,
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
    const domains = this.getConfigDomains();
    
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
      const configuredDomains = this.getConfigDomains().map(d => d.domain);
      
      return {
        certificates: certificates.map(cert => {
          const days = cert.daysRemaining;
          let status = 'valid';
          let warning = null;
          if (days !== null && days < 0) status = 'expired';
          else if (days !== null && days < 7) status = 'expiring';
          else if (days !== null && days < 90) status = 'warning';

          if (days !== null && days < 90) {
            warning = days < 0 ? `已过期 ${Math.abs(days)} 天` : `剩余 ${days} 天 (${days < 7 ? '紧急' : days < 30 ? '需关注' : '90天内到期'})`;
          }

          // Task 14: 到期时发送 PushPlus 提醒
          if (days !== null && days >= 0 && days <= 90) {
            this._maybeNotifyExpiry(cert.mainDomain, days);
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
    sqliteService.addSslDomain(domain, { alias: opts.alias || domain, wildcard: opts.wildcard || false });
    _syncMySQL('ssl_config');
  }

  getConfigDomains() {
    return sqliteService.getSslDomains();
  }

  // 从面板移除域名，同时可选择删除实际证书文件
  removeConfigDomain(domain, deleteFiles = false) {
    sqliteService.removeSslDomain(domain);
    _syncMySQL('ssl_config');
    if (deleteFiles) {
      this._deleteCertFiles(domain);
    }
  }

  // Task 13: 删除 acme.sh 中实际的证书文件
  _deleteCertFiles(domain) {
    try {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const acmeHome = path.join(os.homedir(), '.acme.sh');
      let certDir = path.join(acmeHome, domain + '_ecc');
      if (!fs.existsSync(certDir)) certDir = path.join(acmeHome, domain);
      
      if (fs.existsSync(certDir)) {
        // 使用 acme.sh --remove 来清理证书
        const { execSync } = require('child_process');
        const acmeBin = path.join(os.homedir(), '.acme.sh', 'acme.sh');
        if (fs.existsSync(acmeBin)) {
          execSync(`bash "${acmeBin}" --remove -d "${domain}"`, { timeout: 10000 });
          console.log(`[SSL] 已删除证书文件: ${domain}`);
        } else {
          fs.rmSync(certDir, { recursive: true, force: true });
          console.log(`[SSL] 已手动删除证书目录: ${certDir}`);
        }
      }
    } catch (err) {
      console.warn(`[SSL] 删除证书文件失败: ${domain}`, err.message);
    }
  }

  // Task 14: 证书到期推送通知 (同域名每天最多推送一次)
  async _maybeNotifyExpiry(domain, days) {
    try {
      const lastNotified = sqliteService.getSslNotifiedAt(domain);
      const now = Date.now();
      if (lastNotified && (now - lastNotified) < 86400000) return; // 24小时内不重复

      const notifyService = require('./notify-service');
      sqliteService.setSslNotifiedAt(domain, now);

      await notifyService.notifySslExpiry({
        domain,
        daysRemaining: days,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString()
      });
    } catch (err) {
      console.warn(`[SSL] 到期推送失败: ${domain}`, err.message);
    }
  }

  // ========== 内部方法 ==========

  _execAcme(args, env = {}) {
    // 净化环境变量：移除我们 app 的 LOG_LEVEL，避免 acme.sh 在 BusyBox ash 上
    // 把字符串 "info" 当整数比较（[_debug() 内部 [ "$LOG_LEVEL" -ge 1 ]）
    const sanEnv = { ...process.env };
    delete sanEnv.LOG_LEVEL;
    delete sanEnv.DEBUG;
    return new Promise((resolve, reject) => {
      execFile(ACME_BIN, args.split(' ').filter(Boolean), {
        env: { ...sanEnv, ...env },
        timeout: 120000,
        maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err) {
          // acme.sh 有时返回非0但实际成功
          const combined = stdout + stderr;
          // exit code 2 = "Domains not changed"，表示证书已存在且未过期，直接视为成功
          if (combined.includes('Cert success') || combined.includes('Already exists') || combined.includes('Domains not changed')) {
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
      if (!line.trim() || line.includes('Main_Domain')) continue;

      // acme.sh v3.x --list 输出用 \t 分隔，兼容旧版空格分隔
      let parts = line.split('\t').map(s => s.trim()).filter(Boolean);
      if (parts.length < 4) {
        // fallback: 旧版空格分隔
        parts = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
      }
      if (parts.length < 4) continue;

      // parts[0]=域名, parts[1]="ec-256", parts[2]=SAN域名, parts[3]=CA
      // parts[4]=Created(可能), parts[5]=Renew(可能)
      const mainDomain = parts[0];
      const keyLength = parts[1].replace(/"/g, '');
      const rawSanDomains = parts[2] || '';
      const ca = parts[3] || 'ZeroSSL.com';
      const createdStr = parts.length >= 5 ? parts[4] : '';
      const renewStr = parts.length >= 6 ? parts[5] : '';

      const expiresAt = this._parseAcmeDate(renewStr);
      const daysRemaining = this._daysUntil(expiresAt);

      certificates.push({
        mainDomain,
        keyLength,
        sanDomains: rawSanDomains
          .replace(/DNS:/g, '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        ca,
        createdAt: this._parseAcmeDate(createdStr),
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
}

module.exports = new SslService();