/* 배포 빌드: 앱 4개를 dist/<app> 로 빌드하고, 허브(hub/) 와 공용 assets/ 를 dist 루트에 놓는다.
   Vercel 은 vercel.json 의 buildCommand(npm run build) → outputDirectory(dist) 를 그대로 서빙한다. */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const APPS = ['influencer', 'brand', 'admin', 'shop'];

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const app of APPS) {
	console.log(`\n▶ build apps/${app}`);
	execSync('npm run build', { cwd: join(ROOT, 'apps', app), stdio: 'inherit' });
}

cpSync(join(ROOT, 'hub'), DIST, { recursive: true });
cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true, filter: (src) => !src.includes(`${join('assets', '_src')}`) });
console.log('\n✓ dist/ 준비 완료 —', APPS.map((a) => `/${a}`).join(' '), '+ / (허브) + /assets');
