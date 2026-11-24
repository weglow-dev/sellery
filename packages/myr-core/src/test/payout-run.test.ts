import { describe, expect, it } from 'vitest';
import { applyPayoutWebhook, payoutAttemptFromJson, runPayoutCheck, runPayoutSend, type PayoutRunDeps } from '../payout-run';
import type { TossPayout } from '../toss-payout-rules';

/** 가짜 DB · 토스 — 부른 순서 · 인자를 기록한다(판정은 DB 몫이라 여기서는 흐름만 본다) */
function fake(o: {
	list?: unknown[];
	check?: unknown[];
	begin?: (args: Record<string, unknown>) => unknown;
	result?: (args: Record<string, unknown>) => unknown;
	balance?: { ok: true; body: { availableAmount: number } } | { ok: false; status: number; body: { code: string; message: string } };
	request?: (items: { refPayoutId: string }[], key: string) => { ok: boolean; status: number; body: unknown };
	get?: (id: string) => { ok: boolean; status: number; body: unknown };
}) {
	const calls: { fn: string; args: Record<string, unknown> }[] = [];
	const deps: PayoutRunDeps = {
		rpc: async (fn, args) => {
			calls.push({ fn, args });
			if (fn === 'myr_payout_send_list') return { data: o.list ?? [], error: null };
			if (fn === 'myr_payout_check_list') return { data: o.check ?? [], error: null };
			if (fn === 'myr_payout_send_begin') return { data: o.begin?.(args) ?? null, error: null };
			if (fn === 'myr_payout_send_result') return { data: o.result?.(args) ?? { ok: true, result: 'sending', accepted: true }, error: null };
			return { data: null, error: { message: 'unknown rpc' } };
		},
		api: {
			getBalance: async () => {
				calls.push({ fn: 'toss.getBalance', args: {} });
				return (o.balance ?? { ok: true, status: 200, body: { availableAmount: 1_000_000, pendingAmount: 0, currency: 'KRW' } }) as never;
			},
			requestPayouts: async (items, opts) => {
				calls.push({ fn: 'toss.requestPayouts', args: { items, key: opts.idempotencyKey } });
				return (o.request?.(items as never, opts.idempotencyKey) ?? { ok: true, status: 200, body: { items: [], hasMore: false, nextCursor: null } }) as never;
			},
			getPayout: async (id) => {
				calls.push({ fn: 'toss.getPayout', args: { id } });
				return (o.get?.(id) ?? { ok: false, status: 404, body: { code: 'PAYOUT_NOT_FOUND', message: '' } }) as never;
			}
		},
		now: () => new Date('2039-02-03T04:05:00Z'),
		uncertain: (r) => !r.ok && (r.status === 0 || r.status >= 500)
	};
	return { deps, calls };
}
const payout = (ref: string, status: string, extra: Partial<TossPayout> = {}): TossPayout =>
	({ id: `tp_${ref}`, refPayoutId: ref, destination: 's', scheduleType: 'EXPRESS', payoutDate: null, amount: null, status, error: null, requestedAt: null, ...extra }) as TossPayout;
// 서버 시작 응답 — available_after(토스가 받아 주면 남는 지급 가능 금액)는 서버가 계산해 준다(가짜는 고정 값으로 흐름만 본다)
const beginOk = (args: Record<string, unknown>) => ({ ok: true, id: args.p_id, ref: `${args.p_id}-1`, key: `myr-po-${args.p_id}-1`, toss_seller_id: `seller_${args.p_id}`, amount: 30000, available_after: 970_000 });

describe('토스 지급대행 자동 이체 흐름(0127)', () => {
	it('보낼 지급 건이 없으면 잔액도 묻지 않는다', async () => {
		const { deps, calls } = fake({ list: [] });
		expect(await runPayoutSend(deps)).toEqual({ ok: true, lines: [] });
		expect(calls.map((c) => c.fn)).toEqual(['myr_payout_send_list']);
	});

	it('잔액을 모르면 아무것도 보내지 않는다(BALANCE_UNKNOWN)', async () => {
		const { deps, calls } = fake({ list: [{ id: 'a' }], balance: { ok: false, status: 500, body: { code: 'COMMON_ERROR', message: '' } } });
		expect((await runPayoutSend(deps)).code).toBe('BALANCE_UNKNOWN');
		expect(calls.some((c) => c.fn === 'myr_payout_send_begin')).toBe(false);
	});

	it('건마다 시작 → 바로지급 요청(참조 번호 · 멱등 키는 시작 RPC 값) → 결과 · 토스가 받아 주면(accepted) 다음 가드에 서버의 available_after', async () => {
		const { deps, calls } = fake({
			list: [{ id: 'a' }, { id: 'b' }],
			begin: beginOk,
			request: (items) => ({ ok: true, status: 200, body: { items: [payout(items[0].refPayoutId, 'REQUESTED')], hasMore: false, nextCursor: null } })
		});
		const r = await runPayoutSend(deps);
		expect(r.lines.map((l) => [l.id, l.result])).toEqual([['a', 'sending'], ['b', 'sending']]);
		const begins = calls.filter((c) => c.fn === 'myr_payout_send_begin').map((c) => c.args.p_available);
		expect(begins).toEqual([1_000_000, 970_000]);
		const req = calls.find((c) => c.fn === 'toss.requestPayouts')!.args as { items: { refPayoutId: string; destination: string; scheduleType: string; amount: { value: number } }[]; key: string };
		expect([req.items[0].refPayoutId, req.items[0].destination, req.items[0].scheduleType, req.items[0].amount.value, req.key]).toEqual(['a-1', 'seller_a', 'EXPRESS', 30000, 'myr-po-a-1']);
		const res = calls.find((c) => c.fn === 'myr_payout_send_result')!.args;
		expect([res.p_ref, res.p_status, res.p_toss_id, res.p_code]).toEqual(['a-1', 'REQUESTED', 'tp_a-1', null]);
	});

	it('토스가 받아 주지 않으면(실패 · 모름) 다음 가드에 처음 금액 그대로', async () => {
		const { deps, calls } = fake({
			list: [{ id: 'a' }, { id: 'b' }],
			begin: beginOk,
			request: () => ({ ok: false, status: 400, body: { code: 'EXCEEDED_PAYOUT_BALANCE_AMOUNT', message: '' } }),
			result: () => ({ ok: true, result: 'failed', accepted: false, kind: 'retry' })
		});
		await runPayoutSend(deps);
		expect(calls.filter((c) => c.fn === 'myr_payout_send_begin').map((c) => c.args.p_available)).toEqual([1_000_000, 1_000_000]);
	});

	it('시작 RPC 가 거절하면(가드) 토스를 부르지 않고 넘어간다', async () => {
		const { deps, calls } = fake({ list: [{ id: 'a' }], begin: () => ({ ok: false, code: 'BALANCE_EXCEEDED' }) });
		expect((await runPayoutSend(deps)).lines).toEqual([{ id: 'a', result: 'skipped', code: 'BALANCE_EXCEEDED' }]);
		expect(calls.some((c) => c.fn === 'toss.requestPayouts')).toBe(false);
	});

	it('요청 실패 — 5xx · 응답 없음은 UNCERTAIN(결과 확인 필요) · 4xx 는 토스 코드 그대로 · 성공인데 지급 객체가 없으면 UNCERTAIN', async () => {
		const codes: unknown[] = [];
		const run = async (request: () => { ok: boolean; status: number; body: unknown }) => {
			const { deps, calls } = fake({ list: [{ id: 'a' }], begin: beginOk, request });
			await runPayoutSend(deps);
			codes.push(calls.find((c) => c.fn === 'myr_payout_send_result')!.args.p_code);
		};
		await run(() => ({ ok: false, status: 500, body: { code: 'COMMON_ERROR', message: '' } }));
		await run(() => ({ ok: false, status: 0, body: { code: 'NETWORK', message: '' } }));
		await run(() => ({ ok: false, status: 400, body: { code: 'EXCEEDED_PAYOUT_BALANCE_AMOUNT', message: '' } }));
		await run(() => ({ ok: true, status: 200, body: { items: [], hasMore: false, nextCursor: null } }));
		expect(codes).toEqual(['UNCERTAIN', 'UNCERTAIN', 'EXCEEDED_PAYOUT_BALANCE_AMOUNT', 'UNCERTAIN']);
	});

	it('응답의 지급 객체 참조 번호가 이 건과 다르면 그 지급을 적지 않는다 — 결과 모름(토스 id · 상태를 싣지 않는다)', async () => {
		const { deps, calls } = fake({
			list: [{ id: 'a' }],
			begin: beginOk,
			request: () => ({ ok: true, status: 200, body: { items: [payout('someone-else-9', 'COMPLETED')], hasMore: false, nextCursor: null } }),
			result: () => ({ ok: true, result: 'check', accepted: false, kind: 'check' })
		});
		await runPayoutSend(deps);
		const res = calls.find((c) => c.fn === 'myr_payout_send_result')!.args;
		expect([res.p_ref, res.p_status, res.p_toss_id, res.p_code]).toEqual(['a-1', null, null, 'UNCERTAIN']);
		expect(res.p_error).toEqual({ code: 'REF_MISMATCH_IN_RESPONSE', refs: ['someone-else-9'] });
	});

	it('실패한 지급 객체 — 토스 error.code 를 결과 RPC 에 넘긴다(종류는 DB 가 정한다)', async () => {
		const { deps, calls } = fake({
			list: [{ id: 'a' }],
			begin: beginOk,
			request: (items) => ({ ok: true, status: 200, body: { items: [payout(items[0].refPayoutId, 'FAILED', { error: { code: 'INVALID_ACCOUNT_INFO', message: '계좌' } })], hasMore: false, nextCursor: null } }),
			result: () => ({ ok: true, result: 'failed', accepted: false, kind: 'account' })
		});
		const r = await runPayoutSend(deps);
		expect(r.lines[0]).toMatchObject({ result: 'failed', kind: 'account', code: 'INVALID_ACCOUNT_INFO' });
		expect(calls.find((c) => c.fn === 'myr_payout_send_result')!.args.p_error).toEqual({ code: 'INVALID_ACCOUNT_INFO', message: '계좌' });
	});

	it('매시간 확인 — 송금 중은 토스 id 로 조회 · 결과 모름은 같은 키로 다시 요청', async () => {
		const { deps, calls } = fake({
			check: [
				{ id: 'a', ref: 'a-1', key: 'myr-po-a-1', toss_payout_id: 'tp_a', toss_seller_id: 'sa', amount: 10000, action: 'get' },
				{ id: 'b', ref: 'b-2', key: 'myr-po-b-2', toss_payout_id: null, toss_seller_id: 'sb', amount: 20000, action: 'resend' }
			],
			get: () => ({ ok: true, status: 200, body: payout('a-1', 'COMPLETED') }),
			request: (items) => ({ ok: true, status: 200, body: { items: [payout(items[0].refPayoutId, 'IN_PROGRESS')], hasMore: false, nextCursor: null } }),
			result: (args) => ({ ok: true, result: args.p_status === 'COMPLETED' ? 'paid' : 'sending' })
		});
		const r = await runPayoutCheck(deps);
		expect(r.lines.map((l) => [l.id, l.result])).toEqual([['a', 'paid'], ['b', 'sending']]);
		expect(calls.find((c) => c.fn === 'toss.requestPayouts')!.args.key).toBe('myr-po-b-2');
		expect(calls.some((c) => c.fn === 'myr_payout_send_begin')).toBe(false);
	});

	it('매시간 확인 — 조회가 5xx 면 다음 시간에(상태 그대로 · 결과 RPC 안 부름)', async () => {
		const { deps, calls } = fake({
			check: [{ id: 'a', ref: 'a-1', key: 'k', toss_payout_id: 'tp_a', toss_seller_id: 's', amount: 1, action: 'get' }],
			get: () => ({ ok: false, status: 503, body: { code: 'COMMON_ERROR', message: '' } })
		});
		expect((await runPayoutCheck(deps)).lines).toEqual([{ id: 'a', ref: 'a-1', result: 'skipped', code: 'COMMON_ERROR' }]);
		expect(calls.some((c) => c.fn === 'myr_payout_send_result')).toBe(false);
	});

	it('웹훅 payout.changed — 다시 조회한 지급의 참조 번호로 적는다 · 우리 지급이 아니면 무시 · 조회 5xx 는 502(토스가 다시 보낸다)', async () => {
		const ok = fake({ get: () => ({ ok: true, status: 200, body: payout('a-1', 'COMPLETED') }), result: () => ({ ok: true, result: 'paid' }) });
		expect(await applyPayoutWebhook(ok.deps, 'tp_a')).toEqual({ status: 200, result: 'synced COMPLETED → paid' });
		expect(ok.calls.find((c) => c.fn === 'myr_payout_send_result')!.args.p_ref).toBe('a-1');
		const other = fake({ get: () => ({ ok: true, status: 200, body: payout('x-1', 'COMPLETED') }), result: () => ({ ok: false, code: 'NOT_FOUND' }) });
		expect(await applyPayoutWebhook(other.deps, 'tp_x')).toEqual({ status: 200, result: 'ignored: unknown payout' });
		const down = fake({ get: () => ({ ok: false, status: 502, body: { code: 'COMMON_ERROR', message: '' } }) });
		expect((await applyPayoutWebhook(down.deps, 'tp_a')).status).toBe(502);
		const noRef = fake({ get: () => ({ ok: true, status: 200, body: payout('', 'COMPLETED', { refPayoutId: null }) }) });
		expect(await applyPayoutWebhook(noRef.deps, 'tp_a')).toEqual({ status: 200, result: 'ignored: no ref' });
	});

	it('시작 응답 읽기 — 참조 번호 · 키 · 토스 셀러가 없으면 null', () => {
		expect(payoutAttemptFromJson({ ref: 'a-1', key: 'myr-po-a-1', toss_seller_id: 's', amount: '30000', available_after: 70000 })).toEqual({ ref: 'a-1', key: 'myr-po-a-1', tossSellerId: 's', amount: 30000, availableAfter: 70000 });
		expect(payoutAttemptFromJson({ ref: 'a-1', key: 'k' })).toBeNull();
	});
});
