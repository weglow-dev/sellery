/** 서버 흉내 — UI 단계라 지급 · 세금계산서 · 크리에이터 판정과 동작을 여기서 대신한다(메모리 · 새로고침하면 시드로).
 *  기능 단계에서 이 파일은 RPC 호출로 바뀌고 판정은 DB 함수가 한다(0102 보류 이유 · 0104 세금계산서 · 0111 이체 상태 — docs/myr-admin-plan.md).
 *  화면(routes · components)은 여기서 받은 이름 · 칩 · 안내 · 버튼 목록 · 건수만 그린다 — 화면에서 상태를 다시 판정하지 않는다. */
import { products } from './products.svelte';
import { cs } from './cs.svelte';
import { orders } from './orders.svelte';
import { settle } from './settle.svelte';
import { talk } from './talk.svelte';
import { NOW, ME, OTHER_COUNTS, seedCreators, seedPayouts, seedProvider, seedTaxes } from './seed';
import type {
	Chip,
	CreatorRaw,
	CreatorTab,
	CreatorView,
	FailKind,
	HoldKind,
	HomeChip,
	HomeRow,
	HomeCycle,
	HomeStep,
	NavBadge,
	PayoutAction,
	PayoutRaw,
	PayoutTab,
	PayoutView,
	TaxRaw,
	TaxView,
	Tone
} from './types';

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
/** 목의 오늘 · 10월분 정산 계산일 — 지급 완료 기록 날짜 거절 */
export const TODAY = '2026-11-17';
const SETTLED_ON = '2026-11-01';
const stamp = () => `11월 17일 ${NOW.time}`;
const me = () => `${ME.role} ${ME.name}`;
/** 다음 실행일 — 토스 바로지급은 영업일만(주말 · 공휴일 건너뜀) */
const runDay = () => (NOW.beforeRun ? '오늘' : NOW.nextBizDay);

/** 용어집(§1-3) — 운영 콘솔 이름 */
export const FAIL_META: Record<FailKind, { label: string; tone: Tone; what: string; auto: string }> = {
	check: { label: '결과 확인 필요', tone: 'red', what: '하루 넘게 확인했지만 은행이 답을 안 줘요', auto: '지급대행에 확인하고 지급 완료 기록으로 남겨요' },
	ops: { label: '운영 조치 필요', tone: 'red', what: '이체 한도 초과 같은 운영 쪽 문제예요', auto: '다시 보내지 않아요 · 한도를 조정한 뒤 다시 보내요' },
	account: { label: '계좌 확인 필요', tone: 'red', what: '예금주 불일치 · 없는 계좌예요', auto: '크리에이터가 계좌를 다시 입력하고 확인되면 다음 자동 이체(영업일 오후 1시)에 보내요' },
	retry: { label: '재시도 대기', tone: 'orange', what: '은행 점검처럼 잠깐 안 됐어요', auto: '다음 자동 이체(영업일 오후 1시)에 다시 보내요' }
};
const HOLD_LABEL: Record<HoldKind, string> = { ops: '운영팀 확인 중', settle: '사업자 · 정산 정보 확인 전', toss: '토스 본인인증 전', tax: '세금계산서 확인 전' };
const HOLD_ORDER: HoldKind[] = ['ops', 'settle', 'toss', 'tax'];
/** 토스 바로지급(EXPRESS) 접수 시간 밖에 [다시 보내기]를 누르면 — 영업일 08:00~15:00 만 받는다 */
const EXPRESS_CLOSED = '토스 바로지급은 영업일 오전 8시~오후 3시에만 받아요';
const SETTLE_CHIP: Record<CreatorRaw['settle'], Chip> = {
	none: { label: '미입력', tone: 'grey' },
	wait: { label: '확인 대기', tone: 'orange' },
	ok: { label: '확인 완료', tone: 'mint' },
	redo: { label: '다시 입력 요청', tone: 'red' }
};
/** 사업자 정보는 확인됐지만 토스 본인인증 전 — 크리에이터 목록 칩(확인 완료 대신) */
const TOSS_CHIP: Chip = { label: '토스 인증 대기', tone: 'red' };
const TAX_CHIP: Record<TaxRaw['status'], Chip> = {
	none: { label: '제출 전', tone: 'grey' },
	chk: { label: '확인 중', tone: 'orange' },
	ok: { label: '확인 완료', tone: 'mint' },
	redo: { label: '다시 제출 필요', tone: 'red' }
};

class MockServer {
	creatorsRaw = $state<CreatorRaw[]>(seedCreators());
	payoutsRaw = $state<PayoutRaw[]>(seedPayouts());
	taxesRaw = $state<TaxRaw[]>(seedTaxes());
	provider = $state(seedProvider());

	// ───────── 판정(서버 함수 자리) ─────────

	private creator(id: string) {
		return this.creatorsRaw.find((c) => c.id === id)!;
	}
	/** 토스 본인인증 전 — 사업자 정보는 확인됐고 토스 셀러가 APPROVAL_REQUIRED · KYC_REQUIRED(지급 보류 이유 · 크리에이터 탭이 같이 쓴다) */
	private tossPending(c: CreatorRaw) {
		return c.settle === 'ok' && (c.toss === 'APPROVAL_REQUIRED' || c.toss === 'KYC_REQUIRED');
	}
	private taxOf(creatorId: string) {
		return this.taxesRaw.find((t) => t.creatorId === creatorId) ?? null;
	}

	/** 보류 이유 — 운영 보류 → 사업자 정보 → 토스 본인인증 → 세금계산서 순(0102 myr_payout_hold_reasons 자리).
	 *  토스 본인인증 전 = 토스 셀러가 APPROVAL_REQUIRED · KYC_REQUIRED — 그대로 보내면 토스가 FORBIDDEN_SELLER_PAYOUT 으로 거절(묶음 전체 실패)이라 실행에 담지 않는다.
	 *  사업자 정보 확인 전이면 아직 토스 등록 전이라 사업자 정보 이유만 */
	private holdKinds(p: PayoutRaw): HoldKind[] {
		if (!p.amount || p.paid) return [];
		const c = this.creator(p.creatorId);
		const k: HoldKind[] = [];
		if (p.opsHold) k.push('ops');
		if (c.settle !== 'ok') k.push('settle');
		else if (this.tossPending(c)) k.push('toss');
		if (this.taxOf(p.creatorId)?.status !== 'ok') k.push('tax');
		return k;
	}

	/** [다시 보내기] 막힘 — 토스 바로지급 접수 시간 밖이면 문구 · 아니면 null */
	get resendClosed(): string | null {
		return NOW.expressOpen ? null : EXPRESS_CLOSED;
	}

	/** 다음 실행 계획 — 보낼 수 있는 건(재시도 대기 → 지급 대기 · 오래 기다린 순)을 토스 지급 가능 금액(available) 안에서만 담는다.
	 *  안 들어가는 건은 실패가 아니라 지급 대기 그대로 — 토스 정산 뒤 다음 영업일에 보낸다(운영 할 일 없음) */
	private get runPlan() {
		const due = this.payoutsRaw.filter((p) => p.amount && !p.paid && !p.sending && !this.holdKinds(p).length && (!p.fail || p.fail.kind === 'retry'));
		let left = this.provider.available;
		const send: string[] = [];
		const defer: string[] = [];
		for (const p of [...due.filter((x) => x.fail), ...due.filter((x) => !x.fail)]) {
			if (p.amount <= left) {
				send.push(p.id);
				left -= p.amount;
			} else defer.push(p.id);
		}
		return { send, defer };
	}

	payoutView = (p: PayoutRaw): PayoutView => {
		const c = this.creator(p.creatorId);
		const holds = p.paid || p.sending ? [] : this.holdKinds(p);
		const fail = p.paid || p.sending ? null : p.fail;
		const tabs: PayoutTab[] = [];
		const chips: Chip[] = [];
		let note: string | null = null;
		let noteTone: Tone = 'plain';
		const actions: PayoutAction[] = [];
		let nextTry: string | null = null;
		// 토스 지급 가능 금액이 모자라 이번 실행에서 빠지는 건 — 다음 영업일(오늘 실행 전이면 NOW.nextBizDay)
		const deferred = this.runPlan.defer.includes(p.id);
		const deferDay = NOW.nextBizDay;
		const deferNote = `토스 지급 가능 금액이 모자라 ${deferDay} 오후 1시에 보내요 · 토스 정산이 들어오면 자동으로`;

		if (!p.amount) {
			tabs.push('none');
			chips.push({ label: '지급 없음', tone: 'grey' });
			note = '정산금이 전부 제조금액 상계에 쓰였어요';
		} else if (p.paid) {
			tabs.push('paid');
			chips.push({ label: '지급 완료', tone: 'grey' });
			note = `${p.paid.at} · ${p.paid.by}`;
			if (p.paid.manual) actions.push('cancelPaid');
		} else if (p.sending) {
			tabs.push('sending');
			chips.push({ label: '송금 중', tone: 'mint' });
			// 은행 답 없음은 바로 결과 확인 필요로 보내지 않는다 — 웹훅을 기다리며 매시간 자동 확인 · 24시간이 지나도 모르면 운영에게(§11)
			const nr = p.sending.noReply;
			note = nr ? `은행이 아직 답을 안 줬어요 · ${nr.waited} · 매시간 자동으로 확인해요 · 다음 확인 ${nr.nextCheck}` : `은행 처리 중이에요 · ${p.sending.at} 보냄`;
			noteTone = nr ? 'orange' : 'mint';
		} else {
			if (fail) {
				tabs.push('fail');
				chips.push({ label: FAIL_META[fail.kind].label, tone: FAIL_META[fail.kind].tone });
			}
			if (holds.length) {
				tabs.push('hold');
				chips.push({ label: '지급 보류', tone: 'red' });
			}
			// 계좌 실패 뒤 계좌를 다시 내서 정산 정보 확인 대기(보류 이유 = 사업자 정보뿐)면 계좌 안내가 먼저
			const acctOnly = fail?.kind === 'account' && holds.length === 1 && holds[0] === 'settle';
			if (fail && holds.length && !acctOnly) {
				note = '보류 중이라 자동으로 다시 보내지 않아요';
				noteTone = 'red';
			} else if (fail) {
				if (fail.kind === 'check') {
					note = `${fail.why} · 지급대행에 확인하고 지급 완료 기록으로 남겨요`;
					noteTone = 'red';
				} else if (fail.kind === 'retry') {
					nextTry = `${deferred ? deferDay : runDay()} 오후 1시`;
					note = deferred ? `${p.tries}번 시도 · ${deferNote}` : `${p.tries}번 시도 · ${nextTry}에 자동으로 다시 보내요`;
					noteTone = 'orange';
				} else if (fail.kind === 'account') {
					note = c.settle === 'wait' ? '크리에이터가 계좌를 다시 입력했어요 — 정산 정보를 확인하면 다음 자동 이체(영업일 오후 1시)에 보내요' : '크리에이터가 계좌를 다시 입력해야 해요';
					noteTone = c.settle === 'wait' ? 'orange' : 'red';
				} else {
					note = `${fail.why} · 조치한 뒤 다시 보내거나 다음 자동 이체를 기다려요`;
					noteTone = 'red';
				}
			} else if (holds.length) {
				note = holds.includes('ops')
					? (p.opsHold?.memo ?? null)
					: holds.length === 1 && holds[0] === 'toss'
						? '크리에이터가 토스 본인인증을 하면 자동으로 지급 대기가 돼요'
						: '정보가 확인되면 자동으로 지급 대기가 돼요';
				noteTone = holds.includes('ops') ? 'red' : 'plain';
			} else {
				tabs.push('ready');
				chips.push({ label: '지급 대기', tone: 'mint' });
				note = deferred ? deferNote : `${runDay()} 오후 1시에 자동으로 보내요`;
				noteTone = deferred ? 'orange' : 'mint';
			}

			// 줄 끝 버튼 — §11-1 (실패 버튼이 먼저 · 보류 중이면 다시 보내기 없음)
			// 결과 확인 필요 — 다시 보내기 없음 · 지급 완료 기록이 주 버튼(맨 앞에 두면 버튼으로 보인다)
			if (fail?.kind === 'check') actions.push('record');
			if (fail?.kind === 'ops' && !holds.length) actions.push('resend');
			if (fail?.kind === 'account' || holds.includes('settle') || holds.includes('toss')) actions.push('openCreator');
			if (holds.includes('ops')) actions.push('release');
			if (holds.includes('tax')) actions.push('openTax');
			if (!holds.includes('ops') && (tabs.includes('ready') || fail?.kind === 'retry')) actions.push('hold');
			if (fail?.kind === 'ops') actions.push('record');
		}

		const left = holds.filter((h) => h !== 'ops');
		return {
			...p,
			name: c.name,
			handle: c.handle,
			initial: c.initial,
			avatarBg: c.avatarBg,
			tabs,
			failKind: fail?.kind ?? null,
			holdKinds: holds,
			chips,
			holdText: holds.length ? holds.map((h) => HOLD_LABEL[h]).join(' · ') : null,
			note,
			noteTone,
			nextTry,
			actions,
			releaseLeft: holds.includes('ops') && left.length ? `해제해도 ${left.map((h) => HOLD_LABEL[h]).join(' · ')}이라 계속 보류돼요` : null,
			taxId: this.taxOf(p.creatorId)?.id ?? null,
			linesText: `${p.lines.length}줄${p.lines.some((l) => l.month.includes('보류 해제')) ? ' · 지난 달 보류분 포함' : ''}`
		};
	};

	/** 지급 목록 — 실패(결과 확인 → 운영 조치 → 계좌 → 재시도) · 보류 · 대기 · 송금 중 · 완료 · 없음 순 */
	get payouts(): PayoutView[] {
		const rank = (v: PayoutView) => {
			const f: Record<FailKind, number> = { check: 0, ops: 1, account: 2, retry: 3 };
			if (v.failKind) return f[v.failKind];
			const order: PayoutTab[] = ['hold', 'ready', 'sending', 'paid', 'none'];
			return 4 + order.indexOf(v.tabs[0]);
		};
		return this.payoutsRaw.map(this.payoutView).sort((a, b) => rank(a) - rank(b));
	}

	payoutTabs() {
		const v = this.payouts;
		const n = (t: PayoutTab) => v.filter((x) => x.tabs.includes(t)).length;
		const fk = (k: FailKind) => v.filter((x) => x.failKind === k).length;
		const hk = (k: HoldKind) => v.filter((x) => x.holdKinds.includes(k)).length;
		return {
			tabs: [
				{ id: 'fail', name: '지급 실패', count: n('fail'), hot: n('fail') > 0 },
				{ id: 'hold', name: '지급 보류', count: n('hold') },
				{ id: 'ready', name: '지급 대기', count: n('ready') },
				{ id: 'sending', name: '송금 중', count: n('sending') },
				{ id: 'paid', name: '지급 완료', count: n('paid') },
				{ id: 'none', name: '지급 없음', count: n('none') },
				{ id: 'all', name: '전체', count: v.length }
			],
			subs: {
				fail: (['check', 'ops', 'account', 'retry'] as FailKind[]).map((k) => ({ id: k, name: FAIL_META[k].label, count: fk(k), tone: FAIL_META[k].tone })),
				hold: HOLD_ORDER.map((k) => ({ id: k, name: HOLD_LABEL[k], count: hk(k), tone: 'red' as Tone }))
			},
			defaultTab: n('fail') ? 'fail' : 'hold'
		};
	}

	/** 영업일 오후 1시 자동 이체 — 다음 실행에 나갈 건 = 지급 대기 + 재시도 대기(보류 없는 것) 중 토스 지급 가능 금액 안에 드는 것(runPlan).
	 *  잔액은 충전하는 돈이 아니라 토스 정산대금이라 평소엔 홈에 보이지 않고, 모자라서 빠지는 건이 있을 때만 deferText(주황 · 운영 할 일 없음) */
	get schedule() {
		const plan = this.runPlan;
		const v = this.payouts.filter((x) => plan.send.includes(x.id));
		const d = this.payouts.filter((x) => plan.defer.includes(x.id));
		const sum = v.reduce((a, x) => a + x.amount, 0);
		const { available, pending } = this.provider;
		return {
			n: v.length,
			sum,
			sumText: won(sum),
			availableText: won(available),
			pendingText: won(pending),
			deferN: d.length,
			deferText: d.length
				? `토스 지급 가능 금액(${won(available)})이 모자라 ${d.map((x) => `${x.name} ${won(x.amount)}`).join(' · ')}은 토스 정산 뒤 ${NOW.nextBizDay} 오후 1시에 보내요 · 정산 전 ${won(pending)}`
				: null,
			title: '영업일 오후 1시 자동 이체',
			rule: '정산이 확정된 뒤 세금계산서까지 확인된 지급 건을 영업일 오후 1시에 보내요 · 주말 · 공휴일은 다음 영업일',
			when: NOW.beforeRun ? `다음 실행 오늘 오후 1시 · ${NOW.runLeft}` : `오늘 실행 끝 · 다음 실행 ${NOW.nextBizDay} 오후 1시`,
			namesText: v.length ? `이번에 보낼 건 · ${v.map((x) => x.name).join(' · ')}` : '이번에 보낼 건이 없어요',
			lastRunText: (({ n, ok, fail, unknown }) => `${n}건 중 성공 ${ok} · 실패 ${fail}${unknown ? ` · 결과 모름 ${unknown}` : ''}`)(this.provider.lastRun),
			lastRunBad: this.provider.lastRun.fail + this.provider.lastRun.unknown > 0,
			names: v.map((x) => x.name)
		};
	}

	get monthSummary() {
		const v = this.payouts.filter((x) => x.amount);
		const total = v.reduce((a, x) => a + x.amount, 0);
		const paid = v.filter((x) => x.tabs.includes('paid'));
		return {
			month: '10월분',
			totalText: won(total),
			paidN: paid.length,
			n: v.length,
			failN: v.filter((x) => x.tabs.includes('fail')).length,
			holdN: v.filter((x) => x.tabs.includes('hold')).length,
			sendingN: v.filter((x) => x.tabs.includes('sending')).length,
			readyN: v.filter((x) => x.tabs.includes('ready')).length
		};
	}

	selection(ids: string[]) {
		const v = this.payouts.filter((x) => ids.includes(x.id));
		return {
			n: v.length,
			sumText: won(v.reduce((a, x) => a + x.amount, 0)),
			canHold: v.length > 0 && v.every((x) => x.actions.includes('hold')),
			canResend: v.length > 0 && v.every((x) => x.failKind === 'ops' && x.actions.includes('resend'))
		};
	}

	taxView = (t: TaxRaw): TaxView => {
		const c = this.creator(t.creatorId);
		const p = this.payoutsRaw.find((x) => x.id === t.payoutId)!;
		const pv = this.payoutView(p);
		const blocked = t.status === 'chk' && t.sentTotal !== null ? `낸 합계 ${won(t.sentTotal)} · 지금 합계 ${won(t.total)} — 다시 발행을 요청하세요` : null;
		let confirmNote: string | null = null;
		let confirmNoteTone: Tone = 'mint';
		if (t.status === 'chk' && !blocked) {
			const otherHold = pv.holdKinds.filter((h) => h !== 'tax');
			if (otherHold.length) {
				confirmNote = `확인해도 ${otherHold.map((h) => HOLD_LABEL[h]).join(' · ')}이라 계속 보류돼요`;
				confirmNoteTone = 'orange';
			} else confirmNote = `지금 확인하면 ${runDay()} 오후 1시 지급`;
		}
		const actions: TaxView['actions'] = [];
		if (t.status === 'chk' && !blocked) actions.push('confirm');
		if (t.status === 'chk' || (t.status === 'ok' && !p.paid && !p.sending)) actions.push('redo');
		return {
			...t,
			name: c.name,
			handle: c.handle,
			initial: c.initial,
			avatarBg: c.avatarBg,
			firm: c.biz?.firm ?? '—',
			bizNo: c.biz?.bizNo ?? '',
			bizNoMasked: c.biz?.bizNoMasked ?? '—',
			chip: TAX_CHIP[t.status],
			payChips: pv.chips,
			confirmNote,
			confirmNoteTone,
			blocked,
			actions
		};
	};

	get taxes(): TaxView[] {
		return this.taxesRaw.map(this.taxView);
	}

	taxTabs() {
		const v = this.taxesRaw;
		const n = (s: TaxRaw['status']) => v.filter((t) => t.status === s).length;
		return [
			{ id: 'chk', name: '확인 중', count: n('chk') },
			{ id: 'redo', name: '다시 제출 필요', count: n('redo') },
			{ id: 'ok', name: '확인 완료', count: n('ok') },
			{ id: 'none', name: '제출 전', count: n('none') }
		];
	}

	creatorView = (c: CreatorRaw): CreatorView => {
		const ps = this.payoutsRaw.filter((p) => p.creatorId === c.id).map(this.payoutView);
		const acctFail = ps.find((p) => p.failKind === 'account');
		const toss = this.tossPending(c);
		const tabs: CreatorTab[] = [toss ? 'toss' : c.settle, ...(c.active ? [] : ['stopped' as const])];
		let payNote: string | null = null;
		let payNoteTone: Tone = 'orange';
		if (acctFail && c.settle === 'wait') payNote = '계좌 확인 필요로 이체 실패 · 확인하면 다음 자동 이체(영업일 오후 1시)에 다시 보내요';
		else if (acctFail) {
			payNote = '계좌 확인 필요로 이체 실패 · 크리에이터가 계좌를 다시 입력해야 해요';
			payNoteTone = 'red';
		} else if (c.settle !== 'ok' && ps.some((p) => p.holdKinds.includes('settle'))) payNote = '이 정보가 확인돼야 지급 보류가 풀려요';
		else if (ps.some((p) => p.holdKinds.includes('toss'))) {
			// 토스 셀러 APPROVAL_REQUIRED · KYC_REQUIRED — 운영 할 일 없음 · 크리에이터가 인증하면 웹훅(seller.changed)으로 풀린다
			payNote = '토스 본인인증 전이라 지급 보류 · 크리에이터가 인증하면 자동으로 지급 대기가 돼요';
			payNoteTone = 'red';
		}
		return {
			...c,
			settleChip: toss ? TOSS_CHIP : SETTLE_CHIP[c.settle],
			stopChip: c.active ? null : { label: '정지', tone: 'red' },
			stopNote: c.active || !c.stop ? null : `${c.stop.at} 정지 · ${c.stop.by} · ${c.stop.why}`,
			payNote,
			payNoteTone,
			verifyNote: acctFail
				? '확인하면 계좌 확인 필요 실패가 풀려 다음 자동 이체(영업일 오후 1시)에 새 계좌로 보내요'
				: '확인하면 사업자 정보 때문에 걸린 지급 보류가 풀려요(다른 이유가 있으면 계속 보류)',
			tabs,
			payouts: ps.map((p) => ({ id: p.id, month: p.month, amount: p.amount, chips: p.chips, holdText: p.holdText, paidAt: p.paid?.at ?? null }))
		};
	};

	get creators(): CreatorView[] {
		const rank: Record<CreatorTab, number> = { wait: 0, redo: 1, none: 2, toss: 3, ok: 4, stopped: 5 };
		return this.creatorsRaw.map(this.creatorView).sort((a, b) => rank[a.tabs[0]] - rank[b.tabs[0]]);
	}

	creatorTabs() {
		const v = this.creators;
		const n = (t: CreatorTab) => v.filter((c) => c.tabs.includes(t)).length;
		return [
			{ id: 'wait', name: '확인 대기', count: n('wait') },
			{ id: 'redo', name: '다시 입력 요청', count: n('redo') },
			{ id: 'none', name: '미입력', count: n('none') },
			{ id: 'toss', name: '토스 인증 대기', count: n('toss') },
			{ id: 'ok', name: '확인 완료', count: n('ok') },
			{ id: 'stopped', name: '정지', count: n('stopped') },
			{ id: 'all', name: '전체', count: this.creatorsRaw.length }
		];
	}

	// ───────── 크리에이터(§5 · 시안 "MYR Admin PC" · "MYR Admin" 크리에이터 · 2026-11-25) ─────────

	/** 대기 = 정지 아니고 사업자 · 정산 정보가 확인 전이거나 토스 인증이 남은 크리에이터(목록 대기 탭) */
	private crPending = (c: CreatorRaw) => c.active && (c.settle !== 'ok' || c.toss === 'APPROVAL_REQUIRED' || c.toss === 'KYC_REQUIRED');
	private crTs(c: CreatorRaw): 'ok' | 'limited' | 'ci' | 'kyc' | 'none' {
		return c.toss === 'APPROVED' ? 'ok' : c.toss === 'PARTIALLY_APPROVED' ? 'limited' : c.toss === 'APPROVAL_REQUIRED' ? 'ci' : c.toss === 'KYC_REQUIRED' ? 'kyc' : 'none';
	}
	private crBizChip(c: CreatorRaw): Chip {
		return ({ ok: { label: '확인 완료', tone: 'grey' }, wait: { label: '확인 대기', tone: 'orange' }, redo: { label: '다시 입력 요청', tone: 'red' }, none: { label: '미입력', tone: 'red' } } as Record<CreatorRaw['settle'], Chip>)[c.settle];
	}
	private crTsChip(c: CreatorRaw): Chip {
		return ({ ok: { label: '토스 지급 가능', tone: 'grey' }, limited: { label: '토스 지급 가능', tone: 'grey' }, ci: { label: '토스 본인인증 대기', tone: 'orange' }, kyc: { label: '토스 추가 인증 필요', tone: 'red' }, none: { label: '토스 셀러 등록 전', tone: 'grey' } } as Record<string, Chip>)[this.crTs(c)];
	}
	private crJoined = (c: CreatorRaw) => c.joinedAt.replace(/^\d{4}년\s*/, '');

	/** 목록 탭 3개 — 전체 · 대기 · 정지 */
	crTabs() {
		const v = this.creatorsRaw;
		return [
			{ id: 'all' as const, name: '전체', count: v.length },
			{ id: 'wait' as const, name: '대기', count: v.filter(this.crPending).length },
			{ id: 'stopped' as const, name: '정지', count: v.filter((c) => !c.active).length }
		];
	}

	/** 목록 표 — 크리에이터(아바타 · 이름 · 핸들) · 상태 칩(없으면 "정상") · 채널 · 상품 · 가입일 */
	crList(tab: 'all' | 'wait' | 'stopped') {
		const inTab = { all: () => true, wait: this.crPending, stopped: (c: CreatorRaw) => !c.active }[tab];
		const rows = this.creatorsRaw.filter(inTab).map((c) => {
			const ts = this.crTs(c);
			const biz = this.crBizChip(c);
			const chips: Chip[] = [...(c.settle === 'ok' ? [] : [{ ...biz, label: `사업자 정보 ${biz.label}` }]), ...(ts === 'ci' || ts === 'kyc' ? [this.crTsChip(c)] : []), ...(c.active ? [] : [{ label: '정지', tone: 'red' } as Chip])];
			const ps = products.byCreator(c.id);
			return { id: c.id, initial: c.initial, avatarBg: c.avatarBg, name: c.name, handle: c.handle, channel: c.channel ?? '인스타그램', chips, prod: `판매 중 ${ps.live}개 · 전체 ${ps.total}개`, joined: this.crJoined(c), href: `/creators/${c.id}` };
		});
		return { rows, empty: { all: '크리에이터가 없어요', wait: '확인이나 인증을 기다리는 크리에이터가 없어요', stopped: '정지한 크리에이터가 없어요' }[tab] };
	}

	/** 상세 — 머리 칩 · 기본 정보 · 사업자 · 정산 정보 · 토스 지급대행 · 상품 · 지급 이력 · 활동 · 오른쪽(판매 중 상품 · 안내 · 버튼) */
	crDetail(id: string) {
		const c = this.creatorsRaw.find((x) => x.id === id);
		if (!c) return null;
		const ts = this.crTs(c);
		const ps = products.byCreator(c.id);
		const TS = { ok: ['지급 가능', '한도 없음', 'plain'], limited: ['지급 가능', '7일에 1,000만 원까지', 'plain'], ci: ['본인인증 대기', '인증 전에는 지급할 수 없어요', 'orange'], kyc: ['추가 인증 필요', '인증 전에는 지급할 수 없어요', 'red'], none: ['셀러 등록 전', '—', 'grey'] }[ts] as [string, string, Tone | 'plain'];
		const pays = this.payoutsRaw.filter((p) => p.creatorId === c.id).map(this.payoutView);
		return {
			id: c.id,
			name: c.name,
			handle: c.handle,
			initial: c.initial,
			avatarBg: c.avatarBg,
			headChips: [c.active ? ({ label: '활성', tone: 'mint' } as Chip) : ({ label: '정지', tone: 'red' } as Chip), this.crBizChip(c), ...(ts === 'ci' || ts === 'kyc' ? [this.crTsChip(c)] : [])],
			liveText: `판매 중 상품 ${ps.live}개`,
			basic: { name: `${c.name} ${c.handle}`, channel: c.channel ?? '인스타그램', phone: { masked: c.phoneMasked, raw: c.phoneMasked.replace('****', '2048') }, joined: this.crJoined(c) },
			biz: {
				chip: this.crBizChip(c),
				info: c.biz ? { firm: c.biz.firm, bizNo: { masked: c.biz.bizNoMasked, raw: c.biz.bizNo }, owner: c.biz.owner, email: c.biz.email, account: { masked: c.biz.accountMasked, raw: `${c.biz.bank} ${c.biz.account}` }, submittedAt: c.biz.submittedAt } : null,
				note:
					c.settle === 'wait'
						? (c.resubmitNote ?? '새로 제출한 정보예요 · 확인해 주세요')
						: c.settle === 'redo'
							? `다시 입력 요청 사유 | ${c.redoWhy ?? ''}`
							: !c.biz
								? '아직 사업자, 정산 정보를 입력하지 않았어요 · 크리에이터 콘솔 내 정보에서 입력해요 · 입력 전까지 지급 보류예요'
								: null,
				noteGrey: !c.biz
			},
			toss: c.biz
				? {
						chip: this.crTsChip(c),
						state: { text: TS[0], tone: TS[2] },
						limit: ts === 'ok' || ts === 'limited' ? null : TS[1],
						note: { ci: '토스 본인인증 전이라 지급 보류, 크리에이터가 인증하면 자동으로 지급 대기가 돼요', kyc: '최근 7일 지급액이 1,000만 원을 넘었어요 · 추가 인증(KYC)을 마치기 전까지 지급이 모두 막혀요', none: '크리에이터가 정산 정보를 넣으면 토스에 셀러로 등록되고 본인인증 문자가 나가요', ok: null, limited: null }[ts]
					}
				: null,
			products: ps.rows,
			payouts: pays.map((p) => ({ id: p.id, month: p.month, reason: p.holdText ?? '—', reasonRed: !!p.holdText, chip: p.chips[0], amountText: won(p.amount), href: `/payouts?tab=all&id=${p.id}` })),
			activity: [
				{ at: this.crJoined(c), text: '초대 링크로 가입했어요', who: '' },
				...(c.biz ? [{ at: c.biz.submittedAt, text: '사업자 · 정산 정보를 제출했어요', who: '' }] : []),
				...c.log
			],
			sideNote: c.settle === 'wait' ? '사업자 정보가 확인돼야 지급 보류가 풀려요' : null,
			can: { verify: c.settle === 'wait', kyc: ts === 'kyc', stop: c.active, restore: !c.active },
			stopNote: '정지하면 크리에이터의 판매 중인 상품이 모두 내려가고, 로그인할 수 없어요',
			talkHref: `/talk?cr=${c.id}`
		};
	}

	// ───────── 홈 · 메뉴 숫자(배지 = 홈 숫자 · §1-1) ─────────

	get counts() {
		const v = this.payouts;
		const fk = (k: FailKind) => v.filter((x) => x.failKind === k);
		const tx = this.taxesRaw;
		return {
			check: fk('check'),
			ops: fk('ops'),
			account: fk('account'),
			retry: fk('retry').length,
			hold: v.filter((x) => x.tabs.includes('hold')),
			sending: v.filter((x) => x.tabs.includes('sending')).length,
			taxChk: this.taxes.filter((t) => t.status === 'chk'),
			taxOverdue: tx.filter((t) => t.overdue).length,
			taxRedo: tx.filter((t) => t.status === 'redo').length,
			settleWait: this.creatorsRaw.filter((c) => c.settle === 'wait').length,
			/** 정산 정보 확인 대기 중 계좌 확인 필요 실패가 걸린 크리에이터 — 확인하면 다음 자동 이체(영업일 오후 1시)에 다시 보낸다 */
			settleAcct: fk('account').filter((p) => this.creator(p.creatorId).settle === 'wait').length
		};
	}

	get nav(): Record<string, NavBadge> {
		const c = this.counts;
		const o = OTHER_COUNTS;
		return {
			products: { n: products.counts.newReview + products.counts.revReview, hot: false },
			creators: { n: c.settleWait + o.creators.inviteAsk, hot: false },
			orders: { n: orders.counts.ebutFail, hot: orders.counts.ebutFail > 0 },
			cs: { n: cs.counts.inqOpen + cs.counts.refundRetry + cs.counts.pickup, hot: cs.counts.inqLate + cs.counts.refundRetry + cs.counts.pickupFail + cs.counts.creatorLate > 0 },
			talk: { n: talk.counts.waiting, hot: false },
			settle: { n: products.counts.noLedger + settle.counts.heldLines, hot: false },
			payouts: { n: c.check.length + c.ops.length + c.account.length, hot: c.check.length + c.ops.length + c.account.length > 0 },
			tax: { n: c.taxChk.length + c.taxOverdue, hot: c.taxOverdue > 0 }
		};
	}

	/** 홈(시안 "MYR Admin" · "MYR Admin PC" 홈 · 2026-11-24) — 화면은 이 값만 그린다.
	 *  ① 히어로: 10월분 아직 지급하지 않은 금액 · 지급 합계 · 지급 완료 · 운영 확인 필요 · 토스 지급 가능 잔액(다음 실행에 보낼 금액보다 적으면 "₩○ 모자라요") · 들어올 예정
	 *  ② 세금계산서 확인 대기(확인하면 다음 자동 이체에 지급) · 심사 대기 상품
	 *  ③ 처리할 일 — 메뉴 8줄 고정 순서 · 빨강 칩 수 = 급한 일
	 *  ④ 정산 일정 — 회차 둘(10월분 지급 흐름 · 11월분 확정 전) × 4단계 · 단계 상태 끝남 · 진행 중 · 아직 */
	get home() {
		const c = this.counts;
		const o = OTHER_COUNTS;
		const pc = products.counts;
		const v = this.payouts.filter((x) => x.amount);
		const paid = v.filter((x) => x.tabs.includes('paid'));
		const total = v.reduce((a, x) => a + x.amount, 0);
		const done = paid.reduce((a, x) => a + x.amount, 0);
		const opsN = c.check.length + c.ops.length;
		const plan = this.runPlan;
		// 다음 실행에 보내야 할 금액(지급 가능 안에 든 것 + 모자라 넘어가는 것) — 잔액과 비교
		const due = this.payoutsRaw.filter((p) => plan.send.includes(p.id) || plan.defer.includes(p.id)).reduce((a, p) => a + p.amount, 0);
		const { available, pending } = this.provider;
		const short = Math.max(0, due - available);
		const payDay = NOW.beforeRun ? '오늘' : '다음 영업일';
		const tx = this.taxesRaw;
		const late = tx.filter((t) => t.status === 'none' || t.status === 'redo').length;
		const chk = c.taxChk.length;

		const chip = (label: string, n: number, tone: HomeChip['tone'], href: string): HomeChip | null => (n ? { label, n, tone, href } : null);
		const row = (key: string, name: string, icon: string, href: string, chips: (HomeChip | null)[]): HomeRow => {
			const cs = chips.filter((x): x is HomeChip => !!x);
			return { key, name, icon, href, chips: cs, tone: cs.some((x) => x.tone === 'red') ? 'red' : cs.some((x) => x.tone === 'orange') ? 'orange' : 'grey' };
		};
		const rows: HomeRow[] = [
			row('products', '상품', 'm_products', '/products', [
				chip('신규 심사', pc.newReview, 'orange', '/products?tab=review'),
				chip('수정 심사', pc.revReview, 'orange', '/products?tab=review')
			]),
			row('orders', '주문 · 배송', 'm_orders', '/orders', [
				chip('이벗 발주 실패', orders.counts.ebutFail, 'red', '/orders?tab=paid'),
				chip('배송 완료 예외', orders.counts.noDelivered, 'orange', '/orders?tab=shipping')
			]),
			row('cs', 'CS', 'm_claims', '/cs', [
				chip('환불 다시 필요', cs.counts.refundRetry, 'red', '/cs?tab=refund'),
				chip('회수 접수 실패', cs.counts.pickupFail, 'red', '/cs?tab=collect'),
				chip('회수 확인 필요', cs.counts.pickup - cs.counts.pickupFail, 'orange', '/cs?tab=collect'),
				chip('자동 발송', cs.counts.resend, 'grey', '/cs?tab=exchanges')
			]),
			row('talk', '파트너팀 톡', 'm_talk', '/talk', [chip('답할 차례', talk.counts.waiting, 'orange', '/talk?tab=wait')]),
			row('creators', '크리에이터', 'm_creators', '/creators', [
				chip('사업자 · 정산 정보 확인 대기', c.settleWait, 'orange', '/creators?tab=wait'),
				chip('토스 인증 대기', this.creators.filter((x) => x.tabs.includes('toss')).length, 'grey', '/creators?tab=wait')
			]),
			row('settle', '정산', 'm_settle', '/settle', [
				chip('제조금액 미입력', pc.noLedger, 'orange', '/settle?tab=none'),
				chip('보류된 정산', settle.counts.heldLines, 'orange', '/settle')
			]),
			row('payouts', '지급', 'm_payouts', '/payouts', [
				chip('운영 확인 필요', opsN, 'red', '/payouts?tab=fail'),
				chip('계좌 확인 필요', c.account.length, 'orange', '/payouts?tab=fail&sub=account'),
				chip('재시도 대기', c.retry, 'grey', '/payouts?tab=fail&sub=retry'),
				chip('지급 보류', c.hold.length, 'grey', '/payouts?tab=hold')
			]),
			row('tax', '세금계산서', 'm_tax', '/tax', [
				chip('기한 지남', late, 'red', tx.some((t) => t.status === 'none') ? '/tax?tab=none' : '/tax?tab=redo'),
				chip('확인 대기', chk, 'orange', '/tax?tab=chk')
			])
		];
		const hot = rows.reduce((a, r) => a + r.chips.filter((x) => x.tone === 'red').length, 0);

		// 정산 일정 — 10월분 지급 흐름(지급 건이 있는 크리에이터 기준)
		const conf = v.length;
		const txs = tx.filter((t) => v.some((p) => p.creatorId === t.creatorId));
		const sub = txs.filter((t) => t.status !== 'none').length;
		const okN = txs.filter((t) => t.status === 'ok').length;
		const heldN = settle.counts.heldLines;
		const exc = opsN + c.account.length + c.retry;
		const pct = (a: number, b: number) => Math.round((a / (b || a || 1)) * 100);
		const curSteps: Omit<HomeStep, 'state' | 'pill'>[] = [
			{ no: '1', title: '정산 확정', when: '11월 1일 오후 1시 · 자동', val: String(conf), of: '건', pct: 100, desc: heldN ? `제조금액 미입력 ${heldN}개 상품은 다음 회차로` : '보류 없이 확정됐어요', tone: heldN ? 'orange' : 'plain', href: '/settle/rounds' },
			{ no: '2', title: '세금계산서 제출', when: '11월 10일까지 · 크리에이터', val: String(sub), of: `/ ${conf}`, pct: pct(sub, conf), desc: late ? `기한 지남 ${late}명` : '모두 냈어요', tone: late ? 'red' : 'plain', href: tx.some((t) => t.status === 'none') ? '/tax?tab=none' : '/tax?tab=redo' },
			{ no: '3', title: '수취 확인', when: '제출되는 대로 · 운영', val: String(okN), of: `/ ${conf}`, pct: pct(okN, conf), desc: chk ? `확인 대기 ${chk}건` : '확인할 게 없어요', tone: chk ? 'orange' : 'plain', href: '/tax?tab=chk' },
			{ no: '4', title: '자동 이체', when: '영업일 오후 1시 · 자동', val: String(paid.length), of: `/ ${conf}`, pct: pct(paid.length, conf), desc: `${payDay} ${plan.send.length}건 예정 · 송금 중 ${c.sending} · 예외 ${exc}`, tone: exc ? 'red' : 'plain', href: exc ? '/payouts?tab=fail' : '/payouts?tab=ready' }
		];
		// 단계 상태(시안 2026-11-24) — 끝남(✓) · 진행 중(강조 · "진행 중") · 아직(흐리게)
		const curSt: HomeStep['state'][] = [
			'done',
			sub === conf ? 'done' : 'now',
			okN === conf ? 'done' : sub ? 'now' : 'wait',
			paid.length === conf ? 'done' : okN || paid.length ? 'now' : 'wait'
		];
		// 다음 회차(11월분) — 매월 1일 오후 1시에 확정되기 전까지는 일정만(값 없음 · "확정 전")
		const nextSteps: Omit<HomeStep, 'state' | 'pill'>[] = [
			{ no: '1', title: '정산 확정', when: `${o.settle.nextAt} · 자동`, val: `D-${o.settle.dday}`, of: '', pct: 0, desc: '11월 판매분을 자동으로 계산하고 확정해요', tone: 'plain', href: '/settle' },
			{ no: '2', title: '세금계산서 제출', when: '12월 10일까지 · 크리에이터', val: '—', of: '', pct: 0, desc: '정산이 확정되면 크리에이터에게 안내가 가요', tone: 'plain', href: '/tax' },
			{ no: '3', title: '수취 확인', when: '제출되는 대로 · 운영', val: '—', of: '', pct: 0, desc: '제출된 건부터 확인해요', tone: 'plain', href: '/tax' },
			{ no: '4', title: '자동 이체', when: '영업일 오후 1시 · 자동', val: '—', of: '', pct: 0, desc: '수취 확인된 건부터 건마다 나가요', tone: 'plain', href: '/payouts' }
		];
		const withSt = (list: Omit<HomeStep, 'state' | 'pill'>[], st: HomeStep['state'][], nowPill: string): HomeStep[] =>
			list.map((x, i) => ({ ...x, state: st[i], pill: st[i] === 'now' ? nowPill : null }));
		const cycles: HomeCycle[] = [
			{ key: 'cur', label: '10월분', steps: withSt(curSteps, curSt, '진행 중') },
			{ key: 'next', label: '11월분', steps: withSt(nextSteps, ['now', 'wait', 'wait', 'wait'], '확정 전') }
		];

		return {
			heroLabel: '10월분 · 아직 지급하지 않은 금액',
			heroValue: won(total - done),
			payHref: c.check.length + c.ops.length + c.account.length + c.retry ? '/payouts?tab=fail' : '/payouts?tab=hold',
			heroStats: [
				{ k: '지급 합계', v: won(total), warn: false },
				{ k: '지급 완료', v: `${paid.length}/${conf}건`, warn: false },
				{ k: '운영 확인 필요', v: `${opsN}건`, warn: opsN > 0 }
			],
			bal: won(available),
			balNote: short ? `${won(short)} 모자라요` : '충분해요',
			balShort: short > 0,
			// 모자란 건은 실패가 아니다 — 지급 대기 그대로 다음 영업일 자동 이체로(§11 "잔액")
			balMore: short ? `모자란 ${plan.defer.length}건은 다음 영업일에 자동으로 보내요` : null,
			pend: pending ? won(pending) : null,
			// 확인할 게 없으면 회색 카드(급해 보이지 않게)
			tax: { n: chk, tone: chk ? 'orange' : 'grey', when: chk ? `지금 확인하면 ${payDay} 오후 1시 지급` : null },
			review: { n: pc.newReview + pc.revReview, sub: `신규 ${pc.newReview} · 수정 ${pc.revReview}`, href: '/products?tab=review' },
			rows,
			hot,
			hotText: hot ? `급한 일 ${hot}가지` : '급한 일이 없어요',
			cycles,
			stepsNote: '지급은 매월 1일 한 번이 아니라 세금계산서가 확인된 다음 자동 이체(영업일 오후 1시)에 건마다 나가요.'
		};
	}

	// ───────── 동작(RPC 자리) — 결과 문구를 돌려준다 ─────────

	private patchPayout(id: string, f: (p: PayoutRaw) => Partial<PayoutRaw>, log: { text: string; who?: string }) {
		this.payoutsRaw = this.payoutsRaw.map((p) => (p.id === id ? { ...p, ...f(p), log: [...p.log, { at: stamp(), text: log.text, who: log.who ?? me() }] } : p));
	}

	/** 토스 잔액 새로고침(GET /v2/balances) — 목: 정산 전이던 돈이 정산돼 지급 가능으로 넘어온 것으로 */
	refreshBalance() {
		const { available, pending } = this.provider;
		this.provider = { ...this.provider, available: available + pending, pending: 0 };
		return `토스 잔액을 다시 불러왔어요 · 지급 가능 ${won(available + pending)}`;
	}

	resend(id: string): { ok: boolean; msg: string } {
		if (this.resendClosed) return { ok: false, msg: this.resendClosed };
		const p = this.payoutsRaw.find((x) => x.id === id)!;
		const { available, pending } = this.provider;
		if (available < p.amount) return { ok: false, msg: `토스 지급 가능 금액이 모자라요 — 지급 가능 ${won(available)} · 필요 ${won(p.amount)} · 정산 전 ${won(pending)}은 토스 정산 뒤 쓸 수 있어요` };
		this.provider = { ...this.provider, available: available - p.amount };
		this.patchPayout(
			id,
			(x) => ({ fail: null, sending: { at: stamp() }, tries: x.tries + 1, attempts: [...x.attempts, { at: stamp(), result: '송금 중', tone: 'mint', raw: `POST /v2/payouts · REQUESTED · Idempotency-Key PAY-${x.creatorId}-1017` }] }),
			{ text: '다시 보내기 · 송금 중' }
		);
		return { ok: true, msg: `${this.creator(p.creatorId).name}에게 다시 보냈어요 · 송금 중` };
	}

	hold(ids: string[], memo: string) {
		ids.forEach((id) => this.patchPayout(id, () => ({ opsHold: { memo, by: `${me()} · ${stamp()}` } }), { text: `운영 보류 · ${memo}` }));
		const out = `${runDay()} 오후 1시 이체에서 빠져요`;
		return ids.length > 1 ? `${ids.length}건을 운영 보류했어요 · ${out}` : `운영 보류했어요 · ${out}`;
	}

	release(id: string) {
		this.patchPayout(id, () => ({ opsHold: null }), { text: '운영 보류 해제' });
		const v = this.payoutView(this.payoutsRaw.find((x) => x.id === id)!);
		return v.holdKinds.length ? `보류를 해제했어요 · ${v.holdText}이라 계속 보류돼요` : v.failKind ? '보류를 해제했어요 · 실패 건은 그대로예요' : `보류를 해제했어요 · ${runDay()} 오후 1시에 자동으로 보내요`;
	}

	/** 지급 완료 기록(예외 처리 · §11-2) — 거절은 문구로 돌려준다 */
	recordPaid(id: string, date: string, typed: number, memo: string): { ok: boolean; msg: string } {
		const p = this.payoutsRaw.find((x) => x.id === id)!;
		if (p.paid) return { ok: false, msg: `이미 ${p.paid.at}에 지급 완료로 기록됐어요` };
		if (typed !== p.amount) return { ok: false, msg: `보낸 금액이 지급 건 금액(${won(p.amount)})과 달라요` };
		if (date > TODAY) return { ok: false, msg: '오늘 이후 날짜는 기록할 수 없어요' };
		if (date < SETTLED_ON) return { ok: false, msg: '이체한 날이 정산 계산일(11월 1일) 전이에요' };
		const [, m, d] = date.split('-').map(Number);
		this.patchPayout(id, () => ({ fail: null, paid: { at: `${m}월 ${d}일 이체`, by: `수동 기록 · ${me()}`, manual: true }, memo: memo || null }), { text: `지급 완료 기록 · ${memo || '직접 이체'}` });
		return { ok: true, msg: '지급 완료로 기록했어요 · 크리에이터 화면에 바로 보여요' };
	}

	cancelPaid(id: string, why: string) {
		this.patchPayout(id, () => ({ paid: null }), { text: `지급 완료 취소 · ${why}` });
		return '지급 완료 기록을 취소했어요 · 이미 보낸 돈은 돌아오지 않아요';
	}

	confirmTax(id: string) {
		const t = this.taxesRaw.find((x) => x.id === id)!;
		this.taxesRaw = this.taxesRaw.map((x) => (x.id === id ? { ...x, status: 'ok', waited: null, log: [...x.log, { at: stamp(), text: '수취 확인', who: me() }] } : x));
		const v = this.payoutView(this.payoutsRaw.find((p) => p.id === t.payoutId)!);
		this.patchPayout(t.payoutId, () => ({}), { text: v.holdKinds.length ? `세금계산서 확인 · ${v.holdText}으로 계속 보류` : `세금계산서 확인 · 지급 대기 · ${runDay()} 오후 1시 자동 이체 예정` });
		return v.holdKinds.length ? `확인했어요 · ${v.holdText}이라 계속 보류돼요` : `확인했어요 · ${runDay()} 오후 1시에 자동으로 지급돼요`;
	}

	redoTax(id: string, why: string) {
		this.taxesRaw = this.taxesRaw.map((x) => (x.id === id ? { ...x, status: 'redo', redoWhy: why, sentTotal: null, waited: null, log: [...x.log, { at: stamp(), text: `다시 제출 요청 · ${why}`, who: me() }] } : x));
		return '다시 제출을 요청했어요 · 크리에이터 정산 화면에 사유가 보여요';
	}

	verifySettle(id: string) {
		this.creatorsRaw = this.creatorsRaw.map((c) => (c.id === id ? { ...c, settle: 'ok', resubmitNote: null, log: [...c.log, { at: stamp(), text: '사업자 · 정산 정보 확인 완료', who: me() }] } : c));
		// 계좌 확인 필요 실패는 확인된 새 계좌로 다음 자동 이체(영업일 오후 1시)에 다시 보낸다(실패 기록은 지우고 대기로)
		const moved: string[] = [];
		this.payoutsRaw.filter((p) => p.creatorId === id && p.fail?.kind === 'account').forEach((p) => {
			this.patchPayout(p.id, () => ({ fail: null }), { text: '정산 정보 확인 · 새 계좌로 다음 자동 이체(영업일 오후 1시)에 다시 보내요' });
		});
		this.payoutsRaw.filter((p) => p.creatorId === id && p.amount && !p.paid).forEach((p) => {
			const v = this.payoutView(p);
			moved.push(v.chips.map((x) => x.label).join(' · '));
		});
		return moved.length ? `확인했어요 · 이 크리에이터의 지급 건 ${moved.length}건이 ${moved[0]}로 바뀌었어요` : '확인했어요';
	}

	redoSettle(id: string, why: string) {
		this.creatorsRaw = this.creatorsRaw.map((c) => (c.id === id ? { ...c, settle: 'redo', redoWhy: why, log: [...c.log, { at: stamp(), text: `다시 입력 요청 · ${why}`, who: me() }] } : c));
		return '다시 입력을 요청했어요 · 크리에이터 콘솔에 사유가 보여요';
	}
}

export const server = new MockServer();
export { NOW, ME };
