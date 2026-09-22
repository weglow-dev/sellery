import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { BANKS, brandSettleFailMessage, parseBrandSettleInfoInput, type BrandSettleInfoInputError } from '@sellery/db/brand/settle-rules';
import {
	BIZ_DOC_MAX_BYTES,
	BIZ_DOC_TYPES,
	RATE_LIMIT_MESSAGE,
	brandPath,
	getBrandSettleInfo,
	listBrandSettlements,
	rateLimit,
	requireBrand,
	saveBrandSettleInfo,
	uploadBrandBizDoc,
	type BrandReady
} from '$lib/server/brand';

/**
 * `/settle` — 정산 정보 등록 + 사업자등록증 + 정산 내역 5단계 (docs/brand-console-plan.md §5 `/brand/settle` · §6 행 5 PR-B · §8 "플랫폼+PG 열" · "사업자등록번호 수정" · "자동 발주" · "세금계산서"
 * · 프로토타입 demo-my 정산 정보 폼 + demo-settle 표). 인플루언서 `/settle` 의 브랜드 판 — 정산 유형 라디오·주민등록번호는 없다(브랜드는 전원 사업자).
 * load: `requireBrand` → `getBrandSettleInfo`(0019 app_brand_settle_info — 계좌 뒤 4자리 · 사업자번호 뒤 5자리 · 세금계산서 정보 · po_* 읽기만) + `listBrandSettlements`(settled 스냅샷 · pending 재계산).
 *   `?msg=<code>` 성공 안내(SETTLE_MESSAGES). 실패는 `fail(400, { form, message, field?, values? })` 로 같은 화면 — 정산 정보 폼만 입력값을 되돌린다. 콘솔 응답에 원문 계좌·사업자번호는 없다.
 * actions(전부 requireBrand → rateLimit → 본인 brand.id 만):
 *   save       은행 · 계좌 · 예금주 (+ 사업자등록번호: 비어 있는 계정만 · 통신판매업 신고번호 · 세금계산서 수신 정보) → `parseBrandSettleInfoInput`(0019 app_set_brand_settle_info 와 같은 조건) → `saveBrandSettleInfo`
 *   uploadDoc  사업자등록증(JPG · PNG · WebP · PDF · 10MB) → `uploadBrandBizDoc`(Storage partner-docs · object path 만 저장) — 보기는 `/settle/doc`(단기 서명 URL 로 302)
 * 자동 발주(po_enabled/po_email)는 읽기만 — 저장 함수가 없다(§8, 발송 크론은 관리자 단계).
 */
export type SettleMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const SETTLE_MESSAGES: Record<string, SettleMessage> = {
	saved: { tone: 'ok', text: '정산 정보 저장 완료 — 다음 정산부터 이 계좌로 지급되고, 보류된 정산이 있으면 다음 지급 배치에 포함돼요.' },
	saved_partial: { tone: 'info', text: '정산 계좌를 저장했어요 — 사업자등록번호까지 등록해야 지급이 실행됩니다.' },
	doc_saved: { tone: 'ok', text: '사업자등록증을 등록했어요 — 운영팀이 확인한 뒤 정산 명세·세금계산서 발행에 사용해요.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE }
};

export type SettleForm = 'save' | 'doc';

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/settle' });
	if (!r.ok) redirect(303, r.location);
	const { brand, balance } = r.ctx;

	const [info, list] = await Promise.all([getBrandSettleInfo(brand.id), listBrandSettlements(brand.id)]);
	const msg = SETTLE_MESSAGES[event.url.searchParams.get('msg') ?? ''] ?? null;

	return {
		brand: { name: brand.name, grade: brand.grade },
		balance,
		info,
		list,
		msg,
		banks: BANKS.filter((b) => b !== '선택'),
		docMaxMb: Math.round(BIZ_DOC_MAX_BYTES / 1024 / 1024),
		docHref: brandPath('/settle/doc'),
		settlePath: brandPath('/settle'),
		campaignsPath: brandPath('/campaigns'),
		salesPath: brandPath('/sales'),
		ordersPath: brandPath('/orders'),
		myPath: brandPath('/my')
	};
};

// ------------------------------------------------------------
// form actions
// ------------------------------------------------------------
function back(query: string): never {
	redirect(303, `${brandPath('/settle')}${query ? `?${query}` : ''}`);
}

/** 공통 진입 — 게이트 · 레이트리밋(실패 시 /settle?msg=err_rate) · 폼 파싱 */
async function enter(event: RequestEvent, action: string): Promise<{ ctx: BrandReady; formData: FormData }> {
	const r = await requireBrand(event, { next: '/settle' });
	if (!r.ok) redirect(303, r.location);
	if (!rateLimit(`brand-settle-${action}:${r.ctx.user.id}`)) back('msg=err_rate');
	return { ctx: r.ctx, formData: await event.request.formData() };
}

/** RPC 실패 코드 → 강조 필드 (0019 app_set_brand_settle_info 의 code 는 parseBrandSettleInfoInput 과 같은 이름 + BIZ_NO_LOCKED · BIZ_NO_TAKEN) */
const FIELD_OF: Record<string, BrandSettleInfoInputError['field']> = {
	BANK_REQUIRED: 'bank',
	BAD_BANK: 'bank',
	BAD_ACCOUNT: 'account',
	HOLDER_REQUIRED: 'holder',
	BAD_BIZ_NO: 'biz_no',
	BIZ_NO_LOCKED: 'biz_no',
	BIZ_NO_TAKEN: 'biz_no',
	BAD_MAIL_ORDER: 'mail_order_no',
	BAD_EMAIL: 'tax_email'
};

/** 정산 정보 폼의 문자열 값만 — 되돌릴 입력값 (계좌번호는 되돌리지 않는다 — 원문을 응답에 싣지 않는 규칙) */
const SETTLE_KEYS = ['bank', 'holder', 'biz_no', 'mail_order_no', 'company', 'ceo', 'biz_type', 'biz_item', 'tax_email'] as const;
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
		const bad = (code: string) => fail(400, { form: 'save' as SettleForm, message: brandSettleFailMessage(code), field: FIELD_OF[code] ?? null, values });

		const parsed = parseBrandSettleInfoInput(Object.fromEntries(formData.entries()));
		if (!parsed.ok) return bad(parsed.error.code);
		const res = await saveBrandSettleInfo(ctx.brand.id, parsed.value);
		if (!res.ok) return bad(res.code);
		back(`msg=${res.info.settle_info_complete ? 'saved' : 'saved_partial'}#settle-info`);
	},

	uploadDoc: async (event) => {
		const { ctx, formData } = await enter(event, 'doc');
		const bad = (code: string) => fail(400, { form: 'doc' as SettleForm, message: brandSettleFailMessage(code), field: null, values: null });
		const file = formData.get('doc');
		if (!(file instanceof File) || file.size <= 0 || file.size > BIZ_DOC_MAX_BYTES || !BIZ_DOC_TYPES[file.type]) return bad('BAD_FILE');
		const res = await uploadBrandBizDoc(ctx.brand.id, { bytes: await file.arrayBuffer(), type: file.type, size: file.size });
		if (!res.ok) return bad(res.code);
		back('msg=doc_saved#doc');
	}
};
