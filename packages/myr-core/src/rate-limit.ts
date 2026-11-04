/**
 * 메모리 레이트리밋 — packages/db partner/seller.server.ts rateLimit 복사(샵 lib/server/rate-limit.ts 에서 옮김 · 2026-11-04 콘솔 초대 화면도 쓴다).
 * 프로세스(함수 인스턴스) 기준이라 느슨한 상한이다. 순수 — DB·환경 없음.
 */
const RL_WINDOW_MS = 30 * 60 * 1000;
const RL_MAX = 20;
const buckets = new Map<string, number[]>();

/** `key` 의 최근 windowMs 호출이 max 건 이상이면 false. 통과 시 이번 호출을 기록 */
export function rateLimit(key: string, max = RL_MAX, windowMs = RL_WINDOW_MS, now = Date.now()): boolean {
	const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
	if (hits.length >= max) {
		buckets.set(key, hits);
		return false;
	}
	hits.push(now);
	buckets.set(key, hits);
	if (buckets.size > 5_000) for (const [k, v] of buckets) if (v.length === 0 || now - v[v.length - 1] > windowMs) buckets.delete(k);
	return true;
}
