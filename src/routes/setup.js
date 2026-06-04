// 引导安装路由（无需认证）
const express = require('express');
const router = express.Router();
const setupService = require('../services/setup-service');
const fs = require('fs');
const path = require('path');

// 检查是否已安装
function isInstalled() {
  try {
    const envPath = path.join(__dirname, '..', '..', '.env');
    const env = fs.readFileSync(envPath, 'utf-8');
    return env.includes('ADMIN_PASS=') && !env.includes('ADMIN_PASS=admin123');
  } catch (e) {
    return false;
  }
}

// 获取安装状态
router.get('/status', (req, res) => {
  res.json({ success: true, data: { installed: isInstalled() } });
});

// 测试数据库连接
router.post('/test-db', async (req, res) => {
  const { host, port, user, password, database } = req.body;
  if (!host || !user) {
    return res.json({ success: false, message: '缺少必要参数' });
  }
  const result = await setupService.testDbConnection({ host, port: port || 3306, user, password, database });
  res.json(result);
});

// 完成安装
router.post('/install', async (req, res) => {
  // 防止重复安装
  if (isInstalled()) {
    return res.json({ success: false, message: '系统已安装，请直接登录' });
  }

  const config = req.body;
  if (!config.adminUser || !config.adminPass) {
    return res.json({ success: false, message: '请填写管理员账号和密码' });
  }

  try {
    const result = await setupService.install(config);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: `安装失败: ${err.message}` });
  }
});

module.exports = router;
