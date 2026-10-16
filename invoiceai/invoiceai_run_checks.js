// Usage: node run_checks.js <path-to-repo-root>
// Starts the server on a throwaway DB and runs black-box HTTP checks. No external services needed.
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const os = require('os');
const root = path.resolve(process.argv[2]); const PORT = 3999; const B = `http://127.0.0.1:${PORT}/api/v1`;
const dbPath = path.join(os.tmpdir(), `inv_${Date.now()}.db`);
const req = async (m, p, body, tok) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; };
const line = (k, v) => console.log(k.padEnd(52), '->', v);
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT, DB_PATH: dbPath, NODE_PATH: path.join(root, 'node_modules') }, stdio: 'ignore' });
  for (let i = 0; i < 30; i++) { try { await fetch(`http://127.0.0.1:${PORT}/health`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  try {
    // 1. brand-new signup
    const su = await req('POST', '/auth/signup', { email: 'newuser@test.com', password: 'Str0ngPass!', name: 'New User' });
    line('1. signup with a brand-new email', `${su.s} ${su.j.error || 'created, token=' + !!su.j.token}`);
    const lg = await req('POST', '/auth/login', { email: 'newuser@test.com', password: 'Str0ngPass!' });
    line('   ...then login with that same new account', `${lg.s} ${lg.j.error || 'ok'}`);
    // 2. weak password
    const wk = await req('POST', '/auth/signup', { email: 'weak@test.com', password: '1', name: 'W' });
    const wkLogin = await req('POST', '/auth/login', { email: 'weak@test.com', password: '1' });
    line('2. account with a 1-character password', `signup=${wk.s} ${wk.j.error || ''} | login with "1" -> ${wkLogin.s} ${wkLogin.s === 200 ? 'ACCEPTED (no password rules)' : wkLogin.j.error}`);
    // 3. documented default credentials
    const demo = await req('POST', '/auth/login', { email: 'test@example.com', password: 'password123' });
    line('3. login with documented demo credentials', `${demo.s} ${demo.j.token ? 'LOGGED IN' : demo.j.error}`);
    const T = demo.j.token;
    // 4. forged token using the default JWT secret
    let forged = 'n/a'; try { const jwt = require(path.join(root, 'node_modules/jsonwebtoken')); const f = jwt.sign({ id: 1, email: 'x', role: 'user' }, 'invoiceai-secret-key-2024'); const r = await req('GET', '/dashboard', null, f); forged = `${r.s} ${r.s === 200 ? 'FORGED TOKEN ACCEPTED' : r.j.error}`; } catch (e) { forged = e.message; }
    line('4. forged JWT signed with the default secret', forged);
    // companies / invoices of demo
    const comps = (await req('GET', '/companies', null, T)).j; const cid = comps[0].id;
    const invs = (await req('GET', `/companies/${cid}/invoices`, null, T)).j;
    const draft = invs.find(i => i.status === 'draft');
    // 5. payments: string amount, negative, overpay
    const p1 = await req('POST', `/invoices/${draft.id}/payments`, { amount: '100', payment_date: '2026-10-01' }, T);
    const p2 = await req('POST', `/invoices/${draft.id}/payments`, { amount: '100', payment_date: '2026-10-02' }, T);
    const after = (await req('GET', `/invoices/${draft.id}`, null, T)).j;
    line('5. pay "100" twice (JSON strings) -> total_paid', `${JSON.stringify(after.total_paid)} (expected 200)  status=${after.status}`);
    const neg = await req('POST', `/invoices/${invs.find(i => i.status === 'sent').id}/payments`, { amount: -5000, payment_date: '2026-10-01' }, T);
    line('6. record a NEGATIVE payment (-5000)', `${neg.s} ${neg.s === 201 ? 'ACCEPTED' : neg.j.error}`);
    // 7. mark-paid leaves no payment row
    const fresh = await req('POST', `/companies/${cid}/invoices`, { client_id: invs[0].client_id, issue_date: '2026-10-01', due_date: '2026-11-01', items: [{ description: 'Fresh', quantity: 2, rate: 500 }] }, T);
    await req('POST', `/invoices/${fresh.j.id}/mark-paid`, {}, T);
    const freshAfter = (await req('GET', `/invoices/${fresh.j.id}`, null, T)).j;
    const pay = (await req('GET', `/invoices/${fresh.j.id}/payments`, null, T)).j;
    line('7. mark-paid: invoice total_paid vs payment ledger', `total_paid=${freshAfter.total_paid}, payment rows=${pay.length}, ledger sum=${pay.reduce((a, p) => a + p.amount, 0)}`);
    // 8. XSS in PDF/print page
    const x = await req('POST', `/companies/${cid}/invoices`, { client_id: invs[0].client_id, issue_date: '2026-10-01', due_date: '2026-11-01', items: [{ description: '<img src=x onerror=alert(document.domain)>', quantity: 1, rate: 100 }], notes: '<script>alert(1)</script>' }, T);
    const html = await (await fetch(`${B}/invoices/${x.j.id}/pdf`, { headers: { Authorization: 'Bearer ' + T } })).text();
    line('8. <script>/<img onerror> in description+notes, in PDF', html.includes('<img src=x onerror') && html.includes('<script>alert(1)') ? 'RENDERED UNESCAPED (XSS)' : 'escaped');
    // 9. negative / zero qty & rate accepted
    const bad = await req('POST', `/companies/${cid}/invoices`, { client_id: invs[0].client_id, issue_date: '2026-10-01', due_date: '2026-11-01', items: [{ description: 'x', quantity: -3, rate: 999 }] }, T);
    line('9. invoice with quantity -3', `${bad.s} ${bad.s === 201 ? 'ACCEPTED, total=' + bad.j.total : bad.j.error}`);
    // 10. IDOR: new user attaches demo's client to their own invoice
    const tokB = su.j.token || lg.j.token; let idor = 'skipped (user B could not log in)';
    if (tokB) {
      const cb = (await req('POST', '/companies', { name: 'B Co' }, tokB)).j;
      const r = await req('POST', `/companies/${cb.id}/invoices`, { client_id: invs[0].client_id, issue_date: '2026-10-01', due_date: '2026-11-01', items: [{ description: 'x', quantity: 1, rate: 1 }] }, tokB);
      const list = (await req('GET', `/companies/${cb.id}/invoices`, null, tokB)).j;
      idor = r.s === 201 ? `ACCEPTED; B sees other user's client: "${list[0]?.client_name}" <${list[0]?.client_email}>` : `${r.s} ${r.j.error}`;
      // 11. invoice-number collision across companies
      const cb2 = (await req('POST', '/companies', { name: 'B Co 2' }, tokB)).j;
      const own = async (c) => (await req('POST', `/companies/${c}/clients`, { name: 'Own client' }, tokB)).j.id;
      const ownA = await own(cb.id), ownB = await own(cb2.id);
      const mk = (c) => req('POST', `/companies/${c}/invoices`, { client_id: c === cb.id ? ownA : ownB, issue_date: '2026-10-01', due_date: '2026-11-01', items: [{ description: 'x', quantity: 1, rate: 1 }] }, tokB);
      const first = await mk(cb2.id); const second = await mk(cb.id);
      line('11. two companies create their first invoices', `HTTP ${first.s} and ${second.s}  ${[first.s, second.s].includes(500) ? '-> one FAILED with 500 (invoice_number UNIQUE collision)' : '-> both ok'}`);
    }
    line('10. attach ANOTHER user\'s client_id to my invoice', idor);
    // 12. CSV export with quote in client name
    await req('POST', `/companies/${cid}/clients`, { name: 'Ram "Tech" Pvt, Ltd' }, T);
    const cl = (await req('GET', `/companies/${cid}/clients`, null, T)).j.find(c => c.name.includes('Ram'));
    await req('POST', `/companies/${cid}/invoices`, { client_id: cl.id, issue_date: '2026-10-01', due_date: '2026-11-01', items: [{ description: 'x', quantity: 1, rate: 1 }] }, T);
    const csv = await (await fetch(`${B}/export/invoices?format=csv`, { headers: { Authorization: 'Bearer ' + T } })).text();
    line('12. CSV row for client  Ram "Tech" Pvt, Ltd', csv.split('\n').find(l => l.includes('Ram')).slice(0, 70));
    // 13. dashboard ignores partial invoices
    const d = (await req('GET', '/dashboard', null, T)).j;
    const all = (await req('GET', `/companies/${cid}/invoices`, null, T)).j;
    const partial = all.filter(i => i.status === 'partial').length;
    line('13. dashboard (status partial invoices exist: ' + partial + ')', `pending=${d.pending} overdue=${d.overdue} paid=${d.paid} partial=${d.partial ?? 'n/a'} -> buckets add up to ${d.pending + d.overdue + d.paid + (d.partial || 0)} of ${d.total_invoices} invoices`);
    // 14. recurring date overflow
    const rec = await req('POST', `/invoices/${all[0].id}/recurring`, { frequency: 'monthly' }, T);
    await req('PUT', `/invoices/${all[0].id}`, { due_date: '2026-01-31' }, T);
    const rec2 = await req('POST', `/invoices/${all[0].id}/recurring`, { frequency: 'monthly' }, T);
    line('14. recurring monthly from due date 2026-01-31', `next = ${rec2.j.nextDate}`);
    const rec3 = await req('POST', `/invoices/${all[0].id}/recurring`, { frequency: 'bogus' }, T);
    line('15. recurring frequency "bogus"', `${rec3.s} ${rec3.j.error || 'ACCEPTED, silently treated as monthly'}`);
    // 17. overpayment
    const op = await req('POST', `/companies/${cid}/invoices`, { client_id: invs[0].client_id, issue_date: '2026-10-01', due_date: '2026-11-01', items: [{ description: 'Small', quantity: 1, rate: 1000 }] }, T);
    const over = await req('POST', `/invoices/${op.j.id}/payments`, { amount: 5000, payment_date: '2026-10-05' }, T);
    line('17. pay 5000 on an invoice that totals ' + op.j.total, `${over.s} ${over.s === 201 ? 'ACCEPTED (overpayment)' : over.j.error}`);
    // 16. deleting an invoice that has payments
    const allNow = (await req('GET', `/companies/${cid}/invoices`, null, T)).j; const withPay = allNow.find(i => i.status === 'partial');
    const del = await fetch(`${B}/invoices/${withPay.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + T } });
    const left = (await req('GET', `/invoices/${withPay.id}/payments`, null, T));
    line('16. delete an invoice that has recorded payments', `${del.status} ${del.status === 200 ? 'DELETED, payment history gone with it' : 'blocked'}`);
  } catch (e) { console.log('CHECK ERROR', e); }
  srv.kill(); try { fs.rmSync(dbPath, { force: true }); fs.rmSync(dbPath + '-wal', { force: true }); fs.rmSync(dbPath + '-shm', { force: true }); } catch {}
})();
