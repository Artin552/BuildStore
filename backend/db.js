// backend/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');


// база хранится рядом, в файле users.db
const db = new sqlite3.Database(path.join(__dirname, 'users.db'));

// создаём таблицу, если её нет
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT
    )
  `);

  // Таблица объявлений
  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      category TEXT,
      price TEXT,
      description TEXT,
      imagePath TEXT,
      created_at INTEGER
    )
  `);

  // Таблица заказов
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Таблица товаров в заказе
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      price_at_purchase TEXT,
      created_at INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (listing_id) REFERENCES listings(id)
    )
  `);

  // Добавим дополнительные столбцы, которые используются в приложении (безопасно через PRAGMA)
  db.all("PRAGMA table_info('listings')", (err, cols) => {
    if (err) return console.error('DB pragma error', err);
    const names = (cols || []).map(c => c.name);
    const adds = [];
    if (!names.includes('owner_id')) adds.push("ALTER TABLE listings ADD COLUMN owner_id INTEGER DEFAULT NULL");
    if (!names.includes('discount')) adds.push("ALTER TABLE listings ADD COLUMN discount INTEGER DEFAULT 0");
    if (!names.includes('rating')) adds.push("ALTER TABLE listings ADD COLUMN rating REAL DEFAULT 0");
    if (!names.includes('reviewsCount')) adds.push("ALTER TABLE listings ADD COLUMN reviewsCount INTEGER DEFAULT 0");
    if (!names.includes('in_stock')) adds.push("ALTER TABLE listings ADD COLUMN in_stock INTEGER DEFAULT 1");
    if (!names.includes('is_hot')) adds.push("ALTER TABLE listings ADD COLUMN is_hot INTEGER DEFAULT 0");
    if (!names.includes('tags')) adds.push("ALTER TABLE listings ADD COLUMN tags TEXT");
    adds.forEach(a => {
      db.run(a, (e) => { if (e) console.error('Error migrating listings:', e); else console.log('Migrated listings:', a); });
    });

    // create index on category for faster filtering (no-op if exists)
    db.run("CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category)", (e) => { if (e) console.error('Index create error', e); });

    db.run("CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id)", (e) => { if (e) console.error('Index owner error', e); });

    // индексы для заказов
    db.run("CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)", (e) => { if (e) console.error('Index orders_user error', e); });
    db.run("CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)", (e) => { if (e) console.error('Index order_items_order error', e); });
  });


// Миграция таблицы users: добавляем поля для восстановления пароля и профиля  
// Ensure users table has reset_token/reset_requested_at for password reset flow
  db.all("PRAGMA table_info('users')", (err2, ucols) => {
    if (err2) return console.error('DB pragma error (users)', err2);
    const unames = (ucols || []).map(c => c.name);
    if (!unames.includes('reset_token')) {
      db.run("ALTER TABLE users ADD COLUMN reset_token TEXT", (e) => { if (e) console.error('Could not add reset_token', e); else console.log('Added reset_token to users'); });
    }
    if (!unames.includes('reset_requested_at')) {
      db.run("ALTER TABLE users ADD COLUMN reset_requested_at INTEGER", (e) => { if (e) console.error('Could not add reset_requested_at', e); else console.log('Added reset_requested_at to users'); });
    }
    if (!unames.includes('created_at')) {
      db.run("ALTER TABLE users ADD COLUMN created_at INTEGER", (e) => {
        if (e) console.error('Could not add created_at', e);
        else console.log('Added created_at to users');
      });
    }
    if (!unames.includes('avatar_path')) {
      db.run("ALTER TABLE users ADD COLUMN avatar_path TEXT", (e) => {
      if (e) console.error('Could not add avatar_path', e);
      else console.log('Added avatar_path to users');
      });
    }
  });
});
module.exports = db;
