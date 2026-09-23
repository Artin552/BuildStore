/**
 * МОДУЛЬ УПРАВЛЕНИЯ ТЕМОЙ (theme.js)
 * 
 * Реализует переключатель темы с тремя состояниями:
 * - "system" (как в системе) — учитывает prefers-color-scheme
 * - "light" (светлая)
 * - "dark" (тёмная)
 * 
 * Тема применяется до первой отрисовки страницы (без "мигания").
 * Выбор пользователя сохраняется в localStorage.
 */

(function() {
  'use strict';
  
  const THEME_KEY = 'buildstore-theme';
  const VALID_THEMES = ['system', 'light', 'dark'];
  
  /**
   * Получить текущую тему системы
   * @returns {string} 'light' или 'dark'
   */
  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  /**
   * Получить эффективную тему (с учётом системной)
   * @param {string} storedTheme - сохранённая тема
   * @returns {string} 'light' или 'dark'
   */
  function getEffectiveTheme(storedTheme) {
    if (!storedTheme || storedTheme === 'system') {
      return getSystemTheme();
    }
    return storedTheme;
  }
  
  /**
   * Применить тему к документу
   * @param {string} theme - 'light' или 'dark'
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }
  
  /**
   * Инициализировать тему при загрузке
   * Вызывается как можно раньше (до рендеринга body)
   */
  function initTheme() {
    const storedTheme = localStorage.getItem(THEME_KEY);
    
    // Проверяем валидность сохранённой темы
    const validStoredTheme = VALID_THEMES.includes(storedTheme) ? storedTheme : 'system';
    
    // Применяем эффективную тему
    const effectiveTheme = getEffectiveTheme(validStoredTheme);
    applyTheme(effectiveTheme);
    
    // Сохраняем валидную тему обратно (на случай если была невалидная)
    if (storedTheme !== validStoredTheme) {
      localStorage.setItem(THEME_KEY, validStoredTheme);
    }
    
    // Слушаем изменения системной темы
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const currentStored = localStorage.getItem(THEME_KEY);
      // Только если пользователь выбрал "system", реагируем на изменения
      if (!currentStored || currentStored === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
  
  /**
   * Переключить тему на следующую в цикле
   * system -> light -> dark -> system
   */
  function cycleTheme() {
    const current = localStorage.getItem(THEME_KEY) || 'system';
    let next;
    
    switch (current) {
      case 'system': next = 'light'; break;
      case 'light': next = 'dark'; break;
      case 'dark': next = 'system'; break;
      default: next = 'light';
    }
    
    localStorage.setItem(THEME_KEY, next);
    const effective = getEffectiveTheme(next);
    applyTheme(effective);
    
    return next;
  }
  
  /**
   * Установить конкретную тему
   * @param {string} theme - 'system', 'light' или 'dark'
   */
  function setTheme(theme) {
    if (!VALID_THEMES.includes(theme)) {
      console.warn('Invalid theme:', theme);
      return;
    }
    
    localStorage.setItem(THEME_KEY, theme);
    const effective = getEffectiveTheme(theme);
    applyTheme(effective);
  }
  
  /**
   * Получить текущую сохранённую тему
   * @returns {string} 'system', 'light' или 'dark'
   */
  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY) || 'system';
  }
  
  /**
   * Создать UI переключателя темы
   * @param {HTMLElement} container - контейнер для переключателя
   */
  function createThemeToggle(container) {
    if (!container) return;
    
    const themes = [
      { value: 'system', label: 'Как в системе', icon: '🖥️' },
      { value: 'light', label: 'Светлая', icon: '☀️' },
      { value: 'dark', label: 'Тёмная', icon: '🌙' }
    ];
    
    const current = getStoredTheme();
    
    const select = document.createElement('select');
    select.id = 'themeSelect';
    select.className = 'theme-select';
    select.setAttribute('aria-label', 'Выбрать тему оформления');
    
    themes.forEach(theme => {
      const option = document.createElement('option');
      option.value = theme.value;
      option.textContent = theme.label;
      if (theme.value === current) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
      setTheme(e.target.value);
    });
    
    container.appendChild(select);
  }
  
  // Экспорт функций в глобальную область
  window.BuildStoreTheme = {
    init: initTheme,
    cycle: cycleTheme,
    set: setTheme,
    get: getStoredTheme,
    getEffective: getEffectiveTheme,
    createToggle: createThemeToggle
  };
  
  // Авто-инициализация (как можно раньше)
  initTheme();
})();
