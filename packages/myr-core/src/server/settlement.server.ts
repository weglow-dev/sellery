/**
 * MYR 정산 회차(서버 전용 · 0087) — 계산 · 확정은 DB `myr_settlement_run` 하나(백엔드 원칙 1). 크론(샵 /api/cron/settle)이 매월 1일 13:00(KST)에 지난달을 돌린다.
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
