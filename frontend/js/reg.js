// ============================================================
// РЕГИСТРАЦИЯ (ТЗ 5.1–5.3)
// Два типа аккаунта: частное лицо — упрощённая форма;
// организация — ИНН/ОГРН, юр. адрес, контакты компании,
// загрузка документов и обязательное согласие на обработку данных.
// Ошибки показываем под конкретным полем (ТЗ 5.2), а не «в виде текста».
// ============================================================
(function () {
  'use strict';

  const form = document.getElementById('registerForm');
  if (!form) return;

  const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 МБ (ТЗ 5.2)
  const ALLOWED_DOC_EXT = ['pdf', 'jpg', 'jpeg', 'png'];

  const $ = (id) => document.getElementById(id);
  const orgFields = $('orgFields');

  function accountType() {
    const el = document.querySelector('input[name="accountType"]:checked');
    return el ? el.value : 'person';
  }

  function setFieldError(id, msg) {
    const box = document.querySelector(`[data-error-for="${id}"]`);
    if (box) box.textContent = msg || '';
    const input = $(id);
    if (input) {
      input.classList.toggle('is-invalid', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
  }

  function clearErrors() {
    document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    document.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    const g = $('formError');
    if (g) g.hidden = true;
  }

  function showGlobalError(msg) {
    const g = $('formError');
    if (g) { g.textContent = msg; g.hidden = false; }
  }

  // ---------- Переключение блока организации ----------
  document.querySelectorAll('input[name="accountType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isOrg = accountType() === 'organization';
      orgFields.hidden = !isOrg;
      clearErrors();
    });
  });

  // ---------- Показ/скрытие пароля (SVG-иконка вместо эмодзи, ТЗ 2A.3) ----------
  const toggleBtn = $('toggleRPassword');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const p = $('rpassword');
      const show = p.type === 'password';
      p.type = show ? 'text' : 'password';
      toggleBtn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
      toggleBtn.classList.toggle('is-active', show);
    });
  }

  // ---------- Документы: проверка формата по расширению + превью списка ----------
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('read error'));
      fr.readAsDataURL(file);
    });
  }

  function validateDocFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_DOC_EXT.includes(ext)) return 'Допустимы только PDF, JPG или PNG';
    if (file.size > MAX_DOC_BYTES) return 'Файл больше 10 МБ';
    return null;
  }

  function renderDocsList(files) {
    const list = $('docsList');
    list.innerHTML = '';
    Array.from(files).forEach((f) => {
      const li = document.createElement('li');
      const err = validateDocFile(f);
      li.className = 'docs-list__item' + (err ? ' docs-list__item--error' : '');
      li.textContent = `${f.name} (${(f.size / 1024 / 1024).toFixed(2)} МБ)` + (err ? ` — ${err}` : '');
      list.appendChild(li);
    });
  }

  $('orgDocs').addEventListener('change', (e) => {
    renderDocsList(e.target.files);
  });

  // ---------- Клиентская валидация ----------
  function validate() {
    clearErrors();
    let ok = true;
    const name = $('rname').value.trim();
    const email = $('remail').value.trim();
    const password = $('rpassword').value;

    if (name.length < 2) { setFieldError('rname', 'Укажите имя (минимум 2 символа)'); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('remail', 'Некорректный e-mail'); ok = false; }
    if (password.length < 6) { setFieldError('rpassword', 'Пароль должен содержать минимум 6 символов'); ok = false; }

    const payload = { name, email, password, type: accountType() };

    if (payload.type === 'organization') {
      const orgName = $('orgName').value.trim();
      const inn = $('orgInn').value.trim();
      const ogrn = $('orgOgrn').value.trim();
      const address = $('orgAddress').value.trim();
      const contact = $('orgContact').value.trim();
      const phone = $('orgPhone').value.trim();
      const orgEmail = $('orgEmail').value.trim();
      const files = $('orgDocs').files;

      if (orgName.length < 2) { setFieldError('orgName', 'Укажите название организации или ФИО ИП'); ok = false; }
      if (!/^\d{10}(\d{2})?$/.test(inn)) { setFieldError('orgInn', 'ИНН — 10 или 12 цифр'); ok = false; }
      if (ogrn && !/^(\d{13}|\d{15})$/.test(ogrn)) { setFieldError('orgOgrn', 'ОГРН — 13 цифр, ОГРНИП — 15 цифр'); ok = false; }
      if (address.length < 5) { setFieldError('orgAddress', 'Укажите юридический адрес'); ok = false; }
      if (contact.length < 2) { setFieldError('orgContact', 'Укажите контактное лицо'); ok = false; }
      if (!/^[\d+()\- ]{6,20}$/.test(phone)) { setFieldError('orgPhone', 'Укажите корректный телефон компании'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orgEmail)) { setFieldError('orgEmail', 'Укажите корректный e-mail компании'); ok = false; }
      if (files.length === 0) { setFieldError('orgDocs', 'Загрузите хотя бы один подтверждающий документ'); ok = false; }
      for (let i = 0; i < files.length; i++) {
        const err = validateDocFile(files[i]);
        if (err) { setFieldError('orgDocs', `«${files[i].name}»: ${err}`); ok = false; break; }
      }
      if (!$('consent').checked) { setFieldError('consent', 'Без согласия на обработку данных регистрация организации невозможна'); ok = false; }

      payload.organization = {
        orgName, inn, ogrn: ogrn || undefined,
        legalAddress: address,
        contactPerson: contact,
        contactPosition: $('orgPosition').value.trim(),
        phone, email: orgEmail
      };
      payload.consent = true;
    }
    return ok ? payload : null;
  }

  // ---------- Отправка ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = validate();
    if (!payload) return;

    const submitBtn = $('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем...';

    try {
      // Читаем документы в base64 прямо перед отправкой
      if (payload.type === 'organization') {
        const files = Array.from($('orgDocs').files);
        payload.organization.documents = await Promise.all(files.map(readAsDataURL));
      }

      const res = await window.BuildStoreApi.apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 15000); // документы могут быть большими — увеличенный таймаут

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        if (data.token) sessionStorage.setItem('token', data.token);
        if (data.user && data.user.email) sessionStorage.setItem('userEmail', data.user.email);
        if (data.user) sessionStorage.setItem('user', JSON.stringify(data.user));
        if (data.user && data.user.type === 'organization') {
          alert('Заявка отправлена модератору. Размещать объявления можно будет после подтверждения документов.');
          window.location.href = '/frontend/dashboard.html';
        } else {
          window.location.href = data.redirect || '/';
        }
        return;
      }
      showGlobalError(data.error || 'Ошибка регистрации. Попробуйте ещё раз.');
    } catch (err) {
      console.error(err);
      showGlobalError('Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Создать аккаунт';
    }
  });
})();
