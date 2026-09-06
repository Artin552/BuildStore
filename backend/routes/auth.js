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



let transporter = null;
if (EMAIL_HOST && EMAIL_PORT && EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({ host: EMAIL_HOST, port: Number(EMAIL_PORT), secure: false, auth: { user: EMAIL_USER, pass: EMAIL_PASS } });
}

// === Регистрация ===
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

  // Валидация email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
  }

  // проверим, нет ли уже такого email
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (err) {
      console.error('DB error in /register:', err);
      return res.status(500).json({ error: 'Ошибка при регистрации' });
    }
    if (row) return res.status(400).json({ error: 'Пользователь уже существует' });

    const hash = await bcrypt.hash(password, 10);
    const now = Date.now();
    db.run(
      'INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)', [name || '', email, hash, now], function (err) {
      if (err) return res.status(500).json({ error: 'Ошибка при регистрации' });
      const user = { id: this.lastID, name, email };
        const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        // Return token so client can stay logged in; redirect to root
        res.json({ success: true, user, token });
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

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    // Отдаём только безопасные поля — ни в коем случае не хеш пароля и reset_token
    const safeUser = { id: user.id, name: user.name, email: user.email };
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
  // с активным запросом на сброс и сверяем код с каждым хешем
  db.all('SELECT * FROM users WHERE reset_token IS NOT NULL AND reset_token != \'\'', [], async (err, users) => {
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

  db.get('SELECT name, email, created_at, avatar_path  FROM users WHERE id = ?', [user.id], (err, row) => {
    if (err) {
      console.error('DB error in /me:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(row);
  });
});


module.exports = {
  router,
  getUserFromAuthHeader
};
