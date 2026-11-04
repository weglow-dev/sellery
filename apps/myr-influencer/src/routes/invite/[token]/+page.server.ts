import { fail } from '@sveltejs/kit';
import { rateLimit } from '@sellery/myr-core/rate-limit';
import type { Actions, PageServerLoad } from './$types';
import { acceptFailure, allAgreed, parseSignupForm, signupErrors, SIGNUP_FIELDS } from '$lib/signup-rules';
import { hasAdmin } from '@sellery/myr-core/server/admin';
import { acceptInvite, handleStatusOnly, requestReinvite, viewInvite } from '$lib/server/invite';
import { previewTokenOf } from '$lib/server/invite-preview';
import { previewInvite } from '$lib/invite-preview';
import { HANDLE_STATUS_MESSAGE } from '$lib/signup-rules';

/**
 * 초대 가입 `/invite/<토큰>` — 시안 "MYR Influencer Signup"(모바일 · PC)의 네 화면(초대장 · 가입 폼 · 환영 · 만료) · docs/myr.md 결정 14 · §4.2.1 10번.
 *   load     토큰 → 초대(0070 myr_app_invite_view). 열리지 않으면(없음 · 만료 · 사용됨 · 취소) 만료 화면
 *   signup   가입 — 칸 검증(signup-rules · 화면과 같은 함수) → 계정 생성 + 크리에이터 연결(myr-core acceptInvite) → 바로 로그인
 *   request  만료 화면 "새 초대 요청하기" → 그 초대에 요청 기록(운영 목록 requested)
 * 토큰은 이 경로에만 실린다(로그 · 응답에 다시 싣지 않는다). 레이트리밋은 IP 기준(함수 인스턴스 메모리 — 느슨한 상한).
 * 미리보기 주소(dev · Vercel Preview 만 — lib/invite-preview.ts): /invite/preview · preview-used · preview-expired — 저장하지 않는다.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const preview = previewTokenOf(params.token);
	if (preview) return { ...previewInvite(preview), preview: true };
	if (!hasAdmin()) {
		console.error('[invite] SUPABASE_SERVICE_ROLE_KEY 없음 — docs/deploy.md 크리에이터 콘솔 절');
		return { state: 'expired' as const, reason: 'DB_ERROR', preview: false };
	}
	const v = await viewInvite(params.token);
	if (!v.ok) return { state: 'expired' as const, reason: v.code, preview: false };
	return { state: 'valid' as const, email: v.email, expiresAt: v.expiresAt, preview: false };
};

export const actions: Actions = {
	signup: async ({ params, request, locals, getClientAddress }) => {
		if (!rateLimit(`invite-signup:${getClientAddress()}`, 10)) return fail(429, { action: 'signup' as const, message: '시도가 너무 많아요. 잠시 후 다시 시도해주세요' });
		if (!hasAdmin()) return fail(503, { action: 'signup' as const, message: '가입 서버 설정이 아직 끝나지 않았어요' });
		const values = parseSignupForm(await request.formData());

		// 1. 칸 검증 — 화면과 같은 규칙(브라우저 검사를 건너뛴 요청도 여기서 막힌다)
		const errs = signupErrors(values);
		const bad = SIGNUP_FIELDS.find((k) => !!errs[k]);
		if (bad) return fail(400, { action: 'signup' as const, field: bad, message: errs[bad] });
		if (!allAgreed(values.agreed)) return fail(400, { action: 'signup' as const, field: 'terms' as const, message: '약관과 개인정보 수집 · 이용에 동의해주세요' });

		// 미리보기 — 핸들은 실제 DB 규칙으로 보고, 저장 없이 환영 화면으로
		if (previewTokenOf(params.token)) {
			const st = await handleStatusOnly(values.handle);
			if (st && st !== 'available') return fail(400, { action: 'signup' as const, field: 'handle' as const, message: HANDLE_STATUS_MESSAGE[st] });
			return { action: 'signup' as const, ok: true as const, signedIn: false, handle: `@${values.handle}` };
		}

		// 2. 계정 + 크리에이터 연결(RPC 가 핸들 중복 · 예약어 · 초대 상태를 다시 본다)
		const r = await acceptInvite({
			token: params.token,
			password: values.password,
			name: values.name.trim(),
			handle: values.handle,
			platform: values.platform ?? '',
			phone: values.phone,
			termsAgreedAt: new Date().toISOString()
		});
		if (!r.ok) {
			const f = acceptFailure(r.code, r.field);
			if (r.code === 'DB_ERROR') console.error('[invite] accept failed');
			return fail('screen' in f ? 410 : 400, { action: 'signup' as const, code: r.code, ...f });
		}

		// 3. 바로 로그인(실패해도 가입은 끝났다 — 환영 화면의 버튼이 로그인으로 보낸다)
		let signedIn = false;
		if (locals.supabase) {
			const { error } = await locals.supabase.auth.signInWithPassword({ email: r.email, password: values.password });
			if (error) console.warn('[invite] signIn after signup:', error.message);
			signedIn = !error;
		}
		return { action: 'signup' as const, ok: true as const, signedIn, handle: r.handle };
	},

	request: async ({ params, getClientAddress }) => {
		if (previewTokenOf(params.token)) return { action: 'request' as const, requested: true };
		if (!rateLimit(`invite-request:${getClientAddress()}`, 5)) return { action: 'request' as const, requested: false as const };
		if (!hasAdmin()) return { action: 'request' as const, requested: false as const };
		const r = await requestReinvite(params.token);
		return { action: 'request' as const, requested: r.ok };
	}
};
