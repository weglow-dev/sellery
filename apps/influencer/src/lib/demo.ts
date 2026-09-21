/**
 * `(demo)` 라우트 그룹 — 프로토타입 데모 화면(localStorage · @sellery/core 상태)의 경로 표와 노출 조건 (docs/monorepo-migration.md 결정 C · §5.1 "데모 화면").
 * dev 서버 또는 `PUBLIC_DEMO=1` 일 때만 열린다 — 아니면 `(demo)/+layout.server.ts` 가 404, hooks 세션 게이트도 예외로 두지 않는다.
 * 순수 모듈 — hooks.server.ts 와 (demo)/+layout.server.ts 가 같이 쓴다.
 */

/** 접두(`/influencer`) 없는 데모 경로. 콘솔에 같은 이름의 실제 화면이 생기면 그 항목을 여기서 지운다 — 5단계에서 `/sales` `/settle` 을 뺐다(실제 `(console)/sales` `(console)/settle`). */
export const DEMO_PATHS = ['/demo', '/demo-login', '/camps', '/dm', '/explore', '/rank', '/ref', '/shop', '/c', '/s'] as const;

export function isDemoPath(relPath: string): boolean {
	return DEMO_PATHS.some((p) => relPath === p || relPath.startsWith(`${p}/`));
}

/** `dev` = `$app/environment` 의 dev, `flag` = `$env/dynamic/public` 의 PUBLIC_DEMO */
export function demoEnabled(dev: boolean, flag: string | undefined): boolean {
	return dev || flag === '1';
}
