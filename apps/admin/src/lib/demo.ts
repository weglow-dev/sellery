/**
 * `(demo)` 라우트 그룹 — 프로토타입 관리자 데모 화면(localStorage · @sellery/core 상태)의 경로 표와 노출 조건
 * (docs/monorepo-migration.md 결정 C · 인플루언서 `apps/influencer/src/lib/demo.ts` · 브랜드 `apps/brand/src/lib/demo.ts` 와 같은 시그니처).
 * dev 서버 또는 `PUBLIC_DEMO=1` 일 때만 열린다 — 아니면 `(demo)/+layout.server.ts` 가 404, hooks 세션 게이트도 예외로 두지 않는다.
 * 순수 모듈 — hooks.server.ts 와 (demo)/+layout.server.ts 가 같이 쓴다.
 */

/**
 * 접두(`/admin`) 없는 데모 경로. 데모 대시보드만 `/demo` 로 옮겼고(콘솔 루트 `/` 는 `/home` 리다이렉트) 나머지는 원래 이름 그대로다 —
 * 콘솔(`/login` `/home` `/auth/*`)과 아직 겹치지 않는다. 콘솔이 같은 이름의 실제 화면을 만드는 단계에서 해당 데모 경로를
 * `/demo-*` 로 옮기고 이 표를 고친다(인플루언서 5단계가 `/sales` `/settle` 을, 브랜드 2단계가 `/demo-products` 를 뺀 것과 같은 규칙).
 */
export const DEMO_PATHS = ['/demo', '/products', '/influencers', '/brands', '/orders', '/match', '/revenue', '/settle', '/c', '/s'] as const;

export function isDemoPath(relPath: string): boolean {
	return DEMO_PATHS.some((p) => relPath === p || relPath.startsWith(`${p}/`));
}

/** `dev` = `$app/environment` 의 dev, `flag` = `$env/dynamic/public` 의 PUBLIC_DEMO */
export function demoEnabled(dev: boolean, flag: string | undefined): boolean {
	return dev || flag === '1';
}
