// @ts-nocheck — vite 설정에서 불러오는 개발용 스크립트 (svelte-check 대상 아님)
/* 개발 서버 전용: apps/shop/static 의 공용 정적 자산(/assets/* · /email/* · /favicon.svg)을 4 앱 dev 서버에서 서빙한다.
   이미지·파비콘은 4 앱이 같은 파일을 쓰지만 도메인 루트(/assets/…)로 참조되므로 루트를 받는 shop 앱의 static/ 한 곳에만 둔다
   (docs/monorepo-migration.md §1.4). 프로덕션은 같은 도메인이라 shop 이 그대로 서빙하고, 앱별 Preview URL 에서는 404 → 이모지 폴백. */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIR = join(ROOT, 'apps', 'shop', 'static');
const PREFIXES = ['/assets/', '/email/'];
const FILES = ['/favicon.svg'];
const MIME = { '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

export function rootAssets() {
	return {
		name: 'sellery-root-assets',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = (req.url || '').split('?')[0];
				if (!PREFIXES.some((p) => url.startsWith(p)) && !FILES.includes(url)) return next();
				const file = normalize(join(DIR, decodeURIComponent(url)));
				if (!file.startsWith(DIR) || !existsSync(file) || !statSync(file).isFile()) return next();
				res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
				res.setHeader('Cache-Control', 'no-cache');
				createReadStream(file).pipe(res);
			});
		}
	};
}
