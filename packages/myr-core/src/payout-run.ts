/**
 * MYR 토스 지급대행 자동 이체 흐름(0127 · docs/myr.md 7-7 8번) — 순수(DB · 토스는 인자로 받는다 · vitest).
 * 판정은 전부 DB(백엔드 원칙 1): 보낼 지급 건 · 요청 시간 · 잔액 · 하루 한도 · 참조 번호 · 멱등 키 · 토스 상태 → 결과 · 오류 코드 → 실패 종류 · 매시간 확인 대상.
 * 여기서는 순서만 — 목록 → 잔액 → 건마다 [시작 RPC → 토스 요청 → 결과 RPC]. 서버 연결은 server/payout-run.server.ts.
 *   지급 건마다 한 요청 — 토스는 요청 하나가 실패하면 그 요청 전체가 실패한다(실패가 다른 크리에이터에게 번지지 않게 · 시범운영 규모).
 *   결과를 모르면(5xx · 응답 없음) 'UNCERTAIN' 으로 적는다 → 결과 확인 필요(check) → 매시간 같은 멱등 키로 다시 요청(토스가 같은 결과를 돌려준다).
 *   웹훅 · 매시간 조회는 토스에 id 로 다시 조회한 지급 객체만 적는다(웹훅 본문의 상태는 쓰지 않는다 — 서명이 없다).
 */
import { buildTossPayoutItem, type TossPayout } from './toss-payout-rules';
import type { TossPayoutResult, TossPayoutsApi } from './toss-payouts-client';

export type PayoutRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type PayoutRunDeps = {
	rpc: PayoutRpc;
	api: Pick<TossPayoutsApi, 'getBalance' | 'requestPayouts' | 'getPayout'>;
	now: () => Date;
	/** 결과를 모를 때 판정 — 토스 호출 모듈의 isUncertainPayout(응답 없음 · 5xx) */
	uncertain: (res: { ok: boolean; status: number }) => boolean;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Obj => !!x) : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

/** 시작 RPC 가 정한 이번 시도 — 참조 번호(refPayoutId) · 멱등 키 · 토스 셀러 · 금액 · 토스가 받아 주면 남는 지급 가능 금액(서버 available_after) */
export type PayoutAttempt = { ref: string; key: string; tossSellerId: string; amount: number; availableAfter: number | null };
export function payoutAttemptFromJson(v: unknown): PayoutAttempt | null {
	const o = obj(v);
	const ref = str(o?.ref);
	const key = str(o?.key);
	const seller = str(o?.toss_seller_id);
	return o && ref && key && seller ? { ref, key, tossSellerId: seller, amount: num(o.amount), availableAfter: o.available_after == null ? null : num(o.available_after) } : null;
}

/** 결과 RPC 인자 — 토스 지급 객체(조회 · 요청 응답) 또는 요청 실패(오류 코드 · 모름) */
export type PayoutResultArgs = { p_ref: string; p_status: string | null; p_toss_id: string | null; p_code: string | null; p_error: Obj | null };
export function resultArgsOfPayout(ref: string, p: TossPayout): PayoutResultArgs {
	const code = str(p.error?.code);
	return { p_ref: ref, p_status: p.status, p_toss_id: p.id, p_code: code, p_error: p.error ? { code: p.error.code ?? null, message: p.error.message ?? null } : null };
}
export function resultArgsOfFailure(ref: string, res: { ok: false; status: number; body: { code: string; message: string } }, uncertain: boolean): PayoutResultArgs {
	return { p_ref: ref, p_status: null, p_toss_id: null, p_code: uncertain ? 'UNCERTAIN' : res.body.code, p_error: { code: res.body.code, message: res.body.message, http: res.status } };
}

/** accepted — 토스가 받아 줬나(서버 결과 RPC · 송금 중 · 완료) */
export type PayoutLine = { id: string; ref?: string; result: string; accepted?: boolean; kind?: string | null; code?: string | null };
export type PayoutRunResult = { ok: boolean; code?: string; lines: PayoutLine[] };

async function recordResult(deps: PayoutRunDeps, id: string, args: PayoutResultArgs, now: Date): Promise<PayoutLine> {
	const { data, error } = await deps.rpc('myr_payout_send_result', { ...args, p_now: now.toISOString() });
	if (error) return { id, ref: args.p_ref, result: 'db_error', code: error.message };
	const r = obj(data);
	return { id, ref: args.p_ref, result: str(r?.result) ?? str(r?.code) ?? 'unknown', accepted: r?.accepted === true, kind: str(r?.kind), code: args.p_code };
}

/** 한 시도를 토스에 보내고 결과를 적는다(송금 크론 · 매시간 다시 요청이 같이 쓴다 — 같은 참조 번호 · 같은 멱등 키) */
async function requestOne(deps: PayoutRunDeps, id: string, a: PayoutAttempt, now: Date): Promise<PayoutLine> {
	const built = buildTossPayoutItem({ refPayoutId: a.ref, tossSellerId: a.tossSellerId, amount: a.amount, scheduleType: 'EXPRESS' });
	if (!built.ok) return recordResult(deps, id, { p_ref: a.ref, p_status: null, p_toss_id: null, p_code: 'INVALID_PAYOUT_REQUEST', p_error: { code: built.code } }, now);
	const res: TossPayoutResult<{ items: TossPayout[] }> = await deps.api.requestPayouts([built.item], { idempotencyKey: a.key });
	if (!res.ok) return recordResult(deps, id, resultArgsOfFailure(a.ref, res, deps.uncertain(res)), now);
	// 참조 번호가 맞는 지급 객체만 이 건의 결과다 — 없거나 다른 지급뿐이면 처리 여부를 모른다(결과 확인 필요 · 새로 보내지 않고 같은 키로 다시 확인).
	//   다른 지급을 이 건으로 적으면 토스 id 가 엇갈려 매시간 확인이 엉뚱한 지급을 보고 지급 완료로 적거나 두 번 보낼 수 있다
	const p = res.body.items.find((x) => x.refPayoutId === a.ref);
	if (!p) {
		const code = res.body.items.length ? 'REF_MISMATCH_IN_RESPONSE' : 'NO_PAYOUT_IN_RESPONSE';
		return recordResult(deps, id, { p_ref: a.ref, p_status: null, p_toss_id: null, p_code: 'UNCERTAIN', p_error: { code, refs: res.body.items.map((x) => x.refPayoutId) } }, now);
	}
	return recordResult(deps, id, resultArgsOfPayout(a.ref, p), now);
}

/** 영업일 13:05 송금 크론 — 보낼 지급 건마다 시작(잔액 · 하루 한도 가드) → 토스 요청 → 결과. 잔액을 모르면 아무것도 보내지 않는다 */
export async function runPayoutSend(deps: PayoutRunDeps): Promise<PayoutRunResult> {
	const now = deps.now();
	const list = await deps.rpc('myr_payout_send_list', { p_now: now.toISOString() });
	if (list.error) return { ok: false, code: 'DB_ERROR', lines: [] };
	const rows = arr(list.data);
	if (!rows.length) return { ok: true, lines: [] };
	const bal = await deps.api.getBalance();
	if (!bal.ok) return { ok: false, code: 'BALANCE_UNKNOWN', lines: [] };
	let available = bal.body.availableAmount;
	const lines: PayoutLine[] = [];
	for (const row of rows) {
		const id = String(row.id);
		const begin = await deps.rpc('myr_payout_send_begin', { p_id: id, p_available: available, p_now: now.toISOString() });
		const b = obj(begin.data);
		if (begin.error || !b?.ok) {
			lines.push({ id, result: 'skipped', code: begin.error ? 'DB_ERROR' : (str(b?.code) ?? 'UNKNOWN') });
			continue;
		}
		const a = payoutAttemptFromJson(b);
		if (!a) {
			lines.push({ id, result: 'skipped', code: 'BAD_BEGIN' });
			continue;
		}
		const line = await requestOne(deps, id, a, now);
		// 토스가 받아 줬으면(서버 accepted) 다음 건 가드에는 서버가 준 남는 금액(available_after)을 넘긴다
		if (line.accepted && a.availableAfter != null) available = a.availableAfter;
		lines.push(line);
	}
	return { ok: true, lines };
}

/** 매시간 확인 — 송금 중(토스 id 로 조회) · 결과 확인 필요(같은 키로 다시 요청 · 요청할 수 있는 시간에만 목록에 나온다) */
export async function runPayoutCheck(deps: PayoutRunDeps): Promise<PayoutRunResult> {
	const now = deps.now();
	const list = await deps.rpc('myr_payout_check_list', { p_now: now.toISOString() });
	if (list.error) return { ok: false, code: 'DB_ERROR', lines: [] };
	const lines: PayoutLine[] = [];
	for (const row of arr(list.data)) {
		const id = String(row.id);
		const ref = str(row.ref);
		if (!ref) continue;
		const tossId = str(row.toss_payout_id);
		if (row.action === 'get' && tossId) {
			const res = await deps.api.getPayout(tossId);
			if (!res.ok) {
				// 조회가 안 되면 다음 시간에 다시(상태는 그대로) — 토스가 "없다"고 하면 실패로 적는다(재시도)
				if (deps.uncertain(res)) lines.push({ id, ref, result: 'skipped', code: res.body.code });
				else lines.push(await recordResult(deps, id, resultArgsOfFailure(ref, res, false), now));
				continue;
			}
			lines.push(await recordResult(deps, id, resultArgsOfPayout(ref, res.body), now));
			continue;
		}
		const a = payoutAttemptFromJson(row);
		if (!a) continue;
		lines.push(await requestOne(deps, id, a, now));
	}
	return { ok: true, lines };
}

/** 웹훅 payout.changed — 토스에 id 로 다시 조회한 지급 객체의 참조 번호로 적는다(우리가 보낸 지급만 · 같은 상점의 다른 서비스 지급은 NOT_FOUND → 무시) */
export async function applyPayoutWebhook(deps: PayoutRunDeps, tossId: string): Promise<{ status: number; result: string }> {
	const res = await deps.api.getPayout(tossId);
	if (!res.ok) return deps.uncertain(res) ? { status: 502, result: 'error: lookup failed' } : { status: 200, result: `ignored: lookup ${res.body.code}` };
	const ref = str(res.body.refPayoutId);
	if (!ref) return { status: 200, result: 'ignored: no ref' };
	const line = await recordResult(deps, ref, resultArgsOfPayout(ref, res.body), deps.now());
	if (line.result === 'db_error') return { status: 502, result: `error: ${line.code}` };
	if (line.result === 'NOT_FOUND') return { status: 200, result: 'ignored: unknown payout' };
	return { status: 200, result: `synced ${res.body.status} → ${line.result}` };
}
