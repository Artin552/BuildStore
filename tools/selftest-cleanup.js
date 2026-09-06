// tools/selftest-cleanup.js — удалить данные, созданные selftest.js
const db = require('../backend/db');

db.serialize(() => {
  db.all("SELECT id FROM users WHERE email LIKE 'selftest_%'", (e, users) => {
    if (e) { console.error(e); process.exit(1); }
    const ids = (users || []).map(u => u.id);
    console.log('Удаляем пользователей:', ids.join(', ') || 'нет');

    db.all("SELECT id FROM listings WHERE title LIKE 'SelfTest%'", (e2, listings) => {
      if (!e2 && listings) {
        const lIds = listings.map(l => l.id);
        console.log('Удаляем объявления:', lIds.join(', ') || 'нет');
        lIds.forEach(id => db.run('DELETE FROM listings WHERE id = ?', [id]));
        const ph = ids.map(() => '?').join(',') || "''";
        db.run(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (${ph}))`, ids);
        db.run(`DELETE FROM orders WHERE user_id IN (${ph})`, ids);
      }
      const ph = ids.map(() => '?').join(',') || "''";
      db.run(`DELETE FROM users WHERE id IN (${ph})`, ids, () => {
        console.log('Очистка завершена');
        process.exit(0);
      });
    });
  });
});
