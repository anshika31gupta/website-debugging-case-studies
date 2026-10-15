// Usage: node t3_services.js <repoRoot>   — runs claim + upload service logic with an in-memory Prisma stub
const path = require('path'); const root = process.argv[2];
const be = (p) => path.join(root, 'backend/src', p);
const db = { claims: [], tx: { id: 't1', userId: 'u1', merchant: 'Amazon', amount: 1000, detectedBenefit: 'Purchase Protection', cardUsed: 'Visa', benefitValue: 900 } };
const prismaStub = {
  transaction: { findFirst: async () => db.tx, update: async () => ({}) },
  claim: {
    findFirst: async ({ where }) => db.claims.find((c) => (where.id ? c.id === where.id : c.transactionId === where.transactionId)) || null,
    create: async ({ data }) => { const c = { id: 'c' + (db.claims.length + 1), ...data }; db.claims.push(c); return c; },
    update: async ({ where, data }) => Object.assign(db.claims.find((c) => c.id === where.id), data),
  },
  upload: { create: async ({ data }) => data },
};
require.cache[require.resolve(be('config/db.js'))] = { id: 'x', filename: 'x', loaded: true, exports: prismaStub };
let inserted = [];
require.cache[require.resolve(be('services/transactionService.js'))] = { id: 'y', filename: 'y', loaded: true, exports: { createTransaction: async (u, d) => { inserted.push(d); return { ...d, hasBenefit: false }; } } };
const claims = require(be('services/claimService.js')); const uploads = require(be('services/uploadService.js'));
const tryIt = async (label, fn) => { try { const r = await fn(); console.log(label.padEnd(44), '->', r); } catch (e) { console.log(label.padEnd(44), '-> ERROR', e.statusCode || '', e.message.slice(0, 60)); } };
(async () => {
  await tryIt('submit claim -> currentStepIndex (UI: 2=Submitted)', async () => (await claims.submitClaim('u1', { transactionId: 't1' })).currentStepIndex);
  await tryIt('submit 2nd claim, same transaction', async () => (await claims.submitClaim('u1', { transactionId: 't1' })).claimNumber ? 'ACCEPTED (duplicate)' : '');
  await tryIt('advance (no status) -> status', async () => (await claims.advanceClaim('u1', 'c1', {})).status);
  await tryIt('advance with status "Bogus"', async () => { const r = await claims.advanceClaim('u1', 'c1', { status: 'Bogus' }); return `ACCEPTED status=${r.status} idx=${r.currentStepIndex}`; });
  const file = (rows) => ({ originalname: 'x.json', mimetype: 'application/json', buffer: Buffer.from(JSON.stringify(rows)) });
  inserted = [];
  await tryIt('upload [good row, amount "abc"] ', async () => { const r = await uploads.processUpload('u1', file([{ merchant: 'A', amount: 100 }, { merchant: 'B', amount: 'abc' }])); return `ACCEPTED, inserted=${inserted.length}, nanAmount=${inserted.some((d) => Number.isNaN(d.amount))}`; });
  inserted = [];
  await tryIt('upload [amount 0 (number)]', async () => { const r = await uploads.processUpload('u1', file([{ merchant: 'A', amount: 0 }])); return `silently skipped, inserted=${inserted.length}, recordsFound=${r.upload.recordsFound}`; });
})();
