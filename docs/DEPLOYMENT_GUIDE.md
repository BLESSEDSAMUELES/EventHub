# Production Deployment Guide • EventForge / EventHub

This guide provides end-to-end instructions for deploying the **EventForge Multi-Tenant Event & Ticket Reservation Platform** to production across leading cloud providers and self-hosted environments.

---

## 🏗️ Architecture Overview

The platform consists of two decoupled, high-performance tiers:
1. **Frontend**: React 18 + TypeScript + Vite, compiled into optimized static assets served via Vercel, Netlify, or Nginx.
2. **Backend**: Node.js + Express + TypeScript, running in Docker or Node runtime, communicating with PostgreSQL via connection pooling and Redis for workers/caching.
3. **Database**: PostgreSQL (Supabase, Neon, AWS RDS, or Render Managed PostgreSQL) with 9 relational tables and UUID keys.

```
                    ┌────────────────────────┐
                    │     Client Browser     │
                    └───────────┬────────────┘
                                │ HTTPS
            ┌───────────────────┴───────────────────┐
            │                                       │
            ▼                                       ▼
 ┌─────────────────────┐                 ┌─────────────────────┐
 │   Vercel / Nginx    │                 │  Render / Railway   │
 │   (Frontend SPA)    │                 │   (Node.js API)     │
 └─────────────────────┘                 └──────────┬──────────┘
                                                    │
                                  ┌─────────────────┴─────────────────┐
                                  ▼                                   ▼
                       ┌─────────────────────┐             ┌─────────────────────┐
                       │ Supabase PostgreSQL │             │     Redis Cache     │
                       │ (Transaction Pooler)│             │ (Locks & Expiry)    │
                       └─────────────────────┘             └─────────────────────┘
```

---

## 🚀 Option 1: Recommended Cloud Stack (Vercel + Render + Supabase)

This setup is **100% free-tier compatible**, highly scalable, and requires zero server maintenance.

### Step 1: Database Setup (Supabase)

1. Sign up or log into [supabase.com](https://supabase.com).
2. Create a new project (e.g., `eventforge-prod`). Choose your preferred region.
3. Open **SQL Editor** in Supabase and paste the contents of `backend/supabase/migrations/001_initial.sql`. Click **Run** to generate all 9 tables, indexes, and constraints.
4. Go to **Project Settings** → **Database**:
   - Scroll down to **Connection string** → Select **Transaction Pooler** (Port 5432 or 6543, IPv4 compatible).
   - Copy the URI:
     ```
     postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
     ```
   - > [!IMPORTANT]
     > If your database password contains special characters (like `@`, `#`, `$`), URL-encode them (e.g. `@` becomes `%40`).

---

### Step 2: Backend Deployment (Render)

1. Sign up or log into [render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository containing EventForge.
4. Configure the service:
   - **Name**: `eventforge-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`
5. In **Advanced** → **Environment Variables**, add:
   | Key | Value | Description |
   |-----|-------|-------------|
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `10000` | Port provided by Render (or 4000) |
   | `DATABASE_URL` | `postgresql://postgres...` | Your Supabase connection string |
   | `DATABASE_SSL` | `true` | Required for Supabase |
   | `JWT_SECRET` | `[GENERATE_A_64_CHAR_RANDOM_STRING]` | Auth token signing |
   | `MOCK_PAYMENT_WEBHOOK_SECRET` | `[RANDOM_SECRET]` | Payment webhook verification |
   | `FRONTEND_ORIGIN` | `https://your-frontend.vercel.app` | Vercel domain (or `*` temporarily) |
   | `HOLD_MINUTES` | `10` | Ticket hold duration before release |
   | `AUTO_SEED` | `false` | Safeguard against auto-truncating customer data |
6. Click **Create Web Service**.
7. Once deployed, verify your backend health check by visiting:
   `https://eventforge-backend.onrender.com/health`
   Should return: `{"status":"ok","service":"EventForge Ticketing API"}`.

---

### Step 3: Frontend Deployment (Vercel)

1. Sign up or log into [vercel.com](https://vercel.com).
2. Click **Add New...** → **Project** and select your repository.
3. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In **Environment Variables**, add:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://eventforge-backend.onrender.com` |
   *(Do NOT include a trailing slash)*
5. Click **Deploy**.
6. Vercel automatically applies `frontend/vercel.json` for SPA client-side routing.
7. Update `FRONTEND_ORIGIN` on your Render backend with your newly assigned Vercel URL (e.g., `https://eventforge-frontend.vercel.app`).

---

## ⚡ Option 2: Infrastructure as Code (Render Blueprint)

If you prefer deploying both frontend and backend with a single click using Render's blueprint:

1. Push this repository to GitHub with the included `render.yaml` at the root.
2. In Render, go to **Blueprints** → **New Blueprint Instance**.
3. Select your repository. Render will automatically parse `render.yaml` and configure:
   - `eventforge-backend` (Node Web Service)
   - `eventforge-frontend` (Static Web Service with SPA rewrites)
4. Provide the `DATABASE_URL` prompt for Supabase.
5. Click **Apply**.

---

## 🐳 Option 3: Self-Hosted Docker Compose (VPS / AWS EC2 / DigitalOcean)

Deploy the entire stack with self-contained PostgreSQL, Redis, Node API, and Nginx on any Linux VPS with Docker and Docker Compose installed.

### Step 1: Clone and Configure

```bash
git clone https://github.com/your-username/eventforge.git
cd eventforge
```

### Step 2: Launch All Services

```bash
docker compose up -d --build
```

Docker Compose will:
1. Boot PostgreSQL 15 and automatically execute `001_initial.sql`.
2. Boot Redis 7.
3. Build the backend image and wait for healthy DB & Redis connections.
4. Build the frontend image and serve via Nginx on ports `80` and `5173`.

### Step 3: Verify Running Services

```bash
docker compose ps
```

Access:
- Web App: `http://YOUR_SERVER_IP`
- Backend API Health: `http://YOUR_SERVER_IP:4000/health`

### Step 4: Stop or Restart

```bash
docker compose down          # Stop containers (preserves database volume)
docker compose logs -f backend # View live backend logs
```

---

## 📋 Production Environment Variables Reference

### Backend (`backend/.env`)

```ini
PORT=4000
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/dbname
DATABASE_SSL=true
JWT_SECRET=production_super_secret_jwt_key_at_least_32_characters
MOCK_PAYMENT_WEBHOOK_SECRET=production_mock_webhook_secret_key
FRONTEND_ORIGIN=https://eventhub.example.com
HOLD_MINUTES=10
AUTO_SEED=false
```

### Frontend (`frontend/.env`)

```ini
VITE_API_URL=https://api.eventhub.example.com
```

---

## 🔒 Security & Performance Checklist

- [x] **Safe Seeding**: `backend/src/server.ts` checks if tenants exist before seeding. In production with `AUTO_SEED=false`, dyno restarts will **never** truncate customer orders or live reservations.
- [x] **CORS Configuration**: Dynamic whitelist allowing configured `FRONTEND_ORIGIN` and local hosts.
- [x] **Password Encryption**: All user passwords hashed using bcrypt (10 rounds).
- [x] **JWT Authentication**: 24-hour expiration token with role claims (`admin`, `organizer`, `attendee`).
- [x] **Concurrency Safeguards**: Database-level locks and transactional checks preventing ticket overselling under heavy concurrency.
- [x] **SPA Routing**: `frontend/vercel.json`, `frontend/netlify.toml`, and `frontend/nginx.conf` all implement fallback rewrites so deep links and page refreshes work seamlessly.
- [x] **Static Asset Caching**: 1-year immutable caching on CSS/JS bundles with content hashing.

---

## 🛠️ Post-Deployment Verification Commands

Run these quick checks after deployment to verify your live cluster:

```bash
# 1. Verify API Health
curl -s https://your-backend.onrender.com/health
# Expected: {"status":"ok","service":"EventForge Ticketing API",...}

# 2. Verify Events Endpoint
curl -s https://your-backend.onrender.com/api/events
# Expected: JSON array of published events

# 3. Verify User Registration
curl -X POST https://your-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test_attendee@example.com","password":"password123","full_name":"Test User","role":"attendee"}'
# Expected: 201 Created with JWT token and user profile
```
