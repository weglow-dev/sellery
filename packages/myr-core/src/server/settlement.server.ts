/**
 * MYR 정산 회차(서버 전용 · 0087) — 계산 · 확정은 DB `myr_settlement_run` 하나(백엔드 원칙 1). 크론(샵 /api/cron/settle)이 매월 1일 13:00(KST)에 지난달을 돌린다.
 * 제조 원장이 없는 상품만 보류 — 운영이 원장을 넣고 `myr_settlement_confirm_held` 로 확정(어드민 전까지 packages/db/scripts/myr-settle.mjs).
 */
import { admin } from './admin.server';

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
