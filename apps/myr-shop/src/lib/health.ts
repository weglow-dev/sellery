/** `/api/health` 응답 조립 — 순수(테스트 src/test/health.test.ts). 검사 하나라도 fail 이면 503. 원인은 서버 로그에만 남기고 응답에는 ok/fail 만. */
export type Check = 'ok' | 'fail';
export type HealthChecks = { supabaseAdmin: Check };

export function healthBody(checks: HealthChecks): { status: 200 | 503; body: { ok: boolean; checks: HealthChecks } } {
	const ok = Object.values(checks).every((c) => c === 'ok');
	return { status: ok ? 200 : 503, body: { ok, checks } };
}
