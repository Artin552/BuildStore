# Миграция с SQLite на PostgreSQL

Этот документ описывает процесс перевода базы данных проекта BuildStoreNET с SQLite на PostgreSQL.

## 📋 Что было изменено

### 1. Файл `backend/db.js`
Полностью переписан для работы с PostgreSQL вместо SQLite:

- **Раньше**: Использовался `sqlite3` с файловым хранилищем `users.db`
- **Теперь**: Используется `pg` (node-postgres) с пулом соединений

**Ключевые изменения:**
- Подключение через переменные окружения (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`)
- Все таблицы создаются автоматически при запуске
- Сохранена обратная совместимость API (`get`, `all`, `run`)
- Добавлены foreign key constraints для целостности данных

### 2. Файл `backend/package.json`
- **Удалена зависимость**: `sqlite3`
- **Добавлена зависимость**: `pg` (^8.11.3)

### 3. Файл `.env.example`
Создан шаблон файла с переменными окружения для настройки PostgreSQL

## 🚀 Инструкция по настройке

### Шаг 1: Установка PostgreSQL

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### macOS (через Homebrew):
```bash
brew install postgresql
brew services start postgresql
```

#### Windows:
Скачайте установщик с https://www.postgresql.org/download/windows/

### Шаг 2: Создание базы данных

```bash
# Войдите в PostgreSQL
sudo -u postgres psql

# Создайте базу данных
CREATE DATABASE buildstorenet;

# Создайте пользователя (опционально, если не используете postgres)
CREATE USER buildstore WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE buildstorenet TO buildstore;

# Выйдите
\q
```

### Шаг 3: Настройка переменных окружения

Скопируйте файл `.env.example` в `.env`:

```bash
cd /workspace/backend
cp .env.example .env
```

Отредактируйте `.env` и укажите ваши параметры подключения:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=buildstorenet
PGUSER=postgres
PGPASSWORD=ваш_пароль
```

### Шаг 4: Установка зависимостей

```bash
cd /workspace/backend
npm install
```

### Шаг 5: Запуск сервера

```bash
npm start
```

При первом запуске все таблицы будут созданы автоматически.

## 📊 Структура базы данных

### Таблица `users`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | Уникальный ID |
| name | TEXT | Имя пользователя |
| email | TEXT UNIQUE | Email (уникальный) |
| password | TEXT | Хеш пароля |
| reset_token | TEXT | Токен сброса пароля |
| reset_requested_at | BIGINT | Время запроса сброса |
| created_at | BIGINT | Дата создания |
| avatar_path | TEXT | Путь к аватару |

### Таблица `listings`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | Уникальный ID |
| title | TEXT | Заголовок |
| category | TEXT | Категория |
| price | TEXT | Цена |
| description | TEXT | Описание |
| imagePath | TEXT | Путь к изображению |
| created_at | BIGINT | Дата создания |
| owner_id | INTEGER | ID владельца |
| discount | INTEGER DEFAULT 0 | Скидка (%) |
| rating | REAL DEFAULT 0 | Рейтинг |
| reviewsCount | INTEGER DEFAULT 0 | Количество отзывов |
| in_stock | INTEGER DEFAULT 1 | В наличии |
| is_hot | INTEGER DEFAULT 0 | Горячее объявление |
| tags | TEXT | Теги (JSON) |

### Таблица `orders`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | Уникальный ID |
| user_id | INTEGER REFERENCES users(id) | ID пользователя |
| total | TEXT | Общая сумма |
| status | TEXT DEFAULT 'pending' | Статус заказа |
| created_at | BIGINT | Дата создания |

### Таблица `order_items`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | Уникальный ID |
| order_id | INTEGER REFERENCES orders(id) | ID заказа |
| listing_id | INTEGER REFERENCES listings(id) | ID товара |
| quantity | INTEGER DEFAULT 1 | Количество |
| price_at_purchase | TEXT | Цена на момент покупки |
| created_at | BIGINT | Дата создания |

## 🔧 Индексы

Автоматически создаются следующие индексы:
- `idx_listings_category` — для быстрого поиска по категории
- `idx_listings_owner` — для поиска объявлений владельца
- `idx_orders_user` — для поиска заказов пользователя
- `idx_order_items_order` — для поиска товаров в заказе

## 🔄 Миграция данных со SQLite

Если у вас есть данные в SQLite (`users.db`), их можно перенести:

### Вариант 1: Ручной экспорт/импорт

```bash
# Экспорт из SQLite в CSV
sqlite3 users.db <<EOF
.headers on
.mode csv
.output users.csv
SELECT * FROM users;
.output listings.csv
SELECT * FROM listings;
.output orders.csv
SELECT * FROM orders;
.output order_items.csv
SELECT * FROM order_items;
EOF

# Импорт в PostgreSQL (пример для users)
psql -U postgres -d buildstorenet <<EOF
\COPY users(id, name, email, password, reset_token, reset_requested_at, created_at, avatar_path) 
FROM 'users.csv' WITH (FORMAT csv, HEADER true);
EOF
```

### Вариант 2: Использование скрипта миграции

Создайте скрипт `migrate.js`:

```javascript
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const sqliteDb = new sqlite3.Database('./users.db');
const pgPool = new Pool({ /* настройки */ });

async function migrate() {
  // Миграция пользователей
  const users = await new Promise((resolve, reject) => {
    sqliteDb.all('SELECT * FROM users', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  for (const user of users) {
    await pgPool.query(
      `INSERT INTO users (id, name, email, password, reset_token, reset_requested_at, created_at, avatar_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.name, user.email, user.password, user.reset_token, user.reset_requested_at, user.created_at, user.avatar_path]
    );
  }
  
  console.log('Миграция завершена!');
}

migrate().catch(console.error);
```

## ⚠️ Важные замечания

1. **AUTOINCREMENT → SERIAL**: В PostgreSQL используется `SERIAL` вместо `AUTOINCREMENT`
2. **INTEGER → BIGINT**: Для временных меток используется `BIGINT`
3. **Foreign Keys**: В PostgreSQL внешние ключи работают "из коробки" без дополнительных настроек
4. **Пулинг соединений**: PostgreSQL клиент использует пул соединений (max 20), что эффективнее для продакшена

## 🧪 Проверка работы

После запуска сервера проверьте логи — должны быть сообщения:
```
✅ Table "users" initialized
✅ Table "listings" initialized
✅ Table "orders" initialized
✅ Table "order_items" initialized
✅ Indexes created
```

## 🆘 Troubleshooting

### Ошибка подключения к базе
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Решение**: Убедитесь, что PostgreSQL запущен:
```bash
sudo systemctl status postgresql
```

### Ошибка аутентификации
```
Error: password authentication failed for user "postgres"
```
**Решение**: Проверьте пароль в `.env` или сбросьте пароль PostgreSQL:
```bash
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'новый_пароль';
```

### Таблицы не создаются
Проверьте права пользователя базы данных:
```bash
sudo -u postgres psql
GRANT ALL PRIVILEGES ON DATABASE buildstorenet TO ваш_пользователь;
```

## 📚 Дополнительные ресурсы

- [Документация node-postgres](https://node-postgres.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [SQLite vs PostgreSQL](https://www.sqlite.org/whentouse.html)
