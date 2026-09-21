import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { COMPANY } from '@sellery/db/company';
import { SIGNUP_FAIL_MESSAGES, isPlatform, isSignupFailCode, parseSignupMeta, type SignupFailCode } from '@sellery/db/partner/signup-rules';
import { RATE_LIMIT_MESSAGE, createSellerFromSignup, getSellerContext, rateLimit, sellerPath } from '$lib/server/partner';
import { SITE_URL } from '$lib/server/db';

/**
 * `/apply` — 보완 폼 (docs/inf-console-plan.md §4.3 "예외 경로" · web influencer/apply/page.tsx + actions.ts 1:1 · docs/monorepo-migration.md §2.4 · §5.2).
 * 남는 유일한 중간 화면: 세션은 있는데 `sellers.user_id` 행이 없는 guest 만 온다 — (1) HANDLE_TAKEN (2) user_metadata 누락·형식 오류(INVALID_INPUT —
 * 옛 템플릿 `{{ .ConfirmationURL }}` 경로) (3) auth/confirm 이 세션 생성 뒤 함수 호출 전에 죽은 경우.
 * load: 먼저 `createSellerFromSignup(user)` 를 다시 시도하고(멱등 — 성공하면 바로 /home), 실패했을 때만 user_metadata 를 프리필한 폼을 그린다.
 * 게이트: `requireSeller()` 는 guest 를 여기로 보내므로 `getSellerContext()` 를 직접 본다(루프 방지). 신청 테이블·심사·반려·/pending 은 없다.
 * action(default = web completeSignup): 세션·행 상태(guest 만 진행) → rate limit 30분 20건 → parseSignupMeta(폼) → createSellerFromSignup(user, form) → /home.
 *   CSRF 는 SvelteKit 내장(Origin 대조 · trustedOrigins) — web `assertSameSiteAction` 삭제. 실패 문구는 `fail(400, { error })` → `form.error`.
 *   약관 동의 시각은 폼 체크박스(`terms=on`) 또는 이미 user_metadata 에 있는 값 — 숨은 필드 값은 믿지 않는다. `redirect` 는 throw 다.
 */

/** 폼으로 고칠 수 없는 실패 — 안내만 (연결 대상 문제 · 신원 미확인) */
const NO_FORM: ReadonlySet<SignupFailCode> = new Set(['LINK_TARGET_NOT_FOUND', 'LINK_TARGET_TAKEN', 'NOT_CONFIRMED']);

function metaOf(user: { user_metadata?: unknown }): Record<string, unknown> {
	const m = user.user_metadata;
	return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

export const load: PageServerLoad = async (event) => {
	const ctx = await getSellerContext(event);
	if (ctx.state === 'anon') redirect(303, `${sellerPath('/login')}?next=${encodeURIComponent(sellerPath('/apply'))}`);
	if (ctx.state === 'ok') redirect(303, sellerPath('/home'));
	if (ctx.state === 'suspended') redirect(303, sellerPath('/suspended'));
	if (ctx.state === 'foreign') redirect(303, `${sellerPath('/login')}?switch=1`);

	// guest — 멱등 재시도 (성공하면 폼 없이 홈으로)
	const retry = await createSellerFromSignup(ctx.user);
	if (retry.ok) redirect(303, sellerPath('/home'));

	const reasonParam = event.url.searchParams.get('reason');
	const reason: SignupFailCode = isSignupFailCode(reasonParam) ? reasonParam : retry.code;
	const meta = metaOf(ctx.user);
	const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : '');
	const platformRaw = str('platform').toLowerCase();
	return {
		reason,
		message: SIGNUP_FAIL_MESSAGES[reason],
		noForm: NO_FORM.has(reason),
		email: ctx.user.email ?? '',
		company: { email: COMPANY.email, csUrl: COMPANY.csUrl },
		termsUrl: `${SITE_URL}/terms`,
		privacyUrl: `${SITE_URL}/privacy`,
		defaults: {
			name: str('display_name') || str('name'),
			platform: isPlatform(platformRaw) ? platformRaw : ('instagram' as const),
			handle: str('handle'),
			referralCode: str('referral_code').toUpperCase(),
			termsAgreed: typeof meta.terms_agreed_at === 'string' && meta.terms_agreed_at.length > 0
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const ctx = await getSellerContext(event);
		if (ctx.state === 'anon') redirect(303, `${sellerPath('/login')}?next=${encodeURIComponent(sellerPath('/apply'))}`);
		if (ctx.state === 'ok') redirect(303, sellerPath('/home'));
		if (ctx.state === 'suspended') redirect(303, sellerPath('/suspended'));
		if (ctx.state === 'foreign') redirect(303, `${sellerPath('/login')}?switch=1`);

		if (!rateLimit(`apply:${ctx.user.id}`)) return fail(429, { error: RATE_LIMIT_MESSAGE });

		const formData = await event.request.formData();
		const metaTerms = metaOf(ctx.user).terms_agreed_at;
		const form = {
			display_name: formData.get('name'),
			platform: formData.get('platform'),
			handle: formData.get('handle'),
			referral_code: formData.get('referral_code'),
			terms_agreed_at: formData.get('terms') === 'on' ? true : typeof metaTerms === 'string' ? metaTerms : undefined
		};
		const parsed = parseSignupMeta(form);
		if (!parsed.ok) return fail(400, { error: parsed.message });

		const result = await createSellerFromSignup(ctx.user, form);
		if (!result.ok) return fail(400, { error: SIGNUP_FAIL_MESSAGES[result.code] });
		redirect(303, sellerPath('/home'));
	}
};
