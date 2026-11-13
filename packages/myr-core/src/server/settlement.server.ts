/**
 * MYR 정산 회차(서버 전용 · 0087) — 계산 · 확정은 DB `myr_settlement_run` 하나(백엔드 원칙 1).
 * 크론(샵 /api/cron/settle)은 매일 13:00(KST) 정산할 차례인 달(DB `myr_settlement_due` · 0106)을 돌린다 — 평소에는 1일에 지난달 · 실패하면 다음 날 따라잡는다.
 * 제조 원장이 없는 상품만 보류 — 운영이 원장을 넣고 `myr_settlement_confirm_held` 로 확정(어드민 전까지 packages/db/scripts/myr-settle.mjs).
 */
import {
	sellerSettlementsFromJson,
	settleItemsFromJson,
	settlePreviewFromJson,
	type SellerSettlements,
	type SettleItem,
	type SettlePreview
} from '../seller-settlement';
import { admin } from './admin.server';
import { logPaymentEvent } from './payment-events.server';

export type { SellerSettlements, SettleItem, SettlePreview } from '../seller-settlement';

export type SettlementRunResult =
	| { ok: true; already: boolean; month: string; rows?: number; confirmed?: number; held?: number; payout?: number }
	| { ok: false; code: string };

/** month = 'YYYY-MM-01' · actor = 'cron' | 'script' | 'admin:<uuid>' */
export async function runSettlement(month: string, actor: string): Promise<SettlementRunResult> {
	const { data, error } = await admin().rpc('myr_settlement_run', { p_month: month, p_actor: actor });
	if (error) {
		console.error('[settlement] run failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	return data as SettlementRunResult;
}

/** 정산할 차례인 달('YYYY-MM-01') — DB myr_settlement_due(0106 · 마지막 회차 다음 달 · 회차가 없으면 KST 지난달 · 그 달이 안 끝났으면 null) */
export async function settlementDue(): Promise<string | null> {
	const { data, error } = await admin().rpc('myr_settlement_due');
	if (error) throw new Error(`myr_settlement_due failed: ${error.message}`);
	return typeof data === 'string' ? data : null;
}

export type SettlementCronResult = SettlementRunResult | { ok: true; nothing: true };

/** 정산 크론 — month 를 주면 그 달(수동 실행 · 결과는 호출한 사람이 본다) · 안 주면 정산할 차례인 달 한 달(없으면 nothing).
 *  자동 실행이 실패하면 운영 할 일 목록(payment_events source 'settlement' · handled=false · 0106)에 남긴다 — 다음 날 크론이 같은 달을 다시 돈다 */
export async function runSettlementCron(month: string | null): Promise<SettlementCronResult> {
	if (month) return runSettlement(month, 'cron');
	let due: string | null;
	try {
		due = await settlementDue();
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error('[settlement] due failed:', message);
		await logSettlementFailure(null, 'DB_ERROR', message);
		return { ok: false, code: 'DB_ERROR' };
	}
	if (!due) return { ok: true, nothing: true };
	const r = await runSettlement(due, 'cron');
	if (!r.ok) await logSettlementFailure(due, r.code);
	return r;
}

async function logSettlementFailure(month: string | null, code: string, message?: string): Promise<void> {
	await logPaymentEvent(admin(), {
		source: 'settlement',
		event_type: 'settlement_run',
		payload: { month, code, ...(message ? { message } : {}) },
		handled: false,
		result: `error: settlement ${code}`
	});
}

/* ---------------- 크리에이터(0089) — 계정 id 는 콘솔 서버가 세션에서(결정 3) ---------------- */

/** 정산 탭 — 예상 · 제조 원장 · 월별 내역 · 크리에이터가 아닌 계정이면 빈 값 */
export async function getSellerSettlementsOfUser(userId: string): Promise<SellerSettlements> {
	const { data, error } = await admin().rpc('myr_app_seller_settlements_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_settlements_of_user failed: ${error.message}`);
	return sellerSettlementsFromJson(data);
}

/** 홈 — 다음 정산 예정(합계만) */
export async function getSellerSettlePreviewOfUser(userId: string): Promise<SettlePreview> {
	const { data, error } = await admin().rpc('myr_app_seller_settle_preview_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_settle_preview_of_user failed: ${error.message}`);
	return settlePreviewFromJson(data);
}

/** 월 내역 펼쳐 보기 — month 'YYYY-MM-01' */
export async function listSellerSettlementItemsOfUser(userId: string, month: string): Promise<SettleItem[]> {
	const { data, error } = await admin().rpc('myr_app_seller_settlement_items_of_user', { p_user: userId, p_month: month });
	if (error) throw new Error(`myr_app_seller_settlement_items_of_user failed: ${error.message}`);
	return settleItemsFromJson(data);
}

/** 다음 정산(예상)의 주문 줄 */
export async function listSellerSettlePreviewItemsOfUser(userId: string): Promise<SettleItem[]> {
	const { data, error } = await admin().rpc('myr_app_seller_settle_preview_items_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_settle_preview_items_of_user failed: ${error.message}`);
	return settleItemsFromJson(data);
}

/** 판매가 1개의 정산금 · 정산 비율(0092 myr_app_settlement_unit) — 정산 회차 · 예상과 같은 함수(비율 = platform_settings · 버림). 콘솔 상품 등록 · 로그인 소개. 실패면 null */
export async function settlementUnit(price: number): Promise<{ pct: number; amount: number } | null> {
	const { data, error } = await admin().rpc('myr_app_settlement_unit', { p_price: Number.isInteger(price) && price > 0 ? price : 0 });
	if (error) {
		console.error('[settlement] unit failed:', error.message);
		return null;
	}
	const r = data as { pct?: unknown; amount?: unknown } | null;
	return typeof r?.pct === 'number' && typeof r.amount === 'number' ? { pct: r.pct, amount: r.amount } : null;
}
