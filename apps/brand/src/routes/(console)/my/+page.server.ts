import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { BRAND_DESCRIPTION_MAX, brandProfileFailMessage, parseBrandProfileInput, type BrandProfileField } from '@sellery/db/brand/settle-rules';
import { BRAND_CATEGORIES, BRAND_NAME_MAX, MANAGER_NAME_MAX } from '@sellery/db/brand/signup-rules';
import {
	BRAND_LOGO_MAX_BYTES,
	BRAND_LOGO_TYPES,
	RATE_LIMIT_MESSAGE,
	brandPath,
	getBrandGradeCard,
	getBrandProfile,
	getBrandSettleInfo,
	rateLimit,
	requireBrand,
	saveBrandProfile,
	setBrandLogoUrl,
	uploadBrandLogo,
	type BrandReady
} from '$lib/server/brand';

/**
 * `/my` — 내 정보 5단계 (docs/brand-console-plan.md §5 `/brand/my` · §6 행 5 PR-B · 프로토타입 demo-my 브랜드 정보 카드(vBrandMy · saveBrandInfo · logoPick) + BrandGrade 등급 카드 + 추천 코드).
 * load: `requireBrand` → `getBrandProfile`(0019 app_brand_profile — 상호 · 카테고리 · 담당자 · 연락처 · 이메일 · 소개 · 로고 · biz_no_masked · ref_code) + `getBrandGradeCard`(실시간 등급 · 다음 등급 · 할인 · 무료 열람 · 🥬 · tiers)
 *   + `getBrandSettleInfo`(정산 정보 요약 — 등록 여부만 · 폼은 /settle). `?msg=<code>` 성공 안내(MY_MESSAGES). 실패는 `fail(400, { form, message, field?, values? })` 로 같은 화면 — 프로필 폼만 입력값을 되돌린다.
 * actions(전부 requireBrand → rateLimit → 본인 brand.id 만):
 *   saveProfile  상호 · 카테고리 · 담당자 이름 · 연락처 · 소개 → `parseBrandProfileInput`(0019 app_set_brand_profile 과 같은 조건) → `saveBrandProfile`(로고 제외)
 *   uploadLogo   로고(JPG · PNG · WebP · GIF · 4MB) → `uploadBrandLogo`(Storage public-assets `brands/<id>/logo-<uuid>`) → `setBrandLogoUrl(url)`
 *   removeLogo   `setBrandLogoUrl(null)` — 파일은 지우지 않는다(상품 이미지와 같은 규칙)
 * 사업자등록번호 · 정산 계좌는 여기서 바꾸지 않는다(§8 — /settle). 로그아웃은 셸의 `POST /brand/auth/signout`.
 */
export type MyMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MY_MESSAGES: Record<string, MyMessage> = {
	saved: { tone: 'ok', text: '브랜드 정보를 저장했어요 — 상호·담당자는 인플루언서 상품 상세와 스레드에 이 값으로 보여요.' },
	logo_saved: { tone: 'ok', text: '로고를 등록했어요 — 상품 상세 · 인플루언서 갤러리에 반영돼요.' },
	logo_removed: { tone: 'info', text: '로고를 지웠어요 — 상호 첫 글자로 표시돼요.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE }
};

export type MyForm = 'profile' | 'logo';

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/my' });
	if (!r.ok) redirect(303, r.location);
	const { brand, balance, user } = r.ctx;

	const [profile, card, settle] = await Promise.all([getBrandProfile(brand.id), getBrandGradeCard(brand.id), getBrandSettleInfo(brand.id)]);
	const msg = MY_MESSAGES[event.url.searchParams.get('msg') ?? ''] ?? null;

	return {
		brand: { name: brand.name, grade: brand.grade, code: brand.code, created_at: brand.created_at },
		balance,
		email: user.email ?? profile?.email ?? null,
		profile,
		card,
		settle: settle ? { complete: settle.settle_info_complete, has_bank_info: settle.has_bank_info, has_biz_no: settle.has_biz_no, has_biz_doc: settle.has_biz_doc, has_tax_info: settle.has_tax_info } : null,
		msg,
		categories: BRAND_CATEGORIES,
		limits: { name: BRAND_NAME_MAX, manager: MANAGER_NAME_MAX, description: BRAND_DESCRIPTION_MAX },
		logoAccept: Object.keys(BRAND_LOGO_TYPES).join(','),
		logoMaxMb: Math.round(BRAND_LOGO_MAX_BYTES / 1024 / 1024),
		settlePath: brandPath('/settle'),
		salesPath: brandPath('/sales'),
		productsPath: brandPath('/products'),
		myPath: brandPath('/my')
	};
};

// ------------------------------------------------------------
// form actions
// ------------------------------------------------------------
function back(query: string): never {
	redirect(303, `${brandPath('/my')}${query ? `?${query}` : ''}`);
}

async function enter(event: RequestEvent, action: string): Promise<{ ctx: BrandReady; formData: FormData }> {
	const r = await requireBrand(event, { next: '/my' });
	if (!r.ok) redirect(303, r.location);
	if (!rateLimit(`brand-my-${action}:${r.ctx.user.id}`)) back('msg=err_rate');
	return { ctx: r.ctx, formData: await event.request.formData() };
}

const PROFILE_KEYS = ['name', 'category', 'manager_name', 'manager_phone', 'description'] as const;
function profileValues(formData: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of PROFILE_KEYS) {
		const v = formData.get(k);
		if (typeof v === 'string') out[k] = v.slice(0, 600);
	}
	return out;
}

export const actions: Actions = {
	saveProfile: async (event) => {
		const { ctx, formData } = await enter(event, 'profile');
		const values = profileValues(formData);
		const bad = (message: string, field: BrandProfileField | string | null) => fail(400, { form: 'profile' as MyForm, message, field, values });

		const parsed = parseBrandProfileInput(Object.fromEntries(formData.entries()));
		if (!parsed.ok) return bad(parsed.message, parsed.field);
		const res = await saveBrandProfile(ctx.brand.id, parsed.value);
		if (!res.ok) return bad(brandProfileFailMessage(res.code, res.field), res.field);
		back('msg=saved#profile');
	},

	uploadLogo: async (event) => {
		const { ctx, formData } = await enter(event, 'logo');
		const bad = (code: string, field: string | null = null) => fail(400, { form: 'logo' as MyForm, message: brandProfileFailMessage(code, field), field, values: null });
		const file = formData.get('logo');
		if (!(file instanceof File) || file.size <= 0 || file.size > BRAND_LOGO_MAX_BYTES || !BRAND_LOGO_TYPES[file.type]) return bad('BAD_FILE');
		const up = await uploadBrandLogo(ctx.brand.id, { bytes: await file.arrayBuffer(), type: file.type, size: file.size });
		if (!up.ok) return bad(up.code);
		const res = await setBrandLogoUrl(ctx.brand.id, up.url);
		if (!res.ok) return bad(res.code, res.field);
		back('msg=logo_saved#profile');
	},

	removeLogo: async (event) => {
		const { ctx } = await enter(event, 'logo');
		const res = await setBrandLogoUrl(ctx.brand.id, null);
		if (!res.ok) return fail(400, { form: 'logo' as MyForm, message: brandProfileFailMessage(res.code, res.field), field: null, values: null });
		back('msg=logo_removed#profile');
	}
};
