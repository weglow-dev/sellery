import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminSettleFailMessage, rrnCsv } from '@sellery/db/admin/settle-rules';
import { requireAdmin } from '$lib/server/admin';
import { exportRrn } from '$lib/server/money';

/**
 * `GET /settle/rrn.csv?ids=<settlement id>&ids=…&purpose=…` — 원천징수(지급명세서) 자료 (docs/inf-console-plan.md §5.9 · 0013 · 0020 app_admin_rrn_export).
 * `exportRrn` 은 `RRN_ENC_KEY`(`$lib/server/money` 가 configureDb 에 주입)가 없으면 DB 를 부르지 않고 RRN_KEY_MISSING — 여기서 안내 문구로 응답(200 이 아닌 400).
 * 복호 호출마다 sensitive_access_log 가 남는다. 응답은 `Cache-Control: no-store` · 페이지 데이터에 싣지 않는다.
 */
export const GET: RequestHandler = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const ids = event.url.searchParams.getAll('ids').map((s) => s.trim()).filter(Boolean).slice(0, 500);
	const purpose = (event.url.searchParams.get('purpose') ?? '').trim().slice(0, 80) || '지급명세서';
	const plain = (text: string, code = 400) => new Response(text, { status: code, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' } });
	if (!ids.length) return plain('정산 건을 하나 이상 선택하세요');

	const actor = gate.ctx.user.email ?? gate.ctx.user.id;
	const res = await exportRrn(ids, { actor, purpose });
	if (!res.ok) return plain(adminSettleFailMessage(res.code), res.code === 'DB_ERROR' ? 500 : 400);

	const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
	return new Response(rrnCsv(res.rows), {
		status: 200,
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="sellery-rrn-${today}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
};
