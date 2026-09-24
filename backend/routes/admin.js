// backend/routes/admin.js
// Админ-панель: модерация организаций (ТЗ 6.2), объявлений (ТЗ 6.3),
// пользователи (ТЗ 6.4), журнал аудита (ТЗ 6.1).
// Все маршруты защищены requireStaff/requireAdmin — роль проверяется
// на бэкенде по таблице users, а не «только на фронтенде».
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireStaff, requireAdmin, audit } = require('./roles');

const ORG_STATUSES = ['pending', 'approved', 'rejected'];
const USER_STATUSES = ['active', 'pending', 'rejected', 'blocked'];

function orgToJson(row) {
  let docs = [];
  try { docs = JSON.parse(row.documents || '[]'); } catch (e) { /* битый JSON — считаем без документов */ }
  return {
    id: row.id,
    userId: row.user_id,
    orgName: row.org_name,
    inn: row.inn,
    ogrn: row.ogrn,
    legalAddress: row.legal_address,
    contactPerson: row.contact_person,
    contactPosition: row.contact_position,
    phone: row.phone,
    email: row.email,
    documents: docs.map(d => '/uploads/documents/' + d),
    status: row.status,
    rejectReason: row.reject_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email
  };
}

// Простая пагинация для админ-таблиц (ТЗ 6.6): page/limit, всего записей в X-Total-Count
function paging(req, defLimit) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || defLimit || 20)));
  return { page, limit, offset: (page - 1) * limit };
}

// ============================================================
// Сводка для дашборда админки
// ============================================================
router.get('/summary', requireStaff, (req, res) => {
  db.get(`SELECT
      (SELECT COUNT(*) FROM organizations WHERE status = 'pending') AS pendingOrgs,
      (SELECT COUNT(*) FROM organizations) AS totalOrgs,
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(*) FROM listings) AS totalListings`, [], (err, row) => {
    if (err) {
      console.error('DB error in /admin/summary:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
    res.json(row);
  });
});

// ============================================================
// 6.2 Модерация организаций
// ============================================================
// Список заявок: фильтр по статусу, поиск по названию/ИНН, пагинация
router.get('/organizations', requireStaff, (req, res) => {
  const status = ORG_STATUSES.includes(req.query.status) ? req.query.status : '';
  const q = (req.query.q || '').trim();
  const { page, limit, offset } = paging(req);

  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) {
    where.push('(o.org_name ILIKE ? OR o.inn ILIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  db.get(`SELECT COUNT(*) AS cnt FROM organizations o${whereSql}`, params, (cErr, cRow) => {
    if (cErr) {
      console.error('DB error in /admin/organizations count:', cErr);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
    db.all(
      `SELECT o.*, u.name AS owner_name, u.email AS owner_email
       FROM organizations o LEFT JOIN users u ON u.id = o.user_id
       ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      params.concat([limit, offset]),
      (err, rows) => {
        if (err) {
          console.error('DB error in /admin/organizations:', err);
          return res.status(500).json({ error: 'Ошибка сервера' });
        }
        res.set('X-Total-Count', cRow ? cRow.cnt : 0);
        res.json((rows || []).map(orgToJson));
      }
    );
  });
});

// Карточка одной заявки
router.get('/organizations/:id', requireStaff, (req, res) => {
  db.get(
    `SELECT o.*, u.name AS owner_name, u.email AS owner_email
     FROM organizations o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      if (!row) return res.status(404).json({ error: 'Заявка не найдена' });
      res.json(orgToJson(row));
    }
  );
});

// Решение модератора: подтвердить / отклонить (причина обязательна, ТЗ 6.2)
router.post('/organizations/:id/review', requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const decision = req.body.decision; // 'approve' | 'reject'
  const reason = (req.body.reason || '').trim();

  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Некорректное решение модератора' });
  }
  if (decision === 'reject' && !reason) {
    return res.status(400).json({ error: 'При отклонении обязательно укажите причину' });
  }

  const newStatus = decision === 'approve' ? 'approved' : 'rejected';

  db.get('SELECT * FROM organizations WHERE id = ?', [id], (err, org) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!org) return res.status(404).json({ error: 'Заявка не найдена' });

    const now = Date.now();
    db.run(
      'UPDATE organizations SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
      [newStatus, decision === 'reject' ? reason : null, req.staffUser.id, now, id],
      (uErr) => {
        if (uErr) {
          console.error('DB error updating organization:', uErr);
          return res.status(500).json({ error: 'Ошибка сервера' });
        }
        // Статус пользователя-владельца синхронизируется со статусом заявки (ТЗ 5.3)
        const userStatus = decision === 'approve' ? 'active' : 'rejected';
        db.run(
          "UPDATE users SET status = ?, reject_reason = ? WHERE id = ? AND type = 'organization'",
          [userStatus, decision === 'reject' ? reason : null, org.user_id],
          (uErr2) => {
            if (uErr2) console.error('DB error updating user status:', uErr2);
            audit(req.staffUser, `organization.${newStatus}`, 'organization', id,
              `${org.org_name} (ИНН ${org.inn})${reason ? '; причина: ' + reason : ''}`);
            res.json({ success: true, status: newStatus });
          }
        );
      }
    );
  });
});

// ============================================================
// 6.3 Модерация объявлений: список и снятие с публикации
// ============================================================
router.get('/listings', requireStaff, (req, res) => {
  const status = req.query.status === 'removed' ? 'removed' : 'published';
  const { page, limit, offset } = paging(req);
  db.get('SELECT COUNT(*) AS cnt FROM listings WHERE COALESCE(moderation_status,\'published\') = ?', [status], (cErr, cRow) => {
    if (cErr) return res.status(500).json({ error: 'Ошибка сервера' });
    db.all(
      `SELECT l.*, u.name AS owner_name, u.email AS owner_email, u.type AS owner_type
       FROM listings l LEFT JOIN users u ON u.id = l.owner_id
       WHERE COALESCE(l.moderation_status,'published') = ?
       ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [status, limit, offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        res.set('X-Total-Count', cRow ? cRow.cnt : 0);
        res.json(rows || []);
      }
    );
  });
});

// Снять/вернуть объявление; причина уходит продавцу (ТЗ 6.3)
router.post('/listings/:id/moderate', requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const action = req.body.action; // 'remove' | 'restore'
  const reason = (req.body.reason || '').trim();
  if (!['remove', 'restore'].includes(action)) {
    return res.status(400).json({ error: 'Некорректное действие' });
  }
  if (action === 'remove' && !reason) {
    return res.status(400).json({ error: 'Укажите причину снятия объявления' });
  }
  db.get('SELECT id, title, owner_id FROM listings WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!row) return res.status(404).json({ error: 'Объявление не найдено' });
    const newStatus = action === 'remove' ? 'removed' : 'published';
    db.run('UPDATE listings SET moderation_status = ?, removal_reason = ? WHERE id = ?',
      [newStatus, action === 'remove' ? reason : null, id], (uErr) => {
        if (uErr) return res.status(500).json({ error: 'Ошибка сервера' });
        audit(req.staffUser, `listing.${newStatus}`, 'listing', id, `«${row.title}»${reason ? '; причина: ' + reason : ''}`);
        res.json({ success: true, status: newStatus });
      });
  });
});

// ============================================================
// 6.4 Пользователи
// ============================================================
router.get('/users', requireStaff, (req, res) => {
  const type = ['person', 'organization'].includes(req.query.type) ? req.query.type : '';
  const status = USER_STATUSES.includes(req.query.status) ? req.query.status : '';
  const q = (req.query.q || '').trim();
  const { page, limit, offset } = paging(req);

  const where = [];
  const params = [];
  if (type) { where.push('u.type = ?'); params.push(type); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  if (q) { where.push('(u.name ILIKE ? OR u.email ILIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  db.get(`SELECT COUNT(*) AS cnt FROM users u${whereSql}`, params, (cErr, cRow) => {
    if (cErr) return res.status(500).json({ error: 'Ошибка сервера' });
    db.all(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.type, u.created_at,
              (SELECT COUNT(*) FROM listings l WHERE l.owner_id = u.id) AS listings_count
       FROM users u ${whereSql} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      params.concat([limit, offset]),
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        res.set('X-Total-Count', cRow ? cRow.cnt : 0);
        res.json(rows || []);
      }
    );
  });
});

// Блокировка/разблокировка — только admin (ТЗ 6.1: модератору нельзя управлять пользователями)
router.post('/users/:id/block', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const block = !!req.body.block;
  if (id === req.staffUser.id) {
    return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
  }
  db.get('SELECT id, email, role FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
    db.run("UPDATE users SET status = ? WHERE id = ?", [block ? 'blocked' : 'active', id], (uErr) => {
      if (uErr) return res.status(500).json({ error: 'Ошибка сервера' });
      audit(req.staffUser, block ? 'user.block' : 'user.unblock', 'user', id, row.email);
      res.json({ success: true, status: block ? 'blocked' : 'active' });
    });
  });
});

// Назначение ролей — только admin
router.post('/users/:id/role', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const role = req.body.role;
  if (!['user', 'moderator', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Некорректная роль' });
  }
  db.get('SELECT id, email FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, id], (uErr) => {
      if (uErr) return res.status(500).json({ error: 'Ошибка сервера' });
      audit(req.staffUser, 'user.role', 'user', id, `${row.email} → ${role}`);
      res.json({ success: true, role });
    });
  });
});

// Объявления конкретного пользователя (история, ТЗ 6.4)
router.get('/users/:id/listings', requireStaff, (req, res) => {
  db.all('SELECT id, title, category, price, created_at, moderation_status FROM listings WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100',
    [Number(req.params.id)], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(rows || []);
    });
});

// ============================================================
// 6.1 Журнал аудита
// ============================================================
router.get('/audit', requireStaff, (req, res) => {
  const { limit, offset } = paging(req, 50);
  db.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    res.json(rows || []);
  });
});

module.exports = router;
