// V2 设备 WebSocket 连接池 — 由 ws-service.js 管理，command-service.js 引用
// 独立模块打破 ws-service ↔ command-service 循环依赖
const deviceConns = new Map();
module.exports = deviceConns;
