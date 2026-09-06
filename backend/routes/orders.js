const express = require('express');
const router = express.Router();
const db = require('../db');
const authUtils = require('./auth');
const getUserFromAuthHeader = authUtils.getUserFromAuthHeader;

// Создать новый заказ (требует авторизации)
router.post('/', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required and cannot be empty' });
  }

  // Валидация позиций: нужен id и положительное целое количество
  const normalized = [];
  for (const item of items) {
    const id = Number(item && item.id);
    const quantity = Math.floor(Number(item && item.quantity) || 1);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Each item must have a valid id' });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ error: 'Item quantity must be between 1 and 999' });
    }
    normalized.push({ id, quantity });
  }

  // Цены и итоговую сумму берём ТОЛЬКО из БД — данные клиента не доверенные.
  // Клиентский total игнорируется и не сохраняется.
  const placeholders = normalized.map(() => '?').join(',');
  const itemIds = normalized.map(i => i.id);
  db.all(
    `SELECT id, CAST(price AS REAL) AS price FROM listings WHERE id IN (${placeholders})`,
    itemIds,
    (err, rows) => {
      if (err) {
        console.error('Error fetching listing prices:', err);
        return res.status(500).json({ error: 'Failed to create order' });
      }

      const priceById = new Map((rows || []).map(r => [r.id, r.price]));
      const missing = normalized.filter(i => !priceById.has(i.id));
      if (missing.length > 0) {
        return res.status(400).json({ error: 'Some items do not exist' });
      }

      const total = normalized.reduce(
        (sum, i) => sum + (priceById.get(i.id) || 0) * i.quantity,
        0
      );

      const createdAt = Date.now();

      // Вставляем заказ
      db.run(
        'INSERT INTO orders (user_id, total, status, created_at) VALUES (?, ?, ?, ?)',
        [user.id, total.toFixed(2), 'pending', createdAt],
        function(err) {
          if (err) {
            console.error('Error creating order:', err);
            return res.status(500).json({ error: 'Failed to create order' });
          }

          const orderId = this.lastID;

          // Вставляем товары в заказ с ценой из БД
          let inserted = 0;
          let hasError = false;

          normalized.forEach((item) => {
            db.run(
              'INSERT INTO order_items (order_id, listing_id, quantity, price_at_purchase, created_at) VALUES (?, ?, ?, ?, ?)',
              [orderId, item.id, item.quantity, (priceById.get(item.id) || 0).toFixed(2), createdAt],
              (err) => {
                if (err) {
                  console.error('Error inserting order item:', err);
                  hasError = true;
                }
                inserted++;

                // Когда все товары вставлены
                if (inserted === normalized.length) {
                  if (hasError) {
                    return res.status(500).json({ error: 'Error adding some items to order' });
                  }

                  // Возвращаем созданный заказ
                  db.get(
                    'SELECT * FROM orders WHERE id = ?',
                    [orderId],
                    (err, order) => {
                      if (err) {
                        return res.status(500).json({ error: 'Failed to fetch order' });
                      }
                      res.status(201).json(order);
                    }
                  );
                }
              }
            );
          });
        }
      );
    }
  );
});

// Получить все заказы пользователя (требует авторизации)
router.get('/', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const offset = (page - 1) * limit;

  // Получаем количество заказов
  db.get(
    'SELECT COUNT(*) as cnt FROM orders WHERE user_id = ?',
    [user.id],
    (err, countRow) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      const total = countRow ? countRow.cnt : 0;

      // Получаем заказы
      db.all(
        'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [user.id, limit, offset],
        (err, orders) => {
          if (err) return res.status(500).json({ error: 'DB error' });

          // Для каждого заказа получаем товары
          let processed = 0;
          const results = [];

          if (!orders || orders.length === 0) {
            res.set('X-Total-Count', total);
            return res.json([]);
          }

          orders.forEach((order, idx) => {
            db.all(
              'SELECT oi.*, l.title, l.category, l.imagePath FROM order_items oi LEFT JOIN listings l ON oi.listing_id = l.id WHERE oi.order_id = ?',
              [order.id],
              (err, items) => {
                if (err) {
                  console.error('Error fetching order items:', err);
                  items = [];
                }
                results[idx] = {
                  ...order,
                  items: items || []
                };
                processed++;

                if (processed === orders.length) {
                  res.set('X-Total-Count', total);
                  res.json(results);
                }
              }
            );
          });
        }
      );
    }
  );
});

// Получить конкретный заказ (требует авторизации и проверка что это заказ пользователя)
router.get('/:id', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const orderId = req.params.id;

  db.get(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [orderId, user.id],
    (err, order) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Получаем товары в заказе
      db.all(
        'SELECT oi.*, l.title, l.category, l.imagePath, l.description FROM order_items oi LEFT JOIN listings l ON oi.listing_id = l.id WHERE oi.order_id = ?',
        [orderId],
        (err, items) => {
          if (err) {
            console.error('Error fetching order items:', err);
            items = [];
          }
          res.json({
            ...order,
            items: items || []
          });
        }
      );
    }
  );
});

// Обновить статус заказа (только для владельца заказа или админа)
router.patch('/:id', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const orderId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Проверяем что это заказ пользователя
  db.get(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [orderId, user.id],
    (err, order) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      db.run(
        'UPDATE orders SET status = ? WHERE id = ?',
        [status, orderId],
        (err) => {
          if (err) return res.status(500).json({ error: 'DB error' });
          res.json({ success: true, status });
        }
      );
    }
  );
});

module.exports = router;
