import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { tossWebhookTarget } from '@sellery/myr-core/toss-payout-rules';
import { rateLimit } from '@sellery/myr-core/rate-limit';
import { hasAdmin } from '$lib/server/admin';
import { handleTossSellerChanged, hasTossPayouts } from '$lib/server/toss-sellers';

/**
 * POST /api/payouts/webhook — MYR 토스 지급대행 웹훅(0124 · docs/myr.md 7-7 5번). 셀러리 apps/shop 같은 경로를 복사(셀러리 코드는 복사만).
 *   지급대행 웹훅에는 서명이 없다 — 공개 엔드포인트이며 **id 재조회가 유일한 인증**이다. 본문의 상태값은 쓰지 않는다.
 *   1. 형식 검사(저장 전): 본문 ≤ 64KB · JSON · eventType ∈ {seller.changed, payout.changed} · entityBody.id 형식(tossWebhookTarget · TOSS_ID_RE) → 실패 400
 *      (토스 v2 본문은 { eventType, eventId, entityType, entityBody } — 2026-11-20 실측. 셀러리에서 복사한 data.id 가정으로 운영이 400 을 돌려줬다)
 *   2. seller.changed — GET /v2/sellers/{id} 재조회 → myr_app_seller_toss_status(MYR 이 등록한 셀러만 · 0124) → 0122 트리거가 지급 건을 다시 정한다
 *      payout.changed — 자동 이체(7-7 8번) 전이라 200 ignored(토스가 다시 보내지 않게)
 *   3. 모르는 셀러(같은 상점을 쓰는 다른 서비스 · 삭제됨) → 200 ignored · 재조회 불명만 502(토스가 다시 보낸다)
 * 같은 상점(시범운영 peerkeamf5)에 다른 서비스의 웹훅도 등록돼 있다 — 각자 모르는 셀러를 200 으로 넘긴다.
 * 레이트리밋: IP 당 1분 120번 → 429. 공개 주소라 아무 id 로 두드려 토스 조회(같은 상점을 쓰는 서비스와 나눠 쓰는 호출량)를 쓰지 못하게 —
 *   실제 토스 웹훅은 이보다 훨씬 적고, 막혀도 토스는 2xx 가 아니면 다시 보낸다. 함수 인스턴스 메모리 기준이라 느슨한 상한(rate-limit.ts).
 * 등록: 토스 개발자센터 → 지급대행 상점 웹훅 → https://myr-shop.vercel.app/api/payouts/webhook · seller.changed(자동 이체 때 payout.changed).
 */
export const config: Config = { maxDuration: 30 };

const MAX_BODY_BYTES = 64 * 1024;

function bad(): Response {
	return json({ ok: false, code: 'BAD_REQUEST', message: 'invalid webhook' }, { status: 400 });
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!rateLimit(`payouts-webhook:${getClientAddress()}`, 120, 60 * 1000)) return json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
	const declared = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad();
	let text: string;
	try {
		text = await request.text();
	} catch {
		return bad();
	}
	if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return bad();

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return bad();
	}
	const target = tossWebhookTarget(parsed);
	if (!target) return bad();

	if (target.eventType === 'payout.changed') return json({ ok: true, result: 'ignored: payouts not wired yet' });
	if (!hasAdmin() || !hasTossPayouts()) return json({ ok: true, result: 'ignored: not configured' });
	const r = await handleTossSellerChanged(target.id);
	if (r.status >= 500) console.error('[payouts/webhook] seller.changed', r.result);
	return json({ ok: r.status < 500, result: r.result }, { status: r.status });
};
