// form action 규칙 — SvelteKit 은 이름 있는 액션과 `default` 를 같은 페이지에 둘 수 없다(섞으면 그 페이지 POST 가 전부 500).
// 2026-11-04 로그인(`default` + `forgot`)이 운영에서 500 을 낸 뒤 추가 — 라우트 파일을 글자로 읽어 검사한다(+page.server.ts 는 $app/$env 를 import 해서 직접 못 불러온다).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routes = join(dirname(fileURLToPath(import.meta.url)), '..', 'routes');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : n === '+page.server.ts' ? [join(d, n)] : []));

/** `export const actions … = { … };` 블록의 최상위 키 */
export function actionKeys(src: string): string[] {
	const m = src.match(/export const actions[^=]*=\s*\{([\s\S]*?)\n\};/);
	if (!m) return [];
	return [...m[1].matchAll(/^\t([A-Za-z_$][\w$]*)\s*:/gm)].map((x) => x[1]);
}

describe('form actions — default 와 이름 있는 액션을 섞지 않는다', () => {
	it('검사기 자체', () => {
		expect(actionKeys('export const actions: Actions = {\n\tdefault: async () => {},\n\tforgot: async () => {}\n};')).toEqual(['default', 'forgot']);
		expect(actionKeys('export const load = 1;')).toEqual([]);
	});
	it('콘솔의 모든 +page.server.ts', () => {
		const files = walk(routes);
		expect(files.length).toBeGreaterThan(0);
		for (const f of files) {
			const keys = actionKeys(readFileSync(f, 'utf8'));
			if (keys.includes('default')) expect(keys, relative(routes, f)).toEqual(['default']);
		}
	});
});
