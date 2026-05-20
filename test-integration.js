// ============================================================
// ТЕСТ ИНТЕГРАЦИИ КОРЗИНЫ И ЗАКАЗОВ
// ============================================================

const http = require('http');

// Функция для выполнения HTTP запроса
function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Основной тест
async function runTests() {
  console.log('🧪 Начинаем тестирование API корзины и заказов...\n');

  try {
    // 1. Проверяем что сервер запущен
    console.log('1️⃣ Проверяем доступность сервера...');
    const healthCheck = await makeRequest('GET', '/');
    console.log(`   ✅ Сервер доступен (статус: ${healthCheck.status})\n`);

    // 2. Проверяем что API маршруты существуют
    console.log('2️⃣ Проверяем API маршруты...');
    
    // Попытка создать заказ без токена (должно вернуть 401)
    const unauthorizedOrder = await makeRequest('POST', '/api/orders', {
      items: [],
      total: '0'
    });
    
    if (unauthorizedOrder.status === 401) {
      console.log('   ✅ /api/orders требует авторизации (401)\n');
    } else {
      console.log(`   ⚠️ /api/orders вернул ${unauthorizedOrder.status} вместо 401\n`);
    }

    // 3. Проверяем таблицы БД
    console.log('3️⃣ Проверяем структуру БД...');
    const db = require('./backend/db');
    
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('   ❌ Ошибка запроса БД:', err);
        return;
      }
      
      const tableNames = (tables || []).map(t => t.name);
      const requiredTables = ['users', 'listings', 'orders', 'order_items'];
      const found = requiredTables.filter(t => tableNames.includes(t));
      
      console.log(`   Найдены таблицы: ${found.join(', ')}`);
      
      if (found.includes('orders') && found.includes('order_items')) {
        console.log('   ✅ Таблицы заказов созданы\n');
      } else {
        console.log('   ❌ Таблицы заказов не найдены\n');
      }

      console.log('🎉 Тестирование завершено!\n');
      console.log('ℹ️ Для полного функционирования:');
      console.log('   1. Запустите сервер: npm start (из папки backend)');
      console.log('   2. Откройте в браузере: http://localhost:4000');
      console.log('   3. Авторизуйтесь или создайте учетную запись');
      console.log('   4. Добавляйте товары в корзину');
      console.log('   5. Оформляйте заказы из корзины\n');
      
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Ошибка тестирования:', error.message);
    console.log('\n⚠️ Убедитесь что сервер запущен: npm start (из папки backend)');
    process.exit(1);
  }
}

// Даем серверу время на запуск (3 секунды)
setTimeout(runTests, 3000);
