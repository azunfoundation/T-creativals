# Creativals OS

The Agency Operating System for Creativals Digital Marketing Agency — CRM,
quotes, invoicing, clients, projects & tasks, timesheets, attendance, payroll,
profitability, reporting, and a client portal, built around the agency
lifecycle: **Lead → Quote → Approval → Invoice → Client → Project → Tasks →
Time Tracking → Cost Allocation → Profitability → Reporting**.

- **Backend:** Laravel API (`backend/`), Sanctum bearer tokens
- **Frontend:** Next.js (`frontend/`)
- **Database:** SQLite locally; MySQL/PostgreSQL in production (the reporting
  SQL is driver-aware)
- **Continuity record:** [PROJECT_AUDIT.md](PROJECT_AUDIT.md) documents every
  module's audit, fixes, and known limitations — read it before changing
  anything.

---

## Local development

```bat
start-local.bat
```

starts the backend on `:8000`, the frontend on `:3000`, and runs the safe
`php artisan migrate`. Backend PHP changes are picked up without a restart;
the frontend hot-reloads.

**Database safety (non-negotiable):** never run `migrate:fresh`,
`migrate:refresh`, `migrate:reset`, or `db:wipe`, and never delete
`backend/database/database.sqlite` — login tokens and real data live there.
Destructive commands are blocked in `AppServiceProvider::boot()`. To apply
schema changes run only `php artisan migrate` (additive).

Verification gate used throughout the audits:

```bash
cd backend  && php artisan test          # full suite must be green
cd frontend && npx tsc --noEmit          # must be clean
cd frontend && npx next build            # must succeed
```

---

## Production deployment (VPS — Hetzner / Contabo per the PRD)

A 2-vCPU / 4 GB VPS comfortably runs both apps. Outline for Ubuntu 22.04+:

### 1. System

```bash
apt update && apt install -y nginx mysql-server php8.3-fpm php8.3-{cli,mbstring,xml,curl,zip,mysql,sqlite3,gd} composer nodejs npm supervisor certbot python3-certbot-nginx
```

### 2. Backend (Laravel API)

```bash
cd /var/www/creativals/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env && php artisan key:generate
# Edit .env — REQUIRED changes:
#   APP_ENV=production, APP_DEBUG=false, APP_URL=https://api.yourdomain.com
#   FRONTEND_URL=https://app.yourdomain.com   (used in email links)
#   DB_* → your MySQL/Postgres credentials
#   MAIL_* → real SMTP (test it later from Settings → Mail/SMTP → Send Test)
#   GEMINI_API_KEY → optional; without it the AI assistant runs in an
#     honest "Simulation mode" and the dashboard briefing is template-based
#   REVERB_* → only needed when the Phase-Next realtime features ship
php artisan migrate --force
php artisan db:seed --class=RolesPermissionsSeeder --force   # roles/permissions (additive)
php artisan config:cache && php artisan route:cache
```

### 3. Queue worker + scheduler (REQUIRED)

Emails are queued and several business rules run on the scheduler — without
these two, welcome/notification emails never send and invoices never flip to
overdue.

Supervisor program for the queue:

```ini
[program:creativals-queue]
command=php /var/www/creativals/backend/artisan queue:work --tries=3
autostart=true
autorestart=true
user=www-data
```

Cron entry for the scheduler (runs: overdue-invoice sweep 06:00, recurring
invoices 06:10, payment reminders 06:20, monthly recurring-project tasks on
the 1st):

```cron
* * * * * cd /var/www/creativals/backend && php artisan schedule:run >> /dev/null 2>&1
```

### 4. Frontend (Next.js)

```bash
cd /var/www/creativals/frontend
cp .env.example .env.production
# Set NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1 BEFORE building —
# NEXT_PUBLIC_* vars are inlined at build time.
npm ci && npx next build
```

Run with a process manager (`pm2 start "npx next start -p 3000" --name creativals-web`
or a supervisor program), behind nginx.

### 5. nginx + TLS

Two server blocks — `api.yourdomain.com` → php-fpm (Laravel `public/`), and
`app.yourdomain.com` → `proxy_pass http://127.0.0.1:3000`. Then:

```bash
certbot --nginx -d api.yourdomain.com -d app.yourdomain.com
```

### 6. Server hardening

- **Firewall / Oracle Cloud security list:** expose only ports 80 and 443 to
  the internet. Everything else (php-fpm, the Next.js port 3000, database,
  Reverb 8080) must be reachable only from localhost or the VCN.
- **SSH:** key-only authentication — set `PasswordAuthentication no` and
  `PermitRootLogin prohibit-password` in `sshd_config`. If your team has
  stable egress IPs, restrict port 22 to those IPs in the security list.
- **Known-public IP:** the original server IP (`140.245.231.188`) appears in
  this repository's git history and must be treated as public. Assume it is
  being scanned: keep the firewall rules above in place, or move the
  deployment to a fresh reserved public IP.

### 7. Backups

- Nightly database dump (`mysqldump` or a copy of the SQLite file) retained
  off-server.
- `storage/app/public` (uploads/attachments) in the same backup set.
- In-app: Settings → Backups & Recovery can create/restore database backups,
  and soft-deleted records are founder-restorable from the Recovery Bin.

### 8. First login

Seeded founder account (change the password immediately):
`founder@creativals.com`. Manage team accounts under Users, client accounts
under Clients.

---

## Operations quick reference

| Concern | Where |
|---|---|
| Roles & permissions | Settings-independent — `RolesPermissionsSeeder` is the source of truth; UI at `/roles` |
| SMTP / email | Settings → Mail/SMTP (with send-test) |
| Notification opt-ins | Settings → Notifications (per user) |
| Invoice numbering etc. | Settings → Number Sequences |
| Audit trail | Settings → Audit Logs |
| Backups / restore / recovery bin | Settings → Backups & Recovery (founder-gated restores) |
| AI assistant | `GEMINI_API_KEY` env var; honest simulation banner without it |
| Scheduled jobs | `routes/console.php`; require the cron above |

Known limitations and Phase-Next items (chat via Reverb, push notifications,
department profitability, packages-in-quotes) are listed honestly at the end
of [PROJECT_AUDIT.md](PROJECT_AUDIT.md) under "Release Candidate 1".
