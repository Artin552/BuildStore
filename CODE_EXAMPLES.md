# 💻 Примеры кода для разработчиков

## Frontend примеры

### 1. Использование корзины в JavaScript

```javascript
// Добавить товар
window.cart.addItem({
  id: 1,
  title: "Цемент",
  price: "500",
  imagePath: "/uploads/cement.jpg"
});

// Получить все товары
const items = window.cart.getItems();
console.log(items);

// Получить общую стоимость
const total = window.cart.getTotal();
console.log(`Итого: ${total} ₽`);

// Получить количество товаров
const count = window.cart.getCount();
console.log(`В корзине ${count} товаров`);

// Изменить количество товара
window.cart.updateQuantity(1, 5);

// Удалить товар
window.cart.removeItem(1);

// Очистить корзину
window.cart.clear();
```

### 2. Интеграция кнопки "Добавить в корзину"

```html
<!-- В HTML -->
<button id="addToCartBtn" class="btn">Добавить в корзину</button>

<!-- В JavaScript (product.js) -->
const addToCartBtn = document.getElementById('addToCartBtn');
if (addToCartBtn) {
  addToCartBtn.addEventListener('click', () => {
    window.cart.addItem(item);
    addToCartBtn.textContent = '✓ Добавлено в корзину';
    addToCartBtn.disabled = true;
    setTimeout(() => {
      addToCartBtn.textContent = 'Добавить в корзину';
      addToCartBtn.disabled = false;
    }, 2000);
  });
}
```

### 3. Оформление заказа

```javascript
async function checkout() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    alert('Пожалуйста авторизуйтесь');
    window.location.href = '/frontend/auth.html';
    return;
  }

  const items = window.cart.getItems();
  const total = window.cart.getTotal().toFixed(2);

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        items: items,
        total: total
      })
    });

    if (!response.ok) {
      throw new Error('Ошибка при создании заказа');
    }

    const order = await response.json();
    
    // Очищаем корзину
    window.cart.clear();
    
    // Перенаправляем на страницу успеха
    alert(`Заказ #${order.id} успешно создан!`);
    window.location.href = '/frontend/orders.html';
    
  } catch (error) {
    alert('Ошибка: ' + error.message);
  }
}
```

### 4. Загрузка и отображение заказов

```javascript
async function loadOrders() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    console.error('Пользователь не авторизован');
    return;
  }

  try {
    const response = await fetch('/api/orders', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Ошибка загрузки заказов');
    }

    const orders = await response.json();
    
    // Отобразить заказы
    orders.forEach(order => {
      console.log(`Заказ #${order.id}: ${order.total} ₽ (${order.status})`);
      order.items.forEach(item => {
        console.log(`  - ${item.title} × ${item.quantity}`);
      });
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  }
}
```

## Backend примеры

### 1. Создание заказа (API маршрут)

```javascript
// routes/orders.js
router.post('/', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { items, total } = req.body;
  
  // Валидация
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Items cannot be empty' });
  }

  const createdAt = Date.now();
  
  // Создание заказа
  db.run(
    'INSERT INTO orders (user_id, total, status, created_at) VALUES (?, ?, ?, ?)',
    [user.id, total, 'pending', createdAt],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create order' });

      const orderId = this.lastID;
      
      // Создание товаров заказа
      items.forEach((item) => {
        db.run(
          'INSERT INTO order_items (...) VALUES (...)',
          [orderId, item.id, item.quantity, item.price, createdAt],
          (err) => { if (err) console.error(err); }
        );
      });

      res.status(201).json({
        id: orderId,
        user_id: user.id,
        total: total,
        status: 'pending',
        created_at: createdAt
      });
    }
  );
});
```

### 2. Получение заказов пользователя

```javascript
router.get('/', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  db.all(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [user.id],
    (err, orders) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      
      // Загрузить товары для каждого заказа
      orders.forEach((order, idx) => {
        db.all(
          'SELECT * FROM order_items WHERE order_id = ?',
          [order.id],
          (err, items) => {
            order.items = items || [];
          }
        );
      });

      res.json(orders);
    }
  );
});
```

### 3. Обновление статуса заказа

```javascript
router.patch('/:id', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.run(
    'UPDATE orders SET status = ? WHERE id = ? AND user_id = ?',
    [status, req.params.id, user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true, status });
    }
  );
});
```

## Примеры HTTP запросов

### 1. Создание заказа (cURL)

```bash
curl -X POST http://localhost:4000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "items": [
      {
        "id": 1,
        "title": "Цемент",
        "price": "500",
        "quantity": 2
      }
    ],
    "total": "1000"
  }'
```

Ответ:
```json
{
  "id": 1,
  "user_id": 5,
  "total": "1000",
  "status": "pending",
  "created_at": 1726324800000
}
```

### 2. Получение заказов (cURL)

```bash
curl http://localhost:4000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Ответ:
```json
[
  {
    "id": 1,
    "user_id": 5,
    "total": "1000",
    "status": "pending",
    "created_at": 1726324800000,
    "items": [
      {
        "id": 1,
        "order_id": 1,
        "listing_id": 1,
        "quantity": 2,
        "price_at_purchase": "500"
      }
    ]
  }
]
```

### 3. Получение заказа по ID

```bash
curl http://localhost:4000/api/orders/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Обновление статуса заказа

```bash
curl -X PATCH http://localhost:4000/api/orders/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "status": "shipped"
  }'
```

## SQL примеры

### Посмотреть все заказы пользователя

```sql
SELECT o.*, COUNT(oi.id) as items_count, SUM(oi.quantity) as total_quantity
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.user_id = 5
GROUP BY o.id
ORDER BY o.created_at DESC;
```

### Посмотреть товары в заказе

```sql
SELECT oi.*, l.title, l.category
FROM order_items oi
LEFT JOIN listings l ON oi.listing_id = l.id
WHERE oi.order_id = 1;
```

### Статистика по заказам

```sql
SELECT 
  status,
  COUNT(*) as count,
  SUM(CAST(total AS FLOAT)) as total_sum,
  AVG(CAST(total AS FLOAT)) as avg_total
FROM orders
GROUP BY status;
```

### Лучшие товары в продажах

```sql
SELECT 
  l.title,
  SUM(oi.quantity) as total_sold,
  SUM(CAST(oi.price_at_purchase AS FLOAT) * oi.quantity) as revenue
FROM order_items oi
LEFT JOIN listings l ON oi.listing_id = l.id
GROUP BY l.id
ORDER BY total_sold DESC
LIMIT 10;
```

## Тестирование

### Простой тест добавления в корзину

```javascript
// В консоли браузера
window.cart.addItem({
  id: 1,
  title: "Тестовый товар",
  price: "100",
  imagePath: ""
});

console.log(window.cart.getItems());      // Должен показать товар
console.log(window.cart.getCount());      // Должен показать 1
console.log(window.cart.getTotal());      // Должен показать 100
```

### Тест localStorage

```javascript
// Проверить что корзина сохраняется
localStorage.getItem('buildstore_cart');

// Должно быть JSON-like:
// [{"id":1,"title":"...","price":"...","quantity":1}]
```

### Тест API

```javascript
// В консоли браузера (если авторизован)
const token = localStorage.getItem('token');

fetch('/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    items: [{id: 1, title: "Test", price: "100", quantity: 1}],
    total: "100"
  })
}).then(r => r.json()).then(d => console.log(d));
```

## Отладка

### Просмотр корзины в консоли

```javascript
// Корзина
console.log(window.cart);

// Товары
console.log(window.cart.getItems());

// Сумма
console.log(window.cart.getTotal());

// localStorage
console.log(JSON.parse(localStorage.buildstore_cart));

// Badge
console.log(document.getElementById('cartBadge').textContent);
```

### Просмотр заказов в БД

```bash
# В папке backend
sqlite3 users.db

sqlite> SELECT * FROM orders;
sqlite> SELECT * FROM order_items;
sqlite> SELECT o.*, COUNT(oi.id) FROM orders o LEFT JOIN order_items oi;
sqlite> .exit
```

---

**Примеры актуальны для версии 1.0**  
**Последнее обновление: 2026-05-21**
