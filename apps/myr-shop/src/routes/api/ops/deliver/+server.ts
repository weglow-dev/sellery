import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { deliverMessage, parseDeliverInput } from '@sellery/myr-core/ship-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { deliverOrder, listUndelivered } from '$lib/server/ship';

/**
 * 운영 API — 배송 완료 수동 기록(0088 · 정산 0087 의 선행 조건). 운영 콘솔 전까지 `packages/db/scripts/myr-ops.mjs deliver · undelivered` 가 부른다.
 *   GET  ?days=5                     배송중으로 days 일 넘게 남은 줄 → { ok, lines }(이벗 등록 여부 · 택배 조회 링크)
 *   POST { orderCode, date? }        그 주문의 배송중 줄 → 배송 완료(date = 실제 배송일 YYYY-MM-DD · 없으면 지금) → { ok, already, orderCode, delivered, deliveredAt }
 * 자동으로 배송 완료를 찍지 않는다 — 운영이 택배사 조회로 확인한 뒤(2026-11-10 결정). 인증은 크론과 같은 `CRON_SECRET`.
 */
export const config: Config = { maxDuration: 30 };

export const GET: RequestHandler = async ({ request, url }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY', message: deliverMessage('NO_SERVICE_KEY') }, { status: 503 });
	const days = Math.min(365, Math.max(0, Number(url.searchParams.get('days') ?? 5) || 0));
	try {
		return json({ ok: true, days, lines: await listUndelivered(days) });
	} catch (e) {
		console.error('[ops/deliver] list failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR', message: deliverMessage('DB_ERROR') }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY', message: deliverMessage('NO_SERVICE_KEY') }, { status: 503 });
	const parsed = parseDeliverInput(await request.json().catch(() => null));
	if (!parsed.ok) return json({ ok: false, code: 'BAD_REQUEST', field: parsed.field, message: parsed.message }, { status: 400 });
	const r = await deliverOrder(parsed.input);
	if (!r.ok) return json({ ok: false, code: r.code, status: r.status, message: deliverMessage(r.code) }, { status: r.code === 'NOT_FOUND' ? 404 : r.code === 'DB_ERROR' ? 500 : 400 });
	return json(r);
};
