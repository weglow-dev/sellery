/**
 * 크리에이터 사업자 · 정산 정보(0085 · docs/myr.md §4.2.1 9번 · §9-6) — 순수. 화면(초대 가입 2단계 · 내 정보) · API 가 같은 규칙을 쓴다.
 * 서버(0085 `myr_app_seller_settle_info_save`)가 같은 규칙으로 다시 막는다 — 여기는 바로 보여 줄 칸 오류 · 응답 파서 · 문구.
 *   - 상호 1~50 · 대표자 1~30 · 사업자등록번호 10자리 체크섬 · 은행 · 계좌 숫자 8~16자리 · 예금주 = 상호 또는 대표자(공백 · (주) · ㈜ · 주식회사 무시)
 *   - 세금계산서 이메일 = 초대받은 이메일(입력 없음)
 *   - 저장된 사업자번호 · 계좌는 가린 값만 받는다 — 다시 입력하지 않으면(빈 칸) 저장된 값 그대로
 */
export const BANKS = [
	'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행', 'SC제일은행', '카카오뱅크', '토스뱅크', '케이뱅크',
	'우체국', '새마을금고', '신협', '수협은행', 'iM뱅크(대구)', '부산은행', '경남은행', '광주은행', '전북은행', '제주은행', '한국씨티은행', 'KDB산업은행'
] as const;

export type SettleStatus = 'none' | 'pending' | 'verified' | 'rejected';
export const SETTLE_STATUS_META: Record<SettleStatus, { label: string; tone: 'muted' | 'accent' | 'ok' | 'danger'; desc: string }> = {
	none: { label: '미입력', tone: 'muted', desc: '정산을 받으려면 사업자 · 정산 정보를 입력해 주세요' },
	pending: { label: '확인 중', tone: 'accent', desc: 'MYR 운영팀이 사업자 · 계좌 정보를 확인하고 있어요. 확인이 끝나면 정산금이 지급돼요' },
	verified: { label: '확인 완료', tone: 'ok', desc: '확인이 끝났어요. 정산일(매월 1일)에 정산돼요' },
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
};

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
		checkedAt: sn(o.checked_at)
	};
}

/** 정산이 막히는가(콘솔 홈 배너) — 미입력 · 다시 입력 필요 */
export const needsSettleInfo = (i: Pick<SettleInfo, 'status'> | null): boolean => !i || i.status === 'none' || i.status === 'rejected';

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

export type SettleField = 'company' | 'ceo' | 'bizNo' | 'bank' | 'account' | 'holder';
export const SETTLE_FIELDS: readonly SettleField[] = ['company', 'ceo', 'bizNo', 'bank', 'account', 'holder'];
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
	if (v.bizNo.trim() === '' ? !saved.hasBizNo : !bizNoValid(v.bizNo)) e.bizNo = v.bizNo.trim() === '' ? '사업자등록번호를 입력해 주세요' : '사업자등록번호를 다시 확인해 주세요';
	if (!v.bank.trim()) e.bank = '은행을 골라 주세요';
	const acc = digitsOnly(v.account);
	if (v.account.trim() === '' ? !saved.hasAccount : !/^\d{8,16}$/.test(acc)) e.account = v.account.trim() === '' ? '계좌번호를 입력해 주세요' : '계좌번호는 숫자 8~16자리예요';
	if (!v.holder.trim()) e.holder = '예금주를 입력해 주세요';
	else if (company && ceo && !holderMatches(v.holder, company, ceo)) e.holder = '예금주는 상호 또는 대표자와 같아야 해요';
	return e;
}

/** API 본문 — 사업자번호 · 계좌가 비면 null(저장된 값 그대로). 형식이 틀리면 null */
export type SettleSaveBody = { company: string; ceo: string; bizNo: string | null; bank: string; account: string | null; holder: string };
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
	return { company, ceo, bizNo, bank, account, holder };
}

/** 저장 거부 code → 칸 · 문구 */
export const SETTLE_SAVE_MESSAGES: Record<string, { field?: SettleField; message: string }> = {
	BAD_COMPANY: { field: 'company', message: '상호를 확인해 주세요' },
	BAD_CEO: { field: 'ceo', message: '대표자 이름을 확인해 주세요' },
	BAD_BIZ_NO: { field: 'bizNo', message: '사업자등록번호를 다시 확인해 주세요' },
	BAD_BANK: { field: 'bank', message: '은행을 골라 주세요' },
	BAD_ACCOUNT: { field: 'account', message: '계좌번호는 숫자 8~16자리예요' },
	BAD_HOLDER: { field: 'holder', message: '예금주를 입력해 주세요' },
	HOLDER_MISMATCH: { field: 'holder', message: '예금주는 상호 또는 대표자와 같아야 해요' },
	BAD_REQUEST: { message: '입력한 내용을 다시 확인해 주세요' },
	NOT_FOUND: { message: '크리에이터 정보를 찾지 못했어요' },
	DB_ERROR: { message: '저장하지 못했어요. 잠시 후 다시 시도해 주세요' }
};
export const settleSaveMessage = (code: string) => SETTLE_SAVE_MESSAGES[code] ?? SETTLE_SAVE_MESSAGES.DB_ERROR;
