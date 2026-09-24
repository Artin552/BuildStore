// ============================================================
// ОБЩИЙ ДОСТУП К API (api.js)
// ============================================================
// 1. Базовый адрес API задаётся один раз: window.BUILDSTORE_API_BASE
//    (в продакшене можно указать отдельный URL бэкенда, например
//     https://buildstore-api.onrender.com). По умолчанию — относительный
//    путь /api, когда фронтенд и бэкенд задеплоены вместе.
// 2. apiFetch — обёртка над fetch с обязательным таймаутом, чтобы
//    пользователь никогда не оставался перед «вечным спиннером» (ТЗ 2A.0).

(function () {
  'use strict';

  const BASE = (window.BUILDSTORE_API_BASE || '/api').replace(/\/+$/, '');

  /**
   * fetch с таймаутом. Если сервер не ответил за timeoutMs — промис
   * отклоняется с человекочитаемой ошибкой (техническая причина — в консоли).
   */
  async function apiFetch(path, options, timeoutMs) {
    const opts = Object.assign({}, options || {});
    const timeout = timeoutMs || 8000;

    const controller = new AbortController();
    opts.signal = controller.signal;

    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(BASE + path, opts);
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  window.BuildStoreApi = { BASE, apiFetch };
})();
