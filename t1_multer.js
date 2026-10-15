// Repro: file > 5MB upload -> what status does the API return?
const express = require('express'), multer = require('multer'), http = require('http');
const { errorMiddleware, notFoundHandler } = require('/home/claude/work/BenifitFlow-main/backend/src/middlewares/errorMiddleware');
const app = express();
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 } }); // tiny limit for the test
app.post('/api/uploads', up.single('file'), (req, res) => res.json({ ok: true }));
app.use(notFoundHandler); app.use(errorMiddleware);
const s = app.listen(0, async () => {
  const port = s.address().port;
  const fd = new FormData(); fd.append('file', new Blob(['x'.repeat(5000)]), 'big.csv');
  const r = await fetch(`http://127.0.0.1:${port}/api/uploads`, { method: 'POST', body: fd });
  console.log('STATUS', r.status, JSON.stringify((await r.json())).slice(0, 120));
  s.close();
});
