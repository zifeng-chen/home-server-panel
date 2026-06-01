// Docker 管理服务 - docker CLI 封装
const { execSync, exec } = require('child_process');
const os = require('os');

class DockerService {
  constructor() {
    this._available = null;
    this._sudoCmd = '';
  }

  async _init() {
    if (this._available !== null) return;

    // 1. 一次性检测：执行 docker info 并捕获全部输出
    try {
      const output = execSync('docker info 2>&1 || true', {
        timeout: 8000, encoding: 'utf-8', stdio: 'pipe'
      });

      // 权限被拒
      if (output.includes('permission denied')) {
        // 尝试 sudo -n (NOPASSWD)
        try {
          execSync('sudo -n docker info 2>/dev/null', { timeout: 5000, stdio: 'pipe' });
          this._available = true;
          this._sudoCmd = 'sudo -n ';
          return;
        } catch (e) {}

        // 尝试 DOCKER_SUDO_PASS env
        const sudoPass = process.env.DOCKER_SUDO_PASS || '';
        if (sudoPass) {
          try {
            execSync(`echo "${sudoPass}" | sudo -S docker info 2>/dev/null`, { timeout: 8000, stdio: 'pipe' });
            this._available = true;
            this._sudoCmd = `echo "${sudoPass}" | sudo -S `;
            return;
          } catch (e) {}
        }

        this._available = false;
        this._permDenied = true;
        return;
      }

      // 没有权限问题 → 检查是否有 Docker 守护进程
      if (output.includes('Cannot connect') || output.includes('Is the docker daemon')) {
        this._available = false;
        return;
      }

      // 可用
      this._available = true;
      this._sudoCmd = '';
    } catch (e) {
      // docker 命令不存在
      this._available = false;
    }
  }

  getDockerCmd() { return this._sudoCmd + 'docker'; }

  async getInfo() {
    await this._init();
    if (!this._available) {
      const msg = this._permDenied
        ? `Docker Socket 权限不足。请将用户加入 docker 组: sudo usermod -aG docker $(whoami) && newgrp docker`
        : 'Docker 不可用，请安装 Docker 并启动 Docker 服务';
      return { available: false, message: msg, permDenied: !!this._permDenied };
    }

    try {
      // 用独立字段提取，避免 JSON 解析失败
      const fmt = async (tmpl) => {
        try { return this._execSync(`${this.getDockerCmd()} info --format "${tmpl}" 2>/dev/null`); }
        catch (e) { return '0'; }
      };

      const [containers, running, paused, stopped, images, serverVersion, driver, name, memTotal, ncpu] =
        await Promise.all([
          fmt('{{.Containers}}'), fmt('{{.ContainersRunning}}'), fmt('{{.ContainersPaused}}'),
          fmt('{{.ContainersStopped}}'), fmt('{{.Images}}'), fmt('{{.ServerVersion}}'),
          fmt('{{.Driver}}'), fmt('{{.Name}}'), fmt('{{.MemTotal}}'), fmt('{{.NCPU}}')
        ]);

      return {
        available: true,
        version: serverVersion.replace(/[^\d.]/g, '') || '?',
        containers: parseInt(containers) || 0,
        running: parseInt(running) || 0,
        paused: parseInt(paused) || 0,
        stopped: parseInt(stopped) || 0,
        images: parseInt(images) || 0,
        driver: driver || '',
        osType: 'linux',
        name: name || os.hostname(),
        memory: parseInt(memTotal) || 0,
        cpus: parseInt(ncpu) || 0,
        swarm: 'inactive'
      };
    } catch (err) {
      return { available: false, message: '读取 Docker 信息失败: ' + err.message };
    }
  }

  async listContainers(all = true) {
    await this._init();
    if (!this._available) return [];

    try {
      const format = '{{.ID}}|||{{.Names}}|||{{.Image}}|||{{.State}}|||{{.Status}}|||{{.Ports}}|||{{.CreatedAt}}|||{{.Size}}|||{{.Mounts}}|||{{.Networks}}';
      const cmd = `${this.getDockerCmd()} ps ${all ? '-a' : ''} --format '${format}' --no-trunc`;
      const raw = this._execSync(cmd);

      return raw.split('\n').filter(Boolean).map(line => {
        const [id, name, image, state, status, ports, created, size, mounts, networks] = line.split('|||');
        const sizeParts = size.match(/Rw:([\d.]+)\s*(\w+)/);
        return {
          id: id.slice(0, 12),
          fullId: id,
          name,
          image,
          state,
          status,
          ports: this._parsePorts(ports),
          created: created ? created.slice(0, 19) : '',
          size: sizeParts ? `${sizeParts[1]} ${sizeParts[2]}` : '--',
          mounts: mounts || '--',
          networks: networks || '--'
        };
      });
    } catch (err) {
      return [];
    }
  }

  async getContainer(id) {
    const containers = await this.listContainers(true);
    return containers.find(c => c.id.startsWith(id) || c.name === id);
  }

  async containerAction(id, action) {
    await this._init();
    const actions = {
      start: 'start', stop: 'stop', restart: 'restart',
      pause: 'pause', unpause: 'unpause', kill: 'kill'
    };
    const dockerAction = actions[action];
    if (!dockerAction) throw new Error(`不支持的操作: ${action}`);

    this._execSync(`${this.getDockerCmd()} ${dockerAction} ${id}`);
    return { success: true, action, message: `容器 ${action} 完成` };
  }

  async removeContainer(id, force = false) {
    await this._init();
    const flag = force ? '-f' : '';
    this._execSync(`${this.getDockerCmd()} rm ${flag} ${id}`);
    return { success: true, message: '容器已删除' };
  }

  async getLogs(id, lines = 100) {
    await this._init();
    const cmd = `${this.getDockerCmd()} logs --tail ${lines} --timestamps ${id} 2>&1`;
    return this._execSync(cmd);
  }

  async getStats(id) {
    await this._init();
    const format = '"{{json .}}"';
    const cmd = `${this.getDockerCmd()} stats --no-stream --format ${format} ${id}`;
    const raw = this._execSync(cmd);
    try {
      const data = JSON.parse(raw.trim());
      return {
        name: data.Name,
        cpuPercent: parseFloat(data.CPUPerc?.replace('%', '')) || 0,
        memoryUsage: data.MemUsage?.split('/')[0]?.trim() || '0',
        memoryLimit: data.MemUsage?.split('/')[1]?.trim() || '0',
        memoryPercent: parseFloat(data.MemPerc?.replace('%', '')) || 0,
        netIO: data.NetIO || '--',
        blockIO: data.BlockIO || '--',
        pids: parseInt(data.PIDs) || 0
      };
    } catch (e) {
      return null;
    }
  }

  async getAllStats() {
    await this._init();
    if (!this._available) return [];
    // 批量获取：一次 docker stats --all 获取所有容器快照，避免逐个 execSync 阻塞事件循环
    const format = '"{{json .}}"';
    const cmd = `${this.getDockerCmd()} stats --no-stream --all --format ${format} 2>/dev/null`;
    const raw = this._execSync(cmd);
    const stats = [];
    const lines = raw.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const data = JSON.parse(line.trim());
        // 过滤已停止的容器（CPU 为 0.00% 且无内存使用）
        const cpuStr = (data.CPUPerc || '').replace('%', '');
        const memStr = (data.MemUsage || '').split('/')[0]?.trim();
        if (cpuStr === '0.00' && (memStr === '0B' || memStr === '0KiB')) continue;
        stats.push({
          name: data.Name,
          cpuPercent: parseFloat(cpuStr) || 0,
          memoryUsage: memStr || '0',
          memoryLimit: (data.MemUsage || '').split('/')[1]?.trim() || '0',
          memoryPercent: parseFloat((data.MemPerc || '').replace('%', '')) || 0,
          netIO: data.NetIO || '--',
          blockIO: data.BlockIO || '--',
          pids: parseInt(data.PIDs) || 0
        });
      } catch (e) {}
    }
    return stats;
  }

  async listImages() {
    await this._init();
    if (!this._available) return [];

    try {
      const format = '{{.Repository}}|||{{.Tag}}|||{{.ID}}|||{{.CreatedSince}}|||{{.Size}}|||{{.Containers}}';
      const raw = this._execSync(`${this.getDockerCmd()} images --format '${format}'`);
      return raw.split('\n').filter(Boolean).map(line => {
        const [repo, tag, id, created, size, containers] = line.split('|||');
        return {
          id: id.slice(0, 12),
          repository: repo,
          tag,
          fullTag: `${repo}:${tag}`,
          created,
          size,
          containers: parseInt(containers) || 0
        };
      });
    } catch (err) {
      return [];
    }
  }

  async listNetworks() {
    await this._init();
    if (!this._available) return [];

    try {
      const format = '{{.ID}}|||{{.Name}}|||{{.Driver}}|||{{.Scope}}|||{{.Internal}}|||{{.Containers}}';
      const raw = this._execSync(`${this.getDockerCmd()} network ls --format '${format}'`);
      return raw.split('\n').filter(Boolean).map(line => {
        const [id, name, driver, scope, internal, containers] = line.split('|||');
        return {
          id: id.slice(0, 12),
          name, driver, scope,
          internal: internal === 'true',
          containers: containers ? containers.split(',').length : 0
        };
      });
    } catch (err) {
      return [];
    }
  }

  async listVolumes() {
    await this._init();
    if (!this._available) return [];

    try {
      const format = '{{.Name}}|||{{.Driver}}|||{{.Mountpoint}}|||{{.Size}}';
      const raw = this._execSync(`${this.getDockerCmd()} volume ls --format '${format}'`);
      return raw.split('\n').filter(Boolean).map(line => {
        const [name, driver, mountpoint, size] = line.split('|||');
        return { name, driver, mountpoint, size: size || '--' };
      });
    } catch (err) {
      return [];
    }
  }

  // SSE 日志流
  streamLogs(id, lines, res) {
    this._init().then(() => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

      const cmd = `${this.getDockerCmd()} logs --tail ${lines || 50} --follow --timestamps ${id} 2>&1`;
      const child = exec(cmd, { timeout: 300000 });
      let buffer = '';

      child.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const l of lines) {
          if (l.trim()) send('output', { text: l });
        }
      });

      child.stderr.on('data', (data) => {
        send('output', { text: data.toString().trim(), stream: 'stderr' });
      });

      child.on('close', () => { if (buffer.trim()) send('output', { text: buffer.trim() }); send('done', {}); res.end(); });
      child.on('error', (err) => { send('error', { message: err.message }); res.end(); });
      req?.on?.('close', () => child.kill());
    });
  }

  _execSync(cmd) {
    try {
      return execSync(cmd, { timeout: 12000, encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch (err) {
      throw new Error(err.stderr?.toString() || err.message);
    }
  }

  _parsePorts(portsStr) {
    if (!portsStr) return [];
    return portsStr.split(',').map(p => {
      // 兼容两种格式: "15433->5432/tcp" 和 "0.0.0.0:15433->5432/tcp" 和 ":::15433->5432/tcp"
      const m = p.trim().match(/(?:[\[\]:.0-9a-fA-F]*:)?(\d+)->(\d+)\/(tcp|udp)/);
      return m ? { host: parseInt(m[1]), container: parseInt(m[2]), protocol: m[3] } : { raw: p.trim() };
    });
  }
}

module.exports = new DockerService();
