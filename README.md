# CascadeScheduler Lite

> Constraint-based employee shift scheduling as a self-hostable SaaS.

[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

![CascadeScheduler dashboard](https://github.com/user-attachments/assets/4d211b3c-a876-43b4-9f15-4b1aa270d416)
![CascadeScheduler schedule view](https://github.com/user-attachments/assets/91362609-a991-4cf6-8465-726850c19947)
![CascadeScheduler upload flow](https://github.com/user-attachments/assets/a1449bd7-96a1-4e0b-a7ca-fa682de24a8f)
![CascadeScheduler export](https://github.com/user-attachments/assets/52f48ea6-612b-498a-8a52-2e5761272b2d)

---

## Why I Built This

Small businesses — cafés, retail shops, clinics — deal with genuinely complex scheduling problems every week: matching staff availability against shift requirements, respecting minimum-hours contracts, and minimising labour costs. Enterprise workforce tools are too expensive and too complex for them. Spreadsheets don't scale.

I built CascadeScheduler Lite to solve this with a constraint solver (Timefold) behind a simple interface: staff upload an Excel file they already understand, the solver runs, and a ready-to-use schedule comes back in seconds. The core challenge was integrating a JVM-backed constraint solver with a modern async Python web stack while keeping the input flow familiar for businesses already working in Excel.

---

## Features

- Upload Excel template defining employees, availability windows, and shifts
- Constraint-based solving via [Timefold](https://timefold.ai/) (Java-backed, 30-second timeout)
- Interactive Gantt chart preview in-browser before downloading results
- Export results to a formatted multi-sheet Excel workbook
- Free and Pro plan tiers enforced via Stripe subscriptions
- JWT authentication with access and refresh tokens
- Server-rendered HTML admin panel for user management (no frontend dependency)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL 17 |
| Scheduler | Timefold Python (requires JVM) |
| Payments | Stripe |
| Auth | JWT (python-jose + bcrypt) |
| Deployment | Docker Compose + Nginx + Cloudflare |

---

## Getting Started

### Prerequisites

- Docker + Docker Compose
- Node.js 18+ (local frontend dev only)

### Local Development

```bash
# 1. Clone and configure environment
git clone https://github.com/KieFitz/eascadeskSchedulerLite.git
cd eascadeskSchedulerLite
cp .env.example .env
# Edit .env — fill in SECRET_KEY and Stripe keys (see Environment Variables below)

# 2. Start all services
docker compose up

# 3. Optional: run the frontend outside Docker with hot reload
cd frontend && npm install && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Admin Panel | http://localhost:8000/admin |

### First-time Setup

After the stack is running, create a superuser account for the admin panel:

```bash
docker compose exec backend python create_superuser.py your@email.com yourpassword
```

Then visit [http://localhost:8000/admin/login](http://localhost:8000/admin/login).

---

## Excel Template Format

Download the template from the app UI, or generate it locally:

```bash
python create_template.py
```

### Sheet: Employees

| Name | Skills | Min Hours/Week | Cost Per Hour |
|---|---|---|---|
| Alice | Barista, Cashier | 20 | 14.50 |

### Sheet: Availability

| Employee | Type | Day/Date | Start Time | End Time |
|---|---|---|---|---|
| Alice | Preferred | Monday | 09:00 | 17:00 |
| Alice | Unavailable | 2024-12-25 | | |

Availability types: `Preferred`, `Unpreferred`, `Unavailable`

### Sheet: Shifts

| Date | Start Time | End Time | Required Skills | Min Staff |
|---|---|---|---|---|
| 2024-12-01 | 09:00 | 17:00 | Barista | 2 |

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register new account |
| POST | `/api/v1/auth/login` | Login, returns JWT tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/me` | Get current user |

### Scheduler

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/upload` | Upload Excel, returns preview |
| POST | `/api/v1/solve` | Run Timefold solver |
| GET | `/api/v1/export/{run_id}` | Download result as .xlsx |
| GET | `/api/v1/schedules/` | List user's past runs |

### Payments

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/payments/checkout` | Create Stripe checkout session |
| POST | `/api/v1/payments/portal` | Open Stripe billing portal |
| POST | `/api/v1/payments/webhook` | Stripe webhook handler |

---

## Plan Tiers

| Feature | Free | Pro |
|---|---|---|
| Solves per month | 1 | Unlimited |
| Scheduling horizon | 14 days | 31 days |
| Price | €0 | Paid via Stripe |

---

## Admin Panel

Accessible at `/admin` on the backend URL. Server-rendered HTML — no frontend build required.

- List all users with plan and status
- Reset any user's password
- Toggle plan (Free ↔ Pro)
- Suspend / activate accounts
- Delete accounts

Access requires `is_superuser = true` in the database. See [First-time Setup](#first-time-setup).

---

## Deployment (AWS)

The recommended production setup serves the frontend from S3 + CloudFront and runs the backend on EC2 with Docker + Nginx.

```
Users → CloudFront → S3 (React build)
                  ↘ EC2 (Nginx → FastAPI + Timefold)
                          ↓
                       RDS PostgreSQL
```

### Frontend — S3 + CloudFront

```bash
cd frontend
cp .env.example .env.production
# Set VITE_API_URL=https://your-backend-domain.com
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
```

Configure CloudFront with your S3 bucket as origin (use Origin Access Control). Add custom error responses so React Router handles all routes:

| HTTP error code | Response page path | HTTP response code |
|---|---|---|
| 403 | `/index.html` | 200 |
| 404 | `/index.html` | 200 |

### Backend — EC2 (Amazon Linux 2023)

**Recommended instance:** `t3.medium` (2 vCPU, 4 GB RAM minimum). The Timefold solver needs at least 1 dedicated vCPU — do not run on a single-core instance.

```bash
# Install Docker
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# Log out and back in

# Fix buildx (required on Amazon Linux 2023)
mkdir -p ~/.docker/cli-plugins
sudo curl -SL "https://github.com/docker/buildx/releases/download/v0.21.0/buildx-v0.21.0.linux-amd64" \
  -o ~/.docker/cli-plugins/docker-buildx
chmod +x ~/.docker/cli-plugins/docker-buildx

# Install Compose plugin
sudo dnf install -y docker-compose-plugin

# Deploy
git clone https://github.com/KieFitz/eascadeskSchedulerLite.git
cd eascadeskSchedulerLite
cp .env.example .env
nano .env

docker compose -f docker-compose.prod.yml up -d --build
docker compose exec backend python create_superuser.py your@email.com yourpassword
```

### Stripe Setup

1. Create a **Product** in the Stripe dashboard for your Pro plan
2. Create a recurring monthly **Price** and copy the Price ID
3. Add a webhook endpoint at `https://your-backend-domain.com/api/v1/payments/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the signing secret into your `.env`

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=https://your-frontend-domain.com/?payment=success
STRIPE_CANCEL_URL=https://your-frontend-domain.com/pricing?payment=cancelled
```

```bash
docker compose -f docker-compose.prod.yml restart backend
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async connection string |
| `SECRET_KEY` | JWT signing key — keep this secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime (default: 60) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime (default: 7) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Stripe price ID for the Pro plan |
| `STRIPE_SUCCESS_URL` | Redirect URL after successful checkout |
| `STRIPE_CANCEL_URL` | Redirect URL after cancelled checkout |
| `SOLVER_TIMEOUT_SECONDS` | Max Timefold solve time (default: 30) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `ADMIN_EMAIL` | Admin email (informational — auth is DB-based) |

---

## Known Limitations

- Timefold requires a JVM at runtime — minimum 4 GB RAM is strongly recommended
- The solver runs single-threaded per solve request; concurrent solves will compete for CPU
- No multi-tenant solver isolation yet — all users share one solver instance
- The scheduling horizon is capped at 31 days (Pro) to keep solve times reasonable

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Route handlers
│   │   ├── core/            # Config, DB, security, dependencies
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic (solver, exporter, etc.)
│   │   └── templates/admin/ # Admin panel HTML templates
│   ├── alembic/             # Database migrations
│   ├── timefold_model/      # Domain model and constraints
│   └── create_superuser.py
├── frontend/
│   └── src/
│       ├── api/             # Axios API clients
│       ├── components/      # Reusable UI components
│       ├── context/         # Auth context
│       └── pages/           # Route pages
├── deploy/
│   └── nginx/               # Nginx configuration
├── docker-compose.yml
├── docker-compose.prod.yml
└── create_template.py
```

---

## Roadmap

- [ ] **Industry-specific templates** — Pre-built Excel templates for hospitality, retail, healthcare, and logistics
- [ ] **Schedule comparison** — Diff two solve runs to highlight what changed
- [ ] **Availability self-service** — Employee portal for submitting availability directly
- [ ] **Calendar integrations** — Export to Google Calendar and Outlook
- [ ] **Mobile-friendly UI** — Responsive design improvements for tablet and phone
- [ ] **Advanced reporting** — Cost breakdowns, overtime alerts, coverage heatmaps

---

*Source available for review. All rights reserved.*
