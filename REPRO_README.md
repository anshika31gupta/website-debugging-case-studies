# Repro scripts
Setup: `npm i express multer csv-parse dotenv` then `export NODE_PATH=$PWD/node_modules`
- `t1_multer.js` – oversize upload status code (change the repo path inside to compare original vs fixed)
- `t2_proxy.js` / `t2_proxy_fixed.js` – multipart upload through the frontend proxy, before/after
- `t3_services.js <repo-root>` – claim + upload logic with an in-memory DB stub; run on original and fixed repo
