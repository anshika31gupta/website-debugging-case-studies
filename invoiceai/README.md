# Case Study: Auditing an Invoice & Billing App (Node.js, Express, SQLite, vanilla JS)

**Project:** [Invoice-Management-Billing-Software](https://github.com/anshika31gupta/Invoice-Management-Billing-Software) (InvoiceAI), my own full-stack invoicing app
**What this is:** a self-audit of my own project, done the way I'd debug a client's app: reproduce first, fix second, verify third.
**Result:** 18 issues found. 14 reproduced against the running server (the rest by code review or file inspection), 17 fixed, 14 of those with before/after proof.

> This is not client work. It is an audit of my own code, and every finding says how it was verified.

## Summary

| # | Issue | Severity | How verified | Status |
|---|-------|----------|--------------|--------|
| 1 | **Every new signup fails** with "Email already exists" (but the account is silently created) | Critical | Reproduced (HTTP 409, then login works) | Fixed (201, user+company in one transaction) |
| 2 | **Payments as JSON strings corrupt money**: paying `"100"` twice gives `total_paid = 100100` | Critical | Reproduced | Fixed (200, input validated and rounded) |
| 3 | Forged login token accepted: server falls back to a hard-coded JWT secret | Critical | Reproduced (forged token got HTTP 200) | Fixed (random secret in dev, refuses to start in production without one) |
| 4 | Demo account `test@example.com / password123` is created in production and published in the README | High | Reproduced in production mode | Fixed (demo seed is dev-only) |
| 5 | XSS: invoice description and notes rendered unescaped on the printable invoice page, so anyone who opens or receives it runs the script | Medium | Reproduced (`<img onerror>` came back raw) | Fixed (all fields HTML-escaped) |
| 6 | Data leak: any user can attach another user's `client_id` to an invoice and read that client's name and email | High | Reproduced | Fixed (400) |
| 7 | Negative and zero payments, quantities and rates accepted (invoice total of -3536.46) | High | Reproduced | Fixed (validated, 400) |
| 8 | Payments can exceed the invoice balance; deleting an invoice silently erases its payment history | High | Reproduced (delete returned 200) | Fixed (400 / 409) |
| 9 | `mark-paid` sets the invoice to paid but writes no payment record, so ledger and invoice disagree | Medium | Reproduced (paid 1180, ledger 0) | Fixed (ledger entry created) |
| 10 | Invoice numbers collide across companies, so a user's first invoice can fail with HTTP 500 | Medium | Reproduced | Fixed |
| 11 | Dashboard ignores partial invoices: buckets add up to 5 of 8 invoices | Medium | Reproduced | Fixed (7 of 7) |
| 12 | CSV export breaks on quotes (`\"` instead of `""`) and allows spreadsheet formula injection | Medium | Reproduced | Fixed |
| 13 | Recurring invoices: monthly from 31 Jan gives **3 March**; unknown frequencies silently become monthly | Medium | Reproduced | Fixed (28 Feb, 400 on bad value) |
| 14 | No password rules: a 1-character password is accepted | Medium | Reproduced | Fixed (min 8 chars) |
| 15 | Google sign-in accounts get a **predictable password** (`google-oauth-` + public Google id) | High | Code review (not run, needs Google credentials) | Fixed (random password) |
| 16 | `.gitignore` is saved as UTF-16, so Git ignores none of it: the SQLite database (with users), WAL files and `node_modules` were committed | High | Checked file bytes (`ff fe` header) | Fixed file provided |
| 17 | Frontend `API_URL` always points at the production server, even when running locally | Low | Code review | Fixed |
| 18 | Docs and dependencies drift: README says PostgreSQL and `docker-compose up` (no such file exists), 6 unused packages, 7 modules (43 KB) never imported | Low | Searched every `require` | Unused packages removed; docs and dead modules not touched |

## The most instructive bugs

### 1. New users cannot sign up
- **Symptom:** a brand-new email gets `409 Email already exists`.
- **Cause:** signup creates two sample invoices named `INV-001` and `INV-002`, but invoice numbers are globally unique and the demo user already owns them. The insert fails after the user row is saved, and the error handler maps every `UNIQUE` error to "Email already exists".
- **Result before the fix:** the user exists but never received a token and has no company, while the same email now really does exist, so a retry also fails.
- **Fix:** one database transaction for user and company, an explicit email check, and no fake sample invoices or fake GSTIN on real accounts.

### 2. Money arithmetic on strings
- **Before:** two payments of `"100"` gave `total_paid = 100100` and a wrong status.
- **After:** `total_paid = 200`. The amount is converted to a number, must be positive, is rounded to 2 decimals, cannot exceed the balance, and the payment and invoice update run in one transaction.

### 3. Forged login
- **Before:** a token signed with the default secret in the source code was accepted (`HTTP 200`).
- **After:** the same forged token gets `401`. In production the server refuses to start without `JWT_SECRET`.

## Before / after (same test script, original vs fixed code)

| Check | Original | Fixed |
|-------|----------|-------|
| New signup | 409 | 201 |
| Pay "100" twice | 100100 | 200 |
| Negative payment | 201 accepted | 400 |
| Quantity -3 | 201, total -3536.46 | 400 |
| XSS in invoice page | rendered raw | escaped |
| Other user's client_id | accepted, data leaked | 400 |
| Two companies' first invoices | one 500 | both 201 |
| Dashboard buckets | 5 of 8 | 7 of 7 |
| Monthly recurrence from 31 Jan | 3 Mar | 28 Feb |
| Delete invoice with payments | 200, history lost | 409 |
| Production, no `JWT_SECRET` | starts with default secret | refuses to start |

## Found but not fixed (needs a decision)
- **Per-item `tax_rate` is stored but never used.** Totals use only the invoice-level tax rate.
- **Currencies are summed together** in monthly revenue analytics.
- **Google OAuth** has no `state` parameter (CSRF), and I could not run it without Google credentials.
- **No real email sending.** The send endpoint marks the invoice as `sent` without sending anything.
- **README/DEPLOY** describe PostgreSQL, Redis and Docker, but the app runs on SQLite and no Docker files exist.
- **7 unused modules** (43 KB) duplicate logic from `server.js`.

## What I did not verify
- I ran the real Express server on a throwaway SQLite database. I did not test the browser UI.
- Google OAuth, the Claude AI endpoints and the production Railway deployment were not run.
- The patch removes unused packages from `package.json`; run `npm install` afterwards to refresh `package-lock.json`.

## How to reproduce
1. `git apply invoiceai-fixes.patch`
2. Replace `.gitignore` with `gitignore-fixed.txt`, then run
   `git rm --cached invoiceai.db invoiceai.db-wal invoiceai.db-shm temp-script.js`
3. `npm install`
4. Run the checks on original and fixed code:
   `node invoiceai_run_checks.js <repo-folder>` and `node invoiceai_prod_check.js <repo-folder>`

## Skills shown
Node.js, Express, SQLite (better-sqlite3), JWT authentication, REST API validation, financial-data integrity, XSS and access-control bugs, CSV handling, transactions, deployment configuration.
