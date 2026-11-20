/**
 * 토스페이먼츠 지급대행 — 요청 본문 만들기 · 응답 · 웹훅 읽기(순수). packages/payments/src/payout-rules.ts 의 **형식 부분만** 복사(셀러리 코드는 복사만).
 * 판정은 여기 두지 않는다(백엔드 원칙 1) — "토스로 지급 가능한지" · 지급 진행 중 · 다시 요청 가능 · 영업일 · 공유 잔액 가드는 DB 함수(0122~)가 정한다.
 *   - 사업자 종류(개인사업자 · 법인)는 서버 판정(0121 myr_biz_kind · 응답 biz_kind)을 받아 토스 businessType 으로 옮기기만 한다.
 *   - MYR 크리에이터는 사업자만 받는다(docs/myr.md §9-6) — 셀러 본문은 늘 company(개인사업자 · 법인) 모양.
 * 문서: docs.tosspayments.com/guides/v2/payouts · /reference/additional. 실측(2026-11-19 · tpeerkeamf5 테스트 키): 셀러 목록 응답은 { hasMore, size, nextCursor, items }.
 */
import { ACCOUNT_MAX, ACCOUNT_RE, type BizKind } from './settle-info';

/* ---------------- 상태 값(읽기용 이름표 — 판정 아님) ---------------- */

export const TOSS_SELLER_STATUSES = ['APPROVAL_REQUIRED', 'PARTIALLY_APPROVED', 'KYC_REQUIRED', 'APPROVED'] as const;
export type TossSellerStatus = (typeof TOSS_SELLER_STATUSES)[number];
export const TOSS_PAYOUT_STATUSES = ['REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'DELETED'] as const;
export type TossPayoutStatus = (typeof TOSS_PAYOUT_STATUSES)[number];
export type TossBusinessType = 'INDIVIDUAL_BUSINESS' | 'CORPORATE';

export const isTossSellerStatus = (v: unknown): v is TossSellerStatus => typeof v === 'string' && (TOSS_SELLER_STATUSES as readonly string[]).includes(v);
export const isTossPayoutStatus = (v: unknown): v is TossPayoutStatus => typeof v === 'string' && (TOSS_PAYOUT_STATUSES as readonly string[]).includes(v);

/** 토스 지급대행 id 형식 — 웹훅 본문에서 재조회 전에 거르는 용도 */
export const TOSS_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
/** refSellerId 7~20자 · 등록 뒤 못 바꾼다 */
export const TOSS_REF_SELLER_ID_RE = /^[A-Za-z0-9_-]{7,20}$/;

/* ---------------- 은행 이름 → 토스 은행 코드 ---------------- */

/**
 * 금융결제원 3자리 코드(docs.tosspayments.com/codes/org-codes) — @sellery/db partner/bank-codes 복사 + MYR 은행 목록(settle-info BANKS)의 이름.
 * MYR 정산 계좌 은행은 BANKS 이름으로만 저장된다 — 테스트가 BANKS 전부가 코드로 바뀌는지 고정한다. 모르는 이름은 null(토스에 보내지 않고 계좌 오류).
 */
export const TOSS_BANK_CODES: Readonly<Record<string, string>> = {
	산업: '002', 산업은행: '002', KDB산업은행: '002',
	기업: '003', 기업은행: '003', IBK기업은행: '003',
	국민: '004', 국민은행: '004', KB국민은행: '004',
	수협: '007', 수협은행: '007',
	농협: '011', 농협은행: '011', NH농협은행: '011',
	우리: '020', 우리은행: '020',
	SC제일: '023', SC제일은행: '023',
	씨티: '027', 씨티은행: '027', 한국씨티은행: '027',
	대구: '031', 대구은행: '031', iM뱅크: '031', 'iM뱅크(대구)': '031',
	부산: '032', 부산은행: '032',
	광주: '034', 광주은행: '034',
	제주: '035', 제주은행: '035',
	전북: '037', 전북은행: '037',
	경남: '039', 경남은행: '039',
	새마을: '045', 새마을금고: '045',
	신협: '048',
	저축은행: '050',
	산림조합: '064',
	우체국: '071',
	하나: '081', 하나은행: '081', KEB하나은행: '081',
	신한: '088', 신한은행: '088',
	케이뱅크: '089', K뱅크: '089',
	카카오뱅크: '090', 카카오: '090',
	토스뱅크: '092', 토스: '092'
};

/** 은행 이름 → 3자리 코드 · 공백 무시 · 모르는 이름은 null */
export function tossBankCodeOf(bankName: string | null | undefined): string | null {
	const key = String(bankName ?? '').replace(/\s+/g, '');
	if (!key) return null;
	return TOSS_BANK_CODES[key] ?? null;
}

/* ---------------- 셀러 등록 · 수정 본문 ---------------- */

export type TossSellerInput = {
	/** 토스 refSellerId(7~20자) — 만드는 규칙 · 저장은 셀러 등록 연결 단계(docs/myr.md 7-7 5번)가 정한다 */
	refSellerId: string;
	/** 서버 판정(0121 myr_biz_kind · 응답 biz_kind) */
	bizKind: BizKind | null;
	/** 상호 · 대표자 · 사업자등록번호 — 저장된 사업자 · 정산 정보(0085) */
	company: string | null | undefined;
	ceo: string | null | undefined;
	bizNo: string | null | undefined;
	/** 세금계산서 이메일(= 초대받은 이메일) */
	email: string | null | undefined;
	/** 대표자 휴대폰(0121 settle_phone) — 토스가 본인인증 문자를 보낸다 */
	phone: string | null | undefined;
	bank: { bank: string | null | undefined; account: string | null | undefined; holder: string | null | undefined } | null | undefined;
	/** 토스에 넘기는 메타(≤5쌍) */
	metadata?: Record<string, string>;
};

export type TossSellerBody = {
	refSellerId: string;
	businessType: TossBusinessType;
	company: { name: string; representativeName: string; businessRegistrationNumber: string; email: string; phone: string };
	account: { bankCode: string; accountNumber: string; holderName: string };
	metadata?: Record<string, string>;
};

export type TossSellerBuildCode =
	| 'BAD_REF'
	| 'BIZ_KIND_UNKNOWN'
	| 'BIZ_NO_REQUIRED'
	| 'BANK_MISSING'
	| 'BANK_CODE_UNKNOWN'
	| 'BAD_ACCOUNT'
	| 'HOLDER_REQUIRED'
	| 'EMAIL_REQUIRED'
	| 'PHONE_MISSING'
	| 'COMPANY_REQUIRED'
	| 'CEO_REQUIRED';
export type TossSellerBuild = { ok: true; body: TossSellerBody } | { ok: false; code: TossSellerBuildCode; field?: string };

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** 토스 계좌번호 칸은 최대 14자리 — MYR 입력 규칙(settle-info ACCOUNT_RE · 0122 myr_account_ok)이 이 한도를 따른다. 0122 전에 저장된 15 · 16자리 계좌는 여기서 BAD_ACCOUNT */
export const TOSS_ACCOUNT_MAX = ACCOUNT_MAX;

export function buildTossSellerBody(input: TossSellerInput): TossSellerBuild {
	const refSellerId = String(input.refSellerId ?? '');
	if (!TOSS_REF_SELLER_ID_RE.test(refSellerId)) return { ok: false, code: 'BAD_REF' };
	if (input.bizKind !== 'individual' && input.bizKind !== 'corporate') return { ok: false, code: 'BIZ_KIND_UNKNOWN', field: 'bizNo' };
	const bizNo = digits(input.bizNo);
	if (!/^\d{10}$/.test(bizNo)) return { ok: false, code: 'BIZ_NO_REQUIRED', field: 'bizNo' };
	const bank = input.bank;
	if (!bank || !bank.account) return { ok: false, code: 'BANK_MISSING', field: 'account' };
	const bankCode = tossBankCodeOf(bank.bank);
	if (!bankCode) return { ok: false, code: 'BANK_CODE_UNKNOWN', field: 'bank' };
	const accountNumber = digits(bank.account);
	if (!ACCOUNT_RE.test(accountNumber)) return { ok: false, code: 'BAD_ACCOUNT', field: 'account' };
	const holderName = clean(bank.holder, 50);
	if (!holderName) return { ok: false, code: 'HOLDER_REQUIRED', field: 'holder' };
	const email = clean(input.email, 100).toLowerCase();
	if (!email.includes('@')) return { ok: false, code: 'EMAIL_REQUIRED' };
	const phone = digits(input.phone);
	if (!/^\d{8,15}$/.test(phone)) return { ok: false, code: 'PHONE_MISSING', field: 'ceoPhone' };
	const name = clean(input.company, 50);
	if (!name) return { ok: false, code: 'COMPANY_REQUIRED', field: 'company' };
	const representativeName = clean(input.ceo, 50);
	if (!representativeName) return { ok: false, code: 'CEO_REQUIRED', field: 'ceo' };
	const body: TossSellerBody = {
		refSellerId,
		businessType: input.bizKind === 'corporate' ? 'CORPORATE' : 'INDIVIDUAL_BUSINESS',
		company: { name, representativeName, businessRegistrationNumber: bizNo, email, phone },
		account: { bankCode, accountNumber, holderName }
	};
	if (input.metadata) body.metadata = input.metadata;
	return { ok: true, body };
}

/* ---------------- 셀러 등록 · 수정 실패 → 크리에이터에게 보일 오류(0124) ---------------- */

/** sellers.toss_seller_error 에 적는 값 — 있으면 카드가 "정보 확인 필요"(0121 myr_toss_card_state) · field 가 account · bizNo 면 [수정하기]가 그 칸으로(0121 toss_fix) */
export type TossSellerError = { code: string; message: string; field: string | null };

const BUILD_MESSAGES: Record<TossSellerBuildCode, string> = {
	BAD_REF: '등록 식별자를 만들지 못했어요',
	BIZ_KIND_UNKNOWN: '사업자등록번호를 다시 확인해 주세요',
	BIZ_NO_REQUIRED: '사업자등록번호를 다시 확인해 주세요',
	BANK_MISSING: '정산 계좌를 넣어 주세요',
	BANK_CODE_UNKNOWN: '토스페이먼츠가 받지 않는 은행이에요. 다른 은행 계좌를 넣어 주세요',
	BAD_ACCOUNT: '계좌번호는 숫자 8~14자리예요. 계좌번호를 다시 입력해 주세요',
	HOLDER_REQUIRED: '예금주를 넣어 주세요',
	EMAIL_REQUIRED: '계정 이메일을 찾지 못했어요. 파트너팀에 문의해 주세요',
	PHONE_MISSING: '대표자 휴대폰 번호를 넣어 주세요',
	COMPANY_REQUIRED: '상호를 넣어 주세요',
	CEO_REQUIRED: '대표자 이름을 넣어 주세요'
};

/** 본문을 만들 수 없을 때(저장된 정보가 토스 형식에 안 맞음 — 0122 전에 저장된 15 · 16자리 계좌 등) — 크리에이터가 고칠 오류로 적는다 */
export function tossBuildErrorOf(code: TossSellerBuildCode, field?: string): TossSellerError {
	return { code: `PAYLOAD_${code}`, message: BUILD_MESSAGES[code], field: field ?? null };
}

/**
 * 토스 셀러 등록 · 수정 거절 → 크리에이터에게 보일 오류. 우리 쪽 문제(키 · 권한 · 접근 정책 · 암호화)와 불명(네트워크 · 5xx)은 null —
 * 크리에이터가 고칠 일이 아니므로 카드에 적지 않고 서버 로그로 남긴다. 고칠 칸은 토스 오류 코드 이름으로만 고른다(형식 읽기 · 판정 아님).
 */
export function tossSellerErrorOf(status: number, body: { code?: string | null; message?: string | null }): TossSellerError | null {
	const code = String(body.code ?? '');
	if (status === 0 || status >= 500 || status === 401 || status === 403) return null;
	if (/KEY|FORBIDDEN|UNAUTHORIZED|ACCESS_DENIED|ENCRYPT|SECURITY|IDEMPOTENT/.test(code)) return null;
	const field = /ACCOUNT|BANK|HOLDER/.test(code) ? 'account' : /BUSINESS|REGISTRATION|BIZ/.test(code) ? 'bizNo' : /PHONE|MOBILE/.test(code) ? 'ceoPhone' : null;
	return { code: code || `HTTP_${status}`, message: String(body.message ?? '').slice(0, 300) || '토스페이먼츠가 정보를 받지 않았어요', field };
}

/* ---------------- 지급 요청 본문 ---------------- */

export const TOSS_PAYOUT_MAX_PER_REQUEST = 100;
/** 건당 10억 원 미만 */
export const TOSS_PAYOUT_MAX_AMOUNT = 1_000_000_000;
/** transactionDescription ≤ 7자 — 입금 통장에 찍히는 글자 */
export const TOSS_PAYOUT_DESCRIPTION = 'MYR정산';

export type TossScheduleType = 'EXPRESS' | 'SCHEDULED';

export type TossPayoutItemInput = {
	/** 우리 지급 건 id — refPayoutId(≤50) · 토스가 같은 값을 다시 받지 않는다 */
	refPayoutId: string;
	tossSellerId: string;
	amount: number;
	scheduleType: TossScheduleType;
	/** SCHEDULED 면 yyyy-MM-dd */
	payoutDate?: string | null;
	description?: string;
	metadata?: Record<string, string>;
};

export type TossPayoutItem = {
	refPayoutId: string;
	destination: string;
	scheduleType: TossScheduleType;
	payoutDate?: string;
	amount: { currency: 'KRW'; value: number };
	transactionDescription: string;
	metadata?: Record<string, string>;
};

export type TossPayoutItemBuild = { ok: true; item: TossPayoutItem } | { ok: false; code: 'BAD_AMOUNT' | 'NO_SELLER' | 'DATE_REQUIRED' | 'BAD_DATE' | 'BAD_REF' };

export function buildTossPayoutItem(input: TossPayoutItemInput): TossPayoutItemBuild {
	const refPayoutId = String(input.refPayoutId ?? '').trim();
	if (!refPayoutId || refPayoutId.length > 50) return { ok: false, code: 'BAD_REF' };
	if (!input.tossSellerId) return { ok: false, code: 'NO_SELLER' };
	const value = Math.round(Number(input.amount));
	if (!Number.isFinite(value) || value <= 0 || value >= TOSS_PAYOUT_MAX_AMOUNT) return { ok: false, code: 'BAD_AMOUNT' };
	const item: TossPayoutItem = {
		refPayoutId,
		destination: input.tossSellerId,
		scheduleType: input.scheduleType,
		amount: { currency: 'KRW', value },
		transactionDescription: clean(input.description ?? TOSS_PAYOUT_DESCRIPTION, 7) || TOSS_PAYOUT_DESCRIPTION
	};
	if (input.scheduleType === 'SCHEDULED') {
		const d = String(input.payoutDate ?? '').trim();
		if (!d) return { ok: false, code: 'DATE_REQUIRED' };
		if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) return { ok: false, code: 'BAD_DATE' };
		item.payoutDate = d;
	}
	if (input.metadata) item.metadata = input.metadata;
	return { ok: true, item };
}

/** 요청 한 번에 100건까지 — 하나라도 틀리면 그 요청 전체가 실패하므로 나눠 보낸다 */
export function chunkPayouts<T>(items: readonly T[], size = TOSS_PAYOUT_MAX_PER_REQUEST): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/* ---------------- 응답 · 웹훅 읽기 ---------------- */

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export type TossSeller = {
	id: string;
	refSellerId: string | null;
	businessType: string | null;
	status: string;
	account?: { bankCode?: string; accountNumber?: string; holderName?: string } | null;
	[k: string]: unknown;
};

export type TossPayout = {
	id: string;
	refPayoutId: string | null;
	destination: string | null;
	scheduleType: string | null;
	payoutDate: string | null;
	amount: { currency?: string; value?: number } | null;
	status: string;
	error: { code?: string; message?: string } | null;
	requestedAt: string | null;
	[k: string]: unknown;
};

/** 목록 응답 — 토스 v2 는 { hasMore, size, nextCursor, items }(2026-11-19 실측). 배열 · { data } 모양도 받는다 */
export type TossList<T> = { items: T[]; hasMore: boolean; nextCursor: string | null };

export function parseTossSeller(raw: unknown): TossSeller | null {
	const o = obj(raw);
	if (!o || typeof o.id !== 'string' || typeof o.status !== 'string') return null;
	return { ...o, id: o.id, refSellerId: str(o.refSellerId), businessType: str(o.businessType), status: o.status, account: (obj(o.account) as TossSeller['account']) ?? null };
}

export function parseTossPayout(raw: unknown): TossPayout | null {
	const o = obj(raw);
	if (!o || typeof o.id !== 'string' || typeof o.status !== 'string') return null;
	const err = obj(o.error);
	return {
		...o,
		id: o.id,
		refPayoutId: str(o.refPayoutId),
		destination: str(o.destination),
		scheduleType: str(o.scheduleType),
		payoutDate: str(o.payoutDate),
		amount: (obj(o.amount) as TossPayout['amount']) ?? null,
		status: o.status,
		error: err ? { code: str(err.code) ?? undefined, message: str(err.message) ?? undefined } : null,
		requestedAt: str(o.requestedAt)
	};
}

/** 목록 읽기 — 읽지 못한 줄은 건너뛴다. 모양이 전혀 다르면 null */
export function parseTossList<T>(raw: unknown, parseItem: (x: unknown) => T | null): TossList<T> | null {
	const o = obj(raw);
	const arr = Array.isArray(raw) ? raw : o && Array.isArray(o.items) ? o.items : o && Array.isArray(o.data) ? o.data : null;
	if (!arr) return null;
	const items: T[] = [];
	for (const x of arr) {
		const v = parseItem(x);
		if (v) items.push(v);
	}
	return { items, hasMore: o?.hasMore === true, nextCursor: str(o?.nextCursor) };
}

export type TossWebhook<T> = { eventType: string; createdAt: string | null; data: T };

/**
 * 웹훅 본문의 대상 — 토스 v2 실측(2026-11-20 · 개발자센터 전송 내역):
 *   `{ eventType, createdAt, version, eventId, entityType: 'seller' | 'payout', entityBody: { id, refSellerId, status, … } }`
 * 셀러리에서 복사한 `{ data: {…} }` 가정은 틀렸다(운영 웹훅이 400 으로 거절했다) — entityBody 를 읽고, 옛 모양(data)도 받아 둔다.
 */
function webhookEntity(o: Record<string, unknown>): unknown {
	return o.entityBody ?? o.data;
}

/** `seller.changed` — 다른 eventType 이나 모양이 다르면 null */
export function parseSellerWebhook(raw: unknown): TossWebhook<TossSeller> | null {
	const o = obj(raw);
	if (!o || o.eventType !== 'seller.changed') return null;
	const data = parseTossSeller(webhookEntity(o));
	return data ? { eventType: 'seller.changed', createdAt: str(o.createdAt), data } : null;
}

/** `payout.changed` */
export function parsePayoutWebhook(raw: unknown): TossWebhook<TossPayout> | null {
	const o = obj(raw);
	if (!o || o.eventType !== 'payout.changed') return null;
	const data = parseTossPayout(webhookEntity(o));
	return data ? { eventType: 'payout.changed', createdAt: str(o.createdAt), data } : null;
}

/** 웹훅 핸들러가 다시 조회할 대상 — 이벤트 종류(seller.changed · payout.changed)와 id(TOSS_ID_RE). 본문의 상태값은 쓰지 않는다(서명이 없다 — id 재조회가 인증) */
export function tossWebhookTarget(raw: unknown): { eventType: 'seller.changed' | 'payout.changed'; id: string } | null {
	const o = obj(raw);
	if (!o || (o.eventType !== 'seller.changed' && o.eventType !== 'payout.changed')) return null;
	const id = str(obj(webhookEntity(o))?.id);
	return id && TOSS_ID_RE.test(id) ? { eventType: o.eventType, id } : null;
}
