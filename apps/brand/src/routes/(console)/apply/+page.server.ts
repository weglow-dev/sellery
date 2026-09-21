import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { COMPANY } from '@sellery/db/company';
import { BRAND_SIGNUP_FAIL_MESSAGES, isBrandCategory, isBrandSignupFailCode, parseBrandSignupMeta, type BrandSignupFailCode } from '@sellery/db/brand/signup-rules';
import { RATE_LIMIT_MESSAGE, brandPath, createBrandFromSignup, getBrandContext, rateLimit } from '$lib/server/brand';
import { SITE_URL } from '$lib/server/db';

/**
 * `/brand/apply` — 보완 폼 (apps/influencer `(console)/apply` 의 브랜드 판 · docs/brand-console-plan.md §3).
 * 남는 유일한 중간 화면: 세션은 있는데 `brands.user_id` 행이 없는 guest 만 온다 — (1) BIZ_NO_TAKEN / EMAIL_TAKEN (2) user_metadata 누락·형식 오류(INVALID_INPUT)
 * (3) auth/confirm 이 세션 생성 뒤 함수 호출 전에 죽은 경우.
 * load: 먼저 `createBrandFromSignup(user)` 를 다시 시도하고(멱등 — 성공하면 바로 /home), 실패했을 때만 user_metadata 를 프리필한 폼을 그린다.
 * 게이트: `requireBrand()` 는 guest 를 여기로 보내므로 `getBrandContext()` 를 직접 본다(루프 방지). 신청 테이블·심사·반려·/pending 은 없다(결정 4).
 * action(default): 세션·행 상태(guest 만 진행) → rate limit 30분 20건 → parseBrandSignupMeta(폼) → createBrandFromSignup(user, form) → /home.
 *   BIZ_NO_TAKEN 은 폼으로 고칠 수 없는 경우가 대부분(다른 계정이 같은 사업자번호 — 자동 병합 없음)이라 안내 + 폼(오타 정정용) 둘 다 보인다.
 *   약관 동의 시각은 폼 체크박스(`terms=on`) 또는 이미 user_metadata 에 있는 값 — 숨은 필드 값은 믿지 않는다. `redirect` 는 throw 다.
 */

/** 폼으로 고칠 수 없는 실패 — 안내만 (연결 대상 문제 · 신원 미확인 · 이메일 충돌) */
const NO_FORM: ReadonlySet<BrandSignupFailCode> = new Set(['LINK_TARGET_NOT_FOUND', 'LINK_TARGET_TAKEN', 'NOT_CONFIRMED', 'EMAIL_TAKEN']);

function metaOf(user: { user_metadata?: unknown }): Record<string, unknown> {
	const m = user.user_metadata;
	return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

export const load: PageServerLoad = async (event) => {
	const ctx = await getBrandContext(event);
	if (ctx.state === 'anon') redirect(303, `${brandPath('/login')}?next=${encodeURIComponent(brandPath('/apply'))}`);
	if (ctx.state === 'ok') redirect(303, brandPath('/home'));
	if (ctx.state === 'suspended') redirect(303, brandPath('/suspended'));
	if (ctx.state === 'foreign') redirect(303, `${brandPath('/login')}?switch=1`);

	// guest — 멱등 재시도 (성공하면 폼 없이 홈으로)
	const retry = await createBrandFromSignup(ctx.user);
	if (retry.ok) redirect(303, brandPath('/home'));

	const reasonParam = event.url.searchParams.get('reason');
	const reason: BrandSignupFailCode = isBrandSignupFailCode(reasonParam) ? reasonParam : retry.code;
	const meta = metaOf(ctx.user);
	const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : '');
	const categoryRaw = str('category');
	return {
		reason,
		message: BRAND_SIGNUP_FAIL_MESSAGES[reason],
		noForm: NO_FORM.has(reason),
		email: ctx.user.email ?? '',
		company: { email: COMPANY.email, csUrl: COMPANY.csUrl },
		termsUrl: `${SITE_URL}/terms`,
		privacyUrl: `${SITE_URL}/privacy`,
		defaults: {
			name: str('company_name') || str('name'),
			bizNo: str('biz_no'),
			managerName: str('manager_name'),
			managerPhone: str('manager_phone'),
			category: isBrandCategory(categoryRaw) ? categoryRaw : ('건강기능식품' as const),
			referralCode: str('referral_code').toUpperCase(),
			termsAgreed: typeof meta.terms_agreed_at === 'string' && meta.terms_agreed_at.length > 0
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const ctx = await getBrandContext(event);
		if (ctx.state === 'anon') redirect(303, `${brandPath('/login')}?next=${encodeURIComponent(brandPath('/apply'))}`);
		if (ctx.state === 'ok') redirect(303, brandPath('/home'));
		if (ctx.state === 'suspended') redirect(303, brandPath('/suspended'));
		if (ctx.state === 'foreign') redirect(303, `${brandPath('/login')}?switch=1`);

		if (!rateLimit(`brand-apply:${ctx.user.id}`)) return fail(429, { error: RATE_LIMIT_MESSAGE });

		const formData = await event.request.formData();
		const metaTerms = metaOf(ctx.user).terms_agreed_at;
		const form = {
			company_name: formData.get('name'),
			biz_no: formData.get('biz_no'),
			manager_name: formData.get('manager_name'),
			manager_phone: formData.get('manager_phone'),
			category: formData.get('category'),
			referral_code: formData.get('referral_code'),
			terms_agreed_at: formData.get('terms') === 'on' ? true : typeof metaTerms === 'string' ? metaTerms : undefined
		};
		const parsed = parseBrandSignupMeta(form);
		if (!parsed.ok) return fail(400, { error: parsed.message });

		const result = await createBrandFromSignup(ctx.user, form);
		if (!result.ok) return fail(400, { error: BRAND_SIGNUP_FAIL_MESSAGES[result.code] });
		redirect(303, brandPath('/home'));
	}
};
