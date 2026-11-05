// form action 규칙 — SvelteKit 은 이름 있는 액션과 `default` 를 같은 페이지에 둘 수 없다(섞으면 그 페이지 POST 가 전부 500).
// 2026-11-04 로그인(`default` + `forgot`)이 운영에서 500 을 낸 뒤 추가 — 라우트 파일을 글자로 읽어 검사한다(+page.server.ts 는 $app/$env 를 import 해서 직접 못 불러온다).
// 파일은 Vite 의 import.meta.glob(?raw)로 읽는다 — node:fs 는 앱 svelte-check 에 Node 타입이 없어서 쓰지 않는다.
import { describe, expect, it } from 'vitest';

const files = import.meta.glob<string>('../routes/**/+page.server.ts', { query: '?raw', import: 'default', eager: true });

/** `export const actions … = { … };` 블록의 최상위 키 */
function actionKeys(src: string): string[] {
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
		const entries = Object.entries(files);
		expect(entries.length).toBeGreaterThan(3);
		expect(entries.some(([, src]) => actionKeys(src).length > 0)).toBe(true); // 실제로 액션 블록을 읽고 있는지
		for (const [path, src] of entries) {
			const keys = actionKeys(src);
			if (keys.includes('default')) expect(keys, path).toEqual(['default']);
		}
	});
});

// 칸에서 Enter = 폼의 첫 번째 제출 버튼. 로그인 폼에서 그게 "비밀번호 찾기"(formaction ?/forgot)면 Enter 가 재설정 메일을 보낸다(2026-11-05 실제 발생)
const loginPage = import.meta.glob<string>('../routes/login/+page.svelte', { query: '?raw', import: 'default', eager: true });
describe('로그인 폼 — Enter 는 로그인', () => {
	it('폼의 첫 번째 type="submit" 버튼에 formaction 이 없다', () => {
		const src = Object.values(loginPage)[0] ?? '';
		const form = src.slice(src.indexOf('<form'), src.indexOf('</form>'));
		const first = form.match(/<button[^>]*type="submit"[^>]*>/);
		expect(first, '제출 버튼이 있어야 한다').not.toBeNull();
		expect(first![0]).not.toContain('formaction');
	});
});
