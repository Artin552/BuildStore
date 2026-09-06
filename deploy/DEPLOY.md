# Деплой BuildStoreNET на VPS (Ubuntu 22.04/24.04)

Схема: **nginx (80/443) → Node на 127.0.0.1:4000 → SQLite**.
Node-приложение наружу не светится, systemd перезапускает его при падении.

---

## 1. Что понадобится

- VPS с Ubuntu (минимум 1 ГБ RAM — хватит с запасом).
- Домен (опционально, но нужен для HTTPS; можно начать и по IP).
- С вашего компьютера — OpenSSH (в Windows 10/11 встроен: `ssh`, `scp`).

## 2. Установка Node и nginx на сервере

Подключитесь и выполните:

```bash
ssh root@ВАШ_IP

# Node 22 LTS
apt update && apt -y upgrade
apt -y install curl nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs
node -v   # должно быть v22.x

# базовая защита
apt -y install ufw
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

## 3. Загрузка проекта с вашего компьютера

В **PowerShell на Windows** (не на сервере):

```powershell
# создайте архив без node_modules — их поставим на сервере
cd D:\project\marketplace
tar -a -c -f buildstorenet.zip --exclude "BuildStoreNET/backend/node_modules" `
    --exclude "BuildStoreNET/node_modules" --exclude "BuildStoreNET/.git" BuildStoreNET

scp buildstorenet.zip root@ВАШ_IP:/tmp/
```

На сервере:

```bash
mkdir -p /opt/buildstorenet
apt -y install unzip
unzip /tmp/buildstorenet.zip -d /opt
mv /opt/BuildStoreNET/* /opt/BuildStoreNET/.* /opt/buildstorenet/ 2>/dev/null; rmdir /opt/BuildStoreNET
```

## 4. Зависимости и .env

```bash
cd /opt/buildstorenet/backend
npm install --omit=dev

# переменные окружения
cp /opt/buildstorenet/deploy/.env.example /opt/buildstorenet/backend/.env
# впишите сгенерированный секрет в JWT_SECRET:
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" /opt/buildstorenet/backend/.env
nano /opt/buildstorenet/backend/.env   # заполните ALLOWED_ORIGIN и SMTP (по желанию)
```

Если SMTP не настраиваете — код сброса пароля будет печататься в лог сервера
(`journalctl -u buildstorenet`), этого достаточно для демо.

## 5. Права и systemd

```bash
chown -R www-data:www-data /opt/buildstorenet/backend /opt/buildstorenet/uploads
cp /opt/buildstorenet/deploy/buildstorenet.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now buildstorenet
systemctl status buildstorenet        # должно быть active (running)
curl -s http://127.0.0.1:4000/ >/dev/null && echo "OK: приложение отвечает"
```

## 6. nginx

```bash
# замените mydomain.ru на ваш домен (или оставьте _ для работы по IP):
sed -i 's/mydomain.ru/ВАШ_ДОМЕН/g' /opt/buildstorenet/deploy/nginx.conf
cp /opt/buildstorenet/deploy/nginx.conf /etc/nginx/sites-available/buildstorenet
ln -sf /etc/nginx/sites-available/buildstorenet /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Откройте `http://ВАШ_IP` или `http://ваш-домен` — сайт должен работать.

## 7. HTTPS (если есть домен)

```bash
apt -y install certbot python3-certbot-nginx
certbot --nginx -d ваш-домен -d www.ваш-домен
```

Certbot сам перепишет nginx-конфиг и настроит автопродление.

## 8. Обновление после правок кода

На Windows (PowerShell) повторите шаг 3 (архив + scp), затем на сервере:

```bash
systemctl stop buildstorenet
unzip -o /tmp/buildstorenet.zip -d /opt
cp -r /opt/BuildStoreNET/backend /opt/BuildStoreNET/frontend /opt/BuildStoreNET/index.html /opt/buildstorenet/
rm -rf /opt/BuildStoreNET
chown -R www-data:www-data /opt/buildstorenet/backend /opt/buildstorenet/uploads
systemctl start buildstorenet && systemctl status buildstorenet
```

⚠️ Файл `/opt/buildstorenet/backend/.env` и база `users.db` при такой замене
сохраняются, потому что архив не содержит их. Не удаляйте их вручную.

## 9. Полезные команды

```bash
journalctl -u buildstorenet -f      # логи приложения в реальном времени
systemctl restart buildstorenet     # перезапуск
nginx -t                            # проверка конфига nginx
```

## 10. Частые проблемы

| Симптом | Причина / решение |
|---|---|
| 502 Bad Gateway | Приложение не запущено: `systemctl status buildstorenet`, смотрите `journalctl -u buildstorenet` |
| Сайт открывается, а картинки нет | Не перенесли папку `uploads/` или права: `chown -R www-data:www-data /opt/buildstorenet/uploads` |
| 429 Too Many Requests при разработке | Это rate limiter (20 req/min на /api/auth) — так и задумано |
| Сброс пароля не приходит на почту | Не настроен SMTP: код в логе `journalctl -u buildstorenet -f` |
| «Не удалось соединиться с сервером» | Проверьте, что `HOST=127.0.0.1`, `PORT=4000` и nginx проксирует на 4000 |
