# eascadeskScheduler Lite

A SaaS employee shift scheduler powered by [Timefold](https://timefold.ai/) constraint solving. Users upload an Excel template defining employees, availability, and shifts — the solver assigns staff optimally within seconds. Results are downloadable as a formatted Excel workbook.

---

## Features

- Upload Excel template (employees, availability, shifts)
- Constraint-based solving via Timefold (Java-backed, 30s timeout)
- Interactive Gantt chart preview in-browser
- Export results to multi-sheet Excel workbook
- Free and Pro plan tiers enforced via Stripe subscriptions
- JWT authentication (access + refresh tokens)
- Backend HTML admin panel for user management

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
cp .env.example .env
# Edit .env — fill in SECRET_KEY and Stripe keys

# 2. Start all services
docker compose up

# 3. Frontend (Vite dev server with hot reload)
# Included in docker-compose or run locally:
cd frontend && npm install && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Admin Panel | http://localhost:8000/admin |

### First-time Setup

After the stack is running, create a superuser for the admin panel:

```bash
docker compose exec backend python create_superuser.py your@email.com yourpassword
```

Then visit [http://localhost:8000/admin/login](http://localhost:8000/admin/login).

---

## Excel Template Format

Download the template from the app or generate it locally:

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

## API Endpoints

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
| Shifts scheduling horizon | 14 days | 31 days |
| Price | €0 | Paid via Stripe |

---

## Admin Panel

Accessible at `/admin` on the backend URL. Server-rendered HTML (no frontend dependency).

- List all users with plan and status
- Reset any user's password
- Toggle plan (Free ↔ Pro)
- Suspend / activate accounts
- Delete accounts

Access requires `is_superuser = true` in the database. See [First-time Setup](#first-time-setup).

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async connection string |
| `SECRET_KEY` | JWT signing key (keep secret) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime (default: 60) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime (default: 7) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Stripe price ID for Pro plan |
| `STRIPE_SUCCESS_URL` | Redirect after successful checkout |
| `STRIPE_CANCEL_URL` | Redirect after cancelled checkout |
| `SOLVER_TIMEOUT_SECONDS` | Max Timefold solve time (default: 30) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `ADMIN_EMAIL` | Admin email (informational, auth is DB-based) |

---

## Recommended Deployment (AWS)

The recommended production architecture serves the frontend from AWS S3 + CloudFront and runs the backend on an EC2 instance with Docker + Nginx.

```
Users → CloudFront → S3 (React build)
                  ↘ EC2 (Nginx → FastAPI backend)
                         ↓
                       RDS PostgreSQL
```

---

### Frontend — S3 + CloudFront

**1. Build the frontend**

```bash
cd frontend
cp .env.example .env.production
# Set VITE_API_URL=https://your-backend-domain.com
npm run build
```

**2. Upload to S3**

```bash
aws s3 sync dist/ s3://your-bucket-name --delete
```

**3. CloudFront distribution**

- Origin: your S3 bucket (use Origin Access Control, not public bucket)
- Default root object: `index.html`

**4. Fix SPA routing — error pages**

Since React Router handles routing client-side, any direct URL or page refresh (e.g. `/pricing`) will return a 403/404 from S3. Fix this in CloudFront:

- CloudFront → your distribution → **Error pages** → **Create custom error response**
- Add two rules:

| HTTP error code | Response page path | HTTP response code |
|---|---|---|
| 403 | `/index.html` | 200 |
| 404 | `/index.html` | 200 |

This ensures all routes are handled by React Router rather than returning an error.

---

### Backend — EC2 (Amazon Linux 2023)

#### Recommended Instance

- **Minimum:** 2 vCPU, 4 GB RAM (e.g. `t3.medium`)
- **CPU allocation:** 1 vCPU minimum reserved for the Timefold solver — burst CPU instances (`t3`) work well for the solver's short intensive bursts
- Do not run on a single-core instance — the solver will starve the API

#### Docker Setup on Amazon Linux 2023

Amazon Linux 2023 ships with an older version of Docker buildx that may cause build failures. Fix it before building the project:

```bash
# Install Docker
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# Log out and back in for group change to take effect

# Fix buildx (manual update required on Amazon Linux 2023)
mkdir -p ~/.docker/cli-plugins
sudo curl -SL "https://github.com/docker/buildx/releases/download/v0.21.0/buildx-v0.21.0.linux-${ARCH}"   -o /usr/local/lib/docker/cli-plugins/docker-buildx
-o ~/.docker/cli-plugins/docker-buildx
chmod +x ~/.docker/cli-plugins/docker-buildx
docker buildx version

# Install Docker Compose plugin
sudo dnf install -y docker-compose-plugin
```

#### Deploy the backend

```bash
# Clone repo
git clone <the repo>
cd eascadeskSchedulerLite

# Create .env from example
cp .env.example .env
nano .env  # Fill in all values — see Environment Variables section

# Build and start
docker compose -f docker-compose.prod.yml up -d --build

# Migrations run automatically on container start
# Create superuser
docker compose exec backend python create_superuser.py your@email.com yourpassword
```

Nginx is included in the Docker stack and serves as the reverse proxy for the backend API — no separate Nginx install needed on the host.

---

### Stripe Setup

Follow the [Stripe subscriptions guide](https://stripe.com/docs/billing/subscriptions/overview) to create your product and pricing, then:

1. Create a **Product** in the Stripe dashboard for your Pro plan
2. Create a **Price** (recurring monthly) and copy the Price ID
3. Go to **Developers → Webhooks → Add endpoint**
   - URL: `https://your-backend-domain.com/api/v1/payments/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Signing secret** from the webhook page

Add all keys to your `.env` on the EC2 instance:

```bash
nano /path/to/eascadeskSchedulerLite/.env
```

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=https://your-frontend-domain.com/?payment=success
STRIPE_CANCEL_URL=https://your-frontend-domain.com/pricing?payment=cancelled
```

Then restart the backend to pick up the new keys:

```bash
docker compose -f docker-compose.prod.yml restart backend
```

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Route handlers
│   │   ├── core/            # Config, DB, security, deps
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic (solver, exporter, etc.)
│   │   └── templates/admin/ # Admin panel HTML templates
│   ├── alembic/             # Database migrations
│   ├── timefold_model/      # Domain model and constraints
│   └── create_superuser.py  # Superuser creation script
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
└── create_template.py       # Sample Excel template generator
```

---

## Roadmap

- [ ] **Open Source** — Open source to allow others to use project for their own scheduling services/applications as I no longer have the resources to market this product.

---------------------------------------------------

- [ ] **Industry-specific templates** — Pre-built Excel templates for common industries (hospitality, retail, healthcare, logistics) with realistic shift patterns, skill sets, and availability structures
- [ ] **Schedule comparison** — Diff two solve runs to highlight what changed
- [ ] **Availability self-service** — Employee portal to submit their own availability
- [ ] **Calendar integrations** — Export to Google Calendar / Outlook
- [ ] **Mobile-friendly UI** — Responsive design improvements for tablet/phone access
- [ ] **Advanced reporting** — Cost breakdowns, overtime alerts, coverage heatmaps
