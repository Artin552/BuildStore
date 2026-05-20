// ============================================================
// МОДУЛЬ УПРАВЛЕНИЯ КОРЗИНОЙ (cart.js)
// ============================================================
// Управляет корзиной товаров в localStorage

class Cart {
  constructor() {
    this.storageKey = 'buildstore_cart';
    this.cart = this.load();
  }

  // Загрузить корзину из localStorage
  load() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error loading cart:', e);
      return [];
    }
  }

  // Сохранить корзину в localStorage
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.cart));
      this.updateBadge();
    } catch (e) {
      console.error('Error saving cart:', e);
    }
  }

  // Добавить товар в корзину
  addItem(listing) {
    if (!listing.id) {
      console.error('Listing must have id');
      return;
    }

    const existingItem = this.cart.find(item => item.id == listing.id);
    
    if (existingItem) {
      existingItem.quantity = (existingItem.quantity || 1) + 1;
    } else {
      this.cart.push({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        imagePath: listing.imagePath || '',
        quantity: 1
      });
    }

    this.save();
    return true;
  }

  // Удалить товар из корзины
  removeItem(itemId) {
    this.cart = this.cart.filter(item => item.id != itemId);
    this.save();
  }

  // Изменить количество товара
  updateQuantity(itemId, quantity) {
    const item = this.cart.find(i => i.id == itemId);
    if (item) {
      if (quantity <= 0) {
        this.removeItem(itemId);
      } else {
        item.quantity = quantity;
        this.save();
      }
    }
  }

  // Получить все товары в корзине
  getItems() {
    return this.cart;
  }

  // Получить общее количество товаров
  getCount() {
    return this.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }

  // Получить общую стоимость
  getTotal() {
    return this.cart.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      return sum + (price * (item.quantity || 1));
    }, 0);
  }

  // Очистить корзину
  clear() {
    this.cart = [];
    this.save();
  }

  // Обновить badge с количеством товаров в корзине
  updateBadge() {
    const badge = document.getElementById('cartBadge');
    if (badge) {
      const count = this.getCount();
      badge.textContent = count > 0 ? count : '0';
    }
  }
}

// Создаем глобальный объект корзины
window.cart = new Cart();

// Обновляем badge при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  window.cart.updateBadge();
});
