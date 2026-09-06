// my-listings.js — для my-listings.html

async function loadMyListings() {
  const root = document.getElementById('myListings');
  if (!root) return;

  try {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
      // без токена бэкенд вернёт 401 на mine=true — сразу отправляем на вход
      window.location.href = '/frontend/auth.html';
      return;
    }
    const res = await fetch('/api/listings?mine=true', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.status === 401) {
      // токен протух/невалиден — просим войти заново
      sessionStorage.removeItem('token');
      window.location.href = '/frontend/auth.html';
      return;
    }

    const data = await res.json();

    root.innerHTML = '';

    if (data.length === 0) {
      root.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:40px; color:var(--muted);">
          <p>У вас пока нет объявлений</p>
          <p style="margin-top:8px;">Создайте первое — это бесплатно и займёт 2 минуты!</p>
        </div>
      `;
      return;
    }

    data.forEach(item => {
      const card = document.createElement('article');
      card.className = 'card';
      const imgUrl = item.imagePath || '/img/placeholder.svg';
      
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = item.title || '';
      img.src = imgUrl;
      img.onload = () => { img.style.opacity = 1; };
      img.onerror = () => { img.src = '/img/placeholder.svg'; };

      const meta = document.createElement('div');
      meta.className = 'meta';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'title';
      titleDiv.textContent = item.title || '';

      const muted = document.createElement('div');
      muted.className = 'muted';
      muted.textContent = item.category || '';

      const actionsWrap = document.createElement('div');
      actionsWrap.style.display = 'flex';
      actionsWrap.style.gap = '8px';
      actionsWrap.style.marginTop = '8px';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn secondary';
      editBtn.textContent = 'Редактировать';
      editBtn.addEventListener('click', () => editItem(item.id, item.title, item.price || ''));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deleteItem(item.id));

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(delBtn);

      meta.appendChild(titleDiv);
      meta.appendChild(muted);
      meta.appendChild(actionsWrap);

      card.appendChild(img);
      card.appendChild(meta);
      root.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    root.innerHTML = '<p style="color:red; text-align:center;">Ошибка загрузки объявлений</p>';
  }
}

async function deleteItem(id) {
  if (!confirm('Удалить объявление?')) return;
  try {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const res = await fetch('/api/listings/' + id, {
      method: 'DELETE',
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
    if (res.ok) {
      alert('Удалено');
      loadMyListings();
    } else {
      const err = await res.json();
      alert('Ошибка: ' + (err.error || JSON.stringify(err)));
    }
  } catch (e) {
    alert('Не удалось подключиться к серверу');
  }
}

async function editItem(id, currentTitle, currentPrice) {
  const newTitle = prompt('Новый заголовок', currentTitle) || currentTitle;
  const newPrice = prompt('Новая цена', currentPrice) || currentPrice;
  if (newTitle === currentTitle && newPrice === currentPrice) return;

  try {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const res = await fetch('/api/listings/' + id, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify({ title: newTitle, price: newPrice })
    });
    if (res.ok) {
      alert('Сохранено');
      loadMyListings();
    } else {
      const err = await res.json();
      alert('Ошибка: ' + (err.error || JSON.stringify(err)));
    }
  } catch (e) {
    alert('Ошибка сети');
  }
}

// Запуск
document.addEventListener('DOMContentLoaded', loadMyListings);