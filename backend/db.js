// backend/db.js
// PostgreSQL версия
const { Pool } = require('pg');
require('dotenv').config();

// Подключение к PostgreSQL
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'buildstorenet',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  max: 20, // максимальное количество клиентов в пуле
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Инициализация таблиц
async function initDatabase() {
  const client = await pool.connect();
  
  try {
    // Таблица пользователей
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        reset_token TEXT,
        reset_requested_at BIGINT,
        created_at BIGINT,
        avatar_path TEXT
      )
    `);
    console.log('✅ Table "users" initialized');

    // Таблица объявлений
    await client.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        title TEXT,
        category TEXT,
        price TEXT,
        description TEXT,
        imagePath TEXT,
        created_at BIGINT,
        owner_id INTEGER,
        discount INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        reviewsCount INTEGER DEFAULT 0,
        in_stock INTEGER DEFAULT 1,
        is_hot INTEGER DEFAULT 0,
        tags TEXT
      )
    `);
    console.log('✅ Table "listings" initialized');

    // Таблица заказов
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total TEXT,
        status TEXT DEFAULT 'pending',
        created_at BIGINT
      )
    `);
    console.log('✅ Table "orders" initialized');

    // Таблица товаров в заказе
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        listing_id INTEGER NOT NULL REFERENCES listings(id),
        quantity INTEGER DEFAULT 1,
        price_at_purchase TEXT,
        created_at BIGINT
      )
    `);
    console.log('✅ Table "order_items" initialized');

    // Создаём индексы
    await client.query('CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)');
    console.log('✅ Indexes created');

  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Запускаем инициализацию
initDatabase().catch(console.error);

// Экспорт пула и вспомогательных функций
module.exports = {
  pool,
  
  // Обёртки для совместимости со старым API sqlite3
  get(sql, params = [], callback) {
    pool.query(sql, params, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result.rows[0] || null);
    });
  },
  
  all(sql, params = [], callback) {
    pool.query(sql, params, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result.rows);
    });
  },
  
  run(sql, params = [], callback) {
    pool.query(sql, params, (err, result) => {
      if (err) return callback(err);
      // Эмулируем sqlite3 API: this.lastID
      const context = { lastID: result.rows?.[0]?.id || result.insertId || null };
      callback.call(context, err);
    });
  }
};
