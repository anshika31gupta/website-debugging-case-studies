# Case Study: Debugging a Full-Stack App (React + Express + Prisma + Postgres)

**Project:** [BenefitFlow](https://github.com/anshika31gupta/BenifitFlow), my own full-stack credit-card-benefits app
**What this is:** a self-audit of my own project, done the way I'd debug a client's site: reproduce first, fix second, verify third.
**Result:** 11 issues found, 10 reproduced with scripts or a real PostgreSQL 16 database, 9 fixed and tested locally with before/after proof.

> This is not client work. It is an audit of my own code, and every claim below says how it was verified.

**Back to:** [all case studies](../README.md) | **Next:** [InvoiceAI case study](../invoiceai/README.md)

**Status labels used in this repo**
- **Reproduced**: I triggered the bug myself and saw the failure.
- **Fixed (tested locally)**: the fix passes the same script or database check that failed before.
- **Not verified**: I read the code but did not run it, or could not run it in my setup.

## Proof at a glance

Real terminal output from one run of the check script in GitHub Codespaces. The same script runs against the original code and the fixed code.

![Original vs fixed output of the claim logic checks, run in GitHub Codespaces](screenshots/claim-logic-original-vs-fixed.png)

*Top block: original code accepts duplicate claims, a `"Bogus"` status and invalid amounts. Bottom block: fixed code rejects them with clear errors (409 / 400). Fixed (tested locally).*

## Summary

| # | Issue | Severity | How verified | Status |
|---|-------|----------|--------------|--------|
| 1 | DB migration written for SQLite, but the project uses PostgreSQL, so **deploy fails** | Critical | Reproduced on real PostgreSQL 16 | Fixed (tested locally), 9 tables created cleanly |
| 2 | `render.yaml` points `DATABASE_URL` at `localhost` | Critical | Code review | Fixed (managed DB reference). **Deployment not verified** |
| 3 | Frontend proxy corrupts file uploads (multipart) | High | Reproduced (500) | Fixed (tested locally), now 200 and file received |
| 4 | Oversize upload returns 500 instead of 413 | Medium | Reproduced | Fixed (tested locally), 413 with a clear message |
| 5 | Claim tracker step index disagrees with UI, and "Under Review" is skipped | High | Reproduced with DB stub | Fixed (tested locally) |
| 6 | Claim API accepts any status string (`"Bogus"`) | Medium | Reproduced | Fixed (tested locally), 400 with allowed values |
| 7 | Same transaction can be claimed multiple times | High | Reproduced | Fixed for sequential requests (409). **Not race-proof yet**, see note below |
| 8 | CSV/JSON upload: `NaN` amounts saved, `0` silently dropped, half-imported files | High | Reproduced | Fixed (tested locally), all rows validated first, row-level errors |
| 9 | Merchant search is case-sensitive on Postgres | Medium | Confirmed at SQL level (`LIKE` vs `ILIKE`) | Fixed (`mode: 'insensitive'`). Prisma query itself **not run** |
| 10 | Production silently runs with JWT secret `"dev-secret"` | High (security) | Reproduced | Fixed (tested locally), app refuses to boot without a secret |
| 11 | Both GitHub Actions workflows can never pass (Deno on a Node repo; `npm publish` with no root package) | Low | Code review | Replaced with real CI; frontend `lint` + `build` pass locally. Workflows **not run on GitHub** |

**Note on #7 (duplicate claims):** the fix checks for an existing claim and then inserts. Two requests arriving at the same moment could both pass the check. The complete fix is a unique constraint in the database. Until that is added, the accurate claim is "duplicates are blocked in sequential requests", not "fully fixed".

## Detail: the 3 most instructive bugs

### 1. Migration fails on the production database
- **Symptom:** deploy to Render would crash at `prisma migrate deploy`.
- **How I found it:** `schema.prisma` says `postgresql`, but `migration.sql` used SQLite types.
- **Reproduction:** ran the original file on PostgreSQL 16:
  `ERROR: type "datetime" does not exist`
- **Fix:** `DATETIME` to `TIMESTAMP(3)`, primary keys as named constraints. The failing type was `DATETIME`. I also changed `REAL` to `DOUBLE PRECISION` so the migration matches what Prisma's `Float` creates on Postgres.
- **Result:** re-ran on PostgreSQL 16, all 9 tables created.

### 2. File upload broken by the dev/prod proxy
- **Symptom:** uploads through the frontend server return an HTML 500 page.
- **Cause:** the proxy parsed every body as JSON and re-serialised it, destroying `multipart/form-data`.
- **Before:** `500 Unexpected end of form`
- **After:** `200 {"gotFile":true,"bytes":28,"name":"tx.csv"}`
- **Fix:** JSON parsing only on the two Gemini routes; everything else is forwarded as raw bytes.

### 3. Claim lifecycle logic
Using an in-memory DB stub, same script on original vs fixed code (the screenshot above is the raw output of this run):

| Check | Original | Fixed |
|-------|----------|-------|
| `currentStepIndex` after submitting (UI expects 2) | 1 | 2 |
| Second claim for same transaction | accepted | 409 (sequential requests) |
| Advance claim with no status | jumps to `Approved` | `Under Review` |
| Status `"Bogus"` | accepted | 400 |
| Upload row with amount `"abc"` | saved as `NaN` | 400 |
| Upload row with amount `0` | silently skipped | 400 |

## Found but not fixed (needs a product decision)
- **Rules are global:** any logged-in user can create, edit or delete rules that affect every user. Needs a role model.
- **`vercel.json`:** uses `routes` with an external destination and an `env` block; likely should be `rewrites`, and `VITE_API_URL` must be set in the Vercel dashboard. Not tested.
- **Docs drift:** README still says SQLite, `.env.example` says Postgres.

## What I did not verify
- Prisma's query engine could not be downloaded in my sandbox, so I did **not** run the full app end to end. Service logic was tested against an in-memory stub, and the migration against a real PostgreSQL 16.
- **Deployment not verified:** `render.yaml`, `vercel.json` and the new GitHub Actions workflows were not run on the real platforms.
- The race condition in #7 is not covered by tests.

Run the app locally before relying on any single claim.

## How to reproduce
1. Clone the original repo and check out the original code.
2. Run the scripts in `repro/` (instructions in `repro/REPRO_README.md`) and save the output.
3. Apply `fixes.patch` (`git apply fixes.patch`) and run the same scripts again.
4. Compare the two outputs with the screenshot above.

## Files
- `fixes.patch`: all changes as one diff
- `repro/`: scripts that produce the before/after outputs above, plus `REPRO_README.md` with run instructions
- `screenshots/`: original, unedited terminal screenshots

## Skills shown
Node.js, Express, Prisma, PostgreSQL, React/TypeScript build tooling, REST API validation, GitHub Actions, deployment config (Render, Vercel).
