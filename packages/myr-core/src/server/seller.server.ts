/**
 * 크리에이터 콘솔 게이트 — 로그인한 사람이 어느 크리에이터(`sellers` 행)인지 정한다(docs/myr.md §4.2.1 2번 · 결정 3).
 * 셀러리 `packages/db/src/server/partner/seller.server.ts` 의 `getSellerContext` 를 MYR 에 맞게 줄였다(복사 · 🥬 잔액 · 가입 보완 폼 · 고객 세션 분기 없음).
 *
 * **진실은 `sellers.user_id = 로그인한 계정 and active`** 이다 — `user_metadata` 같은 클라이언트가 바꿀 수 있는 값은 보지 않는다.
 * 상태는 넷:
 *   anon       세션 없음 → 로그인 화면
 *   unlinked   로그인은 됐는데 연결된 크리에이터가 없음(가입 전 · 다른 서비스 계정) → 안내 화면
 *   suspended  연결된 크리에이터가 정지(active=false) → 안내 화면
 *   ok         콘솔 사용
 * 모든 콘솔 페이지 load · form action 이 직접 부른다 — 레이아웃에만 두면 형제 페이지 이동 때 정지된 계정이 세션 동안 계속 들어온다.
 * 이후 모든 콘솔 RPC 에 넘기는 seller id 는 여기서 나온 `seller.id` 뿐이다(폼 값은 받지 않는다 · 결정 3).
 */
import type { User } from '@supabase/supabase-js';
import type { SellerContext, SellerSummary } from '../seller';
import { admin } from './admin.server';

export type { SellerContext, SellerSummary } from '../seller';

type Row = { id: string; name: string; handle: string; avatar_url: string | null; email: string | null; active: boolean };

/** user 의 크리에이터 행 — 없으면 null. DB 오류는 throw(페이지 500 — 정지 계정을 "연결 없음" 으로 잘못 보여주지 않는다) */
export async function sellerOfUser(userId: string): Promise<SellerSummary | null> {
	const { data, error } = await admin().from('sellers').select('id, name, handle, avatar_url, email, active').eq('user_id', userId).maybeSingle();
	if (error) throw new Error(`sellers lookup failed: ${error.message}`);
	const r = data as Row | null;
	return r ? { id: r.id, name: r.name, handle: r.handle, avatarUrl: r.avatar_url, email: r.email, active: r.active } : null;
}

/** 세션의 user(이미 JWT 검증된 값 — hooks 의 safeGetSession) → 콘솔 상태 */
export async function sellerContext(user: User | null): Promise<SellerContext> {
	if (!user) return { state: 'anon' };
	const seller = await sellerOfUser(user.id);
	if (!seller) return { state: 'unlinked', user };
	if (!seller.active) return { state: 'suspended', user, seller };
	return { state: 'ok', user, seller };
}
