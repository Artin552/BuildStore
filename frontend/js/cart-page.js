// ============================================================
// ЛОГИКА СТРАНИЦЫ КОРЗИНЫ (cart-page.js)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cartContainer');

  // Функция для отображения корзины
  function renderCart() {
    const items = window.cart.getItems();
    const total = window.cart.getTotal();

    if (items.length === 0) {
      container.innerHTML = `
        <div class="cart-empty">
          <p style="font-size: 48px; margin-bottom: 16px;">🛒</p>
          <p style="font-size: 18px; margin-bottom: 24px;">Ваша корзина пуста</p>
          <a href="/frontend/listings.html" class="btn">Продолжить покупки</a>
        </div>
      `;
      return;
    }

    let itemsHtml = '';
    items.forEach(item => {
      const imgUrl = item.imagePath || `https://picsum.photos/seed/${encodeURIComponent(item.title)}/200/200`;
      const itemTotal = parseFloat(item.price || 0) * (item.quantity || 1);
      
      itemsHtml += `
        <div class="cart-item" data-item-id="${item.id}">
          <img src="${imgUrl}" alt="${item.title}" class="cart-item-image">
          <div class="cart-item-info">
            <div class="cart-item-title">${item.title}</div>
            <div class="cart-item-price">${item.price || 'По договорённости'} ₽</div>
            <div class="cart-item-quantity">
              <button class="btn secondary" style="padding: 4px 8px; font-size: 14px;" onclick="decrementQuantity(${item.id})">−</button>
              <input type="number" value="${item.quantity || 1}" min="1" class="quantity-input" data-item-id="${item.id}" style="width: 50px; padding: 4px; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
              <button class="btn secondary" style="padding: 4px 8px; font-size: 14px;" onclick="incrementQuantity(${item.id})">+</button>
              <span style="margin-left: 16px; color: #666;">= ${itemTotal.toFixed(2)} ₽</span>
            </div>
          </div>
          <button class="cart-item-remove" onclick="removeItem(${item.id})">✕ Удалить</button>
        </div>
      `;
    });

    const cartSummary = `
      <div class="cart-summary">
        <div class="cart-summary-row">
          <span>Товаров:</span>
          <span>${items.length}</span>
        </div>
        <div class="cart-summary-row">
          <span>Подитог:</span>
          <span>${total.toFixed(2)} ₽</span>
        </div>
        <div class="cart-summary-total">
          Итого: ${total.toFixed(2)} ₽
        </div>
        <button class="btn primary" style="width: 100%; margin-top: 16px;" id="checkoutBtn">
          Оформить заказ
        </button>
        <a href="/frontend/listings.html" class="btn secondary" style="width: 100%; margin-top: 8px; text-align: center; display: block;">
          Продолжить покупки
        </a>
      </div>
    `;

    container.innerHTML = `<div style="max-width: 1000px;">${itemsHtml}</div>${cartSummary}`;

    // Обработчик для кнопки оформления заказа
    document.getElementById('checkoutBtn').addEventListener('click', checkoutOrder);

    // Обработчики изменения количества через input
    document.querySelectorAll('.quantity-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const itemId = parseInt(e.target.dataset.itemId);
        const quantity = parseInt(e.target.value) || 1;
        if (quantity > 0) {
          window.cart.updateQuantity(itemId, quantity);
          renderCart();
        }
      });
    });
  }

  // Функция оформления заказа
  async function checkoutOrder() {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    
    if (!token) {
      alert('Пожалуйста, авторизуйтесь перед оформлением заказа');
      window.location.href = '/frontend/auth.html';
      return;
    }

    const items = window.cart.getItems();
    const total = window.cart.getTotal().toFixed(2);

    const checkoutBtn = document.getElementById('checkoutBtn');
    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<span class="loading-spinner"></span> Обработка...';

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: items,
          total: total
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка при создании заказа');
      }

      const order = await response.json();
      
      // Очищаем корзину
      window.cart.clear();

      // Показываем успешное сообщение
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <p style="font-size: 64px; margin-bottom: 16px;">✅</p>
          <h2 style="font-size: 28px; margin-bottom: 16px;">Заказ успешно оформлен!</h2>
          <p style="font-size: 18px; margin-bottom: 8px;">Номер заказа: <strong>#${order.id}</strong></p>
          <p style="font-size: 16px; margin-bottom: 24px; color: #666;">Сумма: ${order.total} ₽</p>
          <p style="font-size: 14px; color: #999; margin-bottom: 24px;">Вы можете отследить заказ в личном кабинете</p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <a href="/frontend/dashboard.html" class="btn">Мои заказы</a>
            <a href="/frontend/listings.html" class="btn secondary">Продолжить покупки</a>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Ошибка: ' + error.message);
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Оформить заказ';
    }
  }

  // Функция удаления товара
  window.removeItem = function(itemId) {
    if (confirm('Удалить товар из корзины?')) {
      window.cart.removeItem(itemId);
      renderCart();
    }
  };

  // Функция увеличения количества
  window.incrementQuantity = function(itemId) {
    const item = window.cart.getItems().find(i => i.id == itemId);
    if (item) {
      window.cart.updateQuantity(itemId, (item.quantity || 1) + 1);
      renderCart();
    }
  };

  // Функция уменьшения количества
  window.decrementQuantity = function(itemId) {
    const item = window.cart.getItems().find(i => i.id == itemId);
    if (item && (item.quantity || 1) > 1) {
      window.cart.updateQuantity(itemId, (item.quantity || 1) - 1);
      renderCart();
    }
  };

  // Обработчик поиска
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');
  
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const q = searchInput.value.trim();
      if (q) {
        window.location.href = '/frontend/listings.html?q=' + encodeURIComponent(q);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) {
          window.location.href = '/frontend/listings.html?q=' + encodeURIComponent(q);
        }
      }
    });
  }

  // Первоначальный рендер
  renderCart();
});
