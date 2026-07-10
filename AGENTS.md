# Creativals OS — Project Rules

Laravel 13 API (`backend/`, Sanctum bearer tokens, SQLite locally) + Next.js frontend (`frontend/`).

## Database: NEVER wipe it when applying code changes

Login tokens live in the `personal_access_tokens` table. Dropping or rebuilding
the database logs every user out and destroys their data.

- To apply new migrations, run **only**: `php artisan migrate` (additive, safe).
- **NEVER** run `migrate:fresh`, `migrate:refresh`, `migrate:reset`, `db:wipe`,
  or delete `backend/database/database.sqlite` as part of building, fixing, or
  deploying code changes. These are blocked by default (see
  `AppServiceProvider::boot()`); do not bypass the block by setting
  `ALLOW_DESTRUCTIVE_DB_COMMANDS` unless the user explicitly asks for a
  database reset.
- If a migration fails, fix the migration (or write a new corrective one) —
  do not rebuild the database to get past the error.
- Seeders that delete rows (e.g. `ProductionDemoSeeder`) run only on explicit
  user request.

## Applying changes locally

- `start-local.bat` starts backend (`:8000`) and frontend (`:3000`) and runs
  the safe `php artisan migrate`.
- Backend PHP changes are picked up by `php artisan serve` without a restart;
  frontend changes hot-reload under `next dev`. Neither requires touching the
  database.
