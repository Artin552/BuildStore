# 🚀 Быстрый старт с PostgreSQL

## 1. Установка зависимостей
```bash
cd backend
npm install
```

## 2. Установка PostgreSQL

### Ubuntu/Debian:
```bash
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### macOS:
```bash
brew install postgresql
brew services start postgresql
```

### Docker (альтернатива):
```bash
docker run --name buildstore-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=buildstorenet -p 5432:5432 -d postgres:15
```

## 3. Создание БД
```bash
sudo -u postgres psql -c "CREATE DATABASE buildstorenet;"
```

## 4. Настройка .env
```bash
cp .env.example .env
```

Отредактируйте `.env` при необходимости (по умолчанию подходит для локальной разработки).

## 5. Запуск
```bash
npm start
```

Сервер запустится на http://127.0.0.1:4000

## ✅ Проверка

В логах вы увидите:
```
✅ Table "users" initialized
✅ Table "listings" initialized
✅ Table "orders" initialized
✅ Table "order_items" initialized
✅ Indexes created
✅ Сервер запущен: http://127.0.0.1:4000
```

## 📖 Подробная документация

См. [MIGRATION_POSTGRESQL.md](./MIGRATION_POSTGRESQL.md) для полной информации о миграции.
