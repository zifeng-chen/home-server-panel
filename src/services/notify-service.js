// PushPlus 通知服务
const https = require('https');

const PUSHPLUS_API = 'www.pushplus.plus';

class NotifyService {
  constructor() {
    this.token = process.env.PUSHPLUS_TOKEN || '';
  }

  setToken(token) {
    this.token = token;
    process.env.PUSHPLUS_TOKEN = token;
  }

  // 发送 PushPlus 消息
  async send({ title, content, template = 'html', topic = '', channel = 'wechat' }) {
    if (!this.token) {
      throw new Error('PushPlus Token 未配置');
    }

    const data = JSON.stringify({
      token: this.token,
      title: title || 'Server Panel 通知',
      content: content || '',
      template,
      topic: topic || '',
      channel
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: PUSHPLUS_API,
        path: '/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 10000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            if (result.code === 200) {
              resolve({ success: true, message: '推送成功', data: result });
            } else {
              resolve({ success: false, message: result.msg || `推送失败 (code: ${result.code})` });
            }
          } catch (e) {
            resolve({ success: false, message: '解析响应失败' });
          }
        });
      });

      req.on('error', (e) => reject(new Error(`网络错误: ${e.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });

      req.write(data);
      req.end();
    });
  }

  // 测试推送
  async test() {
    return this.send({
      title: '🔔 测试通知',
      content: `<h3>Server Panel 推送通道正常</h3>
<p>时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
<p>主机: ${require('os').hostname()}</p>
<p style="color:#4CAF50">✅ 如果您收到这条消息，说明 PushPlus 配置正确。</p>`,
      template: 'html'
    });
  }

  // DDNS 变更通知
  async notifyDdnsChange(records) {
    const lines = records.map(r =>
      `<tr><td>${r.domain}</td><td>${r.oldIp || '新增'}</td><td style="color:#FF9800">${r.newIp}</td></tr>`
    ).join('');

    return this.send({
      title: '📡 DDNS IP 变更通知',
      content: `<h3>公网 IP 已变更</h3>
<table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
<tr style="background:#f5f5f5"><th>域名</th><th>旧IP</th><th>新IP</th></tr>
${lines}
</table>
<p style="color:#999">时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>`,
      template: 'html'
    });
  }

  // SSL 到期通知
  async notifySslExpiry(cert) {
    const color = cert.daysRemaining < 7 ? '#F44336' : cert.daysRemaining < 30 ? '#FF9800' : '#4CAF50';
    return this.send({
      title: `🔒 SSL 证书${cert.daysRemaining < 0 ? '已过期' : '即将到期'}`,
      content: `<h3>SSL 证书到期提醒</h3>
<p><strong>域名:</strong> ${cert.domain}</p>
<p><strong>到期时间:</strong> ${new Date(cert.expiresAt).toLocaleDateString('zh-CN')}</p>
<p style="color:${color};font-size:24px;"><strong>剩余 ${cert.daysRemaining} 天</strong></p>
${cert.daysRemaining < 0 ? '<p style="color:#F44336">⚠️ 证书已过期，请立即续期！</p>' : 
  cert.daysRemaining < 7 ? '<p style="color:#F44336">⚠️ 证书即将过期，请尽快续期！</p>' :
  '<p>建议提前续期，避免服务中断。</p>'}`,
      template: 'html'
    });
  }

  // 服务异常通知
  async notifyServiceDown(service, error) {
    return this.send({
      title: `🚨 ${service} 服务异常`,
      content: `<h3>服务监控告警</h3>
<p><strong>服务:</strong> ${service}</p>
<p><strong>状态:</strong> <span style="color:#F44336">异常</span></p>
<p><strong>错误:</strong> ${error || '未知错误'}</p>
<p style="color:#999">时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>`,
      template: 'html'
    });
  }

  // 系统通知
  async notifySystem(title, body) {
    return this.send({
      title,
      content: body,
      template: 'html'
    });
  }

  // 获取通知服务状态
  async getStatus() {
    const configured = !!this.token;
    return {
      configured,
      tokenPreview: this.token ? this.token.substring(0, 8) + '****' : null,
      provider: 'PushPlus',
      channel: 'wechat'
    };
  }
}

module.exports = new NotifyService();