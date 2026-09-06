// tools/selftest-find-user.js — найти email тестового пользователя selftest_*
const db = require('../backend/db');
db.get("SELECT email FROM users WHERE email LIKE 'selftest_%' ORDER BY id DESC LIMIT 1", (e, r) => {
  if (e) { console.error(e); process.exit(1); }
  console.log(r ? r.email : 'none');
  process.exit(0);
});
