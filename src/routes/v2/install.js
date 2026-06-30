// V2 Agent 安装 API — /api/v2/install
const express = require('express');
const router = express.Router();
const installer = require('../../services/v2/agent-installer');

// POST /api/v2/install — 一键安装 Agent 到目标设备
router.post('/', async (req, res) => {
  try {
    const { ip, username, password, name, serverUrl } = req.body;
    if (!ip) return res.status(400).json({ success: false, message: '缺少 ip 参数' });
    
    const installId = await installer.install(ip, {
      username: username || 'root',
      password: password || '',
      agentName: name || '',
      serverUrl: serverUrl || ''
    });
    
    res.json({ success: true, data: { install_id: installId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/install/:installId — 查询安装进度
router.get('/:installId', async (req, res) => {
  try {
    const state = installer.getInstall(req.params.installId);
    if (!state) {
      return res.status(404).json({ success: false, message: '安装会话不存在或已过期' });
    }
    res.json({ success: true, data: state });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/v2/install/:installId — 清理安装会话
router.delete('/:installId', (req, res) => {
  installer.archive(req.params.installId);
  res.json({ success: true, message: '已清理' });
});

module.exports = router;
