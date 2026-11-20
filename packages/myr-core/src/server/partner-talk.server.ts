/**
 * MYR 파트너팀 톡(0125 · 서버 전용) — 크리에이터는 세션의 user id 로만(RPC 가 sellers.user_id 로 찾는다). 판정은 DB(myr_partner_*).
 */
import { partnerMessageFromJson, partnerMessagesFromJson, type PartnerMessage } from '../partner-talk';
import { admin } from './admin.server';

/** 대화(오래된 것부터) — markRead 면 읽음 표시(뱃지 0). 크리에이터 계정이 아니면 null */
export async function partnerTalkOfUser(userId: string, markRead = true): Promise<{ messages: PartnerMessage[]; unread: number; waiting: boolean } | null> {
	const { data, error } = await admin().rpc('myr_app_partner_talk_of_user', { p_user: userId, p_mark_read: markRead });
	if (error) throw new Error(`myr_app_partner_talk_of_user failed: ${error.message}`);
	const r = data as { ok?: boolean; messages?: unknown; unread?: unknown; waiting?: unknown } | null;
	if (!r?.ok) return null;
	return { messages: partnerMessagesFromJson(r.messages), unread: typeof r.unread === 'number' ? r.unread : 0, waiting: r.waiting === true };
}

/** 안 읽은 파트너팀 답변 수(메신저 뱃지) — 실패하면 0(뱃지가 화면을 막지 않게) */
export async function partnerUnreadOfUser(userId: string): Promise<number> {
	const { data, error } = await admin().rpc('myr_app_partner_unread_of_user', { p_user: userId });
	if (error) {
		console.error('[partner-talk] unread failed:', error.message);
		return 0;
	}
	return typeof data === 'number' ? data : 0;
}

/** 보내기 — 거부 코드는 서버 그대로(NOT_FOUND · BAD_BODY · TOO_FAST) */
export async function sendPartnerMessageOfUser(userId: string, body: string): Promise<{ ok: true; message: PartnerMessage } | { ok: false; code: string }> {
	const { data, error } = await admin().rpc('myr_app_partner_send_of_user', { p_user: userId, p_body: body });
	if (error) {
		console.error('[partner-talk] send failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = data as { ok?: boolean; code?: string; message?: unknown } | null;
	const message = r?.ok ? partnerMessageFromJson(r.message) : null;
	return message ? { ok: true, message } : { ok: false, code: r?.code ?? 'DB_ERROR' };
}
