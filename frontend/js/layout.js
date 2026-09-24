// ============================================================
// ОБЩИЙ ШАБЛОН СТРАНИЦЫ (layout.js) — единый источник правды
// ============================================================
// Рендерит шапку и футер на всех страницах из одного места,
// чтобы копии не «разъезжались» (ТЗ 2A.1): один бренд, одна
// навигация, один рабочий динамический год в футере (ТЗ 2A.2),
// SVG-иконки вместо эмодзи (ТЗ 2A.3), одинаковые ссылки.
//
// Использование на странице:
//   <div id="site-header"></div>
//   ... контент ...
//   <div id="site-footer"></div>
//   <script src="/frontend/js/layout.js" defer></script>

(function () {
  'use strict';

  const BRAND = 'BuildStore'; // одно название везде (ТЗ 2.1)

  // ---------- SVG-иконки (единый набор в стиле Lucide) ----------
  const ICONS = {
    cart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
    close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
    box: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    truck: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
    briefcase: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    alert: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    user: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>',
    mail: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'
  };

  function icon(name) {
    return ICONS[name] || '';
  }

  // ---------- Шапка ----------
  function isFrontendPage() {
    return window.location.pathname.split('/').includes('frontend');
  }
  function pageHref(name) {
    return isFrontendPage() ? name : '/frontend/' + name;
  }

  function headerHtml() {
    return `
      <div class="header-inner container">
        <div class="logo-wrap">
          <a class="logo" href="/index.html">
            <span class="brand">${BRAND}</span>
          </a>
        </div>

        <button class="mobile-menu-btn" aria-label="Открыть меню" aria-expanded="false" aria-controls="navMenu">${icon('menu')}</button>

        <nav id="navMenu" class="main-nav">
          <!-- Одинаковая навигация на всех страницах (ТЗ 2A.1) -->
          <a href="/index.html">Главная</a>
          <a href="/frontend/listings.html">Категории</a>
          <a href="/frontend/contacts.html">Контакты</a>

          <div class="header-actions">
            <div id="themeToggleContainer"></div>
            <div class="auth-links" data-auth-links></div>
            <a href="/frontend/cart.html" class="cart cart-link" id="cartBtn" title="Корзина" aria-label="Корзина">
              ${icon('cart')} <span class="cart-badge" id="cartBadge">0</span>
            </a>
            <!-- Исправлена опечатка «обьявление» (ТЗ 2A.4) -->
            <a class="btn btn-primary" href="/frontend/add.html" id="addBtn">${icon('plus')} Добавить объявление</a>
          </div>
        </nav>
      </div>`;
  }

  // ---------- Футер ----------
  function footerHtml() {
    return `
      <div class="container">
        <div class="footer-grid">
          <div class="footer-column">
            <h4>Покупателям</h4>
            <a href="/frontend/listings.html">Каталог товаров</a>
            <a href="/frontend/contacts.html">Служба поддержки</a>
          </div>
          <div class="footer-column">
            <h4>Продавцам</h4>
            <a href="/frontend/add.html">Разместить объявление</a>
            <a href="/frontend/my-listings.html">Мои объявления</a>
          </div>
          <div class="footer-column">
            <h4>Контакты</h4>
            <a href="/frontend/contacts.html">Автор проекта</a>
            <a href="https://t.me/Artin552" target="_blank" rel="noopener">${icon('mail')} Написать в Telegram</a>
          </div>
        </div>
        <div class="footer-bottom">
          © <span data-year>${new Date().getFullYear()}</span> ${BRAND}. Все права защищены.
        </div>
      </div>`;
  }

  // ---------- Инициализация ----------
  function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.getElementById('navMenu');
    if (!menuBtn || !navMenu) return;

    const setOpen = (open) => {
      navMenu.classList.toggle('active', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.innerHTML = open ? icon('close') : icon('menu');
      menuBtn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    };

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!navMenu.classList.contains('active'));
    });

    document.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !navMenu.contains(e.target)) setOpen(false);
    });

    // Закрытие по Escape — доступность с клавиатуры (ТЗ 0)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });

    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });
  }

  function mountLayout() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');

    if (header) {
      header.innerHTML = headerHtml();
      header.classList.add('main-header');
      initMobileMenu();
      // Переключатель темы — если модуль темы уже загружен
      const tc = document.getElementById('themeToggleContainer');
      if (tc && window.BuildStoreTheme && window.BuildStoreTheme.createToggle) {
        window.BuildStoreTheme.createToggle(tc);
      }
    }
    // auth.js строит кнопки по классу .auth-links; на страницах вне /frontend/
    // относительные ссылки вели бы на /auth.html — правим пути после его отработки.
    setTimeout(() => {
      document.querySelectorAll('[data-auth-links] a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (href === 'auth.html') a.href = pageHref('auth.html');
        if (href === 'reg.html') a.href = pageHref('reg.html');
        if (href === 'dashboard.html') a.href = pageHref('dashboard.html');
      });
    }, 0);

    if (footer) {
      footer.innerHTML = footerHtml();
      footer.classList.add('footer');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountLayout);
  } else {
    mountLayout();
  }

  window.BuildStoreLayout = { BRAND, ICONS, icon };
})();
