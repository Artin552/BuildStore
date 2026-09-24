// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key'; // в реале — хранить в .env
// ⚠️ В продакшене JWT_SECRET должен быть в .env (минимум 32 символа)

// Email transporter will be created lazily if env vars present
const EMAIL_HOST = process.env.EMAIL_HOST || null;
const EMAIL_PORT = process.env.EMAIL_PORT || null;
const EMAIL_USER = process.env.EMAIL_USER || null;
const EMAIL_PASS = process.env.EMAIL_PASS || null;


// Вспомогательная функция для извлечения пользователя из токена
function getUserFromAuthHeader(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length !== 2) return null;
  const token = parts[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Роль пользователя для JWT. Администраторов можно задать через переменную
// окружения ADMIN_EMAILS="a@b.ru,c@d.ru" — они получают роль admin автоматически.
// Иначе роль берётся из таблицы users.role (колонка добавляется при инициализации БД).
function roleToJwt(userRow) {
  if (!userRow) return 'user';
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (userRow.email && admins.includes(String(userRow.email).toLowerCase())) return 'admin';
  return userRow.role || 'user';
}



let transporter = null;
if (EMAIL_HOST && EMAIL_PORT && EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({ host: EMAIL_HOST, port: Number(EMAIL_PORT), secure: false, auth: { user: EMAIL_USER, pass: EMAIL_PASS } });
}

// ============================================================
// Вспомогательные проверки для регистрации организаций (ТЗ 5.2)
// ============================================================
// ИНН: 10 цифр (юр. лицо) или 12 цифр (ИП/физлицо)
const INN_RE = /^\d{10}(\d{2})?$/;
// ОГРН: 13 цифр; ОГРНИП: 15 цифр
const OGRN_RE = /^(\d{13}|\d{15})$/;

function validateOrganization(org) {
  if (!org || typeof org !== 'object') return 'Не переданы данные организации';
  if (!org.orgName || String(org.orgName).trim().length < 2) return 'Укажите название организации или ФИО ИП';
  if (!INN_RE.test(String(org.inn || '').trim())) return 'ИНН должен содержать 10 или 12 цифр';
  if (org.ogrn && !OGRN_RE.test(String(org.ogrn).trim())) return 'ОГРН — 13 цифр, ОГРНИП — 15 цифр';
  if (!org.legalAddress || String(org.legalAddress).trim().length < 5) return 'Укажите юридический адрес';
  if (!org.contactPerson || String(org.contactPerson).trim().length < 2) return 'Укажите контактное лицо';
  if (!org.phone || !/^[\d+()\- ]{6,20}$/.test(String(org.phone).trim())) return 'Укажите корректный телефон компании';
  if (!org.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(org.email).trim())) return 'Укажите корректный e-mail компании';
  const docs = Array.isArray(org.documents) ? org.documents : [];
  if (docs.length === 0) return 'Загрузите подтверждающие документы (свидетельство о регистрации или доверенность)';
  if (docs.length > 10) return 'Слишком много файлов документов (максимум 10)';
  return null; // ошибок нет
}

// Проверка «магических байт» документов: принимаем только PDF/JPG/PNG (ТЗ 5.2)
function sniffDocType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  if (buffer.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

// Сохраняет массив data-URL документов в uploads/documents,
// возвращает список сохранённых имён файлов или строку с ошибкой
function saveDocuments(docs, tag) {
  const MAX_BYTES = 10 * 1024 * 1024; // 10 МБ на файл (ТЗ 5.2)
  const dir = path.join(__dirname, '..', '..', 'uploads', 'documents');
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (let i = 0; i < docs.length; i++) {
    const dataUrl = String(docs[i] || '');
    const m = /^data:[^;,]*;base64,(.+)$/s.exec(dataUrl);
    if (!m) return 'Некорректный формат файла документа';
    let buffer;
    try { buffer = Buffer.from(m[1], 'base64'); } catch (e) { return 'Не удалось прочитать файл документа'; }
    if (buffer.length === 0) return 'Файл документа пуст';
    if (buffer.length > MAX_BYTES) return 'Размер файла документа превышает 10 МБ';
    const kind = sniffDocType(buffer);
    if (!kind) return 'Допустимые форматы документов: PDF, JPG или PNG';
    const filename = `${tag}_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.${kind}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    saved.push(filename);
  }
  return saved;
}

// === Регистрация ===
router.post('/register', (req, res) => {
  const { name, email, password, type, organization, consent } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

  // Валидация email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
  }

  // Тип аккаунта (ТЗ 5.1): person (по умолчанию) | organization
  const accountType = type === 'organization' ? 'organization' : 'person';
  let orgError = null;
  let savedDocs = null;
  if (accountType === 'organization') {
    // Согласие на обработку данных обязательно только для организаций (ТЗ 5.2)
    if (!consent) return res.status(400).json({ error: 'Необходимо согласие на обработку данных' });
    orgError = validateOrganization(organization);
    if (orgError) return res.status(400).json({ error: orgError });
  }

  // проверим, нет ли уже такого email
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (err) {
      console.error('DB error in /register:', err);
      return res.status(500).json({ error: 'Ошибка при регистрации' });
    }
    if (row) return res.status(400).json({ error: 'Пользователь уже существует' });

    // Статусы (ТЗ 5.3): частное лицо активно сразу; организация — «на проверке»
    const userStatus = accountType === 'organization' ? 'pending' : 'active';

    const hash = await bcrypt.hash(password, 10);
    const now = Date.now();
    db.run(
      'INSERT INTO users (name, email, password, created_at, type, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [name || '', email, hash, now, accountType, userStatus], async function (err) {
      if (err) {
        console.error('DB error in /register insert:', err);
        return res.status(500).json({ error: 'Ошибка при регистрации' });
      }
      const userId = this.lastID;

      // Для организаций сразу создаём заявку на модерацию (ТЗ 5.2/5.3):
      // данные компании + сохранённые документы попадают в таблицу organizations,
      // пользователь получает статус «pending» («На проверке»)
      const finishRegister = () => {
        db.get('SELECT id, name, email, role, type, status FROM users WHERE id = ?', [userId], (err2, row) => {
          if (err2 || !row) {
            console.error('DB error in /register readback:', err2);
            return res.status(500).json({ error: 'Ошибка при регистрации' });
          }
          const user = { id: row.id, name: row.name, email: row.email, role: roleToJwt(row), status: row.status || 'active', type: row.type || 'person' };
          const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
          // Return token so client can stay logged in; redirect to root
          res.json({ success: true, user, token });
        });
      };

      if (accountType === 'organization') {
        savedDocs = saveDocuments(organization.documents, `org_${userId}`);
        if (!Array.isArray(savedDocs)) {
          // saveDocuments вернул строку с описанием ошибки
          return res.status(400).json({ error: savedDocs });
        }
        const org = organization;
        db.run(
          `INSERT INTO organizations (user_id, org_name, inn, ogrn, legal_address, contact_person, contact_position, phone, email, documents, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING id`,
          [userId, String(org.orgName).trim(), String(org.inn).trim(), org.ogrn ? String(org.ogrn).trim() : null,
           String(org.legalAddress).trim(), String(org.contactPerson).trim(), org.contactPosition || '',
           String(org.phone).trim(), String(org.email).trim(), JSON.stringify(savedDocs), Date.now()],
          (err3) => {
            if (err3) {
              console.error('DB error in /register organization insert:', err3);
              return res.status(500).json({ error: 'Ошибка при регистрации организации' });
            }
            finishRegister();
          }
        );
        return;
      }
      finishRegister();
      }
    );
  });
});

// === Авторизация ===
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ success: false, error: 'Неверный логин или пароль' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      console.error('DB error in /login:', err);
      return res.status(500).json({ success: false, error: 'Ошибка входа' });
    }
    if (!user) return res.status(401).json({ success: false, error: 'Неверный логин или пароль' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, error: 'Неверный логин или пароль' });

    // Заблокированный пользователь не может войти (ТЗ 6.4)
    if (user.status === 'blocked') {
      return res.status(403).json({ success: false, error: 'Ваш аккаунт заблокирован. Обратитесь в поддержку.' });
    }

    const role = roleToJwt(user);
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role }, JWT_SECRET, { expiresIn: '7d' });

    // Отдаём только безопасные поля — ни в коем случае не хеш пароля и reset_token
    const safeUser = { id: user.id, name: user.name, email: user.email, role, status: user.status || 'active', type: user.type || 'person' };
    res.json({ success: true, user: safeUser, token });
  });
});

// === Забыли пароль:
router.post('/forgot', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  // Note: we intentionally never reveal whether an email exists in the system.
  // Always respond with a generic success message so attackers cannot enumerate accounts.
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (!user) {
      // generic reply
      return res.json({ message: 'Если email зарегистрирован, вы получите код.' });
    }

    // генерируем 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    // сохраняем ХЕШ кода и метку времени (не храним код в открытом виде)
    const codeHash = await bcrypt.hash(code, 10);
    const now = Date.now();
    db.run('UPDATE users SET reset_token = ?, reset_requested_at = ? WHERE id = ?', [codeHash, now, user.id], (err2) => {
      if (err2) {
        console.error('Не удалось сохранить код сброса пароля', err2);
        // still return generic message to avoid leaking info
        return res.json({ message: 'Если email зарегистрирован, вы получите код.' });
      }

      // отправляем по email, если настроен transporter
      if (!transporter) {
        console.log('Email transporter not configured; code:', code);
        return res.json({ message: 'Если email зарегистрирован, вы получите код.' });
      }

      const mail = {
        from: EMAIL_USER,
        to: user.email,
        subject: 'Сброс пароля — BuildStoreNET',
        text: `Код для сброса пароля: ${code}. Он действителен 15 минут.`
      };

      transporter.sendMail(mail, (errSend, info) => {
        if (errSend) {
          console.error('Mail send error', errSend);
          return res.json({ message: 'Если email зарегистрирован, вы получите код.' });
        }
        // Regardless of success detail, return the same generic message
        return res.json({ message: 'Если email зарегистрирован, вы получите код.' });
      });
    });
  });
});

// === Сброс пароля по коду
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Код и новый пароль обязательны' });

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
  }

  // Код хранится в виде bcrypt-хеша, поэтому ищем среди всех пользователей
  // с активным запросом на сброс и сверяем код с каждым хешем.
  // Пустой reset_token сохраняется как NULL, поэтому достаточно IS NOT NULL.
  db.all('SELECT * FROM users WHERE reset_token IS NOT NULL', [], async (err, users) => {
    if (err || !users || users.length === 0) return res.status(400).json({ error: 'Неверный код' });

    // проверяем TTL: 15 минут
    const now = Date.now();
    const user = users.find(u =>
      u.reset_requested_at &&
      (now - Number(u.reset_requested_at)) <= (15 * 60 * 1000) &&
      bcrypt.compareSync(String(token), u.reset_token)
    );
    if (!user) return res.status(400).json({ error: 'Неверный код или срок действия кода истёк' });

    const hash = await bcrypt.hash(password, 10);
    db.run('UPDATE users SET password = ?, reset_token = NULL, reset_requested_at = NULL WHERE id = ?', [hash, user.id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Ошибка при обновлении пароля' });
      res.json({ message: 'Пароль успешно изменён' });
    });
  });
});

// Загрузить аватар (только для авторизованного пользователя)
router.post('/avatar', async (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { imageBase64 } = req.body;
  if (!imageBase64 || !imageBase64.startsWith('data:image')) {
    return res.status(400).json({ error: 'Invalid image' });
  }

  try {
    const parts = imageBase64.split(',');
    const buffer = Buffer.from(parts[1], 'base64');
    const MAX_BYTES = 2 * 1024 * 1024; // 2 МБ
    if (buffer.length > MAX_BYTES) throw new Error('Слишком большой файл');

    const fileType = require('file-type');
    const ft = await fileType.fromBuffer(buffer);
    if (!ft || !ft.mime.startsWith('image/')) throw new Error('Только изображения');

    const allowed = ['jpg', 'jpeg', 'png', 'webp'];
    const ext = ft.ext && allowed.includes(ft.ext) ? ft.ext : 'jpg';

    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
    fs.mkdirSync(uploadDir, { recursive: true });

    const filename = `avatar_${user.id}.${ext}`;
    const savePath = path.join(uploadDir, filename);
    fs.writeFileSync(savePath, buffer);

    // Сохраняем путь в БД
    const avatarPath = `avatars/${filename}`;
    db.run('UPDATE users SET avatar_path = ? WHERE id = ?', [avatarPath, user.id], (err) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ avatarPath: '/uploads/' + avatarPath });
    });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(400).json({ error: 'Ошибка загрузки аватара' });
  }
});


// Получить данные текущего пользователя
router.get('/me', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  db.get('SELECT id, name, email, role, created_at, avatar_path FROM users WHERE id = ?', [user.id], (err, row) => {
    if (err) {
      console.error('DB error in /me:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }
    row.role = roleToJwt(row);
    // Для организаций прикладываем данные заявки и её статус (ТЗ 5.3):
    // фронтенд показывает баннер «на проверке» / причину отклонения
    if (row.type === 'organization') {
      db.get('SELECT id, org_name, inn, status, reject_reason FROM organizations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [user.id], (err2, org) => {
        if (!err2 && org) row.organization = org;
        res.json(row);
      });
      return;
    }
    res.json(row);
  });
});


module.exports = {
  router,
  getUserFromAuthHeader,
  roleToJwt
};
