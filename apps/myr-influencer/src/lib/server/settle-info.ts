/** 사업자 · 정산 정보(9번 · 0085) — `@sellery/myr-core/server/settle-info` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음. */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import { admin } from '@sellery/myr-core/server/admin';
import { getSettleInfoOfUser, type SettleInfo } from '@sellery/myr-core/server/settle-info';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/settle-info';

/** 가입 때 받은 프로필 칸(0070) — 내 정보 화면이 보여 준다(대표 채널 · 연락처 · 가입일) */
export type MyProfileExtra = { platform: string | null; phone: string | null; joinedAt: string | null };
async function profileExtraOf(userId: string): Promise<MyProfileExtra> {
	const { data, error } = await admin().from('sellers').select('platform, contact_phone, created_at').eq('user_id', userId).maybeSingle();
	if (error) console.error('[my] profile failed:', error.message);
	return { platform: data?.platform ?? null, phone: data?.contact_phone ?? null, joinedAt: data?.created_at ?? null };
}

/** 게이트(requireSeller)와 정보 조회를 **동시에** 보내고, 게이트가 통과할 때만 돌려준다(claims.ts myClaims 와 같은 방식) */
export async function mySettleInfo(event: RequestEvent): Promise<{ seller: SellerSummary; info: SettleInfo | null; profile: MyProfileExtra }> {
	const { user } = await event.locals.safeGetSession();
	const infoP = user ? getSettleInfoOfUser(user.id) : Promise.resolve(null);
	const profileP = user ? profileExtraOf(user.id) : Promise.resolve({ platform: null, phone: null, joinedAt: null });
	infoP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다
	profileP.catch(() => {});
	const seller = await requireSeller(event);
	return { seller, info: await infoP, profile: await profileP };
}
