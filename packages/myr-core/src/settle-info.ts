/**
 * 크리에이터 사업자 · 정산 정보(0085 · docs/myr.md §4.2.1 9번 · §9-6) — 순수. 화면(초대 가입 2단계 · 내 정보) · API 가 같은 규칙을 쓴다.
 * 서버(0085 `myr_app_seller_settle_info_save`)가 같은 규칙으로 다시 막는다 — 여기는 바로 보여 줄 칸 오류 · 응답 파서 · 문구.
 *   - 상호 1~50 · 대표자 1~30 · 사업자등록번호 10자리 체크섬 · 은행 · 계좌 숫자 8~14자리(0122 · 토스 최대 14) · 예금주 = 상호 또는 대표자(공백 · (주) · ㈜ · 주식회사 무시)
 *   - 세금계산서 이메일 = 초대받은 이메일(입력 없음)
 *   - 대표자 휴대폰(0121) — 토스페이먼츠 지급대행 본인인증 문자를 받는 번호(대표자 본인 명의) · 처음 저장 때 토스페이먼츠 제3자 제공 동의(TOSS_CONSENT)
 *   - 개인사업자 · 법인(bizKind)은 서버(0121 myr_biz_kind)가 정해 응답에 싣는다 — 화면은 그 값을 읽는다
 *   - 저장된 사업자번호 · 계좌는 가린 값만 받는다 — 다시 입력하지 않으면(빈 칸) 저장된 값 그대로
 */
import { PHONE_RE, formatPhone, phoneDigits } from './phone';

/** 계좌번호 형식 — 숫자 8~14자리(토스 지급대행 accountNumber 최대 14). 서버 0122 myr_account_ok 와 짝(check-boundaries (j)) */
export const ACCOUNT_RE = /^\d{8,14}$/;
/** 계좌 입력 칸 최대 자릿수 — ACCOUNT_RE 의 위 한도(테스트가 같은지 본다) */
export const ACCOUNT_MAX = 14;

export const BANKS = [
	'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행', 'SC제일은행', '카카오뱅크', '토스뱅크', '케이뱅크',
	'우체국', '새마을금고', '신협', '수협은행', 'iM뱅크(대구)', '부산은행', '경남은행', '광주은행', '전북은행', '제주은행', '한국씨티은행', 'KDB산업은행'
] as const;

export type SettleStatus = 'none' | 'pending' | 'verified' | 'rejected';
export const SETTLE_STATUS_META: Record<SettleStatus, { label: string; tone: 'muted' | 'accent' | 'ok' | 'danger'; desc: string }> = {
	none: { label: '미입력', tone: 'muted', desc: '정산을 받으려면 사업자 · 정산 정보를 입력해 주세요' },
	pending: { label: '확인 중', tone: 'accent', desc: 'MYR 운영팀이 사업자 · 계좌 정보를 확인하고 있어요. 확인이 끝나야 정산금이 지급돼요' },
	// 정산 확정 · 지급을 나눠 쓴다(2026-11-13 · settlement-rules SETTLE_CONFIRM_TEXT · PAYOUT_RULE_TEXT 와 같은 뜻)
	verified: { label: '확인 완료', tone: 'ok', desc: '확인이 끝났어요. 매월 1일 오후 1시 정산금이 정해지고, 세금계산서가 확인된 다음 날 오후 1시에 입금돼요' },
	rejected: { label: '다시 입력 필요', tone: 'danger', desc: '운영팀이 다시 입력을 요청했어요. 아래 사유를 보고 고쳐 주세요' }
};

export type SettleInfo = {
	company: string;
	ceo: string;
	bizNoMasked: string | null;
	hasBizNo: boolean;
	bank: string;
	holder: string;
	accountMasked: string | null;
	hasAccount: boolean;
	taxEmail: string;
	status: SettleStatus;
	note: string | null;
	submittedAt: string | null;
	checkedAt: string | null;
	/** 다음 정산 보류 이유(서버 myr_seller_next_hold_json · 정산 탭 next_hold 와 같은 함수 · 0116) — 홈 배너는 code === 'settle_info' 일 때 */
	hold: { code: string; label: string } | null;
	/** 0121 — 대표자 휴대폰(숫자만) · 토스페이먼츠 제3자 제공 동의 여부 · 개인사업자/법인(서버 판정) */
	ceoPhone: string | null;
	tossAgreed: boolean;
	bizKind: BizKind | null;
	/** 내 정보 "토스 본인인증" 카드 상태(서버 0121 myr_toss_card_state) · 토스가 거절한 칸(toss_seller_error.field) */
	tossState: TossState | null;
	tossFix: 'account' | 'bizNo' | null;
	/** 토스로 지급 가능(서버 0122 myr_toss_ready · 응답 toss_ready · 0124) — 가입 토스 화면 "인증 완료" */
	tossReady: boolean;
};
/** 토스 카드 상태 — none 시작 전 · rejected 토스가 정보 거절 · wait 본인인증 전 · partial 인증 완료 · kyc 추가 인증 · approved 한도 없음 · corporate 법인 */
export type TossState = 'none' | 'rejected' | 'wait' | 'partial' | 'kyc' | 'approved' | 'corporate';
export const TOSS_STATES: readonly TossState[] = ['none', 'rejected', 'wait', 'partial', 'kyc', 'approved', 'corporate'];
export const isTossState = (v: unknown): v is TossState => typeof v === 'string' && (TOSS_STATES as readonly string[]).includes(v);
/** 토스 businessType — individual = 개인사업자(문자 본인인증) · corporate = 법인(본인인증 없음) */
export type BizKind = 'individual' | 'corporate';
const isBizKind = (v: unknown): v is BizKind => v === 'individual' || v === 'corporate';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const sn = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const STATUSES: readonly SettleStatus[] = ['none', 'pending', 'verified', 'rejected'];

export function settleInfoFromJson(v: unknown): SettleInfo | null {
	const o = obj(v);
	if (!o) return null;
	return {
		company: s(o.company),
		ceo: s(o.ceo),
		bizNoMasked: sn(o.biz_no_masked),
		hasBizNo: o.has_biz_no === true,
		bank: s(o.bank),
		holder: s(o.holder),
		accountMasked: sn(o.account_masked),
		hasAccount: o.has_account === true,
		taxEmail: s(o.tax_email),
		status: STATUSES.includes(o.status as SettleStatus) ? (o.status as SettleStatus) : 'none',
		note: sn(o.note),
		submittedAt: sn(o.submitted_at),
		checkedAt: sn(o.checked_at),
		hold: holdFrom(o.hold),
		ceoPhone: sn(o.ceo_phone),
		tossAgreed: o.toss_agreed === true,
		bizKind: isBizKind(o.biz_kind) ? o.biz_kind : null,
		tossState: isTossState(o.toss_state) ? o.toss_state : null,
		tossFix: o.toss_fix === 'account' || o.toss_fix === 'bizNo' ? o.toss_fix : null,
		tossReady: o.toss_ready === true
	};
}
function holdFrom(v: unknown): SettleInfo['hold'] {
	const o = obj(v);
	return o && typeof o.code === 'string' ? { code: o.code, label: s(o.label) } : null;
}

/** 콘솔 홈 사업자 · 정산 정보 배너 — 보일지는 서버 보류 이유(hold.code === 'settle_info' · 정산 탭과 같은 값)가 정한다. 여기서는 입력 상태별 문구 · 색만 고른다(확인 중은 "확인 중") */
export function homeSettleBanner(i: Pick<SettleInfo, 'status' | 'hold'> | null): { title: string; body: string; tone: 'hold' | 'wait' } | null {
	if (!i || i.hold?.code !== 'settle_info') return null;
	if (i.status === 'pending') return { title: '사업자 · 정산 정보를 확인하고 있어요', body: '운영팀이 확인하면 정산금이 지급돼요', tone: 'wait' };
	if (i.status === 'rejected') return { title: '사업자 · 정산 정보를 다시 입력해 주세요', body: '정보가 확인돼야 정산금이 지급돼요', tone: 'hold' };
	return { title: '사업자 · 정산 정보를 입력해 주세요', body: '정보가 확인돼야 정산금이 지급돼요', tone: 'hold' };
}

/* ---------------- 칸 규칙 ---------------- */
export const digitsOnly = (v: string): string => v.replace(/\D/g, '');
/** 사업자등록번호 체크섬(0085 myr_biz_no_valid 와 같다) */
export function bizNoValid(v: string): boolean {
	const d = digitsOnly(v);
	if (!/^\d{10}$/.test(d)) return false;
	const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
	let sum = 0;
	for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
	sum += Math.floor((Number(d[8]) * 5) / 10);
	return (10 - (sum % 10)) % 10 === Number(d[9]);
}
/** 입력 중 하이픈 넣기 — 123-45-67890 */
export function formatBizNo(v: string): string {
	const d = digitsOnly(v).slice(0, 10);
	return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
/** 예금주 비교 키(0085 myr_holder_key 와 같다) */
export const holderKey = (v: string): string => v.replace(/\(주\)|㈜|주식회사/g, '').replace(/\s/g, '').toLowerCase();
export const holderMatches = (holder: string, company: string, ceo: string): boolean => {
	const k = holderKey(holder);
	return k !== '' && (k === holderKey(company) || k === holderKey(ceo));
};

export type SettleField = 'company' | 'ceo' | 'ceoPhone' | 'bizNo' | 'bank' | 'account' | 'holder';
export const SETTLE_FIELDS: readonly SettleField[] = ['company', 'ceo', 'ceoPhone', 'bizNo', 'bank', 'account', 'holder'];
/** 가입 폼 04 를 "썼는지" 보는 칸 — 대표자 휴대폰은 연락처로 미리 채워질 수 있어 뺀다 */
export const SETTLE_USED_FIELDS: readonly SettleField[] = ['company', 'ceo', 'bizNo', 'bank', 'account', 'holder'];
export type SettleValues = Record<SettleField, string>;

/** 칸 오류 — 빈 사업자번호 · 계좌는 저장된 값이 있으면 그대로(has*) */
export function settleErrors(v: SettleValues, saved: { hasBizNo: boolean; hasAccount: boolean } = { hasBizNo: false, hasAccount: false }): Partial<Record<SettleField, string>> {
	const e: Partial<Record<SettleField, string>> = {};
	const company = v.company.trim();
	const ceo = v.ceo.trim();
	if (!company) e.company = '상호를 입력해 주세요';
	else if (company.length > 50) e.company = '상호는 50자까지예요';
	if (!ceo) e.ceo = '대표자 이름을 입력해 주세요';
	else if (ceo.length > 30) e.ceo = '대표자 이름은 30자까지예요';
	const phone = formatPhone(v.ceoPhone);
	if (!phone) e.ceoPhone = '대표자 휴대폰 번호를 입력해 주세요';
	else if (!PHONE_RE.test(phone)) e.ceoPhone = '휴대폰 번호를 확인해 주세요';
	if (v.bizNo.trim() === '' ? !saved.hasBizNo : !bizNoValid(v.bizNo)) e.bizNo = v.bizNo.trim() === '' ? '사업자등록번호를 입력해 주세요' : '사업자등록번호를 다시 확인해 주세요';
	if (!v.bank.trim()) e.bank = '은행을 골라 주세요';
	const acc = digitsOnly(v.account);
	if (v.account.trim() === '' ? !saved.hasAccount : !ACCOUNT_RE.test(acc)) e.account = v.account.trim() === '' ? '계좌번호를 입력해 주세요' : '계좌번호는 숫자 8~14자리예요';
	if (!v.holder.trim()) e.holder = '예금주를 입력해 주세요';
	else if (company && ceo && !holderMatches(v.holder, company, ceo)) e.holder = '예금주는 상호 또는 대표자와 같아야 해요';
	return e;
}

/** API 본문 — 사업자번호 · 계좌가 비면 null(저장된 값 그대로). 형식이 틀리면 null. 대표자 휴대폰 형식 · 동의는 RPC 가 본다(BAD_CEO_PHONE · TOSS_CONSENT_REQUIRED) */
export type SettleSaveBody = { company: string; ceo: string; bizNo: string | null; bank: string; account: string | null; holder: string; ceoPhone: string; tossAgreed: boolean };
export function parseSettleBody(v: unknown): SettleSaveBody | null {
	const o = obj(v);
	if (!o) return null;
	const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
	const company = str('company');
	const ceo = str('ceo');
	const bank = str('bank');
	const holder = str('holder');
	if (!company || !ceo || !bank || !holder || company.length > 50 || ceo.length > 30 || bank.length > 20 || holder.length > 50) return null;
	const bizNo = str('bizNo') ? digitsOnly(str('bizNo')) : null;
	const account = str('account') ? digitsOnly(str('account')) : null;
	const ceoPhone = phoneDigits(str('ceoPhone')).slice(0, 11);
	return { company, ceo, bizNo, bank, account, holder, ceoPhone, tossAgreed: o.tossAgreed === true };
}

/** 저장 거부 code → 칸 · 문구 */
export const SETTLE_SAVE_MESSAGES: Record<string, { field?: SettleField; message: string }> = {
	BAD_COMPANY: { field: 'company', message: '상호를 확인해 주세요' },
	BAD_CEO: { field: 'ceo', message: '대표자 이름을 확인해 주세요' },
	BAD_BIZ_NO: { field: 'bizNo', message: '사업자등록번호를 다시 확인해 주세요' },
	BAD_BANK: { field: 'bank', message: '은행을 골라 주세요' },
	BAD_ACCOUNT: { field: 'account', message: '계좌번호는 숫자 8~14자리예요' },
	ACCOUNT_REENTER: { field: 'account', message: '저장된 계좌번호는 14자리가 넘어 지급할 수 없어요. 계좌번호를 다시 입력해 주세요' },
	BAD_HOLDER: { field: 'holder', message: '예금주를 입력해 주세요' },
	HOLDER_MISMATCH: { field: 'holder', message: '예금주는 상호 또는 대표자와 같아야 해요' },
	BAD_CEO_PHONE: { field: 'ceoPhone', message: '대표자 휴대폰 번호를 확인해 주세요' },
	TOSS_CONSENT_REQUIRED: { message: '토스페이먼츠 정보 제공에 동의해 주세요' },
	BAD_REQUEST: { message: '입력한 내용을 다시 확인해 주세요' },
	NOT_FOUND: { message: '크리에이터 정보를 찾지 못했어요' },
	DB_ERROR: { message: '저장하지 못했어요. 잠시 후 다시 시도해 주세요' }
};
export const settleSaveMessage = (code: string) => SETTLE_SAVE_MESSAGES[code] ?? SETTLE_SAVE_MESSAGES.DB_ERROR;

/**
 * 토스페이먼츠 지급대행 — 개인정보 제3자 제공 동의(0121 · 처음 저장 때 한 번 · 서버 TOSS_CONSENT_REQUIRED).
 * ⚠ 문구는 법무 확인 전 초안이다 — 확정되면 이 값만 고친다(가입 폼 · 내 정보가 같이 쓴다).
 */
export const TOSS_CONSENT = {
	title: '개인정보 제3자 제공 동의(토스페이먼츠)',
	rows: [
		['받는 곳', '토스페이먼츠(주)'],
		['목적', '정산금 지급대행 — 셀러 등록 · 본인인증 · 정산금 이체'],
		['항목', '상호 · 대표자 · 사업자등록번호 · 대표자 휴대폰 · 이메일 · 정산 계좌(은행 · 계좌번호 · 예금주)'],
		['보유 기간', '지급대행 이용이 끝날 때까지(법령이 보관을 정한 정보는 그 기간까지)']
	] as const,
	note: '동의하지 않으면 정산금을 받을 수 없어요.'
} as const;
