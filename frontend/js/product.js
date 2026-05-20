  // Получить id товара из URL
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
      document.getElementById('productDetail').innerHTML = '<p>Товар не найден</p>';
    } else {
      // Загрузить товар
      fetch('/api/listings/' + encodeURIComponent(productId))
        .then(res => {
          if (!res.ok) throw new Error('Товар не найден');
          return res.json();
        })
        .then(item => {
          const imgUrl = item.imagePath || `https://picsum.photos/seed/${encodeURIComponent(item.title)}/1200/700`;
          const created = item.created_at ? new Date(Number(item.created_at)) : null;
          const dateStr = created ? created.toLocaleDateString('ru-RU', { year:'numeric', month:'long', day:'numeric' }) : '';

          const html = `
            <div class="listing-detail" style="max-width:800px; margin:0 auto;">
              <div class="listing-header">
                <div class="listing-title" style="font-size:28px; font-weight:bold; margin-bottom:8px;">${item.title || ''}</div>
                <div class="listing-date muted small">${dateStr}</div>
              </div>

              <div class="listing-image-wrapper" style="margin:24px 0;">
                <img class="listing-image" src="${imgUrl}" alt="${item.title || ''}" style="max-width:100%; border-radius:8px;">
              </div>

              <div class="listing-body" style="margin:24px 0;">
                <div class="listing-desc" style="font-size:16px; line-height:1.6; margin-bottom:16px;">${item.description || ''}</div>
                <div class="listing-meta muted small">
                  <strong>Категория:</strong> ${item.category || 'Не указана'}
                </div>
              </div>

              <div class="listing-info" style="margin:24px 0; padding:16px; background:#f5f5f5; border-radius:8px;">
                <div style="margin-bottom:12px;"><strong>Цена:</strong> ${item.price ? (item.price + ' ₽') : 'По договорённости'}</div>
                <div style="margin-bottom:12px;"><strong>Статус:</strong> ${item.in_stock ? '✅ В наличии' : '❌ Нет в наличии'}</div>
                ${item.rating ? `<div style="margin-bottom:12px;"><strong>Рейтинг:</strong> ⭐ ${item.rating}</div>` : ''}
              </div>

              <div class="listing-cta" style="margin:24px 0; padding:24px; background:#f0f8ff; border-radius:8px;">
                <h3 style="margin-top:0;">Готовы купить?</h3>
                <p class="muted">Добавьте товар в корзину и оформите заказ онлайн.</p>
                <div style="margin-top:16px; display:flex; gap:12px;">
                  <button class="btn" id="addToCartBtn" style="flex:1;">Добавить в корзину</button>
                  <button class="btn secondary" onclick="alert('Функция контактов будет добавлена')" style="flex:1;">Связаться</button>
                </div>
              </div>

              <div style="text-align:center; margin:32px 0;">
                <a href="/frontend/listings.html" class="btn secondary">← Вернуться к категориям</a>
              </div>
            </div>
          `;

          document.getElementById('productDetail').innerHTML = html;

          // Обработчик для кнопки "Добавить в корзину"
          const addToCartBtn = document.getElementById('addToCartBtn');
          if (addToCartBtn) {
            addToCartBtn.addEventListener('click', () => {
              window.cart.addItem(item);
              addToCartBtn.textContent = '✓ Добавлено в корзину';
              addToCartBtn.disabled = true;
              setTimeout(() => {
                addToCartBtn.textContent = 'Добавить в корзину';
                addToCartBtn.disabled = false;
              }, 2000);
            });
          }
        })
        .catch(err => {
          document.getElementById('productDetail').innerHTML = `<p style="color:red;">Ошибка: ${err.message}</p><a href="/frontend/listings.html" class="btn">Вернуться</a>`;
        });
    }

    // Поиск
    document.getElementById('searchBtn').addEventListener('click', () => {
      const q = document.getElementById('searchInput').value.trim();
      if (q) {
        window.location.href = '/frontend/listings.html?q=' + encodeURIComponent(q);
      }
    });

    document.getElementById('searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = document.getElementById('searchInput').value.trim();
        if (q) {
          window.location.href = '/frontend/listings.html?q=' + encodeURIComponent(q);
        }
      }
    });