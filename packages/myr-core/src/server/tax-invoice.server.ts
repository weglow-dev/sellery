/**
 * 세금계산서 제출(서버 전용 · 0104) — 크리에이터 계정 id 는 콘솔 서버가 세션에서 정해 넘긴다(결정 3).
 * 합계 · 상태 · 제출 가능 판정은 DB `myr_app_seller_tax_invoice_submit` 하나(백엔드 원칙 1). 운영 확인은 콘솔 전까지 packages/db/scripts/myr-settle.mjs.
 */
import { taxInvoiceFromJson, type TaxInvoice } from '../tax-invoice';
import { admin } from './admin.server';

export type { TaxInvoice } from '../tax-invoice';

export type TaxInvoiceSubmitResult = { ok: true; invoice: TaxInvoice } | { ok: false; code: string };

/** month = 'YYYY-MM-01' · approvalNo = 크리에이터가 적은 그대로(서버가 정리 · 형식 검사) */
export async function submitTaxInvoiceOfUser(userId: string, month: string, approvalNo: string): Promise<TaxInvoiceSubmitResult> {
	const { data, error } = await admin().rpc('myr_app_seller_tax_invoice_submit', { p_user: userId, p_month: month, p_approval_no: approvalNo });
	if (error) {
		console.error('[tax-invoice] submit failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = data as { ok?: boolean; code?: string; invoice?: unknown } | null;
	const invoice = taxInvoiceFromJson(r?.invoice);
	if (!r?.ok || !invoice) return { ok: false, code: typeof r?.code === 'string' ? r.code : 'DB_ERROR' };
	return { ok: true, invoice };
}
