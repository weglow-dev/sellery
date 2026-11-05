import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consoleNext, linkFailureTarget } from '$lib/console-auth';

/**
 * GET /auth/confirm — 메일 링크 착지(비밀번호 재설정 · 초대). token_hash 방식(셀러리 콘솔과 같은 이유 — 링크를 다른 기기에서 열어도 된다).
 *   `?token_hash=…&type=recovery|invite|signup|email|magiclink&next=…`
 *   verifyOtp → 세션 쿠키 → 재설정 · 초대는 새 비밀번호 화면(`/password/new`), 그 밖은 `next`(같은 오리진 경로만 · 기본 홈).
 * 실패(만료 · 재사용 · 형식 오류)는 로그인 화면 `?error=expired|auth` — 단 이미 로그인된 상태의 재설정 · 초대 링크는 새 비밀번호 화면으로(linkFailureTarget).
 * Supabase 이메일 템플릿은 셀러리와 한 벌이고 링크가 `{{ .RedirectTo }}&token_hash=…&type=…` 라서, 이 앱이 보낸 `redirectTo` 가 이 경로를 가리키면 여기로 온다
 * (Supabase Redirect URLs 에 이 앱 주소가 있어야 한다 — 없으면 Site URL(셀러리)로 떨어진다 · docs/deploy.md MYR 표).
 * 크리에이터 연결 여부는 여기서 보지 않는다 — 다음 화면의 콘솔 게이트(requireSeller)가 본다.
 */
const OTP_TYPES = ['signup', 'recovery', 'invite', 'email', 'magiclink', 'email_change'] as const;
type OtpType = (typeof OTP_TYPES)[number];
const isOtpType = (v: string | null): v is OtpType => v !== null && (OTP_TYPES as readonly string[]).includes(v);

export const GET: RequestHandler = async ({ url, locals }) => {
	const tokenHash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type');
	if (!tokenHash || !isOtpType(type) || !locals.supabase) redirect(302, '/login?error=auth');

	const { error } = await locals.supabase.auth.verifyOtp({ type, token_hash: tokenHash });
	if (error) {
		console.warn('[auth/confirm] verifyOtp failed:', error.message);
		const { user } = await locals.safeGetSession();
		redirect(302, linkFailureTarget(type, !!user));
	}
	if (type === 'recovery' || type === 'invite') redirect(302, '/password/new');
	redirect(302, consoleNext(url.searchParams.get('next')));
};
