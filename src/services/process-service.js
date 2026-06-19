// 进程聚合服务：PM2 + Docker + 系统服务
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

class ProcessService {
  // 聚合所有进程信息
  async listAll() {
    const [pm2, docker, system] = await Promise.allSettled([
      this._getPm2Processes(),
      this._getDockerContainers(),
      this._getSystemServices()
    ]);

    const pm2List = pm2.status === 'fulfilled' ? pm2.value : [];
    const dockerList = docker.status === 'fulfilled' ? docker.value : [];
    const sysList = system.status === 'fulfilled' ? system.value : [];

    return {
      pm2: pm2List,
      docker: dockerList,
      system: sysList,
      summary: {
        pm2: { total: pm2List.length, online: pm2List.filter(p => p.status === 'online').length },
        docker: { total: dockerList.length, running: dockerList.filter(d => d.status === 'running').length },
        system: { total: sysList.length, active: sysList.filter(s => s.active).length },
        total: pm2List.length + dockerList.length + sysList.length
      }
    };
  }

  // PM2 进程（通过 pm2 jlist）
  _getPm2Processes() {
    try {
      let pm2Bin = this._findPm2();
      const raw = execSync(`${pm2Bin} jlist 2>/dev/null`, { timeout: 5000, encoding: 'utf-8' });
      if (!raw.trim()) return [];
      const processes = JSON.parse(raw);
      return processes.map(p => ({
        id: `pm2-${p.pm_id}`,
        name: p.name,
        pid: p.pid,
        type: 'pm2',
        typeLabel: 'PM2',
        status: p.pm2_env?.status || 'unknown',
        cpu: Math.round((p.monit?.cpu || 0) * 100) / 100,
        memory: Math.round((p.monit?.memory || 0) / 1024 / 1024 * 100) / 100, // MB
        uptime: Math.floor((Date.now() - (p.pm2_env?.pm_uptime || Date.now())) / 1000),
        restarts: p.pm2_env?.restart_time || 0,
        cwd: p.pm2_env?.pm_cwd || '',
        execMode: p.pm2_env?.exec_mode || 'fork',
        instances: p.pm2_env?.instances || 1
      }));
    } catch (_) {
      return [];
    }
  }

  // Docker 容器进程
  async _getDockerContainers() {
    return new Promise((resolve) => {
      const sock = process.env.DOCKER_SOCK || '/var/run/docker.sock';
      if (!fs.existsSync(sock)) return resolve([]);

      const http = require('http');
      const options = { socketPath: sock, path: '/containers/json?all=true', method: 'GET' };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const containers = JSON.parse(data);
            resolve(containers.map(c => {
              const ports = (c.Ports || []).map(p => p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`).join(', ');
              return {
                id: `docker-${c.Id.substring(0, 12)}`,
                name: (c.Names?.[0] || c.Id.substring(0, 12)).replace(/^\//, ''),
                pid: 0,
                type: 'docker',
                typeLabel: 'Docker',
                status: c.State === 'running' ? 'running' : 'stopped',
                image: c.Image || '',
                ports: ports || '--',
                created: c.Created ? new Date(c.Created * 1000).toLocaleDateString('zh-CN') : '--',
                containerId: c.Id ? c.Id.substring(0, 12) : '--'
              };
            }));
          } catch (_) { resolve([]); }
        });
      });
      req.on('error', () => resolve([]));
      req.setTimeout(5000, () => { req.destroy(); resolve([]); });
      req.end();
    });
  }

  // 系统关键服务状态
  _getSystemServices() {
    const platform = os.platform();
    const services = [];

    // 关键服务定义
    const svcDefs = [
      { name: 'SSH', bin: 'sshd', check: () => this._checkPort(22) },
      { name: 'Nginx', bin: 'nginx', check: () => this._checkProcess('nginx') },
      { name: 'DNS (dnsmasq)', bin: 'dnsmasq', check: () => this._checkProcess('dnsmasq') || this._checkPort(53) },
      { name: 'Cron', bin: 'crond', check: () => this._checkProcess('crond') || this._checkProcess('cron') },
      { name: 'Docker', bin: 'dockerd', check: () => this._checkProcess('dockerd') },
      { name: '系统日志', bin: 'syslog-ng', check: () => this._checkProcess('syslog') || this._checkProcess('rsyslogd') },
      { name: '网络管理', bin: 'netifd', check: () => platform === 'linux' && this._checkProcess('netifd') },
      { name: 'DHCP (odhcpd)', bin: 'odhcpd', check: () => this._checkProcess('odhcpd') },
      { name: 'uHTTPd (Web UI)', bin: 'uhttpd', check: () => this._checkProcess('uhttpd') },
      { name: 'OpenClash', bin: 'clash', check: () => this._checkProcess('clash') },
      { name: 'UPnP (miniupnpd)', bin: 'miniupnpd', check: () => this._checkProcess('miniupnpd') },
      { name: 'Samba', bin: 'smbd', check: () => this._checkProcess('smbd') },
      { name: 'Server Panel', bin: 'node', check: () => this._checkPort(3456) },
      { name: 'MySQL', bin: 'mysqld', check: () => this._checkProcess('mysqld') || this._checkPort(3306) },
      { name: 'acme.sh', bin: 'acme.sh', check: () => this._checkProcess('acme.sh') }
    ];

    for (const s of svcDefs) {
      try {
        const active = s.check();
        let pid = 0;
        if (active) {
          try {
            const out = execSync(`ps w | grep -w "${s.bin}" | grep -v grep | awk '{print $1}' | head -1`, { timeout: 2000, encoding: 'utf-8' }).trim();
            pid = parseInt(out) || 0;
          } catch (_) {}
        }
        services.push({
          id: `sys-${s.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: s.name,
          pid,
          type: 'system',
          typeLabel: '系统服务',
          status: active ? 'active' : 'inactive',
          active
        });
      } catch (_) {
        services.push({
          id: `sys-${s.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: s.name,
          pid: 0,
          type: 'system',
          typeLabel: '系统服务',
          status: 'unknown',
          active: false
        });
      }
    }

    return services;
  }

  _checkPort(port) {
    try {
      execSync(`echo > /dev/tcp/127.0.0.1/${port} 2>/dev/null || true`, { timeout: 2000, shell: '/bin/bash' });
      return true;
    } catch (_) {
      // bash TCP fallback
      try {
        if (fs.existsSync('/proc/net/tcp')) {
          const content = fs.readFileSync('/proc/net/tcp', 'utf-8');
          const hexPort = port.toString(16).padStart(4, '0').toUpperCase();
          return content.includes(`:${hexPort} `) && content.includes(' 0A ');
        }
      } catch (_) {}
      return false;
    }
  }

  _checkProcess(name) {
    try {
      const out = execSync(`ps w 2>/dev/null | grep -w "${name}" | grep -v grep`, { timeout: 3000, encoding: 'utf-8' });
      return out.trim().length > 0;
    } catch (_) {
      // /proc/cmdline fallback
      try {
        const procDirs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
        for (const pid of procDirs) {
          try {
            const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf-8').trim();
            if (comm === name) return true;
          } catch (_) {}
        }
      } catch (_) {}
      return false;
    }
  }

  _findPm2() {
    try {
      const p = execSync('which pm2 2>/dev/null', { timeout: 2000, encoding: 'utf-8' }).trim();
      if (p) return p;
    } catch (_) {}
    for (const c of ['/root/.npm-global/bin/pm2', '/usr/local/bin/pm2', '/usr/bin/pm2']) {
      if (fs.existsSync(c)) return c;
    }
    return 'pm2';
  }
}

module.exports = new ProcessService();
