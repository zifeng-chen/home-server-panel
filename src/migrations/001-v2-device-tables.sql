-- HSP V2.0 数据库迁移
-- 新增表：devices, device_metrics, device_commands, device_plugins

CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(64) PRIMARY KEY COMMENT '设备唯一标识',
  name VARCHAR(255) DEFAULT '' COMMENT '设备名称',
  hostname VARCHAR(255) DEFAULT '' COMMENT '主机名',
  ip VARCHAR(64) DEFAULT '' COMMENT 'IP 地址',
  os VARCHAR(64) DEFAULT '' COMMENT '操作系统',
  arch VARCHAR(64) DEFAULT '' COMMENT 'CPU 架构',
  version VARCHAR(32) DEFAULT '' COMMENT 'Agent 版本',
  status ENUM('online','offline','error') DEFAULT 'offline' COMMENT '状态',
  last_seen DATETIME DEFAULT NULL COMMENT '最后心跳时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  INDEX idx_status (status),
  INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备表';

CREATE TABLE IF NOT EXISTS device_metrics (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '指标 ID',
  device_id VARCHAR(64) NOT NULL COMMENT '设备 ID',
  cpu DOUBLE DEFAULT 0 COMMENT 'CPU 使用率 (%)',
  memory DOUBLE DEFAULT 0 COMMENT '内存使用率 (%)',
  disk DOUBLE DEFAULT 0 COMMENT '磁盘使用率 (%)',
  temperature DOUBLE DEFAULT 0 COMMENT 'CPU 温度 (°C)',
  load_avg DOUBLE DEFAULT 0 COMMENT '系统负载 (1min)',
  network_rx BIGINT DEFAULT 0 COMMENT '网络接收 (bytes)',
  network_tx BIGINT DEFAULT 0 COMMENT '网络发送 (bytes)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',
  INDEX idx_device_time (device_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备监控指标表';

CREATE TABLE IF NOT EXISTS device_commands (
  id VARCHAR(64) PRIMARY KEY COMMENT '命令 ID',
  device_id VARCHAR(64) NOT NULL COMMENT '设备 ID',
  command TEXT COMMENT '命令内容',
  status ENUM('pending','running','success','failed') DEFAULT 'pending' COMMENT '执行状态',
  result TEXT COMMENT '执行结果',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_device (device_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备命令记录表';

CREATE TABLE IF NOT EXISTS device_plugins (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '记录 ID',
  device_id VARCHAR(64) NOT NULL COMMENT '设备 ID',
  plugin_name VARCHAR(128) NOT NULL COMMENT '插件名称',
  version VARCHAR(32) DEFAULT '' COMMENT '插件版本',
  enabled TINYINT DEFAULT 0 COMMENT '是否启用',
  UNIQUE KEY uk_device_plugin (device_id, plugin_name),
  INDEX idx_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备插件表';

-- 注册本机为默认设备
INSERT IGNORE INTO devices (id, name, hostname, ip, os, arch, version, status, last_seen, created_at)
VALUES ('dev_local', 'iStoreOS 主路由', 'iStoreOS', '192.168.100.1', 'linux', 'x86_64', '1.7.3', 'online', NOW(), NOW());
