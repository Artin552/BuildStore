const express = require('express');
const router = express.Router();
const db = require('../db');
const authUtils = require('./auth');
const getUserFromAuthHeader = authUtils.getUserFromAuthHeader;

// Для работы с файлами
const fs = require('fs');
const path = require('path');
const fileType = require('file-type');

// Форматирование объявления для API
function formatListing(listing) {
  if (!listing) return null;
  return {
    ...listing,
    imagePath: listing.imagePath ? '/uploads/' + listing.imagePath : ''
  };
}

// Get all listings, optional search q
router.get('/', (req, res) => {
  const q = req.query.q;
  const mine = req.query.mine === 'true';
  const user = getUserFromAuthHeader(req);
  if (mine && !user) {
    // "мои объявления" без токена — не отдаём общий список, требуем авторизацию
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const category = req.query.category || req.query.cat || '';
  const in_stock = req.query.in_stock === 'true' || req.query.in_stock === '1';
  const onlyDiscount = req.query.discount === 'true' || req.query.discount === '1';
  const minRating = Number(req.query.minRating || req.query.rating || 0) || 0;
  const minPrice = Number(req.query.minPrice || 0) || 0;
  const maxPrice = Number(req.query.maxPrice || 0) || 0;
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

  let baseSql = 'FROM listings';
  const params = [];
  const where = [];

  if (q) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (mine && user) {
    where.push('owner_id = ?');
    params.push(user.id);
  }
  if (in_stock) {
    where.push('(in_stock = 1 OR in_stock IS NULL)');
  }
  if (onlyDiscount) {
    where.push('discount > 0');
  }
  if (minRating) {
    where.push('rating >= ?'); params.push(minRating);
  }
  if (minPrice) {
    where.push('CAST(price AS INTEGER) >= ?'); params.push(minPrice);
  }
  if (maxPrice) {
    where.push('CAST(price AS INTEGER) <= ?'); params.push(maxPrice);
  }

  const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';

  const countSql = `SELECT COUNT(*) as cnt ${baseSql} ${whereSql}`;
  db.get(countSql, params, (cErr, cRow) => {
    if (cErr) return res.status(500).json({ error: 'DB error' });
    const total = cRow ? cRow.cnt : 0;

    const offset = (page - 1) * limit;
    // Поля in_stock/rating/discount/reviewsCount/is_hot/tags используются фильтрами
    // и бейджами фронтенда — не отдавать их здесь означает сломанные фильтры на клиенте
    const sql = `SELECT id, title, category, price, description, imagePath, created_at, owner_id, discount, rating, reviewsCount, in_stock, is_hot, tags ${baseSql} ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const finalParams = params.concat([limit, offset]);
    db.all(sql, finalParams, (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      const mapped = (rows || []).map(formatListing);
      res.set('X-Total-Count', total);
      res.json(mapped);
    });
  });
});

// Get single listing by id
router.get('/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT id, title, category, price, description, imagePath, created_at, owner_id, discount, rating, reviewsCount, in_stock, is_hot, tags FROM listings WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(formatListing(row));
  });
});

// Create new listing
router.post('/', async (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { title, category, price, description, imageBase64 } = req.body;
  if (!title || !price) return res.status(400).json({ error: 'title and price required' });

  let finalImagePath = '';
  if (imageBase64 && imageBase64.startsWith('data:image/')) {
    try {
      const parts = imageBase64.split(',');
      const buffer = Buffer.from(parts[1], 'base64');
      const MAX_BYTES = 5 * 1024 * 1024;
      if (buffer.length > MAX_BYTES) throw new Error('File too large');

      const ft = await fileType.fromBuffer(buffer);
      if (!ft || !ft.mime.startsWith('image/')) throw new Error('Not an image');

      const allowed = ['jpg', 'jpeg', 'png', 'webp'];
      const ext = ft.ext && allowed.includes(ft.ext) ? ft.ext : 'jpg';

      const uploadDir = path.join(__dirname, '..', '..', 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      const filename = `listing_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const savePath = path.join(uploadDir, filename);
      fs.writeFileSync(savePath, buffer);
      finalImagePath = filename;
    } catch (err) {
      console.error('Failed to save image', err);
      return res.status(400).json({ error: 'Invalid image upload' });
    }
  }

  const created_at = Date.now();
  db.run(
    `INSERT INTO listings (title, category, price, description, imagePath, created_at, owner_id) VALUES (?,?,?,?,?,?,?)`,
    [title, category || '', price, description || '', finalImagePath, created_at, user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      const id = this.lastID;
      db.get('SELECT * FROM listings WHERE id = ?', [id], (err2, row) => {
        if (err2) return res.status(500).json({ error: 'DB error' });
        res.status(201).json(formatListing(row));
      });
    }
  );
});

// Delete listing by id
router.delete('/:id', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const id = req.params.id;
  db.get('SELECT owner_id FROM listings WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.owner_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
    // 🔥 Удаляем файл при удалении объявления
    if (row.imagePath) {
      const uploadDir = path.join(__dirname, '..', '..', 'uploads');
      const filePath = path.join(uploadDir, row.imagePath);
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.warn('Не удалось удалить файл при удалении объявления:', unlinkErr.message);
      });
    }
    db.run('DELETE FROM listings WHERE id = ?', [id], function (err2) {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true });
    });
  });
});

// Update a listing (owner only)
router.put('/:id', async (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.params.id;
  const { title, category, price, description, imageBase64 } = req.body;

  // Запрашиваем и owner_id, и imagePath
  db.get('SELECT owner_id, imagePath FROM listings WHERE id = ?', [id], async (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.owner_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

    const updates = [];
    const params = [];
    let newImagePath = row.imagePath;

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }

    // Обработка нового изображения
    if (imageBase64 && imageBase64.startsWith('data:image/')) {
      try {
        const parts = imageBase64.split(',');
        const buffer = Buffer.from(parts[1], 'base64');
        const MAX_BYTES = 5 * 1024 * 1024;
        if (buffer.length > MAX_BYTES) throw new Error('File too large');

        const ft = await fileType.fromBuffer(buffer);
        if (!ft || !ft.mime.startsWith('image/')) throw new Error('Not an image');

        const allowed = ['jpg', 'jpeg', 'png', 'webp'];
        const ext = ft.ext && allowed.includes(ft.ext) ? ft.ext : 'jpg';

        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        const filename = `listing_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const savePath = path.join(uploadDir, filename);
        fs.writeFileSync(savePath, buffer);
        newImagePath = filename;

        // 🔥 УДАЛЯЕМ СТАРЫЙ ФАЙЛ, ЕСЛИ ОН СУЩЕСТВОВАЛ И ОТЛИЧАЕТСЯ
        if (row.imagePath && row.imagePath !== newImagePath) {
          const oldPath = path.join(uploadDir, row.imagePath);
          fs.unlink(oldPath, (unlinkErr) => {
            if (unlinkErr) {
              console.warn(`Не удалось удалить старое изображение: ${oldPath}`, unlinkErr.message);
            }
          });
        }

        updates.push('imagePath = ?');
        params.push(newImagePath);
      } catch (e) {
        console.error('Ошибка загрузки изображения:', e);
        return res.status(400).json({ error: 'Invalid image upload' });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const sql = `UPDATE listings SET ${updates.join(', ')} WHERE id = ?`;
    db.run(sql, params, function (err2) {
      if (err2) return res.status(500).json({ error: 'DB error' });
      db.get('SELECT * FROM listings WHERE id = ?', [id], (err3, updated) => {
        if (err3) return res.status(500).json({ error: 'DB error' });
        res.json(formatListing(updated));
      });
    });
  });
});

module.exports = router;