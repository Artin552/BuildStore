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

    // --- Расширение схемы для модерации продавцов и админ-панели (ТЗ 5–7) ---
    // Роль: user / moderator / admin; статус: active / pending / rejected / blocked
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'person'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reject_reason TEXT`);
    console.log('✅ Users columns (role/status/type/reject_reason) ensured');

    // Заявки организаций на верификацию (ТЗ 5.2/6.2)
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        org_name TEXT NOT NULL,
        inn TEXT NOT NULL,
        ogrn TEXT,
        legal_address TEXT,
        contact_person TEXT,
        contact_position TEXT,
        phone TEXT,
        email TEXT,
        documents TEXT,
        status TEXT DEFAULT 'pending',
        reject_reason TEXT,
        reviewed_by INTEGER,
        reviewed_at BIGINT,
        created_at BIGINT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_org_user ON organizations(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_org_status ON organizations(status)`);
    console.log('✅ Table "organizations" initialized');

    // Журнал аудита действий модераторов/админов (ТЗ 6.1)
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER,
        actor_email TEXT,
        action TEXT,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at BIGINT
      )
    `);
    console.log('✅ Table "audit_log" initialized');

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
    // Паспорт/сертификат товара и статус модерации объявления (ТЗ 6.3, 7.2)
    await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS certificatePath TEXT`);
    await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'published'`);
    await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS removal_reason TEXT`);
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

// ============================================================
// АВТОМАТИЧЕСКАЯ КОНВЕРТАЦИЯ ЗАПРОСОВ ИЗ СИНТАКСИСА sqlite3 В PostgreSQL
// ============================================================
// Исторически весь бэкенд писал SQL в стиле sqlite3 («?», «$NNN»).
// В PostgreSQL позиционные параметры — $1..$n, а LIKE регистрозависим.
// Чтобы не переписывать десятки запросов вручную (и не сломать их
// половинчато), переводим запрос на лету:
//   '?' -> '$N';  ILIKE -> LIKE;  CAST(x AS REAL) -> CAST(x AS DOUBLE PRECISION)
// Разбор идёт посимвольно, и строковые литералы ('...', "...") НЕ трогаются —
// иначе конвертация ломала бы их содержимое (например, <> '' в WHERE).
function pgToSqlite(sql) {
  let out = '';
  let i = 0;
  let n = 0; // счётчик позиционных параметров
  const len = sql.length;
  while (i < len) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        if (sql[i] === quote) {
          out += quote;
          i++;
          if (sql[i] === quote) { out += quote; i++; continue; } // '' — экранированная кавычка
          break;
        }
        out += sql[i++];
      }
      continue;
    }
    if (ch === '?') { n++; out += '$' + n; i++; continue; }
    if (ch === '$') {
      const m = /^\$(\d+)/.exec(sql.slice(i));
      if (m) { n = Math.max(n, Number(m[1])); out += m[0]; i += m[0].length; continue; }
      n++; out += '$' + n; i++; continue;
    }
    out += ch;
    i++;
  }
  // Диалектные правки вне литералов
  return out
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/CAST\(([^()]*)AS\s+REAL\)/gi, 'CAST($1 AS DOUBLE PRECISION)');
}

// Экспорт пула и вспомогательных функций
module.exports = {
  pool,
  pgToSqlite,
  
  // Обёртки для совместимости со старым API sqlite3
  get(sql, params = [], callback) {
    pool.query(pgToSqlite(sql), params, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result.rows[0] || null);
    });
  },
  
  all(sql, params = [], callback) {
    pool.query(pgToSqlite(sql), params, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result.rows);
    });
  },
  
  run(sql, params = [], callback) {
    pool.query(pgToSqlite(sql), params, (err, result) => {
      if (err) return callback(err);
      // Эмулируем sqlite3 API: this.lastID.
      // В PostgreSQL вставленную строку можно вернуть через RETURNING id —
      // все INSERT-запросы в проекте дописаны с RETURNING id.
      // Если RETURNING не было и строки нет — считаем запрос успешным
      // (UPDATE/DELETE), а не падаем с «ошибкой регистрации».
      // Если запрос с RETURNING id — отдаём id вставленной строки;
      // для UPDATE/DELETE без RETURNING lastID остаётся null (это не ошибка)
      const context = { lastID: result.rows?.[0]?.id ?? null };
      callback.call(context, err);
    });
  }
};
