/** 접수 레이트리밋 — packages/db/src/server/partner/seller.server.ts 의 rateLimit() 과 같은 방식(프로세스 메모리 · 서버리스 인스턴스마다 따로 센다).
 *  이 앱은 @sellery/* 를 쓰지 않는 독립 앱이라 import 하지 않고 복사했다. shop 의 /orders/lookup(IP 30분 5회)과 같은 기본값.
 *  메모리 기준이라 봇을 완전히 막지는 못하고 "같은 인스턴스에서 짧은 시간에 쏟아붓는 것"을 늦추는 용도 — 허니팟·길이 제한과 함께 쓴다.
 *
 *  "확인"과 "기록"을 나눈 이유(2026-10-26): 제출 횟수가 아니라 **실제로 접수된 횟수**만 세기 위해서다.
 *  연락처 오타(400)나 슬랙 장애(502)로 돌려받은 시도까지 세면 오타 5번에 30분 차단이고, 통신사 CGNAT 는 한 IP 를 수십 명이 같이 쓰므로
 *  남이 틀린 횟수로 내가 막힌다. 호출자는 검증 뒤 isRateLimited() 로 막고, 슬랙 전송이 성공한 뒤 countHit() 으로 기록한다. */
export const RL_WINDOW_MS = 30 * 60 * 1000;
export const RL_MAX = 5;
export const RATE_LIMIT_MESSAGE = '요청이 너무 많아요 — 잠시 후 다시 시도해주세요';

const buckets = new Map<string, number[]>();

/** 창 안의 기록만 남기고 돌려준다 */
function recent(key: string, now: number, windowMs: number): number[] {
	const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
	buckets.set(key, hits);
	return hits;
}

/** 창 안에 max 번 이상 기록됐으면 true — 기록하지 않는다 */
export function isRateLimited(key: string, max = RL_MAX, windowMs = RL_WINDOW_MS): boolean {
	return recent(key, Date.now(), windowMs).length >= max;
}

/** 한 번 기록 — 접수가 실제로 끝났을 때만 부른다 */
export function countHit(key: string, windowMs = RL_WINDOW_MS): void {
	const now = Date.now();
	recent(key, now, windowMs).push(now);
	// 메모리 상한 — 오래된 키 정리
	if (buckets.size > 5_000) {
		for (const [k, v] of buckets) {
			if (v.length === 0 || now - v[v.length - 1] > windowMs) buckets.delete(k);
		}
	}
}
