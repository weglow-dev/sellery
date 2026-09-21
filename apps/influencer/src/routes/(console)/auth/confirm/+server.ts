import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPartnerUser, safeNext } from '@sellery/db/auth';
import { consolePath } from '@sellery/db/console-paths';
import { createAdminClient, ensureCustomer } from '$lib/server/db';
import { createSellerFromSignup, linkSellerIdOf } from '$lib/server/partner';

/**
 * GET /influencer/auth/confirm — **콘솔 전용 사본**(docs/monorepo-migration.md 결정 15 · §5.1) — shop `routes/auth/confirm/+server.ts` 와 같은 로직,
 * 실패 착지만 항상 콘솔 로그인(`/influencer/login?error=<reason>`). token_hash 방식 인증·재설정·초대 링크 착지 (docs/inf-console-plan.md §4.1 · §4.3).
 *   `?token_hash=…&type=signup|recovery|invite|email|magiclink&next=…`
 *   verifyOtp({ type, token_hash }) → 세션 쿠키 → 파트너(`isPartnerUser` 또는 `app_metadata.link_seller_id`)면
 *   `ensureCustomer` 생략 + `createSellerFromSignup(user)`(멱등 · 한 트랜잭션) → `safeNext(next)`(비었으면 `/influencer/home`) 로 302.
 *   생성 실패(`ok:false`) → `/influencer/apply?reason=<code>`(보완 폼). `type=recovery` 는 생성 없이 `/influencer/password/new`.
 *   파트너가 아닌 계정(카카오 고객 — 이 라우트로 올 일은 없지만 shop 사본과 동일하게)은 `ensureCustomer`(best-effort) + `?welcome=1`.
 * 가입 폼·재발송·재설정의 `emailRedirectTo`/`redirectTo` 가 이 경로를 가리킨다 — 콘솔 Preview(`sellery-influencer-*.vercel.app`) 에서도 가입 메일 링크가 같은 오리진에 착지한다.
 * 만료·재사용 링크(같은 token_hash 재클릭)는 `?error=expired` — 이미 인증된 계정이면 로그인만 하면 된다.
 */
const OTP_TYPES = ['signup', 'recovery', 'invite', 'email', 'magiclink', 'email_change'] as const;
type OtpType = (typeof OTP_TYPES)[number];

function isOtpType(v: string | null): v is OtpType {
	return v !== null && (OTP_TYPES as readonly string[]).includes(v);
}

const loginPath = (reason: string) => `${consolePath('seller', '/login')}?error=${reason}`;

export const GET: RequestHandler = async ({ url, locals }) => {
	const tokenHash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type');
	const next = safeNext(url.searchParams.get('next'));

	if (!tokenHash || !isOtpType(type) || !locals.supabase) redirect(302, loginPath('auth'));

	const { data, error } = await locals.supabase.auth.verifyOtp({ type, token_hash: tokenHash });
	if (error || !data.user) {
		console.error('[influencer/auth/confirm] verifyOtp failed:', error?.message ?? 'no user');
		redirect(302, loginPath('expired'));
	}
	const user = data.user;
	const partner = isPartnerUser(user) || linkSellerIdOf(user) !== null;

	if (type === 'recovery') {
		// 비밀번호 재설정 — 생성 호출 없이 새 비밀번호 화면으로 (next 에도 실려 오지만 고정 목적지로 통일)
		redirect(302, consolePath('seller', '/password/new'));
	}

	if (partner) {
		// 파트너 — ensureCustomer 생략(§4.2). 가입 생성은 멱등(already:true) 이라 링크 재클릭·재시도에 안전.
		const result = await createSellerFromSignup(user);
		if (!result.ok) {
			console.error('[influencer/auth/confirm] createSellerFromSignup:', result.code, result.field ?? '');
			redirect(302, `${consolePath('seller', '/apply')}?reason=${encodeURIComponent(result.code)}`);
		}
		// next 가 비었으면(safeNext 폴백 "/") 콘솔 홈 — "/" 는 고객 홈이다
		redirect(302, next === '/' ? consolePath('seller', '/home') : next);
	}

	// 고객(카카오) — shop 사본과 동일 (best-effort)
	void (async () => {
		await ensureCustomer(createAdminClient(), user);
	})().catch((e: unknown) => {
		console.error('[influencer/auth/confirm] ensureCustomer failed:', e instanceof Error ? e.message : e);
	});
	const dest = new URL(next, url.origin);
	dest.searchParams.set('welcome', '1');
	redirect(302, dest.pathname + dest.search + dest.hash);
};
