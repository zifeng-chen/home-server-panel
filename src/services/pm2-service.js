// PM2 进程管理服务
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

class Pm2Service {
  // 检查 PM2 是否已安装
  isInstalled() {
    try {
      execSync('which pm2 2>/dev/null || npm list -g pm2 2>/dev/null', { timeout: 3000, encoding: 'utf-8' });
      return true;
    } catch (e) {
      try {
        const ver = execSync('pm2 -v 2>/dev/null', { timeout: 3000, encoding: 'utf-8' }).trim();
        return !!ver;
      } catch (e2) {
        return false;
      }
    }
  }

  // 获取 PM2 守护进程状态
  getDaemonStatus() {
    try {
      // 先检查 PM2 命令是否存在
      execSync('which pm2 2>/dev/null', { timeout: 3000, encoding: 'utf-8' });
    } catch (e) {
      return { installed: false, running: false, version: '' };
    }

    // PM2 已安装，检查守护进程
    try {
      const raw = execSync('pm2 ping 2>&1 || true', { timeout: 3000, encoding: 'utf-8' });
      const running = raw.includes('pong') || raw.includes('[PM2]');
      let pm2Ver = '';
      try { pm2Ver = execSync('pm2 -v 2>/dev/null', { timeout: 2000, encoding: 'utf-8' }).trim(); } catch (e) {}
      return { installed: true, running, version: pm2Ver };
    } catch (err) {
      return { installed: true, running: false, version: '' };
    }
  }

  // 安装 PM2
  install() {
    try {
      const result = execSync('npm install -g pm2 2>&1', { timeout: 60000, encoding: 'utf-8' });
      const installed = this.isInstalled();
      return { success: installed, message: installed ? 'PM2 安装成功' : ('安装命令已执行但检测失败: ' + result.slice(-200)) };
    } catch (err) {
      return { success: false, message: 'PM2 安装失败: ' + (err.stderr || err.message).slice(-300) };
    }
  }

  // 卸载 PM2
  uninstall() {
    try {
      try { execSync('pm2 kill 2>/dev/null', { timeout: 5000 }); } catch (e) {}
      execSync('npm uninstall -g pm2 2>&1', { timeout: 60000, encoding: 'utf-8' });
      return { success: true, message: 'PM2 已卸载' };
    } catch (err) {
      return { success: false, message: 'PM2 卸载失败: ' + (err.stderr || err.message).slice(-300) };
    }
  }

  // 启动 PM2 守护进程
  startDaemon() {
    try {
      execSync('pm2 resurrect 2>&1', { timeout: 10000 });
      return { success: true, message: 'PM2 守护进程已启动' };
    } catch (err) {
      return { success: false, message: '启动失败: ' + err.message };
    }
  }

  // PM2 安装引导信息
  getInstallGuide() {
    const nodeVer = process.version;
    const npmVer = (() => { try { return execSync('npm -v 2>/dev/null', { timeout: 3000, encoding: 'utf-8' }).trim(); } catch (e) { return 'unknown'; } })();
    const globalPath = (() => { try { return execSync('npm root -g 2>/dev/null', { timeout: 3000, encoding: 'utf-8' }).trim(); } catch (e) { return 'unknown'; } })();

    const installed = this.isInstalled();
    const daemon = installed ? this.getDaemonStatus() : null;

    return {
      success: true,
      data: {
        installed,
        daemonRunning: daemon?.running || false,
        pm2Version: daemon?.version || '',
        nodeVersion: nodeVer,
        npmVersion: npmVer,
        globalNpmPath: globalPath,
        guides: [
          { step: 1, title: '安装 PM2', cmd: 'npm install -g pm2', desc: '全局安装 PM2 进程管理器' },
          { step: 2, title: '创建 ecosystem 配置', cmd: 'pm2 init', desc: '在项目目录生成 ecosystem.config.js' },
          { step: 3, title: '启动应用（示例）', cmd: 'pm2 start ecosystem.config.js', desc: '按配置文件启动进程' },
          { step: 4, title: '设置开机自启', cmd: 'pm2 startup && pm2 save', desc: '让 PM2 随系统启动' }
        ]
      }
    };
  }
  // 获取所有 PM2 进程
  getProcesses() {
    try {
      const raw = execSync('pm2 jlist 2>/dev/null', { timeout: 5000, encoding: 'utf-8' });
      if (!raw.trim()) return { success: true, data: { processes: [], count: 0 } };

      const processes = JSON.parse(raw);
      const summary = {
        online: processes.filter(p => p.pm2_env?.status === 'online').length,
        stopped: processes.filter(p => p.pm2_env?.status === 'stopped').length,
        errored: processes.filter(p => p.pm2_env?.status === 'errored').length,
        total: processes.length,
        uptime: this._formatUptimeSec(processes[0]?.pm2_env?.pm_uptime ?
          (Date.now() - processes[0].pm2_env.pm_uptime) / 1000 : 0)
      };

      const mapped = processes.map(p => ({
        id: p.pm_id,
        pid: p.pid,
        name: p.name,
        status: p.pm2_env?.status || 'unknown',
        restarts: p.pm2_env?.restart_time || 0,
        uptime: Math.floor((Date.now() - (p.pm2_env?.pm_uptime || Date.now())) / 1000),
        cpu: Math.round((p.monit?.cpu || 0) * 100) / 100,
        memory: Math.round((p.monit?.memory || 0) / 1024 / 1024 * 100) / 100,  // MB
        cwd: p.pm2_env?.pm_cwd || '',
        execPath: p.pm2_env?.pm_exec_path || '',
        instances: p.pm2_env?.instances || 1,
        execMode: p.pm2_env?.exec_mode || 'fork',
        unstable: p.pm2_env?.unstable_restarts || 0
      }));

      return { success: true, data: { processes: mapped, summary } };
    } catch (err) {
      const notRunning = err.message.includes('not found') || err.message.includes('not running') || 
                         err.message.includes('ENOENT') || err.message.includes('command not found') ||
                         err.message.includes('no processes');
      return { 
        success: true, 
        data: { 
          processes: [], 
          count: 0,
          error: notRunning ? 'pm2_not_running' : err.message,
          message: notRunning ? 'PM2 未运行或无进程' : 'PM2 查询失败: ' + err.message
        }
      };
    }
  }

  // 获取单个进程详情
  getProcess(id) {
    try {
      const raw = execSync(`pm2 jlist 2>/dev/null`, { timeout: 5000, encoding: 'utf-8' });
      const processes = JSON.parse(raw);
      const p = processes.find(p => p.pm_id == id);
      if (!p) return { success: false, message: '进程不存在' };
      return { success: true, data: this._mapProcess(p) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // 重启进程
  restart(name) {
    try {
      execSync(`pm2 restart '${name}' 2>&1`, { timeout: 10000 });
      return { success: true, message: `进程 ${name} 已重启` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // 停止进程
  stop(name) {
    try {
      execSync(`pm2 stop '${name}' 2>&1`, { timeout: 10000 });
      return { success: true, message: `进程 ${name} 已停止` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // 启动进程
  start(name) {
    try {
      execSync(`pm2 start '${name}' 2>&1`, { timeout: 10000 });
      return { success: true, message: `进程 ${name} 已启动` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // 删除进程
  delete(name) {
    try {
      execSync(`pm2 delete '${name}' 2>&1`, { timeout: 5000 });
      return { success: true, message: `进程 ${name} 已删除` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // 获取 PM2 概览
  getOverview() {
    try {
      const result = execSync('pm2 info 0 2>&1 | head -30', { timeout: 5000, encoding: 'utf-8' });
      const pm2Ver = execSync('pm2 -v 2>/dev/null', { timeout: 3000, encoding: 'utf-8' }).trim();
      const node = os.hostname();
      return { 
        success: true, 
        data: { 
          pm2Version: pm2Ver,
          hostname: node,
          running: true
        }
      };
    } catch (err) {
      return { success: true, data: { pm2Version: 'unknown', running: false } };
    }
  }

  // 保存 PM2 配置
  save() {
    try {
      execSync('pm2 save 2>&1', { timeout: 5000 });
      return { success: true, message: 'PM2 配置已保存' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  _mapProcess(p) {
    return {
      id: p.pm_id,
      pid: p.pid,
      name: p.name,
      status: p.pm2_env?.status || 'unknown',
      cpu: Math.round((p.monit?.cpu || 0) * 100) / 100,
      memory: Math.round((p.monit?.memory || 0) / 1024 / 1024 * 100) / 100,
      uptime: Math.floor((Date.now() - (p.pm2_env?.pm_uptime || 0)) / 1000),
      restarts: p.pm2_env?.restart_time || 0,
      cwd: p.pm2_env?.pm_cwd || '',
      execPath: p.pm2_env?.pm_exec_path || ''
    };
  }

  _formatUptimeSec(seconds) {
    if (seconds <= 0) return '--';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }
}

module.exports = new Pm2Service();