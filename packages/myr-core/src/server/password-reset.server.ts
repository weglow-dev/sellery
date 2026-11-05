/**
 * 크리에이터 비밀번호 재설정 메일(서버 전용 · 2026-11-05) — Supabase `resetPasswordForEmail` 은 프로젝트의 공용 템플릿(셀러리 문구 · 보낸 사람 Sellery)으로
 * 나가므로, MYR 은 토큰만 admin `generateLink(recovery)` 로 받고(Supabase 는 메일을 보내지 않는다) 메일은 MYR 디자인으로 Resend 로 보낸다.
 *   - **MYR 크리에이터 계정(`sellers.user_id`)에만** 보낸다 — 샵 고객 · 셀러리 계정 등은 조용히 건너뛴다(계정 유무는 화면에 드러내지 않는다)
 *   - 링크는 `/auth/confirm?token_hash=…&type=recovery&next=/password/new`(초대와 같은 콘솔 착지) · 1회용 · 만료는 Supabase 설정(기본 1시간)
 *   - 절대 throw 하지 않는다 — 결과는 로그용(sent · reason)
 */
import { passwordResetMail } from '../mail/templates';
import { isTokenHash, recoveryLink } from '../password-reset';
import { admin } from './admin.server';
import { sendMail } from './mail.server';

export type ResetResult = { sent: true } | { sent: false; reason: 'no_user' | 'not_creator' | 'suspended' | 'db_error' | 'mail_failed' };

export async function sendPasswordReset(input: { email: string; consoleUrl: string }): Promise<ResetResult> {
	try {
		const { data, error } = await admin().auth.admin.generateLink({ type: 'recovery', email: input.email });
		const tokenHash = data?.properties?.hashed_token;
		if (error || !data?.user || !isTokenHash(tokenHash)) return { sent: false, reason: 'no_user' };
		const { data: seller, error: sErr } = await admin().from('sellers').select('name, active').eq('user_id', data.user.id).maybeSingle();
		if (sErr) {
			console.error('[password-reset] sellers lookup failed:', sErr.message);
			return { sent: false, reason: 'db_error' };
		}
		if (!seller) return { sent: false, reason: 'not_creator' };
		if (!seller.active) return { sent: false, reason: 'suspended' };
		const tpl = passwordResetMail({ name: String(seller.name), email: input.email, link: recoveryLink(input.consoleUrl, tokenHash), tokenHash });
		const r = await sendMail({ to: input.email, subject: tpl.subject, html: tpl.html, text: tpl.text, tag: tpl.tag, idempotencyKey: tpl.idempotencyKey });
		if (!r.ok) {
			console.warn(`[password-reset] mail not sent (${r.reason})`);
			return { sent: false, reason: 'mail_failed' };
		}
		return { sent: true };
	} catch (e) {
		console.error('[password-reset] failed:', e instanceof Error ? e.message : e);
		return { sent: false, reason: 'db_error' };
	}
}
