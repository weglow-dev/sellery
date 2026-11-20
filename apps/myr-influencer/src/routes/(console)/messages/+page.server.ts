import type { PageServerLoad } from './$types';
import { requireSeller } from '$lib/server/seller';
import { partnerTalkOfUser } from '$lib/server/partner-talk';

/** 파트너팀 톡(0125) — 대화를 읽고 읽음 표시(뱃지 0) · waiting = 운영이 답할 차례(서버 myr_partner_waiting) */
export const load: PageServerLoad = async (event) => {
	await requireSeller(event);
	const { user } = await event.locals.safeGetSession();
	const talk = user ? await partnerTalkOfUser(user.id, true) : null;
	return { messages: talk?.messages ?? [], waiting: talk?.waiting ?? false };
};
