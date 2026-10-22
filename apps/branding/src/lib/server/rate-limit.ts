/** 접수 레이트리밋 — packages/db/src/server/partner/seller.server.ts 의 rateLimit() 과 같은 방식(프로세스 메모리 · 서버리스 인스턴스마다 따로 센다).
 *  이 앱은 @sellery/* 를 쓰지 않는 독립 앱이라 import 하지 않고 복사했다. shop 의 /orders/lookup(IP 30분 5회)과 같은 기본값.
 *  메모리 기준이라 봇을 완전히 막지는 못하고 "같은 인스턴스에서 짧은 시간에 쏟아붓는 것"을 늦추는 용도 — 허니팟·길이 제한과 함께 쓴다. */
export const RL_WINDOW_MS = 30 * 60 * 1000;
export const RL_MAX = 5;
export const RATE_LIMIT_MESSAGE = '요청이 너무 많아요 — 잠시 후 다시 시도해주세요';

const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max = RL_MAX, windowMs = RL_WINDOW_MS): boolean {
	const now = Date.now();
	const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
	if (hits.length >= max) {
		buckets.set(key, hits);
		return false;
	}
	hits.push(now);
	buckets.set(key, hits);
	// 메모리 상한 — 오래된 키 정리
	if (buckets.size > 5_000) {
		for (const [k, v] of buckets) {
			if (v.length === 0 || now - v[v.length - 1] > windowMs) buckets.delete(k);
		}
	}
	return true;
}
