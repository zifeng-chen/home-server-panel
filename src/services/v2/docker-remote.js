// V2 远程 Docker 服务 — 本地设备直接调 docker CLI / 远程设备经 WS 命令通道转发
// 服务端侧同样做引用白名单校验（纵深防御，不依赖 Agent 单点）
const { execFile } = require('child_process');
const commandService = require('./command-service');
const { safePath } = require('./file-service');

// 与 agent/docker.go 保持一致的白名单
const CONTAINER_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const IMAGE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,190}$/;
const CONTAINER_ACTIONS = new Set(['start', 'stop', 'restart', 'kill', 'pause', 'unpause']);
const COMPOSE_ACTIONS = new Set(['up', 'down', 'ps', 'logs', 'restart', 'stop', 'start', 'pull', 'config']);
const PRUNE_TARGETS = new Set(['image', 'images', 'container', 'containers', 'network', 'networks', 'volume', 'volumes', 'builder']);

const QUERY_TIMEOUT = 25000;
const ACTION_TIMEOUT = 95000;
const PULL_TIMEOUT = 300000;

const DOCKER_CANDIDATES = [
  'docker',
  '/usr/bin/docker',
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  '/opt/bin/docker',
  '/Applications/Docker.app/Contents/Resources/bin/docker',
];

let cachedBin = null;
function dockerBin() {
  if (cachedBin) return cachedBin;
  const fs = require('fs');
  for (const c of DOCKER_CANDIDATES) {
    if (c === 'docker') continue;
    try { fs.accessSync(c, fs.constants.X_OK); cachedBin = c; return c; } catch { /* next */ }
  }
  cachedBin = 'docker';
  return cachedBin;
}

/** 执行本地 docker 命令，永不 throw，返回结构化结果 */
function dockerExec(args, timeout = QUERY_TIMEOUT) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(dockerBin(), args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const base = {
        stdout: stdout || '',
        stderr: stderr || '',
        duration_ms: Date.now() - started,
        exit_code: 0,
      };
      if (!err) return resolve(base);
      let code = 1;
      if (typeof err.code === 'number') code = err.code;
      else if (err.killed) code = 124;
      const msg = String(stderr || '').trim();
      let error = msg || err.message || 'docker 执行失败';
      if (/ENOENT|not found/i.test(err.message || '')) error = 'Docker 未安装或 docker 命令不可用';
      if (err.killed) error = `docker 命令超时 (${timeout}ms)`;
      resolve({ ...base, exit_code: code, error });
    });
  });
}

function assertContainerRef(name) {
  if (!name || typeof name !== 'string') throw new Error('缺少容器名或 ID');
  if (!CONTAINER_REF_RE.test(name.trim())) throw new Error('非法容器名/ID');
  return name.trim();
}
function assertImageRef(image) {
  if (!image || typeof image !== 'string') throw new Error('缺少镜像名');
  if (!IMAGE_REF_RE.test(image.trim())) throw new Error('非法镜像引用');
  return image.trim();
}

const splitLines = (s) => String(s || '').split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '');
const countLines = (s) => splitLines(s).length;

class DockerRemote {
  // ===== 概览 =====
  async status(deviceId) {
    if (deviceId === 'dev_local') return this._local('docker_status', {});
    return this._dispatch(deviceId, 'docker_status', {});
  }

  // ===== 容器 =====
  async listContainers(deviceId, opts = {}) {
    const data = { all: opts.all !== false };
    if (deviceId === 'dev_local') return this._local('docker_ps', data);
    return this._dispatch(deviceId, 'docker_ps', data);
  }

  async logs(deviceId, name, opts = {}) {
    const data = {
      name: assertContainerRef(name),
      tail: Math.min(Math.max(parseInt(opts.tail) || 200, 1), 2000),
      since: opts.since || '',
    };
    if (deviceId === 'dev_local') return this._local('docker_logs', data);
    return this._dispatch(deviceId, 'docker_logs', data);
  }

  async stats(deviceId) {
    if (deviceId === 'dev_local') return this._local('docker_stats', {});
    return this._dispatch(deviceId, 'docker_stats', {}, ACTION_TIMEOUT);
  }

  async action(deviceId, name, action) {
    const ref = assertContainerRef(name);
    if (!CONTAINER_ACTIONS.has(action)) throw new Error('不支持的容器操作: ' + action);
    const data = { name: ref, action };
    if (deviceId === 'dev_local') return this._local('docker_action', data);
    return this._dispatch(deviceId, 'docker_action', data, ACTION_TIMEOUT);
  }

  async removeContainer(deviceId, name, force = false) {
    const ref = assertContainerRef(name);
    const data = { name: ref, force: !!force };
    if (deviceId === 'dev_local') return this._local('docker_remove', data);
    return this._dispatch(deviceId, 'docker_remove', data, ACTION_TIMEOUT);
  }

  // ===== 镜像 =====
  async listImages(deviceId) {
    if (deviceId === 'dev_local') return this._local('docker_images', {});
    return this._dispatch(deviceId, 'docker_images', {});
  }

  async pullImage(deviceId, image) {
    const ref = assertImageRef(image);
    const data = { image: ref };
    if (deviceId === 'dev_local') return this._local('docker_pull', data);
    return this._dispatch(deviceId, 'docker_pull', data, PULL_TIMEOUT);
  }

  async removeImage(deviceId, image, force = false) {
    const ref = assertImageRef(image);
    const data = { image: ref, force: !!force };
    if (deviceId === 'dev_local') return this._local('docker_image_rm', data);
    return this._dispatch(deviceId, 'docker_image_rm', data, ACTION_TIMEOUT);
  }

  async prune(deviceId, target = 'image', confirm = false) {
    const t = String(target || 'image').toLowerCase();
    if (!PRUNE_TARGETS.has(t)) throw new Error('不支持的清理目标: ' + t);
    if ((t === 'volume' || t === 'volumes') && !confirm) {
      throw new Error('清理数据卷会删除数据，需显式确认');
    }
    const data = { target: t, confirm: !!confirm };
    if (deviceId === 'dev_local') return this._local('docker_prune', data);
    return this._dispatch(deviceId, 'docker_prune', data, PULL_TIMEOUT);
  }

  // ===== Compose =====
  async compose(deviceId, file, action, service) {
    if (!file || typeof file !== 'string') throw new Error('缺少 compose 文件路径');
    if (!COMPOSE_ACTIONS.has(action)) throw new Error('不支持的 compose 操作: ' + action);
    if (service && !CONTAINER_REF_RE.test(service)) throw new Error('非法服务名');

    // 与文件浏览器同一套路径白名单（纵深防御，Agent 侧还会再校验一次）
    const check = safePath(file);
    if (!check.ok) throw new Error('compose 文件路径不合法: ' + check.error);
    const abs = check.abs;
    if (!/\.ya?ml$/i.test(abs)) throw new Error('compose 文件必须是 .yml / .yaml');

    const data = { file: abs, action, service: service || '' };
    if (deviceId === 'dev_local') {
      try { await require('fs').promises.access(abs); }
      catch { throw new Error('compose 文件不存在: ' + abs); }
      return this._local('docker_compose', data);
    }
    return this._dispatch(deviceId, 'docker_compose', data, PULL_TIMEOUT);
  }

  // ===== 分发 =====
  async _dispatch(deviceId, action, data, timeout = QUERY_TIMEOUT + 5000) {
    const reply = await commandService.send(deviceId, { action, data }, timeout);
    const result = reply && reply.result ? reply.result : {};
    if (result.error) throw new Error(result.error);
    return result;
  }

  // ===== 本地直连 docker CLI（与 Agent 行为对齐）=====
  async _local(action, data) {
    switch (action) {
      case 'docker_status': {
        const ver = await dockerExec(['version', '--format', '{{.Server.Version}}']);
        if (ver.error) {
          return {
            available: false,
            installed: ver.exit_code !== 127 && !/未安装/.test(ver.error),
            error: ver.error,
          };
        }
        const out = {
          available: true,
          installed: true,
          version: ver.stdout.trim(),
          binary: dockerBin(),
        };
        const all = await dockerExec(['ps', '-a', '--format', '{{.ID}}']);
        if (!all.error) out.containers = countLines(all.stdout);
        const running = await dockerExec(['ps', '--format', '{{.ID}}']);
        if (!running.error) out.running = countLines(running.stdout);
        const imgs = await dockerExec(['images', '--format', '{{.ID}}']);
        if (!imgs.error) out.images = countLines(imgs.stdout);
        const comp = await dockerExec(['compose', 'version']);
        out.compose = !comp.error;
        return out;
      }
      case 'docker_ps': {
        const base = ['ps'];
        if (data.all !== false) base.push('-a');
        let r = await dockerExec([...base, '--no-trunc', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}']);
        if (r.error || r.exit_code !== 0) {
          const r2 = await dockerExec([...base, '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}']);
          if (r2.error || r2.exit_code !== 0) {
            return { available: false, error: r.error || r.stderr.trim() || 'docker ps 执行失败' };
          }
          r = r2;
        }
        const containers = splitLines(r.stdout).map((line) => {
          const f = line.split('\t');
          return {
            id: f[0] || '', name: f[1] || '', image: f[2] || '', state: f[3] || '',
            status: f[4] || '', ports: f[5] || '', created: f[6] || '',
          };
        });
        return { available: true, containers, count: containers.length };
      }
      case 'docker_logs': {
        const args = ['logs', '--tail', String(data.tail || 200)];
        if (data.since) args.push('--since', data.since);
        args.push(data.name);
        const r = await dockerExec(args);
        let text = r.stdout || '';
        if (r.stderr) text += (text ? '\n' : '') + r.stderr;
        if ((r.error || r.exit_code !== 0) && !String(r.stdout || '').trim()) {
          throw new Error(r.error || r.stderr.trim() || '读取日志失败');
        }
        return { name: data.name, tail: data.tail, logs: text };
      }
      case 'docker_stats': {
        const r = await dockerExec(['stats', '--no-stream', '--format',
          '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}'], ACTION_TIMEOUT);
        if (r.error || r.exit_code !== 0) return { available: false, error: r.error || r.stderr.trim() };
        const stats = splitLines(r.stdout).map((line) => {
          const f = line.split('\t');
          return {
            name: f[0] || '', cpu: f[1] || '', mem: f[2] || '', memPct: f[3] || '',
            netIO: f[4] || '', blockIO: f[5] || '', pids: f[6] || '',
          };
        });
        return { available: true, stats };
      }
      case 'docker_action':
      case 'docker_remove': {
        const args = action === 'docker_action'
          ? [data.action, data.name]
          : (data.force ? ['rm', '-f', data.name] : ['rm', data.name]);
        const r = await dockerExec(args, ACTION_TIMEOUT);
        this._throwIfFailed(r);
        return {
          name: data.name,
          action: data.action || 'remove',
          deleted: action === 'docker_remove',
          result: r.stdout.trim(),
          duration_ms: r.duration_ms,
        };
      }
      case 'docker_images': {
        const r = await dockerExec(['images', '--no-trunc', '--format', '{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}']);
        if (r.error || r.exit_code !== 0) return { available: false, error: r.error || r.stderr.trim() };
        const images = splitLines(r.stdout).map((line) => {
          const f = line.split('\t');
          const repo = f[1] || '';
          return {
            id: f[0] || '', repository: repo, tag: f[2] || '', size: f[3] || '',
            created: f[4] || '', dangling: !repo || repo === '<none>',
          };
        });
        return { available: true, images, count: images.length };
      }
      case 'docker_pull': {
        const r = await dockerExec(['pull', data.image], PULL_TIMEOUT);
        this._throwIfFailed(r);
        let out = r.stdout || '';
        if (r.stderr) out += (out ? '\n' : '') + r.stderr;
        return { image: data.image, output: out, duration_ms: r.duration_ms };
      }
      case 'docker_image_rm': {
        const args = data.force ? ['rmi', '-f', data.image] : ['rmi', data.image];
        const r = await dockerExec(args, ACTION_TIMEOUT);
        this._throwIfFailed(r);
        return { image: data.image, deleted: true, result: r.stdout.trim() };
      }
      case 'docker_prune': {
        const map = {
          image: ['image', 'prune', '-f'], images: ['image', 'prune', '-f'],
          container: ['container', 'prune', '-f'], containers: ['container', 'prune', '-f'],
          network: ['network', 'prune', '-f'], networks: ['network', 'prune', '-f'],
          volume: ['volume', 'prune', '-f'], volumes: ['volume', 'prune', '-f'],
          builder: ['builder', 'prune', '-f'],
        };
        const r = await dockerExec(map[data.target], PULL_TIMEOUT);
        this._throwIfFailed(r);
        return { target: data.target, result: r.stdout.trim() };
      }
      case 'docker_compose': {
        const args = ['compose', '-f', data.file];
        if (data.action === 'up') args.push('up', '-d');
        else if (data.action === 'logs') args.push('logs', '--tail', '200');
        else args.push(data.action);
        if (data.service) args.push(data.service);

        const r = await dockerExec(args, PULL_TIMEOUT);
        this._throwIfFailed(r);
        let out = r.stdout || '';
        if (r.stderr) out += (out ? '\n' : '') + r.stderr;
        const res = {
          file: data.file, action: data.action, service: data.service || '',
          output: out, duration_ms: r.duration_ms,
        };
        if (data.action === 'ps') res.containers = parseComposePs(out);
        return res;
      }
      default:
        throw new Error('未知 Docker 动作: ' + action);
    }
  }

  _throwIfFailed(r) {
    if (r.error) throw new Error(r.error);
    if (r.exit_code !== 0) throw new Error(String(r.stderr || '').trim() || `docker 执行失败 (exit ${r.exit_code})`);
  }
}

/** 解析 docker compose ps 表格输出（用表头列位置切片，避免 CREATED/STATUS 含空格被误切） */
function parseComposePs(out) {
  const lines = splitLines(out)
  if (lines.length < 2) return []

  const header = lines[0]
  const cols = []
  const re = /\S+/g
  let m
  while ((m = re.exec(header)) !== null) {
    cols.push({ name: m[0].toUpperCase(), start: m.index, end: Number.MAX_SAFE_INTEGER })
  }
  for (let i = 0; i < cols.length - 1; i++) cols[i].end = cols[i + 1].start
  if (!cols.length) return []

  const rows = []
  for (const line of lines.slice(1)) {
    const c = { name: '', service: '', state: '', status: '', ports: '' }
    for (const col of cols) {
      if (col.start >= line.length) continue
      const val = line.slice(col.start, Math.min(col.end, line.length)).trim()
      switch (col.name) {
        case 'NAME': c.name = val; break
        case 'SERVICE': c.service = val; break
        case 'STATUS': c.status = val; break
        case 'PORTS': c.ports = val; break
        case 'STATE': c.state = val; break
        default: break
      }
    }
    if (!c.name) continue
    if (!c.state) c.state = composeState(c.status)
    rows.push(c)
  }
  return rows
}

function composeState(status) {
  const s = String(status || '').toLowerCase()
  if (s.startsWith('up')) return 'running'
  if (s.startsWith('exited')) return 'exited'
  if (s.startsWith('restarting')) return 'restarting'
  if (s.startsWith('created')) return 'created'
  if (s.startsWith('paused')) return 'paused'
  if (s.startsWith('dead')) return 'dead'
  return 'unknown'
}

module.exports = new DockerRemote();
module.exports.parseComposePs = parseComposePs;
