/**
 * 세금계산서(0104 · docs/myr.md 작업 순서 7-4) — 순수. 서버 응답(myr_payout_invoice_json) → 화면 모양 · 문구 · 승인번호 입력 형식.
 * 합계 · 공급가액 · 세액 · 작성일자 · 발행 기한 · 기한 지남 · 제출 가능은 서버 값이다 — 여기서 계산하지 않는다.
 * 승인번호 형식은 입력 형식 규칙이라 서버(myr_tax_invoice_no)와 여기 둘 다 둔다(백엔드 원칙 1 예외 — 화면은 빨리 알려 주고 서버가 최종 판정).
 * 테스트 src/test/tax-invoice.test.ts.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const sn = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** none 제출 전 · submitted 확인 중 · accepted 확인 완료 · returned 다시 제출 필요 */
export type TaxInvoiceStatus = 'none' | 'submitted' | 'accepted' | 'returned';
const STATUSES: readonly TaxInvoiceStatus[] = ['none', 'submitted', 'accepted', 'returned'];

export type TaxInvoice = {
	/** 세금계산서가 필요한 지급 건(합계 0원 초과) · show = 칸을 그린다(지급 전이거나 이미 낸 것이 있다) */
	needed: boolean;
	show: boolean;
	/** 합계(= 상계 뒤 금액 · 보증금 환급 제외) · 공급가액 · 세액 — 서버 myr_tax_invoice_amounts */
	total: number;
	supply: number;
	tax: number;
	/** 작성일자(정산월 말일) · 발행 기한(다음 달 10일) — 'YYYY-MM-DD' */
	writeDate: string;
	dueDate: string;
	overdue: boolean;
	/** 크리에이터가 할 일(제출 전 · 다시 제출 필요 · 지급 전) — 달 카드 칩 */
	todo: boolean;
	status: TaxInvoiceStatus;
	statusLabel: string;
	/** 운영 확인 완료 — 서버 myr_tax_invoice_accepted */
	accepted: boolean;
	approvalNo: string | null;
	returnNote: string | null;
	submittedAt: string | null;
	checkedAt: string | null;
	/** 낸 뒤 합계가 바뀌었다 — 다시 발행해야 한다 */
	amountChanged: boolean;
	canSubmit: boolean;
};

export function taxInvoiceFromJson(v: unknown): TaxInvoice | null {
	const o = obj(v);
	if (!o) return null;
	return {
		needed: o.needed === true,
		show: o.show === true,
		total: n(o.total),
		supply: n(o.supply),
		tax: n(o.tax),
		writeDate: s(o.write_date),
		dueDate: s(o.due_date),
		overdue: o.overdue === true,
		todo: o.todo === true,
		status: STATUSES.includes(o.status as TaxInvoiceStatus) ? (o.status as TaxInvoiceStatus) : 'none',
		statusLabel: s(o.status_label, '제출 전'),
		accepted: o.accepted === true,
		approvalNo: sn(o.approval_no),
		returnNote: sn(o.return_note),
		submittedAt: sn(o.submitted_at),
		checkedAt: sn(o.checked_at),
		amountChanged: o.amount_changed === true,
		canSubmit: o.can_submit === true
	};
}

/** 승인번호 정리 — 하이픈 · 공백을 빼고 소문자. 앞 8자리 숫자 + 영문 소문자 · 숫자 16자리(국세청 24자리)가 아니면 null(서버 myr_tax_invoice_no 와 같은 형식) */
export function normalizeApprovalNo(v: string): string | null {
	const x = v.replace(/[\s-]/g, '').toLowerCase();
	return /^[0-9]{8}[0-9a-z]{16}$/.test(x) ? x : null;
}

/** '2034020341000000a1b2c3d4' → '20340203-41000000-a1b2c3d4' */
export const approvalNoText = (no: string): string => (no.length === 24 ? `${no.slice(0, 8)}-${no.slice(8, 16)}-${no.slice(16)}` : no);

/** 상태 칩 색 — 정산 탭 칩과 같은 이름(SettleTone) */
export const TAX_INVOICE_TONE: Record<TaxInvoiceStatus, 'plan' | 'hold' | 'warn' | 'done'> = { none: 'warn', submitted: 'plan', accepted: 'done', returned: 'hold' };

/** 상태별 안내 한 줄(제출 전 · 다시 제출 필요는 입력 칸 · 사유가 대신한다) */
export const TAX_INVOICE_GUIDE: Record<TaxInvoiceStatus, string> = {
	none: '',
	submitted: '운영팀이 홈택스에서 확인하고 있어요. 확인되면 지급돼요.',
	accepted: '운영팀 확인이 끝났어요. 지급 준비가 되면 이체돼요.',
	returned: ''
};

/** 제출 요청 본문 — month 'YYYY-MM' → 'YYYY-MM-01' · 승인번호는 문자열이면 그대로(형식은 서버가 다시 본다) */
export function parseTaxInvoiceBody(v: unknown): { month: string; approvalNo: string } | null {
	const o = obj(v);
	const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s(o?.month));
	if (!o || !m || typeof o.approvalNo !== 'string' || o.approvalNo.length > 64) return null;
	return { month: `${m[1]}-${m[2]}-01`, approvalNo: o.approvalNo };
}

const MESSAGES: Record<string, string> = {
	BAD_NO: '승인번호 24자리를 확인해 주세요',
	DUPLICATE_NO: '이미 다른 정산에 낸 승인번호예요',
	NOT_NEEDED: '이 정산은 세금계산서가 필요 없어요',
	ALREADY_ACCEPTED: '운영팀 확인이 끝난 세금계산서예요',
	ALREADY_PAID: '지급이 끝난 정산이에요',
	NOT_FOUND: '정산을 찾을 수 없어요',
	BAD_REQUEST: '요청이 올바르지 않아요'
};
export const taxInvoiceMessage = (code: string): string => MESSAGES[code] ?? '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요';
