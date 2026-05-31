module.exports = {
  apps: [{
    name: 'home-server-panel',
    script: 'src/server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};