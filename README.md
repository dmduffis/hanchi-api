# Hanchi API

Standalone Node.js + TypeScript backend for **Hanchi** — a cultural-discovery app for exploring ethnic enclaves, earning passport stamps, and journaling finds.

## Stack

- **Express** — HTTP API
- **PostgreSQL + PostGIS** — geospatial communities / POIs
- **Prisma 7** — ORM + migrations (`prisma.config.ts` holds `DATABASE_URL`)
- **dotenv** — environment config
- **`@prisma/adapter-pg`** — Postgres driver adapter required by Prisma 7

Auth uses **Supabase Auth** JWTs (`Authorization: Bearer <access_token>`). The API verifies the token and upserts a Prisma `User` with `id = auth.uid`. Signing up with an email listed in `SEED_USER_CLAIM_EMAILS` (default `explorer@hanchi.app`) one-time claims `seed-user-1` stamps/favorites/journal.

## Hosting (Supabase + Railway)

Recommended split:

- **Supabase** — Postgres + PostGIS + Auth
- **Railway** — runs this Express API

### 1. Supabase database

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) (name it e.g. `hanchi`).
2. Open **SQL Editor** and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

3. Go to **Connect** → copy a Postgres URI:
   - Prefer **Session pooler** (port **5432**, user `postgres.<project-ref>`) if the direct `db.*` host fails (common on IPv4-only networks).
   - Avoid the **transaction** pooler (port **6543**) for Prisma Migrate.
4. URL-encode special password characters (`$` → `%24`). Append:
   `?sslmode=require&uselibpqcompat=true`

Migrate/seed from your machine:

```bash
npx prisma migrate deploy
npm run prisma:seed
```

### 2. Railway API

1. Put this folder in a GitHub repo (root = `hanchi-api`, or set Railway **Root Directory** to `hanchi-api` in a monorepo).
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select the repo.
3. Variables → set:
   - `DATABASE_URL` = same Supabase session-pooler URI as local `.env`
   - `SUPABASE_URL` = project URL
   - `SUPABASE_SECRET_KEY` = secret/service role key (server only)
   - Optional: `SEED_USER_CLAIM_EMAILS` = comma-separated emails that claim seed data
4. Deploy. `railway.toml` runs `npm run build`, then `npm start` (`prisma migrate deploy` + server).
5. **Settings → Networking → Generate domain** → open `https://<domain>/health`.

Do **not** set `DEV_DEFAULT_USER_ID` or `ALLOW_STUB_AUTH` on Railway.

### Auth setup (Supabase dashboard)

1. **Authentication → Providers** → enable Email.
2. For faster mobile testing, you can disable **Confirm email** under Auth settings (re-enable before public launch if you want).
3. Copy the project URL + anon/publishable key into the mobile app `.env`.

### Notes

- Seed is manual (`npm run prisma:seed`) — not run on every deploy.

## Prerequisites

- Node.js 20.19+
- A PostgreSQL database with the **PostGIS** extension

### Local Postgres + PostGIS

```bash
# macOS (Homebrew)
brew install postgresql@16 postgis
brew services start postgresql@16
createdb hanchi
psql hanchi -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

Or with Docker:

```bash
docker run --name hanchi-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hanchi \
  -p 5432:5432 \
  -d postgis/postgis:16-3.4
```

### Hosted options

[Supabase](https://supabase.com) and [Neon](https://neon.tech) both support PostGIS. Enable the extension in the SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Then copy the connection string into `.env` as `DATABASE_URL`.

## Setup

```bash
cd hanchi-api
cp .env.example .env
# Edit .env — set DATABASE_URL (and optionally PORT / DEV_DEFAULT_USER_ID)

npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Server defaults to `http://localhost:3000`. Health check: `GET /health`.

## Environment variables

| Variable                 | Required | Description                                                          |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| `DATABASE_URL`           | Yes      | Postgres connection string (PostGIS-enabled DB)                      |
| `SUPABASE_URL`           | Yes\*    | Supabase project URL (\*required for auth)                           |
| `SUPABASE_SECRET_KEY`    | Yes\*    | Secret/service role key for token verification                       |
| `SEED_USER_CLAIM_EMAILS` | No       | Emails that claim `seed-user-1` data on first sign-in                |
| `PORT`                   | No       | HTTP port (default `3000`)                                           |
| `ALLOW_STUB_AUTH`        | No       | Set `1` locally to accept `x-user-id` without JWT (never on Railway) |
| `DEV_DEFAULT_USER_ID`    | No       | Stub fallback user id when `ALLOW_STUB_AUTH=1`                       |
| `YELP_API_KEY`           | No\*     | Yelp Fusion key for POI sync (\*required to run sync)                |
| `SYNC_SECRET`            | No\*     | Shared secret for `POST /admin/sync/yelp*` (`x-sync-secret`)         |

## API overview

| Method  | Path                      | Notes                                                            |
| ------- | ------------------------- | ---------------------------------------------------------------- |
| `GET`   | `/communities`            | Optional `?near=lat,lng&radius=meters` (PostGIS)                 |
| `GET`   | `/communities/:id`        | Community + POIs                                                 |
| `GET`   | `/communities/:id/dishes` | Dishes across POIs in a community                                |
| `GET`   | `/pois/:id`               | POI + dishes                                                     |
| `GET`   | `/users/me`               | Current user — Bearer token                                      |
| `PATCH` | `/users/me`               | Update intents / cultures — Bearer token                         |
| `POST`  | `/stamps`                 | Body: `{ communityId }` — Bearer token                           |
| `GET`   | `/users/:id/stamps`       | Own stamps only — Bearer token                                   |
| `POST`  | `/journal`                | Body: `{ note, communityId?, poiId?, photoUrl? }` — Bearer token |
| `GET`   | `/users/:id/journal`      | Own journal only — Bearer token                                  |
| `GET`   | `/routes`                 | Optional `?type=curated\|ai_generated\|seasonal`                 |
| `GET`   | `/routes/:id`             | Route with ordered stops                                         |
| `GET`   | `/search?q=`              | Search communities, POIs, dishes by name                         |
| `POST`  | `/admin/sync/yelp`        | Sync all communities from Yelp — requires `x-sync-secret`        |
| `POST`  | `/admin/sync/yelp/:id`    | Sync one community — requires `x-sync-secret`                    |

## Yelp POI sync

Pulls restaurants/food near each community centroid and upserts POIs that fall **inside** the community polygon (by `yelpId`).

```bash
# One community
npm run yelp:sync -- koreatown-manhattan

# All communities
npm run yelp:sync

# Or via HTTP (set SYNC_SECRET in .env / Railway)
curl -X POST -H "x-sync-secret: $SYNC_SECRET" \
  "http://localhost:3000/admin/sync/yelp/koreatown-manhattan"
```

On Railway, also set `YELP_API_KEY` and `SYNC_SECRET`.

Stub auth example:

```bash
curl -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" http://localhost:3000/users/me
```

## Seed data

`prisma/seed.ts` loads **30 NYC enclaves** aligned with the mobile mock data (Mayor's Office immigrant enclaves map), plus a few curated POIs/dishes/routes. Demo user: `seed-user-1` / `explorer@hanchi.app`.

After seeding, run `npm run yelp:sync` (or `POST /admin/sync/yelp`) to fill restaurants from Yelp.

## Project structure

```
hanchi-api/
  src/
    routes/
    controllers/
    middleware/
    lib/
    types/
    index.ts
  prisma/
    schema.prisma
    seed.ts
  prisma.config.ts
  .env.example
  package.json
  tsconfig.json
  README.md
```

## Notes

- AI route recommendations are **not** implemented. `GET /routes` returns the most recently created routes (with an optional type filter) and includes a `TODO` in code for real recommendation logic.
- Geometry columns use PostGIS via Prisma `Unsupported` types; near/list detail endpoints use `ST_*` helpers in raw SQL.
