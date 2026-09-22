import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminSettleFailMessage, payoutCsv } from '@sellery/db/admin/settle-rules';
import { requireAdmin } from '$lib/server/admin';
import { exportPayouts } from '$lib/server/money';

/**
 * `GET /settle/payouts/export.csv?status=pending|held|paid|all&purpose=…` — 이체 파일 (docs/admin-console-plan.md 결정 M6).
 * `exportPayouts`(0020 app_admin_payout_export) 가 계좌 **원문**을 돌려주고 지급건마다 sensitive_access_log(field 'bank_info' · actor · purpose) 를 남긴다 —
 * 그래서 purpose 는 필수(없으면 400 문구) 이고 응답은 `Cache-Control: no-store` · 페이지 데이터에 싣지 않는다. actor = 관리자 이메일(없으면 user id).
 * CSV 는 `payoutCsv`(BOM + CRLF · 계좌번호 `="…"`) — 엑셀에서 바로 열린다.
 */
export const GET: RequestHandler = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const status = (event.url.searchParams.get('status') ?? 'pending').trim().toLowerCase();
	const purpose = (event.url.searchParams.get('purpose') ?? '').trim().slice(0, 80);
	const plain = (text: string, code = 400) => new Response(text, { status: code, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' } });
	if (!purpose) return plain(adminSettleFailMessage('ACTOR_REQUIRED'));
	if (!['pending', 'held', 'paid', 'all'].includes(status)) return plain(adminSettleFailMessage('BAD_STATUS'));

	const actor = gate.ctx.user.email ?? gate.ctx.user.id;
	const res = await exportPayouts(status, { actor, purpose });
	if (!res.ok) return plain(adminSettleFailMessage(res.code), res.code === 'DB_ERROR' ? 500 : 400);

	const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
	return new Response(payoutCsv(res.rows), {
		status: 200,
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="sellery-payouts-${status}-${today}.csv"`,
			'cache-control': 'private, no-store',
			'x-sellery-logged': String(res.logged)
		}
	});
};
