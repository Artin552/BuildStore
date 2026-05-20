// ============================================================
// ЛОГИКА СТРАНИЦЫ ЗАКАЗОВ (orders.js)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  const container = document.getElementById('ordersContainer');

  // Если пользователь не авторизован
  if (!token) {
    container.innerHTML = `
      <div class="empty-state">
        <p style="font-size: 48px; margin-bottom: 16px;">🔒</p>
        <p style="font-size: 18px; margin-bottom: 24px;">Пожалуйста, авторизуйтесь</p>
        <a href="/frontend/auth.html" class="btn">Войти</a>
      </div>
    `;
    return;
  }

  try {
    // Получаем заказы
    const response = await fetch('/api/orders', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        container.innerHTML = `
          <div class="empty-state">
            <p style="font-size: 48px; margin-bottom: 16px;">🔒</p>
            <p style="font-size: 18px; margin-bottom: 24px;">Сеанс истёк, пожалуйста авторизуйтесь заново</p>
            <a href="/frontend/auth.html" class="btn">Войти</a>
          </div>
        `;
        return;
      }
      throw new Error('Ошибка загрузки заказов');
    }

    const orders = await response.json();

    if (!orders || orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p style="font-size: 48px; margin-bottom: 16px;">📦</p>
          <p style="font-size: 18px; margin-bottom: 24px;">У вас нет заказов</p>
          <a href="/frontend/listings.html" class="btn">Начать покупки</a>
        </div>
      `;
      return;
    }

    // Отображаем заказы
    let ordersHtml = '';
    orders.forEach(order => {
      const createdDate = new Date(Number(order.created_at));
      const dateStr = createdDate.toLocaleDateString('ru-RU', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const statusLabels = {
        'pending': 'Ожидание подтверждения',
        'confirmed': 'Подтвержден',
        'shipped': 'Отправлен',
        'delivered': 'Доставлен',
        'cancelled': 'Отменен'
      };

      let itemsHtml = '';
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          itemsHtml += `
            <div class="order-item-row">
              <div class="order-item-name">
                ${item.title || 'Товар'} × ${item.quantity || 1}
              </div>
              <div>${item.price_at_purchase || '—'} ₽</div>
            </div>
          `;
        });
      }

      ordersHtml += `
        <div class="order-card">
          <div class="order-header">
            <div>
              <div class="order-number">Заказ #${order.id}</div>
              <div class="order-date">${dateStr}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="order-status ${order.status || 'pending'}">
                ${statusLabels[order.status] || order.status || 'Неизвестен'}
              </span>
            </div>
          </div>
          
          <div class="order-items">
            ${itemsHtml || '<div class="muted">Нет товаров</div>'}
          </div>

          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="color: #999;">Итого:</span>
              <span class="order-total">${order.total || '—'} ₽</span>
            </div>
            <a href="#" onclick="viewOrderDetails(${order.id}); return false;" class="btn secondary" style="padding: 6px 12px; font-size: 14px;">
              Подробнее
            </a>
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div>${ordersHtml}</div>
      <div style="text-align: center; margin-top: 24px;">
        <a href="/frontend/listings.html" class="btn secondary">← Продолжить покупки</a>
      </div>
    `;

  } catch (error) {
    console.error('Error loading orders:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: red;">
        <p>Ошибка загрузки заказов: ${error.message}</p>
        <a href="/frontend/orders.html" class="btn secondary" style="margin-top: 16px;">Попробовать снова</a>
      </div>
    `;
  }
});

// Функция просмотра деталей заказа
window.viewOrderDetails = async function(orderId) {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  
  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Ошибка загрузки деталей заказа');
    }

    const order = await response.json();
    
    let itemsHtml = '';
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        const imgUrl = item.imagePath || `https://picsum.photos/seed/${encodeURIComponent(item.title)}/150/150`;
        itemsHtml += `
          <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #eee;">
            <img src="${imgUrl}" alt="${item.title}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;">
            <div style="flex: 1;">
              <div style="font-weight: 600;">${item.title || 'Товар'}</div>
              <div style="color: #999; font-size: 14px;">Категория: ${item.category || '—'}</div>
              <div style="margin-top: 4px;">
                <span style="color: var(--primary); font-weight: 600;">${item.price_at_purchase || '—'} ₽</span>
                <span style="color: #999;"> × ${item.quantity || 1}</span>
              </div>
            </div>
          </div>
        `;
      });
    }

    const statusLabels = {
      'pending': 'Ожидание подтверждения',
      'confirmed': 'Подтвержден',
      'shipped': 'Отправлен',
      'delivered': 'Доставлен',
      'cancelled': 'Отменен'
    };

    const createdDate = new Date(Number(order.created_at));
    const dateStr = createdDate.toLocaleDateString('ru-RU', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    alert(`
Заказ #${order.id}
${dateStr}

Статус: ${statusLabels[order.status] || order.status}

Товары:
${itemsHtml.replace(/<[^>]*>/g, '').trim()}

Итого: ${order.total} ₽
    `.trim());
  } catch (error) {
    alert('Ошибка: ' + error.message);
  }
};
