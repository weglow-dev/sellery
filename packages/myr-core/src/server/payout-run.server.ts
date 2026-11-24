/**
 * MYR 토스 지급대행 자동 이체(0127 · 서버 전용) — 순수 흐름(payout-run.ts)에 DB(service role RPC) · 토스(지급대행 키)를 연결한다.
 * 부르는 곳: myr-shop 크론 /api/cron/payouts(영업일 13:05 송금) · /api/cron/payouts-check(매시간 결과 확인) · 웹훅 /api/payouts/webhook(payout.changed).
 * 키가 없으면(로컬 · Preview 에 지급대행 키 없음) 아무것도 하지 않는다 — NOT_CONFIGURED.
 */
import { applyPayoutWebhook, runPayoutCheck, runPayoutSend, type PayoutRunDeps, type PayoutRunResult } from '../payout-run';
import { createTossPayouts, isUncertainPayout } from '../toss-payouts-client';
import { admin } from './admin.server';
import { myrConfig } from './config.server';
import { hasTossPayouts } from './toss-payouts.server';

const api = createTossPayouts({ keys: () => ({ secretKey: myrConfig().tossPayoutSecretKey, securityKey: myrConfig().tossPayoutSecurityKey }) });

function deps(): PayoutRunDeps {
	return {
		rpc: async (fn, args) => {
			const { data, error } = await admin().rpc(fn, args);
			return { data, error: error ? { message: error.message } : null };
		},
		api,
		now: () => new Date(),
		uncertain: isUncertainPayout
	};
}

const notConfigured = (): PayoutRunResult => ({ ok: false, code: 'NOT_CONFIGURED', lines: [] });

/** 영업일 13:05 — 보낼 지급 건을 토스에 바로지급으로 요청(요청할 수 있는 시간 · 영업일은 DB 가 정한다) */
export const runPayoutSendCron = (): Promise<PayoutRunResult> => (hasTossPayouts() ? runPayoutSend(deps()) : Promise.resolve(notConfigured()));

/** 매시간 — 송금 중 · 결과 확인 필요 지급 건의 결과를 토스에서 다시 읽어 적는다 */
export const runPayoutCheckCron = (): Promise<PayoutRunResult> => (hasTossPayouts() ? runPayoutCheck(deps()) : Promise.resolve(notConfigured()));

/** 웹훅 payout.changed — 토스에 다시 조회해 적는다 */
export const handleTossPayoutChanged = (tossId: string): Promise<{ status: number; result: string }> =>
	hasTossPayouts() ? applyPayoutWebhook(deps(), tossId) : Promise.resolve({ status: 200, result: 'ignored: not configured' });
