// Repro: dev/prod proxy in frontend/server.ts (logic copied verbatim) vs multipart upload
const express = require('express'), multer = require('multer');
// "backend": real multer upload endpoint
const be = express(); const up = multer({ storage: multer.memoryStorage() });
be.post('/api/uploads', up.single('file'), (req, res) => res.json({ gotFile: !!req.file, bytes: req.file?.size ?? 0, name: req.file?.originalname }));
const beS = be.listen(0, () => {
  const backendBase = `http://127.0.0.1:${beS.address().port}`;
  const app = express();
  
  app.use('/api', async (req, res) => {          // same proxy as server.ts
    const targetUrl = `${backendBase}/api${req.url}`;
    const headers = {};
    if (req.headers.authorization) headers['authorization'] = req.headers.authorization;
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    const options = { method: req.method, headers };
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) { const chunks = []; for await (const c of req) chunks.push(c); if (chunks.length) options.body = Buffer.concat(chunks); }
    const r = await fetch(targetUrl, options);
    res.status(r.status).send(await r.text());
  });
  const s = app.listen(0, async () => {
    const fd = new FormData(); fd.append('file', new Blob(['merchant,amount\nAmazon,1200\n']), 'tx.csv');
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/uploads`, { method: 'POST', body: fd });
    console.log('VIA PROXY (fixed) ->', r.status, (await r.text()).slice(0, 200));
    s.close(); beS.close();
  });
});
