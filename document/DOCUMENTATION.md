# 🛒 Корзина и заказы - Документация

## 📌 Краткое описание

Полная система корзины и оформления заказов для BuildStoreNET:
- Корзина с localStorage
- Страницы cart.html и orders.html
- REST API для управления заказами
- Таблицы БД: orders и order_items

## 🚀 Быстрый старт

```bash
# 1. Запустить сервер
cd backend
npm start

# 2. Открыть браузер
http://localhost:4000
```

## 🎯 Использование

### Добавить товар в корзину
```javascript
window.cart.addItem({
  id: 1,
  title: "Цемент",
  price: "500",
  imagePath: "/uploads/cement.jpg"
});
```

### Получить информацию о корзине
```javascript
window.cart.getItems()      // Все товары
window.cart.getTotal()      // Общая сумма
window.cart.getCount()      // Количество товаров
```

### Оформить заказ
Нажать кнопку "Оформить заказ" в корзине (требует авторизация)

### Просмотреть заказы
Личный кабинет → "Мои заказы"

## 🔌 API Маршруты

```
POST   /api/orders          Создать заказ
GET    /api/orders          Получить заказы пользователя
GET    /api/orders/:id      Получить детали заказа
PATCH  /api/orders/:id      Обновить статус заказа
```

### Пример создания заказа

```bash
curl -X POST http://localhost:4000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "items": [
      {"id": 1, "title": "Цемент", "price": "500", "quantity": 2}
    ],
    "total": "1000"
  }'
```

## 💾 Таблицы БД

### orders
```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
)
```

### order_items
```sql
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  price_at_purchase TEXT,
  created_at INTEGER
)
```

## 📂 Файлы проекта

**Backend:**
- `backend/routes/orders.js` - API маршруты
- `backend/db.js` - создание таблиц БД
- `backend/server.js` - подключение маршрутов

**Frontend:**
- `frontend/cart.html` - страница корзины
- `frontend/orders.html` - история заказов
- `frontend/js/cart.js` - управление корзиной
- `frontend/js/cart-page.js` - логика страницы
- `frontend/js/orders.js` - логика заказов

## 🔐 Безопасность

- ✅ JWT авторизация на всех операциях
- ✅ Проверка принадлежности заказа
- ✅ Валидация данных на сервере
- ✅ Защита от SQL injection

## 📊 Статусы заказов

```
pending       - Ожидание подтверждения
confirmed     - Подтвержден
shipped       - Отправлен
delivered     - Доставлен
cancelled     - Отменен
```

## 🧪 Тестирование

```bash
# Запустить интеграционный тест
node test-integration.js
```

### Тест в консоли браузера
```javascript
// Добавить товар
window.cart.addItem({id: 1, title: "Test", price: "100"})

// Посмотреть товары
console.log(window.cart.getItems())

// Посмотреть localStorage
console.log(localStorage.buildstore_cart)
```

## 💻 Frontend примеры

### Добавление в корзину
```javascript
const item = {
  id: 1,
  title: "Товар",
  price: "500",
  imagePath: "/uploads/item.jpg"
};
window.cart.addItem(item);
```

### Получение товаров
```javascript
const items = window.cart.getItems();
items.forEach(item => {
  console.log(`${item.title}: ${item.quantity} × ${item.price}`);
});
```

### Удаление товара
```javascript
window.cart.removeItem(1);
```

### Изменение количества
```javascript
window.cart.updateQuantity(1, 5);
```

## 🖧 Backend примеры

### Получение заказов
```javascript
router.get('/', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  db.all(
    'SELECT * FROM orders WHERE user_id = ?',
    [user.id],
    (err, orders) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(orders);
    }
  );
});
```

### Создание заказа
```javascript
router.post('/', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { items, total } = req.body;
  
  db.run(
    'INSERT INTO orders (user_id, total, status, created_at) VALUES (?, ?, ?, ?)',
    [user.id, total, 'pending', Date.now()],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed' });
      res.status(201).json({ id: this.lastID, status: 'pending' });
    }
  );
});
```

## SQL примеры

### Все заказы пользователя
```sql
SELECT * FROM orders WHERE user_id = 5 ORDER BY created_at DESC;
```

### Товары в заказе
```sql
SELECT oi.*, l.title FROM order_items oi
LEFT JOIN listings l ON oi.listing_id = l.id
WHERE oi.order_id = 1;
```

### Статистика по статусам
```sql
SELECT status, COUNT(*) as count
FROM orders GROUP BY status;
```

## 🎨 Стили и UI

- Адаптивный дизайн
- Цветовое выделение статусов
- Badge со счетчиком
- Анимации загрузки

## ⚡ Быстрые команды

```bash
# Запустить сервер
npm start (в папке backend)

# Запустить тест
node test-integration.js

# Просмотреть БД
sqlite3 backend/users.db
```

## 📝 Переменные окружения

```
JWT_SECRET=your_secret_key
HOST=127.0.0.1
PORT=4000
JSON_LIMIT=2mb
```

## 🚨 Решение проблем

**Корзина не сохраняется:**
- Проверить localStorage в браузере: `localStorage.buildstore_cart`

**Заказ не создается:**
- Проверить авторизацию: `localStorage.getItem('token')`
- Посмотреть консоль браузера на ошибки

**API не работает:**
- Убедиться что сервер запущен: `npm start`
- Проверить port 4000

## 📞 Контакты

- Документация: это файл
- Примеры: смотрите в файле
- Тесты: `test-integration.js`

---

**Версия:** 1.0.1  
**Статус:** ✅ Готово  
**Дата:** 2026-05-21
