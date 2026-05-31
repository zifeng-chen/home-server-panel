// PM2 进程管理服务
const { execSync } = require('child_process');
const os = require('os');

class Pm2Service {
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