# 🚀 Быстрый старт - Корзина и покупки

## Что было реализовано

✅ **Полнофункциональная система корзины и заказов**

### Frontend (Фронтенд)
- Корзина в localStorage (сохраняется между сеансами)
- Страница корзины с редактированием товаров
- Кнопка "Добавить в корзину" на каждом товаре
- Badge в хедере показывает количество товаров в корзине
- Страница "Мои заказы" в личном кабинете
- Оформление заказов с проверкой авторизации

### Backend (Бэкенд)
- Таблицы в БД: `orders` и `order_items`
- API маршруты: POST/GET/PATCH /api/orders
- Сохранение цен на момент покупки
- Проверка авторизации (JWT токены)
- История заказов пользователя

## Новые файлы

### Backend
- `backend/routes/orders.js` - API для управления заказами

### Frontend
- `frontend/cart.html` - Страница корзины
- `frontend/orders.html` - Страница истории заказов
- `frontend/js/cart.js` - Логика управления корзиной
- `frontend/js/cart-page.js` - Логика страницы корзины
- `frontend/js/orders.js` - Логика страницы заказов

## Обновленные файлы

- `backend/db.js` - Добавлены таблицы orders и order_items
- `backend/server.js` - Подключен маршрут /api/orders
- `frontend/product.html` - Подключен cart.js
- `frontend/product.js` - Интегрирована кнопка "Добавить в корзину"
- `frontend/cart.html` - Полностью переписан
- `frontend/listings.html` - Подключен cart.js
- `frontend/dashboard.html` - Добавлена кнопка "Мои заказы"
- `index.html` - Подключен cart.js

## Как использовать

### 1. Запустить сервер
```bash
cd backend
npm start
```

### 2. Открыть в браузере
```
http://localhost:4000
```

### 3. Использование корзины

**Добавить товар:**
- Выбрать товар и нажать "Добавить в корзину"
- Товар добавится в корзину (localStorage)
- Badge в хедере обновит счетчик

**Просмотреть корзину:**
- Нажать значок корзины в хедере (🛒)
- Или перейти на `/frontend/cart.html`

**Оформить заказ:**
- В корзине нажать "Оформить заказ"
- Если не авторизован - перенаправит на вход
- Заказ создастся и появится в "Мои заказы"

**История заказов:**
- В личном кабинете нажать "Мои заказы"
- Увидеть все заказы с товарами и ценами

## Тестирование

Запустить тест:
```bash
node test-integration.js
```

## Структура данных

### Корзина (localStorage)
```javascript
[
  {
    id: 1,
    title: "Цемент",
    price: "500",
    imagePath: "/uploads/cement.jpg",
    quantity: 2
  }
]
```

### Заказ (БД)
```javascript
{
  id: 1,
  user_id: 5,
  total: "1000.00",
  status: "pending",
  created_at: 1726324800000,
  items: [
    {
      id: 1,
      order_id: 1,
      listing_id: 1,
      quantity: 2,
      price_at_purchase: "500",
      title: "Цемент"
    }
  ]
}
```

## API Примеры

### Создать заказ
```bash
curl -X POST http://localhost:4000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "items": [
      {"id": 1, "title": "Цемент", "price": "500", "quantity": 2}
    ],
    "total": "1000.00"
  }'
```

### Получить заказы
```bash
curl http://localhost:4000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Получить заказ по ID
```bash
curl http://localhost:4000/api/orders/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Важные классы и функции

### window.cart (глобальный объект)
```javascript
window.cart.addItem(listing)        // Добавить товар
window.cart.removeItem(itemId)      // Удалить товар
window.cart.updateQuantity(id, qty) // Изменить количество
window.cart.getItems()              // Получить все товары
window.cart.getTotal()              // Получить сумму
window.cart.getCount()              // Получить количество
window.cart.clear()                 // Очистить корзину
```

## Статусы заказов

- `pending` - Ожидание подтверждения (новый заказ)
- `confirmed` - Подтвержден
- `shipped` - Отправлен
- `delivered` - Доставлен
- `cancelled` - Отменен

## Безопасность

✅ Все операции требуют JWT авторизацию  
✅ Пользователь видит только свои заказы  
✅ Цены фиксируются при покупке  
✅ Валидация данных на сервере  

## Возможные расширения

1. Платежные системы (Stripe, Yandex.Kassa)
2. Email уведомления при смене статуса
3. Система скидок и промокодов
4. Возврат товаров
5. Отзывы о товарах после покупки
6. Варианты товаров (размеры, цвета)
7. Рекомендации на основе покупок

---

📚 **Подробнее** - смотрите `CART_IMPLEMENTATION.md`  
✅ **Статус** - Полностью готово к использованию
