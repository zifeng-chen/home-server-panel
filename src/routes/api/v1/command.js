const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const DeviceManager = require('../../../services/device-manager');

// POST /api/v1/command/send - 向设备下发命令
router.post('/send', async (req, res) => {
  try {
    const { device_id, action, params } = req.body;
    if (!device_id || !action) {
      return res.status(400).json({ success: false, message: '缺少 device_id 或 action' });
    }

    const commandId = 'cmd_' + crypto.randomBytes(8).toString('hex');
    const command = JSON.stringify({ type: 'command', action, params });
    await DeviceManager.recordCommand(commandId, device_id, command, 'pending');

    // 如果是本地设备，直接执行
    if (device_id === 'dev_local') {
      const result = await executeLocal(action, params);
      await DeviceManager.updateCommandResult(commandId, {
        success: result.success,
        message: result.message,
        result: result.output
      });
    }
    // TODO: 远程设备通过 WebSocket Agent Gateway 下发
    else {
      await DeviceManager.updateCommandResult(commandId, {
        success: false,
        message: 'Agent 通信模块开发中'
      });
    }

    res.json({ success: true, data: { command_id: commandId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/command/:id - 查询命令结果
router.get('/:id', async (req, res) => {
  try {
    const db = require('../../../services/db');
    const cmd = await db.queryOne('SELECT * FROM device_commands WHERE id = ?', [req.params.id]);
    if (!cmd) {
      return res.status(404).json({ success: false, message: '命令不存在' });
    }
    res.json({ success: true, data: cmd });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 本地命令执行（V1 简化版）
async function executeLocal(action, params) {
  const { execSync } = require('child_process');
  try {
    let cmd = '';
    switch (action) {
      case 'system.info': cmd = 'uname -a'; break;
      case 'system.uptime': cmd = 'uptime'; break;
      case 'docker.ps': cmd = 'docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "Docker not available"'; break;
      case 'docker.restart':
        if (!params?.container) throw new Error('缺少容器名');
        cmd = `docker restart ${params.container}`;
        break;
      case 'nginx.reload': cmd = 'nginx -s reload 2>&1 || echo "Nginx not available"'; break;
      case 'nginx.test': cmd = 'nginx -t 2>&1'; break;
      default: throw new Error(`不支持的操作: ${action}`);
    }
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
    return { success: true, message: '执行成功', output };
  } catch (err) {
    return { success: false, message: err.message, output: err.stderr || err.stdout || '' };
  }
}

module.exports = router;
