import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPartnerUser, safeNext } from '@sellery/db/auth';
import { PREFIX_OF, consolePath } from '@sellery/db/console-paths';
import { createAdminClient, createSellerFromSignup, ensureCustomer, linkSellerIdOf } from '$lib/server/db';

/**
 * GET /auth/confirm — **token_hash 방식** 인증·재설정·초대 링크 착지 (docs/inf-console-plan.md §4.1 · §4.3 · web auth/confirm/route.ts 1:1).
 *   `?token_hash=…&type=signup|recovery|invite|email|magiclink&next=…`
 *   verifyOtp({ type, token_hash }) → 세션 쿠키 → 파트너(`isPartnerUser` 또는 `app_metadata.link_seller_id`)면
 *   `ensureCustomer` 생략 + `createSellerFromSignup(user)`(멱등 · 한 트랜잭션) → `safeNext(next)` 로 302.
 *   생성 실패(`ok:false`) → `/influencer/apply?reason=<code>`(보완 폼). `type=recovery` 는 생성 없이 `/influencer/password/new`.
 *   카카오 고객(파트너 아님)은 기존 콜백처럼 `ensureCustomer`(best-effort) + `?welcome=1`.
 *
 * PKCE `?code=` 가 아니라 token_hash 를 쓰는 이유: code verifier 는 signUp 을 호출한 브라우저 쿠키에만 있어 데스크톱에서
 * 가입하고 휴대폰 메일 앱에서 링크를 열면 exchangeCodeForSession 이 실패한다. 이메일 템플릿의 링크를
 * `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup` 으로 바꿔야 이 라우트에 도달한다(web/DEPLOY.md §3.5).
 * 콘솔 경로는 경로 모드 상대 경로(`/influencer/...`) 그대로 — web `loginUrlFor` 의 호스트 분기는 결정 11 로 삭제됐다.
 */
const OTP_TYPES = ['signup', 'recovery', 'invite', 'email', 'magiclink', 'email_change'] as const;
type OtpType = (typeof OTP_TYPES)[number];

function isOtpType(v: string | null): v is OtpType {
	return v !== null && (OTP_TYPES as readonly string[]).includes(v);
}

/** 실패 시 보낼 로그인 경로 — next 가 콘솔 경로면 콘솔 로그인(`?error=<reason>`), 아니면 고객 로그인(`?error=auth`) */
function loginPathFor(next: string, reason: string): string {
	if (next.startsWith(`${PREFIX_OF.seller}/`) || next === PREFIX_OF.seller) return `${PREFIX_OF.seller}/login?error=${reason}`;
	return '/login?error=auth';
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const tokenHash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type');
	const next = safeNext(url.searchParams.get('next'));

	if (!tokenHash || !isOtpType(type) || !locals.supabase) redirect(302, loginPathFor(next, 'auth'));

	const { data, error } = await locals.supabase.auth.verifyOtp({ type, token_hash: tokenHash });
	if (error || !data.user) {
		console.error('[auth/confirm] verifyOtp failed:', error?.message ?? 'no user');
		// 만료·재사용 링크는 로그인으로 (이미 인증된 계정이면 로그인만 하면 된다)
		redirect(302, loginPathFor(next, 'expired'));
	}
	const user = data.user;
	const partner = isPartnerUser(user) || linkSellerIdOf(user) !== null;

	if (type === 'recovery') {
		// 비밀번호 재설정 — 생성 호출 없이 새 비밀번호 화면으로 (next 에도 실려 오지만 고정 목적지로 통일 · 파트너 전용 흐름)
		redirect(302, consolePath('seller', '/password/new'));
	}

	if (partner) {
		// 파트너 — ensureCustomer 생략(§4.2). 가입 생성은 멱등(already:true) 이라 링크 재클릭·재시도에 안전.
		const result = await createSellerFromSignup(user);
		if (!result.ok) {
			console.error('[auth/confirm] createSellerFromSignup:', result.code, result.field ?? '');
			redirect(302, `${consolePath('seller', '/apply')}?reason=${encodeURIComponent(result.code)}`);
		}
		// next 가 비었으면(safeNext 폴백 "/") 콘솔 홈 — 경로 모드에서 "/" 는 고객 홈이다
		redirect(302, next === '/' ? consolePath('seller', '/home') : next);
	}

	// 고객(카카오) — 기존 콜백과 동일 (best-effort)
	void (async () => {
		await ensureCustomer(createAdminClient(), user);
	})().catch((e: unknown) => {
		console.error('[auth/confirm] ensureCustomer failed:', e instanceof Error ? e.message : e);
	});
	const dest = new URL(next, url.origin);
	dest.searchParams.set('welcome', '1');
	redirect(302, dest.pathname + dest.search + dest.hash);
};
