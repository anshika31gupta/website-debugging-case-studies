# Case Study: Debugging a Full-Stack App (React + Express + Prisma + Postgres)

**Project:** [BenefitFlow](https://github.com/anshika31gupta/BenifitFlow), my own full-stack credit-card-benefits app
**What this is:** a self-audit of my own project, done the way I'd debug a client's site: reproduce first, fix second, verify third.
**Result:** 11 issues found, 10 reproduced with scripts or a real PostgreSQL 16 database, 9 fixed with before/after proof.

> This is not client work. It is an audit of my own code, and every claim below says how it was verified.

## Summary

| # | Issue | Severity | How verified | Status |
|---|-------|----------|--------------|--------|
| 1 | DB migration written for SQLite, but the project uses PostgreSQL, so **deploy fails** | Critical | Ran on real PostgreSQL 16 | Fixed, 9 tables created cleanly |
| 2 | `render.yaml` points `DATABASE_URL` at `localhost` | Critical | Code review | Fixed (managed DB reference), not deployed-tested |
| 3 | Frontend proxy corrupts file uploads (multipart) | High | Reproduced (500) | Fixed (200, file received) |
| 4 | Oversize upload returns 500 instead of 413 | Medium | Reproduced | Fixed (413 + clear message) |
| 5 | Claim tracker step index disagrees with UI, and "Under Review" is skipped | High | Reproduced with DB stub | Fixed |
| 6 | Claim API accepts any status string (`"Bogus"`) | Medium | Reproduced | Fixed (400 with allowed values) |
| 7 | Same transaction can be claimed multiple times | High | Reproduced | Fixed (409) |
| 8 | CSV/JSON upload: `NaN` amounts saved, `0` silently dropped, half-imported files | High | Reproduced | Fixed (all rows validated first, row-level errors) |
| 9 | Merchant search is case-sensitive on Postgres | Medium | Confirmed at SQL level (`LIKE` vs `ILIKE`) | Fixed (`mode: 'insensitive'`), Prisma query itself not run |
| 10 | Production silently runs with JWT secret `"dev-secret"` | High (security) | Reproduced | Fixed (app refuses to boot) |
| 11 | Both GitHub Actions workflows can never pass (Deno on a Node repo; `npm publish` with no root package) | Low | Code review | Replaced with real CI; frontend `lint` + `build` pass locally |

## Detail: the 3 most instructive bugs

### 1. Migration fails on the production database
- **Symptom:** deploy to Render would crash at `prisma migrate deploy`.
- **How I found it:** `schema.prisma` says `postgresql`, but `migration.sql` used SQLite types.
- **Reproduction:** ran the original file on PostgreSQL 16:
  `ERROR: type "datetime" does not exist`
- **Fix:** `DATETIME` to `TIMESTAMP(3)`, `REAL` to `DOUBLE PRECISION`, primary keys as named constraints.
- **Result:** re-ran on PostgreSQL 16, all 9 tables created.

### 2. File upload broken by the dev/prod proxy
- **Symptom:** uploads through the frontend server return an HTML 500 page.
- **Cause:** the proxy parsed every body as JSON and re-serialised it, destroying `multipart/form-data`.
- **Before:** `500 Unexpected end of form`
- **After:** `200 {"gotFile":true,"bytes":28,"name":"tx.csv"}`
- **Fix:** JSON parsing only on the two Gemini routes; everything else is forwarded as raw bytes.

### 3. Claim lifecycle logic
Using an in-memory DB stub, same script on original vs fixed code:

| Check | Original | Fixed |
|-------|----------|-------|
| `currentStepIndex` after submitting (UI expects 2) | 1 | 2 |
| Second claim for same transaction | accepted | 409 |
| Advance claim with no status | jumps to `Approved` | `Under Review` |
| Status `"Bogus"` | accepted | 400 |
| Upload row with amount `"abc"` | saved as `NaN` | 400 with row number |
| Upload row with amount `0` | silently skipped | 400 with row number |

## Found but not fixed (needs a product decision)
- **Rules are global:** any logged-in user can create, edit or delete rules that affect every user. Needs a role model.
- **`vercel.json`:** uses `routes` with an external destination and an `env` block; likely should be `rewrites`, and `VITE_API_URL` must be set in the Vercel dashboard. Not tested.
- **Docs drift:** README still says SQLite, `.env.example` says Postgres.

## What I did not verify
Prisma's query engine could not be downloaded in my sandbox, so I did **not** run the full app end to end. Service logic was tested against an in-memory stub, and the migration against a real PostgreSQL 16. Run the app locally before relying on any single claim.

## Files
- `fixes.patch`: all changes as one diff (`git apply fixes.patch`)
- `repro/`: scripts that produce the before/after outputs above

## Skills shown
Node.js, Express, Prisma, PostgreSQL, React/TypeScript build tooling, REST API validation, GitHub Actions, deployment config (Render, Vercel).
