-- HSP V2.0 设备管理 — 数据库迁移
-- 复用现有 home_server_panel 数据库（由 db-service.js 管理）

-- 1. 设备注册表
CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(64) PRIMARY KEY COMMENT '设备唯一标识',
  name VARCHAR(128) NOT NULL COMMENT '设备名称',
  hostname VARCHAR(128) COMMENT '主机名',
  ip VARCHAR(45) COMMENT 'IP 地址',
  os VARCHAR(32) COMMENT '操作系统',
  arch VARCHAR(16) COMMENT 'CPU 架构',
  version VARCHAR(32) COMMENT 'Agent 版本',
  secret VARCHAR(256) DEFAULT '' COMMENT '认证密钥',
  status ENUM('online','offline') DEFAULT 'offline' COMMENT '在线状态',
  last_seen TIMESTAMP NULL COMMENT '最后心跳时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 指标历史表
CREATE TABLE IF NOT EXISTS device_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL COMMENT '设备 ID',
  cpu DECIMAL(5,2) COMMENT 'CPU 使用率 %',
  memory_pct DECIMAL(5,2) COMMENT '内存使用率 %',
  disk_pct DECIMAL(5,2) COMMENT '磁盘使用率 %',
  net_rx BIGINT DEFAULT 0 COMMENT '网络接收 bytes/s',
  net_tx BIGINT DEFAULT 0 COMMENT '网络发送 bytes/s',
  uptime BIGINT COMMENT '运行时长 秒',
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',
  INDEX idx_device_time (device_id, collected_at),
  INDEX idx_collected (collected_at),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 命令历史表
CREATE TABLE IF NOT EXISTS device_commands (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL COMMENT '设备 ID',
  command TEXT NOT NULL COMMENT '命令内容',
  status ENUM('pending','running','success','failed') DEFAULT 'pending' COMMENT '执行状态',
  result TEXT COMMENT '执行输出',
  exit_code INT COMMENT '退出码',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP NULL,
  INDEX idx_device_status (device_id, status),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 告警规则表
CREATE TABLE IF NOT EXISTS alert_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL COMMENT '规则名称',
  metric ENUM('cpu','memory','disk') NOT NULL COMMENT '监控指标',
  operator ENUM('gt','lt') NOT NULL COMMENT '比较运算符 gt=大于 lt=小于',
  threshold DECIMAL(5,1) NOT NULL COMMENT '阈值',
  device_id VARCHAR(64) DEFAULT NULL COMMENT '指定设备ID，NULL=全局',
  enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  last_triggered TIMESTAMP NULL COMMENT '上次触发时间（冷却用）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device (device_id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
