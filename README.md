# Hanchi API

Standalone Node.js + TypeScript backend for **Hanchi** — a cultural-discovery app for exploring ethnic enclaves, earning passport stamps, and journaling finds.

## Stack

- **Express** — HTTP API
- **PostgreSQL + PostGIS** — geospatial communities / POIs
- **Prisma 7** — ORM + migrations (`prisma.config.ts` holds `DATABASE_URL`)
- **dotenv** — environment config
- **`@prisma/adapter-pg`** — Postgres driver adapter required by Prisma 7

Auth is intentionally stubbed via an `x-user-id` header. Replace before shipping (Supabase Auth, Clerk, Firebase Auth, etc.).

## Hosting (Supabase + Railway)

Recommended split:

- **Supabase** — Postgres + PostGIS
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
3. Variables → set **only**:
   - `DATABASE_URL` = same Supabase session-pooler URI as local `.env`
4. Deploy. `railway.toml` runs `npm run build`, then `npm start` (`prisma migrate deploy` + server).
5. **Settings → Networking → Generate domain** → open `https://<domain>/health`.

Do **not** set `DEV_DEFAULT_USER_ID` on Railway.

### Notes

- Seed is manual (`npm run prisma:seed`) — not run on every deploy.
- Later you can replace stub `x-user-id` auth with **Supabase Auth** without changing hosts.

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

| Variable              | Required | Description                                                  |
| --------------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`        | Yes      | Postgres connection string (PostGIS-enabled DB)              |
| `PORT`                | No       | HTTP port (default `3000`)                                   |
| `DEV_DEFAULT_USER_ID` | No       | Fallback user id when `x-user-id` is omitted (dev only)      |
| `YELP_API_KEY`        | No\*     | Yelp Fusion key for POI sync (\*required to run sync)        |
| `SYNC_SECRET`         | No\*     | Shared secret for `POST /admin/sync/yelp*` (`x-sync-secret`) |

## API overview

| Method | Path                      | Notes                                                                    |
| ------ | ------------------------- | ------------------------------------------------------------------------ |
| `GET`  | `/communities`            | Optional `?near=lat,lng&radius=meters` (PostGIS)                         |
| `GET`  | `/communities/:id`        | Community + POIs                                                         |
| `GET`  | `/communities/:id/dishes` | Dishes across POIs in a community                                        |
| `GET`  | `/pois/:id`               | POI + dishes                                                             |
| `POST` | `/stamps`                 | Body: `{ communityId, userId? }` — requires `x-user-id`                  |
| `GET`  | `/users/:id/stamps`       | Requires `x-user-id`                                                     |
| `POST` | `/journal`                | Body: `{ note, communityId?, poiId?, photoUrl? }` — requires `x-user-id` |
| `GET`  | `/users/:id/journal`      | Requires `x-user-id`                                                     |
| `GET`  | `/routes`                 | Optional `?type=curated\|ai_generated\|seasonal`                         |
| `GET`  | `/routes/:id`             | Route with ordered stops                                                 |
| `GET`  | `/search?q=`              | Search communities, POIs, dishes by name                                 |
| `POST` | `/admin/sync/yelp`        | Sync all communities from Yelp — requires `x-sync-secret`                |
| `POST` | `/admin/sync/yelp/:id`    | Sync one community — requires `x-sync-secret`                            |

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
curl -H "x-user-id: seed-user-1" http://localhost:3000/users/seed-user-1/stamps
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
