// tools/selftest.js — одноразовая проверка исправлений (миграции + API)
const http = require('http');
const db = require('../backend/db');

const BASE = { host: '127.0.0.1', port: process.env.PORT || 4000 };
let failures = 0;

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      ...BASE, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function check(name, cond, detail) {
  if (cond) console.log(`   ✅ ${name}`);
  else { failures++; console.log(`   ❌ ${name} ${detail ? '— ' + JSON.stringify(detail) : ''}`); }
}

async function main() {
  console.log('1) Проверка миграции owner_id...');
  const cols = await new Promise((res) => {
    db.all("PRAGMA table_info('listings')", (e, c) => res(c.map(x => x.name)));
  });
  check('колонка owner_id добавлена', cols.includes('owner_id'), cols);

  console.log('2) Логин: ответ не содержит хеш пароля / reset_token...');
  const login = await req('POST', '/api/auth/login', { email: 'test@example.com', password: 'test123' });
  let token = null;
  if (login.status === 200 && login.data.token) {
    token = login.data.token;
    const u = login.data.user;
    check('в ответе нет password', u && u.password === undefined, u);
    check('в ответе нет reset_token', u && u.reset_token === undefined);
  } else {
    console.log('   ℹ️  Тестовый пользователь не найден, регистрируем нового...');
    const email = `selftest_${Date.now()}@example.com`;
    const reg = await req('POST', '/api/auth/register', { name: 'SelfTest', email, password: 'test123' });
    check('регистрация 200', reg.status === 200, reg);
    token = reg.data && reg.data.token;
    check('регистрация вернула token', !!token);
    const u = reg.data.user || {};
    check('в ответе регистрации нет password', u.password === undefined, u);
  }

  console.log('3) Регистрация с коротким паролем отклоняется...');
  const badReg = await req('POST', '/api/auth/register', { email: `x${Date.now()}@a.ru`, password: '123' });
  check('400 на короткий пароль', badReg.status === 400, badReg);

  console.log('4) Заказ: сервер пересчитывает сумму по БД...');
  const create = await req('POST', '/api/listings', {
    title: 'SelfTest товар', category: 'test', price: '150', description: 'x'
  }, token);
  check('объявление создано', create.status === 201, create);
  const listingId = create.data && create.data.id;

  if (listingId) {
    const order = await req('POST', '/api/orders', {
      items: [{ id: listingId, quantity: 2, price: '0.01', total: '0.02' }],
      total: '0.02' // поддельная сумма от клиента — должна быть проигнорирована
    }, token);
    check('заказ создан (201)', order.status === 201, order);
    check('сумма пересчитана сервером (300.00)', order.data && order.data.total === '300.00', order.data && order.data.total);

    const badOrder = await req('POST', '/api/orders', { items: [{ id: 99999999, quantity: 1 }] }, token);
    check('заказ с несуществующим товаром отклонён (400)', badOrder.status === 400, badOrder);
  }

  console.log('5) Защита .db файлов...');
  const dbReq = await req('GET', '/users.db');
  check('GET /users.db -> 403', dbReq.status === 403, dbReq.status);
  const dbReq2 = await req('GET', '/backend/users.db');
  check('GET /backend/users.db -> 403', dbReq2.status === 403, dbReq2.status);

  console.log('6) Забыли пароль: код сохраняется как хеш...');
  const forgotEmail = `selftest_forgot_${Date.now()}@example.com`;
  await req('POST', '/api/auth/register', { name: 'F', email: forgotEmail, password: 'test123' });
  await req('POST', '/api/auth/forgot', { email: forgotEmail });
  const row = await new Promise((res) => {
    db.get('SELECT reset_token FROM users WHERE email = ?', [forgotEmail], (e, r) => res(r));
  });
  check('reset_token это bcrypt-хеш ($2a/$2b), а не 6 цифр',
    row && /^\$2[aby]\$/.test(row.reset_token || ''), row && row.reset_token);

  console.log(failures === 0 ? '\n🎉 Все проверки пройдены' : `\n⚠️ Провалено проверок: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Selftest error:', e); process.exit(1); });
