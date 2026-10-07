import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { TOSS_ID_RE } from '@sellery/payments/payout-rules';
import { handlePayoutChanged, handleSellerChanged } from '$lib/server/payments';

/**
 * POST /api/payouts/webhook — 토스 지급대행 웹훅 `seller.changed` · `payout.changed` (0040 · docs/deploy.md §5.3.1).
 *
 * `/api/payments/webhook` 과 같은 원칙: 지급대행 웹훅에도 서명이 없다 — 공개 엔드포인트이며 **id 재조회가 유일한 인증**이다. 본문의 상태값은 쓰지 않는다.
 *   1. 형식 검사(저장 전): 본문 ≤ 64KB · JSON · eventType ∈ {seller.changed, payout.changed} · data.id ^[A-Za-z0-9_-]{4,40}$ → 실패 400, 로그 없음
 *   2. GET /v2/sellers/{id} · GET /v2/payouts/{id} 재조회(`TOSS_PAYOUT_SECRET_KEY`) → 그 결과로만 app_partner_seller_sync · app_payout_sync_status(멱등 · payout_events 원문 기록은 함수 안)
 *   3. 모르는 셀러/지급(다른 상점 · 삭제됨) → 200 ignored. 재조회 실패(불명)만 502 — 토스가 재시도한다.
 * JSON 본문이라 SvelteKit 내장 CSRF 검사 대상이 아니다. 키가 없으면(Preview · 로컬) 재조회가 CONFIG_ERROR(4xx) → 200 ignored.
 */
export const config: Config = { maxDuration: 30 };

const MAX_BODY_BYTES = 64 * 1024;

function bad(): Response {
	return json({ ok: false, code: 'BAD_REQUEST', message: 'invalid webhook' }, { status: 400 });
}

export const POST: RequestHandler = async ({ request }) => {
	const declared = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad();
	let text: string;
	try {
		text = await request.text();
	} catch {
		return bad();
	}
	if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return bad();

	let body: { eventType?: unknown; data?: { id?: unknown } | null };
	try {
		const parsed: unknown = JSON.parse(text);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad();
		body = parsed as typeof body;
	} catch {
		return bad();
	}
	const eventType = typeof body.eventType === 'string' ? body.eventType : '';
	const id = body.data && typeof body.data === 'object' && typeof body.data.id === 'string' ? body.data.id : '';
	if (!id || !TOSS_ID_RE.test(id)) return bad();

	if (eventType === 'seller.changed') {
		const r = await handleSellerChanged({ id });
		return json({ ok: r.status < 500, result: r.result }, { status: r.status });
	}
	if (eventType === 'payout.changed') {
		const r = await handlePayoutChanged({ id });
		return json({ ok: r.status < 500, result: r.result }, { status: r.status });
	}
	return bad();
};
