# Website Debugging Case Studies

I audit and fix bugs in full-stack web apps. These are **self-audits of my own projects**, done the way I would debug a client's site: reproduce first, fix second, verify third. This is not client work, and every claim says how it was verified.

## Case studies

| Project | Stack | Found | Reproduced | Fixed | Details |
|---------|-------|-------|------------|-------|---------|
| BenefitFlow | React, Express, Prisma, PostgreSQL | 11 | 10 | 9 | [benefitflow/](benefitflow/README.md) |
| InvoiceAI | Node, Express, SQLite | 18 | 14 | 17 | [invoiceai/](invoiceai/README.md) |

## Highlights

- **Deploy-breaking migration:** the migration was written for SQLite but the project uses PostgreSQL. Real PostgreSQL 16 error: `type "datetime" does not exist`. After the fix, all 9 tables are created cleanly. ([BenefitFlow](benefitflow/README.md))
- **Uploads broken by a proxy:** every request body was parsed as JSON, which corrupted file uploads. Before: `500`. After: `200` and the file is received. ([BenefitFlow](benefitflow/README.md))
- **Claim logic bugs:** duplicate claims, invalid status values and bad amounts were all accepted. After the fix they are rejected with clear 409/400 errors. ([BenefitFlow](benefitflow/README.md))

![Original vs fixed output of the claim logic checks, run in GitHub Codespaces](benefitflow/screenshots/claim-logic-original-vs-fixed.png)

*Real terminal output from one run in GitHub Codespaces: original code on top, fixed code below. Fixed (tested locally).*

## Status labels

- **Reproduced**: I triggered the bug myself and saw the failure.
- **Fixed (tested locally)**: the fix passes the same script or database check that failed before.
- **Not verified**: I read the code but did not run it, or could not run it in my setup (for example deployment config).

## Check it yourself

Each case study has a `repro/` folder or run scripts. Run them on the original code, apply the patch, and run them again. The output should match the screenshots.

## Tech

Node.js, Express, React, TypeScript, Prisma, PostgreSQL, SQLite, REST API validation, GitHub Actions, DevTools debugging.
