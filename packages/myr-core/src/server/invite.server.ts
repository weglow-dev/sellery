/**
 * 크리에이터 초대 가입(서버 전용 · 0070 · docs/myr.md 결정 14 · §4.2.1 10번).
 * 콘솔(apps/myr-influencer)의 초대 화면 · 운영 API 와 이후 운영 콘솔(myr-admin)이 이 함수들만 부른다 — 판정은 전부 0070 RPC 안에 있다.
 *
 *   issueInvite      발급(이전 링크 취소) + 초대 메일 → 링크(운영자가 복사해 따로 보낼 수 있게)
 *   revokeInvite · listInvites
 *   viewInvite       초대 화면 load
 *   checkHandle      가입 폼 핸들 칸을 벗어날 때(유효한 초대 토큰이 있어야 묻는다)
 *   acceptInvite     가입 — 초대 이메일로 로그인 계정(메일 인증 완료 · 비밀번호)을 만들고 RPC 로 크리에이터 행에 연결. RPC 가 거절하면 만든 계정을 지운다
 *   requestReinvite  만료 화면 "새 초대 요청하기" → 그 초대에 요청 시각 기록(운영 목록 requested)
 * 토큰 원문은 저장하지 않는다(DB 에는 sha256) — 발급 응답과 초대 메일에만 실린다.
 */
import { creatorInviteMail } from '../mail/templates';
import { inviteLink, isInviteToken, type AcceptCode, type HandleStatus, type InviteClosedCode, type IssueCode, handleStatusOf, isInviteClosed } from '../invite-rules';
import { admin } from './admin.server';
import { sendMail, type MailSendResult } from './mail.server';

type Rpc = { ok?: boolean; code?: string; field?: string; [k: string]: unknown };

async function rpc(fn: string, args: Record<string, unknown>): Promise<Rpc | null> {
	const { data, error } = await admin().rpc(fn, args);
	if (error) {
		console.error(`[invite] ${fn} failed:`, error.message);
		return null;
	}
	return (data ?? null) as Rpc | null;
}

/* ---------------- 운영 ---------------- */

export type IssuedInvite = { inviteId: string; email: string; link: string; expiresAt: string; reissued: boolean; mail: MailSendResult };
export type IssueResult = { ok: true; invite: IssuedInvite } | { ok: false; code: IssueCode };

/** 발급 — consoleUrl 은 링크가 가리킬 콘솔 주소(운영 API 는 자기 오리진). 메일이 실패해도 링크는 돌려준다(운영자가 복사해 보낸다) */
export async function issueInvite(input: { email: string; invitedBy?: string | null; consoleUrl: string; inviter: string; days?: number }): Promise<IssueResult> {
	const r = await rpc('myr_app_admin_invite_create', { p_email: input.email, p_invited_by: input.invitedBy ?? null, p_days: input.days ?? 7 });
	if (!r) return { ok: false, code: 'DB_ERROR' };
	if (!r.ok) return { ok: false, code: (r.code as IssueCode) ?? 'DB_ERROR' };
	const token = String(r.token);
	const invite = { inviteId: String(r.invite_id), email: String(r.email), link: inviteLink(input.consoleUrl, token), expiresAt: String(r.expires_at), reissued: r.reissued === true };
	const tpl = creatorInviteMail({ ...invite, inviter: input.inviter });
	const mail = await sendMail({ to: invite.email, subject: tpl.subject, html: tpl.html, text: tpl.text, tag: tpl.tag, idempotencyKey: tpl.idempotencyKey });
	if (!mail.ok) console.warn(`[invite] mail not sent (${mail.reason}) — 링크를 복사해 전달`);
	return { ok: true, invite: { ...invite, mail } };
}

export async function revokeInvite(email: string): Promise<{ ok: true; revoked: number } | { ok: false; code: 'BAD_EMAIL' | 'DB_ERROR' }> {
	const r = await rpc('myr_app_admin_invite_revoke', { p_email: email });
	if (!r) return { ok: false, code: 'DB_ERROR' };
	return r.ok ? { ok: true, revoked: Number(r.revoked ?? 0) } : { ok: false, code: 'BAD_EMAIL' };
}

export type InviteRow = {
	id: string;
	email: string;
	invited_by: string | null;
	created_at: string;
	expires_at: string;
	used_at: string | null;
	revoked_at: string | null;
	revoked_reason: string | null;
	requested_at: string | null;
	request_count: number;
	state: 'pending' | 'used' | 'expired' | 'revoked';
	seller: { id: string; name: string; handle: string } | null;
};
export async function listInvites(state: string | null, limit = 100): Promise<InviteRow[]> {
	const { data, error } = await admin().rpc('myr_app_admin_invite_list', { p_state: state, p_limit: limit });
	if (error) throw new Error(`invite list failed: ${error.message}`);
	return (data ?? []) as InviteRow[];
}

/* ---------------- 초대 링크 ---------------- */

export type InviteView = { ok: true; email: string; expiresAt: string } | { ok: false; code: InviteClosedCode | 'DB_ERROR' };
export async function viewInvite(token: string): Promise<InviteView> {
	if (!isInviteToken(token)) return { ok: false, code: 'NOT_FOUND' };
	const r = await rpc('myr_app_invite_view', { p_token: token });
	if (!r) return { ok: false, code: 'DB_ERROR' };
	if (!r.ok) return { ok: false, code: isInviteClosed(r.code) ? r.code : 'NOT_FOUND' };
	return { ok: true, email: String(r.email), expiresAt: String(r.expires_at) };
}

export type HandleCheck = { ok: true; handle: string; status: HandleStatus } | { ok: false; code: InviteClosedCode | 'DB_ERROR' };
export async function checkHandle(token: string, handle: string): Promise<HandleCheck> {
	if (!isInviteToken(token)) return { ok: false, code: 'NOT_FOUND' };
	const r = await rpc('myr_app_invite_handle_check', { p_token: token, p_handle: handle });
	if (!r) return { ok: false, code: 'DB_ERROR' };
	if (!r.ok) return { ok: false, code: isInviteClosed(r.code) ? r.code : 'NOT_FOUND' };
	return { ok: true, handle: String(r.handle ?? ''), status: handleStatusOf(r) ?? 'bad' };
}

export type AcceptInput = { token: string; password: string; name: string; handle: string; platform: string; phone: string; termsAgreedAt: string };
export type AcceptResult = { ok: true; email: string; sellerId: string; handle: string } | { ok: false; code: AcceptCode; field?: string };

/** Supabase Auth 의 "이미 있는 이메일" 오류 */
const isEmailExists = (e: { code?: string; message?: string }): boolean => e.code === 'email_exists' || /already (been )?registered|already exists/i.test(e.message ?? '');

export async function acceptInvite(input: AcceptInput): Promise<AcceptResult> {
	const view = await viewInvite(input.token);
	if (!view.ok) return { ok: false, code: view.code };

	// 1. 로그인 계정 — 초대 링크가 이메일 소유를 대신하므로 메일 인증 완료로 만든다(인증 메일 없음)
	const { data: created, error: cErr } = await admin().auth.admin.createUser({ email: view.email, password: input.password, email_confirm: true, app_metadata: { myr_creator: true } });
	if (cErr || !created.user) {
		if (cErr && cErr.code === 'weak_password') return { ok: false, code: 'WEAK_PASSWORD', field: 'password' };
		if (cErr && isEmailExists(cErr)) {
			// 같은 링크의 동시 제출이 먼저 끝났으면 그 결과(USED)로 — 아니면 초대 뒤에 생긴 계정
			const again = await viewInvite(input.token);
			return { ok: false, code: !again.ok && again.code === 'USED' ? 'USED' : 'EMAIL_HAS_ACCOUNT' };
		}
		console.error('[invite] createUser failed:', cErr?.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const userId = created.user.id;

	// 2. 크리에이터 행 · 초대 사용 — 거절되면 방금 만든 계정을 지운다(다음 시도가 EMAIL_HAS_ACCOUNT 로 막히지 않게)
	const r = await rpc('myr_app_invite_accept', {
		p_token: input.token,
		p_user_id: userId,
		p_name: input.name,
		p_handle: input.handle,
		p_platform: input.platform,
		p_phone: input.phone,
		p_terms_agreed_at: input.termsAgreedAt
	});
	if (!r?.ok) {
		const { error: dErr } = await admin().auth.admin.deleteUser(userId);
		if (dErr) console.error('[invite] rollback deleteUser failed:', dErr.message);
		return { ok: false, code: (r?.code as AcceptCode) ?? 'DB_ERROR', ...(r?.field ? { field: String(r.field) } : {}) };
	}
	return { ok: true, email: view.email, sellerId: String(r.seller_id), handle: String(r.handle) };
}

export async function requestReinvite(token: string): Promise<{ ok: true; email: string } | { ok: false; code: 'NOT_FOUND' | 'USED' | 'DB_ERROR' }> {
	if (!isInviteToken(token)) return { ok: false, code: 'NOT_FOUND' };
	const r = await rpc('myr_app_invite_request', { p_token: token });
	if (!r) return { ok: false, code: 'DB_ERROR' };
	if (!r.ok) return { ok: false, code: r.code === 'USED' ? 'USED' : 'NOT_FOUND' };
	return { ok: true, email: String(r.email) };
}
