const express = require('express');
const router = express.Router();
const db = require('../db');
const authUtils = require('./auth');
const getUserFromAuthHeader = authUtils.getUserFromAuthHeader;
const { roleToJwt } = authUtils;

// Категории, для которых сертификат/паспорт товара обязателен для организаций (ТЗ 7.2).
// Уточняется у заказчика (ТЗ 9); по умолчанию — электроинструмент и СИЗ.
const CERT_REQUIRED_CATEGORIES = ['Электроинструмент', 'СИЗ'];

// Информация о продавце объявления (ТЗ 7.1): тип аккаунта, статус верификации,
// название организации. Один запрос на весь список — без N+1.
function attachSellerInfo(rows, callback) {
  const ownerIds = Array.from(new Set((rows || []).map(r => r.owner_id).filter(id => id != null)));
  if (ownerIds.length === 0) return callback(null, rows);
  const placeholders = ownerIds.map(() => '?').join(',');
  db.all(
    `SELECT u.id, u.type, u.status AS user_status, o.org_name, o.status AS org_status
     FROM users u LEFT JOIN organizations o ON o.user_id = u.id AND o.status = 'approved'
     WHERE u.id IN (${placeholders})`,
    ownerIds,
    (err, sellers) => {
      const map = new Map();
      (sellers || []).forEach(s => map.set(s.id, s));
      (rows || []).forEach(r => {
        const s = map.get(r.owner_id);
        r.sellerType = s && s.type === 'organization' ? 'organization' : 'person';
        r.sellerVerified = !!(s && s.type === 'organization' && s.org_status === 'approved');
        r.sellerOrgName = s ? s.org_name : null;
      });
      callback(null, rows);
    }
  );
}

// Для работы с файлами
const fs = require('fs');
const path = require('path');
const fileType = require('file-type');

// Форматирование объявления для API
function formatListing(listing) {
  if (!listing) return null;
  return {
    ...listing,
    imagePath: listing.imagePath ? '/uploads/' + listing.imagePath : '',
    certificatePath: listing.certificatePath ? '/uploads/certificates/' + listing.certificatePath : ''
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
    // ILIKE — регистронезависимый поиск; db.js автоматически переводит
    // его в LIKE для PostgreSQL (в pg LIKE учитывает регистр)
    where.push('(title ILIKE ? OR description ILIKE ?)');
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
    // Снятые модератором объявления не показываем обычным посетителям (ТЗ 6.3)
    where.push("COALESCE(moderation_status, 'published') <> 'removed'");
    const whereSql2 = where.length ? (' WHERE ' + where.join(' AND ')) : '';
    const sql = `SELECT id, title, category, price, description, imagePath, created_at, owner_id, discount, rating, reviewsCount, in_stock, is_hot, tags, certificatePath ${baseSql} ${whereSql2} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const finalParams = params.concat([limit, offset]);
    db.all(sql, finalParams, (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      const mapped = (rows || []).map(formatListing);
      attachSellerInfo(mapped, () => {
        res.set('X-Total-Count', total);
        res.json(mapped);
      });
    });
  });
});

// Get single listing by id
router.get('/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM listings WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const item = formatListing(row);
    attachSellerInfo([item], () => res.json(item));
  });
});

// Create new listing
router.post('/', async (req, res) => {
  const jwtUser = getUserFromAuthHeader(req);
  if (!jwtUser) return res.status(401).json({ error: 'Unauthorized' });

  const { title, category, price, description, imageBase64, certificateBase64 } = req.body;
  if (!title || String(title).trim().length < 2) return res.status(400).json({ error: 'Укажите заголовок объявления' });
  if (!price || Number(price) < 0 || !String(price).trim()) return res.status(400).json({ error: 'Укажите корректную цену' });

  // Проверка прав и статуса продавца — по данным БД, а не только по токену (ТЗ 5.3, 6.4)
  db.get('SELECT id, role, status, type FROM users WHERE id = ?', [jwtUser.id], async (gErr, seller) => {
    if (gErr) return res.status(500).json({ error: 'DB error' });
    if (!seller) return res.status(401).json({ error: 'Unauthorized' });
    if (seller.status === 'blocked') {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован, размещение объявлений недоступно' });
    }
    if (seller.type === 'organization' && seller.status !== 'active') {
      const msg = seller.status === 'rejected'
        ? 'Организация отклонена модератором. Подайте документы повторно после исправления замечаний.'
        : 'Ваша организация проходит проверку. Размещение объявлений станет доступно после подтверждения.';
      return res.status(403).json({ error: msg });
    }
    return createListing(req, res, seller, title, category, price, description, imageBase64, certificateBase64);
  });
});

async function createListing(req, res, seller, title, category, price, description, imageBase64, certificateBase64) {

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

  // Паспорт/сертификат товара (ТЗ 7.2): принимаем PDF/JPG/PNG до 10 МБ.
  // Для организаций в обязательных категориях загрузка документа необходима.
  let certificatePath = '';
  if (certificateBase64 && String(certificateBase64).startsWith('data:')) {
    try {
      const parts = String(certificateBase64).split(',');
      const buffer = Buffer.from(parts[1] || '', 'base64');
      if (buffer.length === 0) throw new Error('Empty file');
      if (buffer.length > 10 * 1024 * 1024) throw new Error('File too large');
      const head = buffer.slice(0, 8);
      const isPdf = buffer.slice(0, 5).toString('latin1') === '%PDF-';
      const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPng = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (!isPdf && !isJpg && !isPng) throw new Error('Unsupported format');
      const ext = isPdf ? 'pdf' : (isJpg ? 'jpg' : 'png');
      const docDir = path.join(__dirname, '..', '..', 'uploads', 'certificates');
      fs.mkdirSync(docDir, { recursive: true });
      certificatePath = `cert_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      fs.writeFileSync(path.join(docDir, certificatePath), buffer);
    } catch (err) {
      console.error('Failed to save certificate:', err.message);
      return res.status(400).json({ error: 'Не удалось сохранить сертификат. Допустимы PDF, JPG или PNG размером до 10 МБ.' });
    }
  } else if (seller.type === 'organization' && CERT_REQUIRED_CATEGORIES.includes((category || '').trim())) {
    return res.status(400).json({ error: `Для организаций сертификат/паспорт товара в категории «${category}» обязателен` });
  }

  const created_at = Date.now();
  db.run(
    `INSERT INTO listings (title, category, price, description, imagePath, created_at, owner_id, certificatePath) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [String(title).trim(), category || '', price, description || '', finalImagePath, created_at, seller.id, certificatePath],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      const id = this.lastID;
      db.get('SELECT * FROM listings WHERE id = ?', [id], (err2, row) => {
        if (err2) return res.status(500).json({ error: 'DB error' });
        const item = formatListing(row);
        attachSellerInfo([item], () => res.status(201).json(item));
      });
    }
  );
}

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