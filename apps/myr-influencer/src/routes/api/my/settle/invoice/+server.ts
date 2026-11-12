import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseTaxInvoiceBody, taxInvoiceMessage } from '@sellery/myr-core/tax-invoice';
import { submitTaxInvoiceOfUser } from '$lib/server/tax-invoice';
import { apiSeller } from '$lib/server/seller';

/**
 * 세금계산서 승인번호 제출(0104) — 정산 상세 `/settle/<월>` 의 세금계산서 칸이 부른다.
 *   POST { month: 'YYYY-MM', approvalNo } → { ok, invoice } · 실패 { ok:false, code, message }
 *   확인 중이면 고쳐 다시 낼 수 있다 · 확인 완료 · 지급 완료 뒤에는 거절(RPC 가 판정).
 * 크리에이터 · 계정은 세션에서만(결정 3).
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	const body = parseTaxInvoiceBody(await event.request.json().catch(() => null));
	if (!body) return json({ ok: false, code: 'BAD_REQUEST', message: taxInvoiceMessage('BAD_REQUEST') }, { status: 400 });
	const r = await submitTaxInvoiceOfUser(user.id, body.month, body.approvalNo);
	if (!r.ok) return json({ ok: false, code: r.code, message: taxInvoiceMessage(r.code) }, { status: r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : 400 });
	return json(r);
};
