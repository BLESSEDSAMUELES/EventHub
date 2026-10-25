# EventForge • Multi-Tenant Event & Ticket Reservation System

EventForge is an enterprise-grade full-stack event discovery and concurrency-safe ticket reservation platform. Built according to the specification in the Software Project Report, it handles high-volume ticket sales with zero overselling, 10-minute temporary holds, automated background expiration, mock payment gateways, and comprehensive role-based dashboards.

---

## 🚀 Key Highlights & Architectural Features

- **Zero-Oversell Concurrency Engine**: Employs transactional row-locking (`SELECT ... FOR UPDATE` semantics) and atomic updates to guarantee inventory integrity under extreme simultaneous booking spikes.
- **10-Minute Temporary Reservation Holds**: Tickets are temporarily reserved with real-time countdown timers. If an attendee leaves checkout or fails to pay, a background worker releases inventory idempotently.
- **Multi-Tenant Isolation**: Supports independent organizers with isolated event inventories, ticket tiers, orders, and financial analytics.
- **Simulated Payment Gateways**: Supports Credit/Debit Cards, Simulated UPI (GPay/PhonePe), and Digital Wallets with interactive multi-step verification animations and webhook callbacks.
- **18 Complete Screens**: Every screen defined in the project wireframe is fully realized, functional, and deeply interconnected.
- **Role Switcher**: Includes an instant role-switching toolbar allowing reviewers to test as **Attendee** (Blessed Samuel), **Organizer** (Priya Sharma - SaiRam Tech Club), or **Platform Admin**.

---

## 📂 Repository Structure

```
Event ticket/
├── backend/
│   ├── src/
│   │   ├── app.ts                 # Express setup, middleware, error handlers
│   │   ├── server.ts              # API server entrypoint (port 4000)
│   │   ├── routes.ts              # REST API route handlers
│   │   ├── config.ts              # Environment configuration
│   │   ├── db/
│   │   │   ├── index.ts           # Transactional ACID database engine with row locks
│   │   │   └── seed.ts            # Default data seed (tenants, events, bookings)
│   │   ├── middleware/
│   │   │   └── auth.ts            # JWT authentication & tenant RBAC
│   │   ├── lib/
│   │   │   ├── cache.ts           # Redis & in-memory cache layer (FR-13)
│   │   │   └── logger.ts          # Structured audit logger (Screen 18)
│   │   ├── services/
│   │   │   ├── reservationService.ts # Concurrency-safe hold engine
│   │   │   ├── orderService.ts       # Idempotent order snapshot engine
│   │   │   ├── paymentService.ts     # Mock payment processing & webhooks
│   │   │   └── analyticsService.ts   # Metrics and revenue trends
│   │   ├── worker.ts              # Background expiration worker
│   │   └── test/
│   │       └── concurrencyTest.ts # Automated concurrency & acceptance suite
│   ├── supabase/
│   │   └── migrations/
│   │       └── 001_initial.sql    # Supabase PostgreSQL schema migration
│   ├── postman/
│   │   └── eventforge.postman_collection.json # Exported API test collection
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── api.ts                 # Typed API client with auto-JWT & role switcher
│   │   ├── components/            # Reusable UI components & modals
│   │   ├── App.tsx                # Main application covering all 18 screens
│   │   ├── styles.css             # Vanilla CSS design system (glassmorphism, vibrant colors)
│   │   └── main.tsx
│   ├── public/images/             # Generated high-resolution event banners
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── ER_DIAGRAM.md              # Entity relationship diagram & data dictionary
│   └── TEST_PLAN.md               # Acceptance test matrix & concurrency criteria
├── docker-compose.yml             # Local PostgreSQL and Redis compose setup
└── README.md
```

---

## ⚡ Quick Start (Local Setup)

### Prerequisites
- Node.js 20 or later & npm

### 1. Install & Run Backend
```bash
cd backend
npm install
npm run dev
```
The API server starts on **http://localhost:4000** and health check on **http://localhost:4000/health**.

### 2. Run Background Expiration Worker (Optional standalone)
```bash
cd backend
npm run worker
```
*(Note: In development, the worker also runs automatically inside the dev server for convenience!)*

### 3. Run Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## 🧪 Automated Concurrency & Acceptance Tests

To verify that race conditions cannot oversell inventory:

```bash
cd backend
npm run test:concurrency
```

This executes the 6 critical test cases from the report:
- **TC-01**: Reserve single ticket when available = 1
- **TC-02**: 10 simultaneous requests competing for 1 ticket -> exactly 1 succeeds, 9 receive `SOLD_OUT`, available quantity stays 0.
- **TC-03**: Quantity bounds check (exceeding total available)
- **TC-05**: Order idempotency retries
- **TC-08**: Mock payment rejection restores inventory exactly once
- **TC-07**: Mock payment approval confirms booking and preserves sold stock
- **TC-06**: Worker idempotency on confirmed bookings

---

## 👥 Demo Credentials & Seed Accounts

| Role | Email | Password | Tenant / Organization |
|---|---|---|---|
| **Attendee** | `blessed@example.com` | `password123` | SaiRam Tech Club |
| **Organizer** | `priya@example.com` | `password123` | SaiRam Tech Club |
| **Organizer** | `arun@example.com` | `password123` | Chennai Events |
| **Admin** | `admin@example.com` | `admin123` | Platform Global |

*(You can also use the 1-click **Quick Role Switcher** in the top navigation bar to switch personas instantly).*

---

## 🌐 Production Deployment

The project is fully pre-configured for production deployment:
- **Cloud Architecture**: Vercel (Frontend SPA) + Render/Railway (Node.js API) + Supabase (PostgreSQL).
- **Infrastructure as Code**: `render.yaml` for 1-click Render Blueprint deployment.
- **Containerization**: Multi-stage `Dockerfile` and `docker-compose.yml` for self-hosted VPS / Docker deployments.
- **Routing Rewrites**: `frontend/vercel.json` and `frontend/netlify.toml` configured with SPA routing fallbacks.

👉 **Read the complete step-by-step instructions in the [Production Deployment Guide](file:///d:/College/Projects/Event%20ticket/docs/DEPLOYMENT_GUIDE.md).**

