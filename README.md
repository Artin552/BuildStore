# BuildStoreNET (local dev)

This is a small marketplace demo (Node/Express backend + static frontend). Quick notes to run locally.

## 🆕 Новое в версии 1.0.1 - Корзина и заказы

Полностью реализована система корзины и оформления заказов:
- ✅ Корзина с сохранением в localStorage
- ✅ Страница просмотра корзины
- ✅ Оформление заказов (требует авторизации)
- ✅ История заказов пользователя
- ✅ API для управления заказами

**[📖 Полная документация](./CART_IMPLEMENTATION.md)** | **[🚀 Быстрый старт](./CART_QUICK_START.md)** | **[💻 Примеры кода](./CODE_EXAMPLES.md)**

## Required env variables
- `JWT_SECRET` — secret for signing JWT (development fallback exists but set in production!) 
- `HOST` — host to bind (default `127.0.0.1`)
- `PORT` — port (default `4000`)
- `JSON_LIMIT` — max JSON body size (default `2mb`)
- Optional SMTP for password reset: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`.

## Project Structure

```
BuildStoreNET/
├── backend/              # Node.js/Express server
│   ├── server.js        # Main server file
│   ├── db.js            # SQLite database setup (+ orders tables)
│   ├── routes/
│   │   ├── auth.js      # Authentication API endpoints
│   │   ├── listings.js  # Listings API endpoints
│   │   └── orders.js    # 🆕 Orders API endpoints
│   ├── package.json
│   └── users.db         # SQLite database (+ orders, order_items)
├── frontend/            # Static HTML/CSS/JS files
│   ├── css/
│   │   └── styles.css   # Global styles
│   ├── js/
│   │   ├── auth.js      # Auth UI management
│   │   ├── cart.js      # 🆕 Shopping cart management
│   │   ├── cart-page.js # 🆕 Cart page logic
│   │   ├── orders.js    # 🆕 Orders page logic
│   │   └── search.js    # Search module
│   ├── cart.html        # 🆕 Shopping cart page
│   ├── orders.html      # 🆕 My orders page
│   ├── img/             # Images and videos
│   └── ...
├── tests/               # Test suite
├── uploads/             # User-uploaded images
├── index.html          # Main landing page
├── CART_IMPLEMENTATION.md  # 🆕 Cart documentation
├── CART_QUICK_START.md     # 🆕 Quick start guide
├── CODE_EXAMPLES.md        # 🆕 Code examples
├── ARCHITECTURE.md         # 🆕 Architecture diagrams
├── IMPLEMENTATION_SUMMARY.md # 🆕 Change summary
├── test-integration.js     # 🆕 Integration test
└── ...
```

## Run

### 1. Install dependencies
```powershell
cd backend
npm install
```

### 2. Start the server
```powershell
node backend/server.js
```

### 3. Open in browser
```
http://127.0.0.1:4000
```

## Testing

See [`tests/README.md`](tests/README.md) for full test documentation.

Quick test:
```powershell
# Add test data to DB
node tests/add_test_data.js

# Run main smoke test
node tests/smoke_test_search.js
```

## Key Architecture Points

### Frontend
- **No framework** — pure HTML/CSS/vanilla JS
- **Mobile-first CSS** — styles in `frontend/css/styles.css`
- **Unified search** — `frontend/js/search.js` provides global `loadListings()` function used on all pages
- **Auth UI** — `frontend/js/auth.js` manages login/logout/profile display

### Backend
- **REST API** — all endpoints under `/api/`
- **Authentication** — JWT tokens, stored in sessionStorage/localStorage
- **Static serving** — restricted to `frontend/` only (security)
- **Uploads** — saved to `uploads/` folder (outside frontend)
- **Rate limiting** — applied to auth endpoints to prevent brute force

### Database
- **SQLite** — `users.db` in `backend/`
- **Tables** — `users`, `listings`
- **Image storage** — filename-only in DB, served via `/uploads/<filename>`

## Uploads
- User-uploaded images are saved to `uploads/` folder (project root level)
- Images are validated: max 5MB, real MIME type check, extension whitelist (jpg/jpeg/png/webp)
- API responses map DB `imagePath` to `/uploads/<filename>` URLs

## Environment Variables
- `JWT_SECRET` — secret for signing JWT (development fallback exists)
- `HOST` — host to bind (default `127.0.0.1`)
- `PORT` — port (default `4000`)
- `JSON_LIMIT` — max JSON body size (default `2mb`)
- Optional SMTP for password reset: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`

## Notes / Next steps
- Remove `imageBase64` column from DB via migration (recommended). The app no longer persists base64 in new inserts.
- Add production-grade secrets and HTTPS when deploying.
- Consider migrating DB from ad-hoc PRAGMA checks to a proper migration system.
- Implement automated email notifications for password reset flow.

