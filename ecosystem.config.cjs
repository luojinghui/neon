module.exports = {
  apps: [
    {
      name: 'neon',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        NEON_RELEASE_ID: process.env.NEON_RELEASE_ID || 'unknown'
      }
    }
  ]
};
