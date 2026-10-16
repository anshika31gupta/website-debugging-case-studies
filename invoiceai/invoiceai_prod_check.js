// Usage: node prod_check.js <repo-root>   — how does the server behave with NODE_ENV=production?
const { spawnSync, spawn } = require('child_process'); const path = require('path'); const os = require('os');
const root = path.resolve(process.argv[2]);
const env = (extra) => ({ ...process.env, NODE_ENV: 'production', PORT: '3998', DB_PATH: path.join(os.tmpdir(), 'p' + Date.now() + Math.random() + '.db'), NODE_PATH: path.join(root, 'node_modules'), ...extra });
delete process.env.JWT_SECRET;
const a = spawnSync('node', ['server.js'], { cwd: root, env: env({ JWT_SECRET: '' }), timeout: 2500, encoding: 'utf8' });
const booted = a.error && a.error.code === 'ETIMEDOUT';
console.log('production, no JWT_SECRET  ->', booted ? 'SERVER STARTS (uses built-in default secret)' : 'refuses to start: ' + ((a.stderr || '').split('\n').find(l => l.startsWith('Error')) || 'exit ' + a.status));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: root, env: env({ JWT_SECRET: 'x'.repeat(40) }), stdio: 'ignore' });
  for (let i = 0; i < 30; i++) { try { await fetch('http://127.0.0.1:3998/health'); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const r = await fetch('http://127.0.0.1:3998/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'password123' }) });
  console.log('production, demo login      ->', r.status, r.status === 200 ? 'DEMO ACCOUNT EXISTS IN PRODUCTION' : 'no demo account');
  srv.kill();
})();
