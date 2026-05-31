// 系统设置页面
async function loadSettings() {
  try {
    const res = await Api.get('/system/config');
    if (!res.success || !res.data) return;

    const cfg = res.data;
    setVal('cfgAliKeyId', cfg.aliKeyId || '');
    setVal('cfgAliKeySecret', cfg.aliKeySecret || '');
    setVal('cfgPushplusToken', cfg.pushplusToken === '已配置' ? '' : '');
    setVal('cfgAcmeEmail', cfg.acmeEmail || '');
    setVal('cfgAcmeDns', cfg.acmeDnsProvider || 'alidns');
  } catch (err) {
    App.log('error', '加载设置失败:', err);
  }
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined) el.value = value;
}

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('btnSaveSettings');
  const testBtn = document.getElementById('btnTestPushplus');

  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const data = {
      aliKeyId: document.getElementById('cfgAliKeyId')?.value || '',
      aliKeySecret: document.getElementById('cfgAliKeySecret')?.value || '',
      pushplusToken: document.getElementById('cfgPushplusToken')?.value || '',
      acmeEmail: document.getElementById('cfgAcmeEmail')?.value || '',
      acmeDns: document.getElementById('cfgAcmeDns')?.value || 'alidns'
    };
    const res = await Api.post('/system/config', data);
    Utils.notify(res.message || '保存完成', res.success ? 'success' : 'error');
  });

  if (testBtn) testBtn.addEventListener('click', async () => {
    Utils.notify('正在发送测试推送...', 'info');
    const res = await Api.post('/notify/test', {
      token: document.getElementById('cfgPushplusToken')?.value || ''
    });
    Utils.notify(res.message || '推送完成', res.success ? 'success' : 'error');
  });
});