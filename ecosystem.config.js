module.exports = {
  apps: [{
    name:       'server',
    script:     'server.js',
    cwd:        '/claude-teste',
    node_args:  '--experimental-sqlite',
    env: {
      NODE_ENV: 'production',
      PORT:     3000,
    },
    // restart on crash, max 10 restarts in 1 min
    max_restarts: 10,
    min_uptime:   '5s',
    watch:        false,
    error_file:   '/root/.pm2/logs/server-error.log',
    out_file:     '/root/.pm2/logs/server-out.log',
  }],
};
