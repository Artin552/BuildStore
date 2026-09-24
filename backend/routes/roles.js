// backend/routes/roles.js
// Проверка прав доступа к админке (ТЗ 6.1).
// ВАЖНО: роль берётся НЕ из JWT-токена, а из таблицы users при каждом
// запросе — иначе понижение/повышение роли не применялось бы до перевхода,
// а «проверки только на фронтенде» обходились бы подменой токена.
const { getUserFromAuthHeader, roleToJwt } = require('./auth');
const db = require('../db');

// Загружает «свежую» роль пользователя из БД и вызывает
// callback(err, userRow). userRow === null — пользователь не найден.
function loadUserRow(req, callback) {
  const jwtUser = getUserFromAuthHeader(req);
  if (!jwtUser || !jwtUser.id) return callback(null, null, jwtUser);
  db.get('SELECT id, name, email, role, status, type FROM users WHERE id = ?', [jwtUser.id], (err, row) => {
    if (err) return callback(err, null, jwtUser);
    callback(null, row || null, jwtUser);
  });
}

// Middleware: доступ разрешён только ролям admin/moderator (и активному статусу)
function requireStaff(req, res, next) {
  loadUserRow(req, (err, row) => {
    if (err) {
      console.error('DB error in requireStaff:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
    if (!row) return res.status(401).json({ error: 'Требуется вход в систему' });
    const role = roleToJwt(row); // учитывает ADMIN_EMAILS из окружения
    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ error: 'Недостаточно прав для доступа к админ-панели' });
    }
    if (row.status === 'blocked') {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }
    req.staffUser = { id: row.id, name: row.name, email: row.email, role };
    next();
  });
}

// Только admin (управление пользователями и ролями — moderator не может, ТЗ 6.1)
function requireAdmin(req, res, next) {
  loadUserRow(req, (err, row) => {
    if (err) {
      console.error('DB error in requireAdmin:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
    if (!row) return res.status(401).json({ error: 'Требуется вход в систему' });
    if (roleToJwt(row) !== 'admin') {
      return res.status(403).json({ error: 'Раздел доступен только администраторам' });
    }
    if (row.status === 'blocked') {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }
    req.staffUser = { id: row.id, name: row.name, email: row.email, role: 'admin' };
    next();
  });
}

// Запись в журнал аудита (кто, что, когда изменил — ТЗ 6.1)
function audit(staffUser, action, targetType, targetId, details) {
  db.run(
    `INSERT INTO audit_log (actor_id, actor_email, action, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [staffUser ? staffUser.id : null, staffUser ? staffUser.email : '', action, targetType,
     targetId == null ? null : targetId, details ? String(details).slice(0, 2000) : '', Date.now()],
    (err) => {
      if (err) console.error('Не удалось записать в audit_log:', err.message || err);
    }
  );
}

module.exports = { requireStaff, requireAdmin, audit, loadUserRow };
