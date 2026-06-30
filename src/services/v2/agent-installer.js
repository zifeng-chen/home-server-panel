// V2 Agent 安装器 — SSH 到目标设备安装 Go Agent
const { exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AGENT_DIR = path.join(__dirname, '..', '..', '..', 'agent', 'release');
const AGENT_EXECUTABLE = 'hsp-agent-{arch}';

const ARCH_MAP = {
  'linux-amd64': 'hsp-agent-linux-amd64',
  'linux-arm64': 'hsp-agent-linux-arm64',
  'darwin-arm64': 'hsp-agent-darwin-arm64',
};

class AgentInstaller {
  constructor() {
    this.activeInstalls = new Map(); // install_id → { progress, status, log }
  }

  /**
   * 一键安装流程:
   * 1. SSH 登录探测架构 (uname -m)
   * 2. Base64 传输 Agent 二进制
   * 3. 创建 systemd/crontab 自启动
   * 4. 启动 Agent
   */
  async install(ip, { username = 'root', password = '', agentName = '', serverUrl = '' } = {}) {
    const installId = 'inst_' + crypto.randomBytes(4).toString('hex');
    this.activeInstalls.set(installId, {
      progress: { stage: 'init', percent: 0, detail: '正在准备...' },
      status: 'running',
      log: []
    });

    this._runInstall(installId, ip, username, password, agentName, serverUrl).catch(err => {
      const s = this.activeInstalls.get(installId);
      if (s) {
        s.status = 'error';
        s.progress = { stage: 'error', percent: 0, detail: err.message };
        s.log.push(`[ERROR] ${err.message}`);
      }
    });

    return installId;
  }

  async _runInstall(installId, ip, username, password, agentName, serverUrl) {
    const s = this.activeInstalls.get(installId);
    const log = (...args) => {
      const msg = args.join(' ');
      s.log.push(`[${new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' })}] ${msg}`);
    };

    // Step 1: 探测架构
    s.progress = { stage: 'detect', percent: 10, detail: '正在探测设备架构...' };
    const uname = await this._sshExec(ip, username, password, 'uname -m');
    if (!uname) throw new Error('SSH 连接失败，请检查 IP/用户名/密码');
    const arch = this._mapArch(uname.trim());
    log(`架构检测: ${uname.trim()} → ${arch}`);
    s.detectedArch = arch;

    // Step 2: 确认二进制存在
    s.progress = { stage: 'prepare', percent: 20, detail: '正在准备 Agent 程序...' };
    const binaryName = ArchMap[arch];
    if (!binaryName) throw new Error(`不支持的架构: ${arch}`);
    const binaryPath = path.join(AGENT_DIR, binaryName);
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Agent 二进制不存在: ${binaryName}`);
    }
    log(`Agent 二进制就绪: ${binaryName}`);

    // Step 3: Base64 传输
    s.progress = { stage: 'upload', percent: 30, detail: '正在上传 Agent...' };
    const b64 = fs.readFileSync(binaryPath).toString('base64');
    const transferCmd = `echo '${b64}' | base64 -d > /tmp/hsp-agent && chmod +x /tmp/hsp-agent`;
    
    // 分批传输（避免命令行过长）
    const chunkSize = 500000; // ~500KB per chunk
    const chunks = [];
    for (let i = 0; i < b64.length; i += chunkSize) {
      chunks.push(b64.substring(i, i + chunkSize));
    }
    
    let offset = 0;
    for (let ci = 0; ci < chunks.length; ci++) {
      const progress = 30 + Math.floor((ci / chunks.length) * 40);
      s.progress = { stage: 'upload', percent: progress, detail: `正在上传 Agent (${ci + 1}/${chunks.length})...` };
      const chunkCmd = ci === 0 
        ? `echo '${chunks[ci]}' > /tmp/hsp-agent.b64`
        : `echo '${chunks[ci]}' >> /tmp/hsp-agent.b64`;
      await this._sshExec(ip, username, password, chunkCmd);
      offset += chunks[ci].length;
    }
    
    // 解码
    await this._sshExec(ip, username, password, 'base64 -d /tmp/hsp-agent.b64 > /tmp/hsp-agent && chmod +x /tmp/hsp-agent && rm /tmp/hsp-agent.b64');
    log('Agent 上传完成');

    // Step 4: 安装到系统目录
    s.progress = { stage: 'install', percent: 75, detail: '正在安装到 /usr/local/bin/...' };
    await this._sshExec(ip, username, password, 'mv /tmp/hsp-agent /usr/local/bin/hsp-agent');
    const deviceName = agentName || ip.replace(/\./g, '-');
    const server = serverUrl || `http://192.168.100.1:3456`;
    log(`设备名称: ${deviceName}, 服务端: ${server}`);

    // Step 5: 配置自启动
    s.progress = { stage: 'autostart', percent: 85, detail: '正在配置自启动...' };
    const autostartOk = await this._setupAutostart(ip, username, password, deviceName, server);
    log(autostartOk ? '自启动配置完成' : '自启动配置失败（但 Agent 立即可用）');

    // Step 6: 启动 Agent
    s.progress = { stage: 'start', percent: 95, detail: '正在启动 Agent...' };
    // 先 kill 旧进程
    await this._sshExec(ip, username, password, 'pkill -f hsp-agent 2>/dev/null; sleep 1');
    const startCmd = `nohup /usr/local/bin/hsp-agent -name '${deviceName}' -server '${server}' > /var/log/hsp-agent.log 2>&1 &`;
    await this._sshExec(ip, username, password, startCmd);
    await new Promise(r => setTimeout(r, 2000));
    
    // 验证
    const verify = await this._sshExec(ip, username, password, 'pgrep -f hsp-agent');
    if (verify && verify.trim()) {
      log(`Agent 已启动 (PID ${verify.trim()})`);
      s.progress = { stage: 'done', percent: 100, detail: 'Agent 安装成功并已启动' };
      s.status = 'done';
    } else {
      log('Agent 进程未检测到');
      s.progress = { stage: 'done_warn', percent: 100, detail: '安装完成但 Agent 可能未启动，请检查设备' };
      s.status = 'done_warn';
    }
  }

  // ===== SSH 执行（复用 ssh-provider）=====
  async _sshExec(ip, username, password, cmd) {
    try {
      // 优先用内置 ssh key 连接
      const result = await new Promise((resolve, reject) => {
        // 先尝试密钥
        exec(`ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes ${username}@${ip} '${cmd}' 2>/dev/null`, 
          { timeout: 15000 }, (err, stdout) => {
          if (!err) return resolve(stdout);
          // 密钥失败，用密码
          exec(`sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${username}@${ip} '${cmd}' 2>/dev/null`,
            { timeout: 15000 }, (err2, stdout2) => {
            if (err2) reject(err2);
            else resolve(stdout2);
          });
        });
      });
      return result;
    } catch (e) {
      console.warn(`[AgentInstaller] SSH ${ip} 失败:`, e.message);
      return null;
    }
  }

  // ===== 架构映射 =====
  _mapArch(machine) {
    const m = machine || '';
    if (m === 'x86_64' || m === 'amd64') return ArchKeys.amd64;
    if (m === 'aarch64' || m === 'arm64') return ArchKeys.arm64;
    if (m === 'armv7l' || m === 'armv6l') return ArchKeys.arm;
    if (m.includes('arm')) return ArchKeys.arm64; // 默认 arm64
    return ArchKeys.amd64; // 默认 amd64
  }

  // ===== 自启动配置 =====
  async _setupAutostart(ip, username, password, deviceName, server) {
    // 检测 init 系统
    const hasSystemd = await this._sshExec(ip, username, password, 
      'test -d /etc/systemd/system && echo YES || echo NO');
    
    if (hasSystemd && hasSystemd.trim() === 'YES') {
      // systemd 服务
      const unit = `[Unit]
Description=HSP Agent
After=network.target
[Service]
Type=simple
ExecStart=/usr/local/bin/hsp-agent -name '${deviceName}' -server '${server}'
Restart=always
RestartSec=30
[Install]
WantedBy=multi-user.target`;
      const escapedUnit = unit.replace(/'/g, "'\\''");
      return !!(await this._sshExec(ip, username, password,
        `echo '${escapedUnit}' > /etc/systemd/system/hsp-agent.service && systemctl daemon-reload && systemctl enable hsp-agent 2>/dev/null; echo OK`));
    } else {
      // crontab @reboot
      return !!(await this._sshExec(ip, username, password,
        `(crontab -l 2>/dev/null; echo '@reboot /usr/local/bin/hsp-agent -name ${deviceName} -server ${server} >> /var/log/hsp-agent.log 2>&1') | crontab -; echo OK`));
    }
  }

  // ===== 查询状态 =====
  getInstall(installId) {
    return this.activeInstalls.get(installId) || null;
  }

  archive(id) {
    this.activeInstalls.delete(id);
  }
}

const ArchMap = {
  'linux-amd64': 'hsp-agent-linux-amd64',
  'linux-arm64': 'hsp-agent-linux-arm64',  
  'darwin-arm64': 'hsp-agent-darwin-arm64',
};
const ArchKeys = { amd64: 'linux-amd64', arm64: 'linux-arm64', arm: 'linux-arm64' };

module.exports = new AgentInstaller();
