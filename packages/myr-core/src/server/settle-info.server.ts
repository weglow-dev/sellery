/**
 * 크리에이터 사업자 · 정산 정보(서버 전용 · 0085) — 계정 · 운영자 id 는 호출자가 서버 세션에서 정해 넘긴다(결정 3).
 * 크리에이터에게는 가린 값만(사업자번호 ***-**-12345 · 계좌 뒤 4자리). 원문은 운영 확인용(adminSettleInfos)만.
 */
import { settleInfoFromJson, type SettleInfo, type SettleSaveBody } from '../settle-info';
import { admin } from './admin.server';

export type { SettleInfo } from '../settle-info';

export async function getSettleInfoOfUser(userId: string): Promise<SettleInfo | null> {
	const { data, error } = await admin().rpc('myr_app_seller_settle_info_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_settle_info_of_user failed: ${error.message}`);
	return settleInfoFromJson(data);
}

export type SettleSaveResult = { ok: true; recheck: boolean; info: SettleInfo } | { ok: false; code: string };
export async function saveSettleInfoOfUser(userId: string, b: SettleSaveBody): Promise<SettleSaveResult> {
	const { data, error } = await admin().rpc('myr_app_seller_settle_info_save', {
		p_user: userId,
		p_company: b.company,
		p_ceo: b.ceo,
		p_biz_no: b.bizNo,
		p_bank: b.bank,
		p_account: b.account,
		p_holder: b.holder
	});
	if (error) {
		console.error('[settle-info] save failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = data as { ok?: boolean; code?: string; recheck?: boolean; info?: unknown } | null;
	const info = settleInfoFromJson(r?.info);
	if (!r?.ok || !info) return { ok: false, code: typeof r?.code === 'string' ? r.code : 'DB_ERROR' };
	return { ok: true, recheck: r.recheck === true, info };
}

/* ---------------- 운영(콘솔 전까지 myr-creators.mjs 가 같은 RPC 를 부른다) ---------------- */
export type AdminSettleInfo = {
	sellerId: string;
	name: string;
	handle: string;
	status: string;
	company: string | null;
	ceo: string | null;
	bizNo: string | null;
	bank: string | null;
	account: string | null;
	holder: string | null;
	taxEmail: string | null;
	note: string | null;
	submittedAt: string | null;
	checkedAt: string | null;
};
export async function adminSettleInfos(status: string | null = 'pending'): Promise<AdminSettleInfo[]> {
	const { data, error } = await admin().rpc('myr_app_admin_settle_infos', { p_status: status });
	if (error) throw new Error(`myr_app_admin_settle_infos failed: ${error.message}`);
	return (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
		sellerId: String(r.seller_id),
		name: String(r.name ?? ''),
		handle: String(r.handle ?? ''),
		status: String(r.status ?? ''),
		company: (r.company as string) ?? null,
		ceo: (r.ceo as string) ?? null,
		bizNo: (r.biz_no as string) ?? null,
		bank: (r.bank as string) ?? null,
		account: (r.account as string) ?? null,
		holder: (r.holder as string) ?? null,
		taxEmail: (r.tax_email as string) ?? null,
		note: (r.note as string) ?? null,
		submittedAt: (r.submitted_at as string) ?? null,
		checkedAt: (r.checked_at as string) ?? null
	}));
}
export async function adminCheckSettleInfo(sellerId: string, decision: 'verify' | 'reject', note: string | null, adminId: string | null): Promise<{ ok: boolean; code?: string; status?: string }> {
	const { data, error } = await admin().rpc('myr_app_admin_settle_info_check', { p_seller: sellerId, p_decision: decision, p_note: note, p_admin: adminId });
	if (error) return { ok: false, code: 'DB_ERROR' };
	return data as { ok: boolean; code?: string; status?: string };
}
