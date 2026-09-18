// @ts-nocheck — vite 설정에서 불러오는 개발용 스크립트 (svelte-check 대상 아님)
/* 개발 서버에서 저장소 루트 assets/ 를 /assets/ 로 서빙한다.
   앱은 /brand 같은 base 아래에서 돌지만 이미지·파비콘은 4개 앱이 같은 파일을 쓰므로
   루트 assets/ 한 곳만 두고, 배포 때는 scripts/build.mjs 가 dist/assets 로 복사한다. */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIR = join(ROOT, 'assets');
const MIME = { '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

export function rootAssets() {
	return {
		name: 'sellery-root-assets',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = (req.url || '').split('?')[0];
				if (!url.startsWith('/assets/')) return next();
				const file = normalize(join(DIR, decodeURIComponent(url.slice('/assets/'.length))));
				if (!file.startsWith(DIR) || !existsSync(file) || !statSync(file).isFile()) return next();
				res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
				res.setHeader('Cache-Control', 'no-cache');
				createReadStream(file).pipe(res);
			});
		}
	};
}
