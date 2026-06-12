// 引导安装路由（无需认证）
const express = require('express');
const router = express.Router();
const setupService = require('../services/setup-service');
const fs = require('fs');
const path = require('path');

// 检查是否已安装
function isInstalled() {
  try {
    // 方式1：检查 .env 文件
    const envPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, 'utf-8');
      if (env.includes('ADMIN_PASS=') && !env.includes('ADMIN_PASS=admin123')) return true;
    }
    // 方式2：检查 SQLite 数据库是否存在（无 .env 的部署场景，如 iStoreOS）
    const dbPath = path.join(__dirname, '..', '..', 'data', 'panel.db');
    if (fs.existsSync(dbPath)) return true;
    // 方式3：检查 hsp.db（别名）
    const altDbPath = path.join(__dirname, '..', '..', 'data', 'hsp.db');
    if (fs.existsSync(altDbPath)) return true;
    return false;
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
    res.status(500).json({success: false, message: `安装失败: ${err.message}` });
  }
});

module.exports = router;

// POST /api/setup/reset - 清除所有数据，重装系统（需验证管理员密码）
router.post('/reset', (req, res) => {
  // 安全：必须验证当前管理员密码
  const currentPass = process.env.ADMIN_PASS || 'admin123';
  const { password } = req.body;
  if (!password || password !== currentPass) {
    return res.status(403).json({ success: false, message: '管理员密码验证失败' });
  }

  try {
    const envPath = path.join(__dirname, '..', '..', '.env');
    const dataDir = path.join(__dirname, '..', '..', 'data');
    
    // 删除 .env 文件
    if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
    }
    
    // 清空 data 目录（保留目录本身）
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        const fp = path.join(dataDir, file);
        if (fs.statSync(fp).isFile()) {
          fs.unlinkSync(fp);
        }
      }
    }
    
    res.json({ success: true, message: '系统已重置，请重新安装' });
  } catch (err) {
    res.status(500).json({success: false, message: '重置失败: ' + err.message });
  }
});
