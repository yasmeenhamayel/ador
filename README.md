# 🌸 AODORA Perfume Store — Full-Stack Project

A luxury Arabic perfume e-commerce store with:
- Real JWT authentication (register / login / profile)
- SQLite database via `better-sqlite3`
- **Gemini Vision AI** — upload an outfit photo → get perfume recommendations
- Full admin panel, user dashboard, product catalog

---

## 📁 Project Structure

```
aodora-final/
├── backend/
│   ├── server.js          ← Express API server
│   ├── package.json
│   ├── .env               ← Your secrets (never commit!)
│   └── .gitignore
└── frontend/
    ├── index.html         ← Home page
    ├── login.html         ← Login / Register (real API)
    ├── dashboard.html     ← User dashboard + AI outfit recommender
    ├── admin.html         ← Admin panel
    ├── product.html       ← Product detail page
    ├── chatbot.html       ← Chatbot
    ├── css/style.css
    ├── js/
    │   ├── app.js         ← API helpers, Store, Auth
    │   └── home.js        ← Home page logic
    └── images/            ← Perfume images
```

---

## ⚡ Quick Start

### 1 — Prerequisites

| Tool | Min Version | Install |
|------|------------|---------|
| Node.js | 18+ | https://nodejs.org |
| npm | 9+ | comes with Node |

> **WSL users:** run all commands inside your WSL terminal (Ubuntu/Debian).

---

### 2 — Install dependencies

```bash
cd aodora-final/backend
npm install
```

---

### 3 — Configure environment

```bash
# Copy the template
cp .env.example .env   # or just edit .env directly
```

Edit `.env`:

```env
PORT=3000

# Generate a real secret:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=paste_your_generated_secret_here

# Get a FREE key at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=paste_your_gemini_key_here

DB_PATH=./aodora.db
```

---

### 4 — Run the server

```bash
# Production
npm start

# Development (auto-restart on file changes, Node 18+)
npm run dev
```

You will see:

```
🌸  AODORA server running → http://localhost:3000
📁  Serving frontend from: /path/to/frontend
🗄️   Database: /path/to/aodora.db
🤖  Gemini AI: ✅  connected
```

Open **http://localhost:3000** in your browser.

---

## 🔐 Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@perfume.com | admin123 |
| User | user@perfume.com | user123 |

---

## 🤖 AI Outfit Recommendation

1. Log in as any user
2. Go to **Dashboard → توصية الذكاء الاصطناعي**
3. Upload a photo of an outfit (JPG/PNG/WEBP ≤ 10 MB)
4. Click **تحليل الزي واقتراح العطر ✨**
5. Gemini Vision analyzes the outfit and recommends 3 perfumes with explanations

> Requires a valid `GEMINI_API_KEY` in `.env`

---

## 📡 API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | Login, get JWT |
| GET | `/api/auth/me` | ✅ | Get own profile |
| PUT | `/api/auth/me` | ✅ | Update profile / password |

### Perfumes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/perfumes` | — | List all (filter: `?category=رجالي&q=عود`) |
| GET | `/api/perfumes/:id` | — | Single perfume |
| POST | `/api/perfumes` | Admin | Add perfume |
| PUT | `/api/perfumes/:id` | Admin | Update perfume |
| DELETE | `/api/perfumes/:id` | Admin | Delete perfume |

### AI
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/recommend` | ✅ | Upload outfit image → get recommendations |

### Orders
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/orders` | ✅ | My orders |
| POST | `/api/orders` | ✅ | Create order |
| GET | `/api/admin/orders` | Admin | All orders |
| PUT | `/api/admin/orders/:id` | Admin | Update order status |

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/users` | Admin | All users |
| GET | `/api/admin/stats` | Admin | Dashboard stats |

---

## 🪟 WSL-Specific Tips

```bash
# If Node is not found in WSL, install via nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# If better-sqlite3 fails to build:
sudo apt-get install -y build-essential python3

# View your app from Windows browser:
# WSL IP: run `hostname -I` → use that IP instead of localhost
```

---

## 🔧 Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find module 'better-sqlite3'` | Run `npm install` inside `backend/` |
| `SQLITE_CANTOPEN` | Check `DB_PATH` in `.env`; ensure folder is writable |
| AI returns error | Check `GEMINI_API_KEY` is set correctly in `.env` |
| Port in use | Change `PORT=3001` in `.env` |
| `EADDRINUSE` | `kill -9 $(lsof -ti:3000)` then restart |
| Login fails | Server must be running; check browser console for CORS/network errors |
