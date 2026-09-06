// tools/selftest-login-check.js — проверить, что логин не отдаёт хеш пароля
const http = require('http');
const email = process.argv[2], password = process.argv[3];
const r = http.request({
  host: '127.0.0.1', port: process.env.PORT || 4000, path: '/api/auth/login',
  method: 'POST', headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', () => {
    const j = JSON.parse(d);
    console.log('status:', res.statusCode);
    console.log('user keys:', Object.keys(j.user || {}).join(', '));
    const leaked = j.user && ('password' in j.user || 'reset_token' in j.user);
    console.log(leaked ? '❌ УТЕЧКА ДАННЫХ' : '✅ Утечек нет');
    process.exit(leaked ? 1 : 0);
  });
});
r.on('error', (e) => { console.error(e); process.exit(1); });
r.end(JSON.stringify({ email, password }));
