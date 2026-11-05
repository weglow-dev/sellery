/**
 * 크리에이터 콘솔 로그인 규칙 — 공개 경로 · 상태별 이동 · 로그인 폼 검증 · 오류 문구.
 * `$env` · `$app` 을 import 하지 않는 순수 모듈 — `src/test/console-auth.test.ts`. 게이트(hooks · requireSeller)와 로그인 화면이 같이 쓴다.
 */
import { safeNext } from '@sellery/myr-core/auth';

/** 로그인 없이 열리는 경로 — 로그인 · 비밀번호 재설정 요청 · 메일 링크 착지(/auth/*) · 초대 가입(/invite/<토큰>) · robots ·
 *  운영 API(/api/ops/* — 세션 대신 CRON_SECRET 으로 막는다 · lib/server/ops-auth.ts).
 *  `/password/new` 는 재설정 링크가 만든 세션이 있어야 해서 공개가 아니다 */
const PUBLIC_EXACT = new Set(['/login', '/password', '/robots.txt']);
export function isPublicPath(pathname: string): boolean {
	return PUBLIC_EXACT.has(pathname) || pathname.startsWith('/auth/') || pathname.startsWith('/invite/') || pathname.startsWith('/api/ops/');
}

/** 로그인 뒤 돌아갈 곳 — 같은 오리진 경로만(오픈 리다이렉트 방지 · `/auth/` `/login` 은 루프라 제외). 비면 홈 */
export const consoleNext = (next: string | null | undefined): string => safeNext(next);

/** 세션이 없을 때 — 원래 가려던 곳을 `next` 로 싣는다(홈이면 생략) */
export function loginPath(from: string): string {
	const next = consoleNext(from);
	return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}

/** 콘솔 상태 → 이동할 곳. ok 면 null(그대로 진행) */
export function gateLocation(state: 'anon' | 'unlinked' | 'suspended' | 'ok', from: string): string | null {
	switch (state) {
		case 'anon':
			return loginPath(from);
		case 'unlinked':
			return '/unlinked';
		case 'suspended':
			return '/suspended';
		default:
			return null;
	}
}

/** 이메일 형식 — 최상위 도메인 2자 이상(시안 "MYR Influencer Login" 과 같은 규칙) */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;

export type LoginInput = { email: string; password: string };
export type LoginField = 'email' | 'password';
export type LoginParse = { ok: true; input: LoginInput } | { ok: false; field: LoginField; message: string };

/** 칸마다 오류 문구(없으면 빈 문자열) — 로그인 화면이 칸 아래에 바로 보여주고, 서버 검증(parseLoginForm)도 같은 문구를 쓴다 */
export function loginFieldErrors(emailRaw: string, password: string): Record<LoginField, string> {
	const email = emailRaw.trim();
	return {
		email: !email ? '이메일을 입력해주세요' : !EMAIL_RE.test(email) || email.length > 254 ? '이메일 형식을 확인해주세요 (예: creator@myr.kr)' : '',
		password: !password ? '비밀번호를 입력해주세요' : password.length < PASSWORD_MIN ? `비밀번호는 ${PASSWORD_MIN}자 이상이에요` : ''
	};
}

export function parseLoginForm(fd: { get(name: string): unknown }): LoginParse {
	const email = String(fd.get('email') ?? '')
		.trim()
		.toLowerCase();
	const password = String(fd.get('password') ?? '');
	const errs = loginFieldErrors(email, password);
	if (errs.email) return { ok: false, field: 'email', message: errs.email };
	if (errs.password) return { ok: false, field: 'password', message: errs.password };
	return { ok: true, input: { email, password } };
}

/** "이 기기에서 로그인 유지" — 끄면 세션 쿠키를 브라우저를 닫을 때 지워지는 쿠키로 쓴다(hooks 가 이 쿠키를 보고 만료 시각을 뺀다) */
export const SESSION_ONLY_COOKIE = 'myr_session_only';

/** 새 비밀번호 — 8자 이상 · 확인 칸과 같아야 한다 */
export function parseNewPassword(fd: { get(name: string): unknown }): { ok: true; password: string } | { ok: false; message: string } {
	const password = String(fd.get('password') ?? '');
	const confirm = String(fd.get('confirm') ?? '');
	if (password.length < PASSWORD_MIN) return { ok: false, message: `비밀번호는 ${PASSWORD_MIN}자 이상이에요` };
	if (password.length > 72) return { ok: false, message: '비밀번호는 72자까지 쓸 수 있어요' };
	if (password !== confirm) return { ok: false, message: '두 비밀번호가 달라요' };
	return { ok: true, password };
}

/**
 * Supabase Auth 오류 → 화면 문구. 계정이 있는지 없는지 드러내지 않도록 자격 증명 오류는 한 문구로 묶는다.
 * 원문 메시지는 로그에만 남긴다.
 */
export function authErrorMessage(raw: string | null | undefined): string {
	const m = (raw ?? '').toLowerCase();
	if (m.includes('invalid login credentials') || m.includes('invalid credentials')) return '이메일 또는 비밀번호가 맞지 않아요';
	if (m.includes('email not confirmed')) return '메일 인증이 아직 끝나지 않았어요 — 받은 메일의 버튼을 먼저 눌러주세요';
	if (m.includes('rate limit') || m.includes('too many')) return '시도가 너무 많아요 — 잠시 후 다시 해주세요';
	if (m.includes('same password') || m.includes('should be different')) return '지금 쓰는 비밀번호와 다른 비밀번호를 정해주세요';
	if (m.includes('weak') || m.includes('at least')) return '비밀번호가 너무 쉬워요 — 더 길게 정해주세요';
	return '잠시 후 다시 시도해주세요';
}

/** 로그인 화면 `?error=` — 메일 링크 착지(/auth/confirm) 실패 */
/**
 * 메일 링크(재설정 · 초대)가 거절됐을 때 갈 곳 — 이미 쓴 링크를 다시 누르거나 메일 앱이 링크를 먼저 열어 버린 경우.
 * 로그인된 상태(첫 클릭이 만든 세션 등)면 로그인 화면이 바로 홈으로 넘겨 안내가 사라지므로(2026-11-05 실제 발생),
 * 재설정 · 초대 링크는 새 비밀번호 화면으로 보내 "링크는 이미 쓰였지만 바로 바꿀 수 있어요" 를 보여준다.
 */
export function linkFailureTarget(type: string, loggedIn: boolean): string {
	if (loggedIn && (type === 'recovery' || type === 'invite')) return '/password/new?link=used';
	return '/login?error=expired';
}

export const LINK_ERROR: Record<string, string> = {
	expired: '링크가 만료됐거나 이미 사용됐어요. 비밀번호를 정했다면 로그인하고, 아니라면 비밀번호 찾기로 메일을 다시 받아주세요.',
	auth: '로그인에 실패했어요. 잠시 후 다시 시도해주세요.'
};
