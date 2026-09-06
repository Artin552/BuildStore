// backend/server.js
// ============================================================
// ГЛАВНЫЙ ФАЙЛ СЕРВЕРА (Express приложение)
// ============================================================
// Этот файл:
// 1. Инициализирует Express приложение
// 2. Подключает middleware (CORS, Helmet, Rate Limiting и т.д.)
// 3. Подключает маршруты API (/api/auth, /api/listings)
// 4. Раздаёт статические файлы фронтенда (HTML, CSS, JS, изображения)
// 5. Запускает сервер на порту 4000

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config(); // Загружаем переменные окружения из .env файла
const authRoutes = require('./routes/auth'); // Маршруты аутентификации
const listingsRoutes = require('./routes/listings'); // Маршруты объявлений
const ordersRoutes = require('./routes/orders'); // Маршруты заказов

// ============================================================
// ОБРАБОТЧИКИ ОШИБОК
// ============================================================
// Ловим необработанные исключения и выводим их в консоль
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

// Ловим необработанные отклонённые Promise'ы
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// ============================================================
// ИНИЦИАЛИЗАЦИЯ EXPRESS
// ============================================================
const app = express();
const PORT = process.env.PORT || 4000; // Портт по умолчанию 4000

// За nginx указывайте TRUST_PROXY=1 — тогда express-rate-limit увидит
// реальный IP клиента из X-Forwarded-For, а не IP самого nginx
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// ============================================================
// MIDDLEWARE (промежуточные обработчики запросов)
// ============================================================
// Включаем CORS (Cross-Origin Resource Sharing) для доступа с разных доменов.
// В продакшене задайте ALLOWED_ORIGIN, например: https://mydomain.ru
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

// Включаем Helmet для защиты от уязвимостей в HTTP заголовках
app.use(helmet());

// Предупреждение о секретах (не падаем, чтобы не ломать локальную разработку)
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET не задан — используется fallback из routes/auth.js. Для продакшена задайте JWT_SECRET в .env!');
}

// Ограничиваем размер JSON тела запроса до 2MB (защита от DoS атак)
app.use(express.json({ limit: process.env.JSON_LIMIT || '2mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '2mb' }));

// ============================================================
// RATE LIMITERS (ограничение частоты запросов)
// ============================================================
// Общий rate limiter для всех /api/auth запросов
// Лимит: максимум 20 запросов в минуту
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // окно временм 1 минута
  max: 20, // максимум 20 запросов
  message: { error: 'Too many requests, slow down' }
});
app.use('/api/auth', authLimiter);

// Специальный более строгий rate limiter для /forgot эндпоинта
// Лимит: максимум 3 запроса каждые 15 минут (защита от перебора email'ов)
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 3, // максимум 3 запроса
  message: { error: 'Too many password reset attempts, please try later' }
});
app.use('/api/auth/forgot', forgotLimiter);

// Строгий rate limiter для /reset — защита от подбора 6-значного кода сброса
// Лимит: максимум 5 попыток каждые 15 минут (у кода TTL те же 15 минут)
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset attempts, please request a new code later' }
});
app.use('/api/auth/reset', resetLimiter);

// ============================================================
// ЛОГИРОВАНИЕ ЗАПРОСОВ
// ============================================================
// Логируем все запросы к API (полезно для отладки)
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// ============================================================
// ПОДКЛЮЧЕНИЕ API МАРШРУТОВ
// ============================================================
// Все маршруты аутентификации начинаются с /api/auth
app.use('/api/auth', authRoutes.router);

// Все маршруты объявлений начинаются с /api/listings
app.use('/api/listings', listingsRoutes);

// Все маршруты заказов начинаются с /api/orders
app.use('/api/orders', ordersRoutes);

// ============================================================
// ОБЩИЙ ОБРАБОТЧИК ОШИБОК
// ============================================================
// ВАЖНО: регистрируется ПОСЛЕ маршрутов, иначе Express не передаёт
// в него ошибки, возникшие в обработчиках маршрутов
// (например, ошибки парсинга JSON тела или throw в роутах)
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err); // Если уже был отправлен ответ, пропускаем
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// ЗАЩИТА ОТ УТЕЧКИ БАЗЫ ДАННЫХ
// ============================================================
// Блокируем любые запросы к .db-файлам ДО раздачи статики,
// чтобы users.db и подобные файлы никогда не отдавались наружу
app.use((req, res, next) => {
  if (req.url.includes('.db')) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// ============================================================
// РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ (фронтенд)
// ============================================================
// Раздаём CSS файлы при запросе http://localhost:4000/css/...
app.use('/css', express.static(path.join(__dirname, '..', 'frontend', 'css')));

// Раздаём JavaScript файлы при запросе http://localhost:4000/js/...
app.use('/js', express.static(path.join(__dirname, '..', 'frontend', 'js')));

// Раздаём изображения при запросе http://localhost:4000/img/...
app.use('/img', express.static(path.join(__dirname, '..', 'frontend', 'img')));

// Раздаём загруженные изображения объявлений при запросе http://localhost:4000/uploads/...
// С автоматической установкой правильного Content-Type
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  setHeaders: (res, filepath) => {
    const ext = path.extname(filepath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      res.setHeader('Content-Type', `image/${ext.slice(1)}`);
    }
  }
}));
// ============================================================
// СПЕЦИАЛЬНЫЕ МАРШРУТЫ ДЛЯ HTML СТРАНИЦ
// ============================================================


// Раздаём HTML файл при запросе http://localhost:4000/my-listings
  app.get('/my-listings', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'my-listings.html'));
  });

  app.get('/my-listings.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'my-listings.html'));
  });
// Защита от утечки базы данных: основной блок находится выше, до статики
console.log('Frontend path:', path.join(__dirname, '..', 'frontend'));
console.log('Root path:', path.join(__dirname, '..'));
// Раздаём все остальные файлы из папки frontend (HTML файлы и т.д.)
// ВАЖНО: это НЕ раздаёт репозиторий корень (.env, server.js, *.db)
// Статика подключена и с корня, и с префикса /frontend, чтобы работали
// и ссылки вида /auth.html, и редиректы вида /frontend/auth.html
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend'), { index: false }));
app.use(express.static(path.join(__dirname, '..', 'frontend'), { index: false }));



// ============================================================
// ГЛАВНАЯ СТРАНИЦА
// ============================================================
// Все остальные GET запросы идут на главную страницу (index.html в корне)
// Главная страница — доступна по / и /index.html
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});
// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================
const HOST = process.env.HOST || '127.0.0.1'; // По умолчанию локальный хост
const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Сервер запущен: http://${HOST}:${PORT}`);
});

// ============================================================
// ОБРАБОТКА ЗАВЕРШЕНИЯ СЕРВЕРА
// ============================================================
// При получении сигнала SIGINT (Ctrl+C) корректно завершаем сервер
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down');
  server.close(() => process.exit(0));
});

// При получении сигнала SIGTERM корректно завершаем сервер
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
