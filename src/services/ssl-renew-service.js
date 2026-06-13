// SSL 证书自动续期服务
// 每24小时检查一次即将过期的证书并自动续期（acme.sh --renew）

const sslService = require('./ssl-service');
const logService = require('./log-service');
const sqliteService = require('./sqlite-service');

class SslRenewService {
  constructor() {
    this._timer = null;
    this._running = false;
  }

  /** 启动定时检查（每24小时） */
  start() {
    if (this._timer) return;
    
    // 启动后5分钟做首次检查，之后每24小时
    const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24h
    const FIRST_CHECK_DELAY = 5 * 60 * 1000;     // 5min
    
    console.log('[SSL-renew] 自动续期已启动（每24小时检查一次）');
    
    this._timer = setInterval(() => this._checkAndRenew(), CHECK_INTERVAL);
    // 首次延迟检查
    setTimeout(() => this._checkAndRenew(), FIRST_CHECK_DELAY);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** 检查即将过期的证书并续期 */
  async _checkAndRenew() {
    if (this._running) return;
    this._running = true;

    try {
      // 检查 acme.sh 是否可用
      const status = sslService.getStatus();
      if (!status || !status.installed) {
        console.log('[SSL-renew] acme.sh 未安装，跳过检查');
        return;
      }

      // 获取所有证书域名
      let domains = [];
      try {
        domains = sqliteService.getSslDomains();
      } catch (e) {
        // SQLite 未就绪
        console.log('[SSL-renew] 证书列表获取失败:', e.message);
        return;
      }

      if (!domains || domains.length === 0) {
        return; // 无域名，跳过
      }

      // 检查每个域名的证书到期时间
      const now = Date.now();
      const RENEW_DAYS = 30; // 到期前30天自动续期
      const RENEW_MS = RENEW_DAYS * 24 * 60 * 60 * 1000;

      for (const domain of domains) {
        try {
          // 获取证书信息（含到期时间）
          const certInfo = await this._getCertExpiry(domain.domain || domain.name);
          if (!certInfo || !certInfo.expiresAt) continue;

          const expiresAt = new Date(certInfo.expiresAt).getTime();
          const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

          if (daysLeft <= RENEW_DAYS) {
            console.log(`[SSL-renew] ${domain.domain || domain.name} 将在 ${daysLeft} 天后到期，自动续期中...`);
            
            const result = await sslService.renewCertificate(domain.domain || domain.name);
            
            if (result && result.success) {
              console.log(`[SSL-renew] ✅ ${domain.domain || domain.name} 续期成功`);
              logService.log({
                module: 'ssl', action: 'AUTO_RENEW', level: 'info',
                message: `证书自动续期成功: ${domain.domain || domain.name}`,
                detail: `到期前 ${daysLeft} 天自动续期`
              });
            } else {
              console.error(`[SSL-renew] ❌ ${domain.domain || domain.name} 续期失败:`, result?.message || '未知错误');
              logService.log({
                module: 'ssl', action: 'AUTO_RENEW', level: 'error',
                message: `证书自动续期失败: ${domain.domain || domain.name}`,
                detail: result?.message || '未知错误'
              });
            }
          } else {
            console.log(`[SSL-renew] ${domain.domain || domain.name} 还有 ${daysLeft} 天到期，暂不需要续期`);
          }
        } catch (err) {
          console.error(`[SSL-renew] 检查 ${domain.domain || domain.name} 时出错:`, err.message);
        }
      }
    } catch (err) {
      console.error('[SSL-renew] 检查出错:', err.message);
    } finally {
      this._running = false;
    }
  }

  /** 获取证书过期时间 */
  async _getCertExpiry(domain) {
    try {
      // 使用 sslService 的 listCertificates 方法（如果存在）
      if (typeof sslService.listCertificates === 'function') {
        const certs = await sslService.listCertificates();
        return certs.find(c => c.domain === domain || c.name === domain);
      }
    } catch (e) { /* ignore */ }
    return null;
  }
}

const service = new SslRenewService();
// 自动启动
service.start();

module.exports = service;
