/**
 * `(demo)` 라우트 그룹 — 프로토타입 브랜드 데모 화면(localStorage · @sellery/core 상태)의 경로 표와 노출 조건
 * (docs/brand-console-plan.md §2 · 인플루언서 `apps/influencer/src/lib/demo.ts` 와 같은 시그니처).
 * dev 서버 또는 `PUBLIC_DEMO=1` 일 때만 열린다 — 아니면 `(demo)/+layout.server.ts` 가 404, hooks 세션 게이트도 예외로 두지 않는다.
 * 순수 모듈 — hooks.server.ts · (demo)/+layout.server.ts · (demo)/+layout.svelte 가 같이 쓴다.
 */

/**
 * 접두(`/brand`) 없는 데모 경로. 콘솔과 겹치는 이름(`/` `/login` `/products` `/orders` `/cs` `/sales` `/settle` `/my`)은 `/demo-*` 로 옮겼다 —
 * 콘솔이 그 화면을 실제로 만드는 단계(2·4·5)에서 해당 `/demo-*` 항목을 지운다(인플루언서 5단계가 `/sales` `/settle` 을 뺀 것과 같은 규칙).
 * 2단계에서 `/demo-products` 를, 4단계에서 `/demo-orders` `/demo-cs` 를, 5단계에서 `/demo-sales` `/demo-settle` `/demo-my` 를 뺐다(실제 `(console)/orders` `/cs` `/sales` `/settle` `/my` — 데모의 `go.screen('orders'|'cs'|'sales'|'settle'|'my')` 는 콘솔 화면에 닿는다).
 */
export const DEMO_PATHS = [
	'/demo',
	'/demo-login',
	'/camps',
	'/dm',
	'/gallery',
	'/shop',
	'/c',
	'/s'
] as const;

/** core 의 `go.screen(k)` 가 말하는 화면 경로(`/products` …) → 데모 그룹의 실제 경로. 겹치지 않는 경로는 그대로. */
const DEMO_RENAMES: Record<string, string> = {
	'/': '/demo',
	'/login': '/demo-login'
};

export function demoPathOf(corePath: string): string {
	return DEMO_RENAMES[corePath] ?? corePath;
}

export function isDemoPath(relPath: string): boolean {
	return DEMO_PATHS.some((p) => relPath === p || relPath.startsWith(`${p}/`));
}

/** `dev` = `$app/environment` 의 dev, `flag` = `$env/dynamic/public` 의 PUBLIC_DEMO */
export function demoEnabled(dev: boolean, flag: string | undefined): boolean {
	return dev || flag === '1';
}
