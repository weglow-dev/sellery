/* dist/ 를 Vercel 과 같은 규칙으로 로컬 서빙 (SPA 폴백 포함). 배포 전 확인용: node scripts/serve-dist.mjs [port] */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = +(process.argv[2] || 4173);
const APPS = ['influencer', 'brand', 'admin', 'shop'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

function send(res, file, code = 200) {
	res.writeHead(code, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
	createReadStream(file).pipe(res);
}

createServer((req, res) => {
	let url = decodeURIComponent((req.url || '/').split('?')[0]);
	const app = APPS.find((a) => url === `/${a}` || url.startsWith(`/${a}/`));
	if (url === '/') url = '/index.html';
	let file = normalize(join(DIST, url));
	if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (existsSync(file) && statSync(file).isFile()) return send(res, file);
	if (app) return send(res, join(DIST, app, 'index.html')); // SPA 폴백 (vercel.json rewrites 와 동일)
	res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 ' + url);
}).listen(PORT, () => console.log(`dist 서빙 중 → http://localhost:${PORT}  (${APPS.map((a) => '/' + a).join(' ')})`));
