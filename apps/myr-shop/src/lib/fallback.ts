/** 샵 데이터 폴백 규칙 — 순수(테스트 src/test/fallback.test.ts). `lib/server/db.ts` 가 쓴다.
 *  **목 데이터는 로컬 dev 서버에서만.** 운영·Preview 는 환경변수가 없든 RPC 가 실패하든 **빈 화면 + 에러 로그** — 가짜 상품이 운영에 뜨면 장애가 가려진다(2026-10-30 대표 결정). */
export type FallbackReason = 'no-env' | 'rpc-error';

/** 목 데이터로 떨어져도 되는가 — dev 에서만 true. 이유(reason)는 로그 문구용으로 받는다. */
export const useMock = (dev: boolean, _reason: FallbackReason): boolean => dev;

/** 로그 한 줄 — 운영은 error(눈에 띄게) · dev 는 warn(목으로 간다는 안내) */
export function fallbackLog(dev: boolean, reason: FallbackReason, detail = ''): { level: 'error' | 'warn'; message: string } {
	const what = reason === 'no-env' ? 'PUBLIC_SUPABASE_URL/ANON_KEY 가 비어 있음' : `RPC 실패${detail ? `: ${detail}` : ''}`;
	return dev
		? { level: 'warn', message: `[myr-shop] ${what} — dev 라 목 데이터로 렌더` }
		: { level: 'error', message: `[myr-shop] ${what} — 빈 화면으로 렌더(목 데이터는 dev 전용)` };
}
