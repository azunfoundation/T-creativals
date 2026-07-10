.PHONY: up down build migrate seed test fresh logs shell

# ─── Stack Management ─────────────────────────────────────────
up:
	cd docker && docker compose up -d
	@echo "✅ Creativals OS is running at http://localhost"

down:
	cd docker && docker compose down

build:
	cd docker && docker compose build --no-cache

restart:
	cd docker && docker compose restart

logs:
	cd docker && docker compose logs -f

# ─── Backend ──────────────────────────────────────────────────
migrate:
	cd backend && php artisan migrate

# DANGER: migrate:fresh wipes the entire database (all data + every user's
# login token). Requires CONFIRM=WIPE, e.g. `make fresh CONFIRM=WIPE`.
migrate-fresh:
ifneq ($(CONFIRM),WIPE)
	@echo "⛔ BLOCKED: migrate:fresh drops ALL tables and logs out every user."
	@echo "   To apply new migrations without losing data, run: make migrate"
	@echo "   If you really intend to wipe the database: make migrate-fresh CONFIRM=WIPE"
	@exit 1
else
	cd backend && ALLOW_DESTRUCTIVE_DB_COMMANDS=true php artisan migrate:fresh
endif

seed:
	cd backend && php artisan db:seed

fresh:
ifneq ($(CONFIRM),WIPE)
	@echo "⛔ BLOCKED: migrate:fresh drops ALL tables and logs out every user."
	@echo "   To apply new migrations without losing data, run: make migrate"
	@echo "   If you really intend to wipe and reseed the database: make fresh CONFIRM=WIPE"
	@exit 1
else
	cd backend && ALLOW_DESTRUCTIVE_DB_COMMANDS=true php artisan migrate:fresh --seed
	@echo "✅ Database reset and seeded"
endif

test:
	cd backend && php artisan test

test-coverage:
	cd backend && php artisan test --coverage

shell-backend:
	cd docker && docker compose exec backend sh

tinker:
	cd backend && php artisan tinker

# ─── Frontend ─────────────────────────────────────────────────
dev-frontend:
	cd frontend && npm run dev

install-frontend:
	cd frontend && npm install

build-frontend:
	cd frontend && npm run build

# ─── Development (local without Docker) ──────────────────────
dev:
	@echo "Starting backend on :8000 and frontend on :3000..."
	@Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; php artisan serve"
	@Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

# ─── Utilities ───────────────────────────────────────────────
clear-cache:
	cd backend && php artisan cache:clear && php artisan config:clear && php artisan route:clear

queue-work:
	cd backend && php artisan queue:work redis --queue=default,notifications,recurring,profitability,exports

schedule:
	cd backend && php artisan schedule:work
