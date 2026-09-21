import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import {
	BANKS,
	SETTLE_FAIL_MESSAGES,
	SETTLE_TYPE_LABEL,
	parseSettleInfoInput,
	validateRrn,
	type SettleInfoInputError
} from '@sellery/db/partner/settle-rules';
import {
	BIZ_DOC_MAX_BYTES,
	BIZ_DOC_TYPES,
	getSellerSettleInfo,
	listSellerSettlements,
	RATE_LIMIT_MESSAGE,
	rateLimit,
	requireSeller,
	saveSettleInfo,
	sellerPath,
	setSellerRrn,
	uploadBizDoc,
	type SellerReady
} from '$lib/server/partner';

/**
 * `/settle` — 정산 정보 등록 + 정산 내역 5단계 (docs/inf-console-plan.md §5.9 · §6 `/settle` · §7 "5." · 프로토타입 vSellerSettle + vMy 정산 정보 폼).
 * load: `requireSeller` → `getSellerSettleInfo`(0013 app_seller_settle_info — 계좌 뒤 4자리 · 사업자번호 뒤 5자리 · 주민번호 성별 자리만) + `listSellerSettlements`(settled 스냅샷 · pending 재계산).
 *   `?msg=<code>` 성공 안내(SETTLE_MESSAGES). 실패는 `fail(400, { form, message, field?, values? })` 로 같은 화면 — 정산 정보 폼만 입력값을 되돌리고,
 *   **주민등록번호는 어떤 응답에도 되돌리지 않는다**(values 없음). 콘솔 응답에 원문 계좌·사업자번호·주민번호는 없다(§4.9).
 * actions(전부 requireSeller → rateLimit → 본인 seller.id 만):
 *   save       정산 유형 · 은행 · 계좌 · 예금주 (+ 사업자: 사업자등록번호 · 세금계산서 정보) → `parseSettleInfoInput`(0013 app_set_settle_info 와 같은 조건) → `saveSettleInfo`
 *   setRrn     개인(personal) 원천징수 신고용 주민등록번호 → `validateRrn`(형식·검증숫자) → `setSellerRrn`(pgp_sym_encrypt · 키 없으면 RRN_KEY_MISSING) — 원문은 로그에도 남기지 않는다
 *   uploadDoc  사업자등록증(JPG · PNG · WebP · PDF · 10MB) → `uploadBizDoc`(Storage partner-docs · object path 만 저장) — 보기는 `/settle/doc`(단기 서명 URL 로 302)
 */
export type SettleMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const SETTLE_MESSAGES: Record<string, SettleMessage> = {
	saved: { tone: 'ok', text: '정산 정보 저장 완료 — 다음 정산부터 이 계좌로 지급됩니다.' },
	saved_biz: { tone: 'ok', text: '정산 정보 저장 완료 — 사업자 정산은 원천징수 없이 세금계산서로 진행돼요. 사업자등록증도 올려주세요.' },
	rrn_saved: { tone: 'ok', text: '주민등록번호를 암호화해 저장했어요 — 원천징수 신고에만 쓰이고 화면에는 다시 표시되지 않아요.' },
	doc_saved: { tone: 'ok', text: '사업자등록증을 등록했어요 — 운영팀이 확인한 뒤 세금계산서 발행에 사용해요.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE }
};

export type SettleForm = 'save' | 'rrn' | 'doc';

export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/settle' });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;

	const [info, list] = await Promise.all([getSellerSettleInfo(seller.id), listSellerSettlements(seller.id)]);
	const msg = SETTLE_MESSAGES[event.url.searchParams.get('msg') ?? ''] ?? null;

	return {
		seller: { name: seller.name, grade: seller.grade },
		balance,
		info,
		list,
		msg,
		banks: BANKS,
		typeLabels: SETTLE_TYPE_LABEL,
		docMaxMb: Math.round(BIZ_DOC_MAX_BYTES / 1024 / 1024),
		docHref: sellerPath('/settle/doc'),
		settlePath: sellerPath('/settle'),
		campaignsPath: sellerPath('/campaigns'),
		privacyHref: '/privacy'
	};
};

// ------------------------------------------------------------
// form actions
// ------------------------------------------------------------
function back(query: string): never {
	redirect(303, `${sellerPath('/settle')}${query ? `?${query}` : ''}`);
}

/** 공통 진입 — 게이트 · 레이트리밋(실패 시 /settle?msg=err_rate) · 폼 파싱 */
async function enter(event: RequestEvent, action: string): Promise<{ ctx: SellerReady; formData: FormData }> {
	const r = await requireSeller(event, { next: '/settle' });
	if (!r.ok) redirect(303, r.location);
	if (!rateLimit(`settle-${action}:${r.ctx.user.id}`)) back('msg=err_rate');
	return { ctx: r.ctx, formData: await event.request.formData() };
}

const msgOf = (code: string) => SETTLE_FAIL_MESSAGES[code] ?? SETTLE_FAIL_MESSAGES.DB_ERROR;

/** RPC 실패 코드 → 강조 필드 (0013 app_set_settle_info 의 code 는 parseSettleInfoInput 과 같은 이름) */
const FIELD_OF: Record<string, SettleInfoInputError['field']> = {
	BAD_TYPE: 'settle_type',
	BANK_REQUIRED: 'bank',
	BAD_BANK: 'bank',
	BAD_ACCOUNT: 'account',
	HOLDER_REQUIRED: 'holder',
	BIZ_NO_REQUIRED: 'biz_no',
	BAD_BIZ_NO: 'biz_no'
};

/** 정산 정보 폼의 문자열 값만 — 되돌릴 입력값 (주민번호 필드는 이 폼에 없다) */
const SETTLE_KEYS = ['settle_type', 'bank', 'account', 'holder', 'biz_no', 'company', 'ceo', 'biz_type', 'biz_item', 'tax_email'] as const;
function settleValues(formData: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of SETTLE_KEYS) {
		const v = formData.get(k);
		if (typeof v === 'string') out[k] = v.slice(0, 200);
	}
	return out;
}

export const actions: Actions = {
	save: async (event) => {
		const { ctx, formData } = await enter(event, 'save');
		const values = settleValues(formData);
		const bad = (code: string) => fail(400, { form: 'save' as SettleForm, message: msgOf(code), field: FIELD_OF[code] ?? null, values });

		const parsed = parseSettleInfoInput(Object.fromEntries(formData.entries()));
		if (!parsed.ok) return bad(parsed.error.code);
		const res = await saveSettleInfo(ctx.seller.id, parsed.value);
		if (!res.ok) return bad(res.code);
		back(`msg=${parsed.value.settle_type === 'biz' ? 'saved_biz' : 'saved'}#settle-info`);
	},

	setRrn: async (event) => {
		const { ctx, formData } = await enter(event, 'rrn');
		// 실패 응답에 입력값을 싣지 않는다 — 폼은 비워진 채 문구만 (원문은 로그에도 남기지 않는다)
		const bad = (code: string) => fail(400, { form: 'rrn' as SettleForm, message: msgOf(code), field: null, values: null });
		const raw = formData.get('rrn');
		const digits = validateRrn(typeof raw === 'string' ? raw : '');
		if (!digits) return bad('BAD_RRN');
		const res = await setSellerRrn(ctx.seller.id, digits);
		if (!res.ok) return bad(res.code);
		back('msg=rrn_saved#rrn');
	},

	uploadDoc: async (event) => {
		const { ctx, formData } = await enter(event, 'doc');
		const bad = (code: string) => fail(400, { form: 'doc' as SettleForm, message: msgOf(code), field: null, values: null });
		const file = formData.get('doc');
		if (!(file instanceof File) || file.size <= 0 || file.size > BIZ_DOC_MAX_BYTES || !BIZ_DOC_TYPES[file.type]) return bad('BAD_FILE');
		const res = await uploadBizDoc(ctx.seller.id, { bytes: await file.arrayBuffer(), type: file.type, size: file.size });
		if (!res.ok) return bad(res.code);
		back('msg=doc_saved#doc');
	}
};
