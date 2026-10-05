// V2 文件操作服务 — 本地设备直读 fs / 远程设备经 WS 命令通道转发
// 服务端侧同样做路径白名单校验（纵深防御，不依赖 Agent 单点）
const fsp = require('fs').promises;
const path = require('path');
const commandService = require('./command-service');

// 与 agent/fileserver.go 保持一致的白名单
const ALLOWED_ROOTS = [
  '/home', '/root', '/opt', '/srv', '/usr/local',
  '/var/log', '/var/lib', '/var/www', '/tmp', '/mnt', '/media',
  '/etc', '/user', '/share', '/volume1', '/volume2', '/volume3', '/volume4',
];
const DENIED_PREFIXES = [
  '/etc/shadow', '/etc/gshadow', '/etc/sudoers',
  '/root/.ssh', '/.ssh', '/etc/ssh/ssh_host_',
];
const DENIED_NAMES = new Set([
  'id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa',
  'authorized_keys', 'shadow', 'gshadow', '.netrc', '.pgpass',
]);

const MAX_READ = 2 * 1024 * 1024;
const MAX_UPLOAD = 32 * 1024 * 1024;

/**
 * 归一化 + 校验路径
 * @returns {{ ok: boolean, abs?: string, error?: string }}
 */
function safePath(p) {
  if (!p || typeof p !== 'string') return { ok: false, error: '路径不能为空' };
  if (p.includes('\x00')) return { ok: false, error: '非法路径' };
  const clean = path.normalize(p);
  if (!path.isAbsolute(clean)) return { ok: false, error: '仅支持绝对路径' };
  if (clean.includes('..')) return { ok: false, error: '非法路径' };
  const low = clean.toLowerCase();
  for (const d of DENIED_PREFIXES) {
    if (low === d || low.startsWith(d + '/') || low.startsWith(d)) {
      return { ok: false, error: '禁止访问该路径' };
    }
  }
  const base = path.basename(clean).toLowerCase();
  if (DENIED_NAMES.has(base)) return { ok: false, error: '禁止访问该文件' };
  const ok = ALLOWED_ROOTS.some(r => clean === r || clean.startsWith(r + '/'));
  if (!ok) return { ok: false, error: '路径不在允许范围内' };
  return { ok: true, abs: clean };
}

class FileService {
  /**
   * 列出目录
   */
  async list(deviceId, dir) {
    const check = safePath(dir);
    if (!check.ok) throw new Error(check.error);
    return this._dispatch(deviceId, 'file_list', { path: check.abs });
  }

  /**
   * 读取文本文件
   */
  async read(deviceId, file) {
    const check = safePath(file);
    if (!check.ok) throw new Error(check.error);
    return this._dispatch(deviceId, 'file_read', { path: check.abs });
  }

  /**
   * 写入文本文件
   */
  async write(deviceId, file, content) {
    const check = safePath(file);
    if (!check.ok) throw new Error(check.error);
    return this._dispatch(deviceId, 'file_write', { path: check.abs, content: content || '' });
  }

  /**
   * 删除文件/空目录
   */
  async remove(deviceId, file) {
    const check = safePath(file);
    if (!check.ok) throw new Error(check.error);
    return this._dispatch(deviceId, 'file_delete', { path: check.abs });
  }

  /**
   * 上传文件（base64）
   */
  async upload(deviceId, dir, name, base64) {
    if (!name || /[\/\\]/.test(name)) throw new Error('非法文件名');
    const check = safePath(dir);
    if (!check.ok) throw new Error(check.error);
    const buf = Buffer.from(base64 || '', 'base64');
    if (buf.length > MAX_UPLOAD) throw new Error('文件过大 (>32MB)');
    return this._dispatch(deviceId, 'file_upload', { path: check.abs, name, content: base64 });
  }

  /**
   * 读取文件原始 Buffer（用于下载）
   */
  async download(deviceId, file) {
    const check = safePath(file);
    if (!check.ok) throw new Error(check.error);
    if (deviceId === 'dev_local') {
      return { path: check.abs, buffer: await fsp.readFile(check.abs) };
    }
    const reply = await commandService.send(deviceId, {
      action: 'file_read', data: { path: check.abs }
    }, 30000);
    const r = reply.result || {};
    if (r.error) throw new Error(r.error);
    return { path: r.path || check.abs, buffer: Buffer.from(r.content || '', 'utf8') };
  }

  /**
   * 分发：本地直读 / 远程转发
   */
  async _dispatch(deviceId, action, data) {
    if (deviceId === 'dev_local') return this._local(action, data);
    const reply = await commandService.send(deviceId, { action, data }, 25000);
    const result = reply && reply.result ? reply.result : {};
    if (result.error) throw new Error(result.error);
    return result;
  }

  /**
   * 本地设备直接文件系统操作
   */
  async _local(action, data) {
    switch (action) {
      case 'file_list': {
        const entries = await fsp.readdir(data.path, { withFileTypes: true });
        const files = [];
        for (const e of entries) {
          let st;
          try { st = await fsp.stat(path.join(data.path, e.name)); } catch { continue; }
          files.push({
            name: e.name,
            size: st.size,
            mode: (st.mode & 0o777).toString(8),
            isDir: e.isDirectory(),
            modTime: fmtTime(st.mtime),
          });
        }
        files.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        const parent = path.dirname(data.path);
        return { path: data.path, parent: parent === data.path ? '' : parent, files };
      }
      case 'file_read': {
        const st = await fsp.stat(data.path);
        if (st.isDirectory()) throw new Error('目标是目录，无法读取');
        if (st.size > MAX_READ) throw new Error('文件过大 (>2MB)');
        const content = await fsp.readFile(data.path);
        const encoding = content.includes(0) ? 'binary' : 'utf8';
        return { path: data.path, content: content.toString(), size: content.length, encoding };
      }
      case 'file_write': {
        await fsp.mkdir(path.dirname(data.path), { recursive: true });
        await fsp.writeFile(data.path, data.content || '', 'utf8');
        return { path: data.path, written: Buffer.byteLength(data.content || '') };
      }
      case 'file_delete': {
        if (data.path === '/') throw new Error('禁止删除根目录');
        const st = await fsp.stat(data.path);
        await fsp.rm(data.path, { recursive: false, force: false });
        return { path: data.path, deleted: true, isDir: st.isDirectory() };
      }
      case 'file_upload': {
        const raw = Buffer.from(data.content || '', 'base64');
        if (raw.length > MAX_UPLOAD) throw new Error('文件过大 (>32MB)');
        const target = path.join(data.path, data.name);
        await fsp.writeFile(target, raw);
        return { path: target, size: raw.length };
      }
      default:
        throw new Error('未知文件动作: ' + action);
    }
  }
}

function fmtTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

module.exports = new FileService();
module.exports.safePath = safePath;
