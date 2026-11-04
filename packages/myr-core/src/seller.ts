/** 크리에이터 콘솔 게이트의 타입(순수) — 서버 구현은 `server/seller.server.ts`. 앱의 `app.d.ts` 같은 브라우저 도달 파일도 타입만은 여기서 가져간다. */
import type { User } from '@supabase/supabase-js';

export type SellerSummary = {
	id: string;
	name: string;
	/** `@` 포함(DB 규약) */
	handle: string;
	avatarUrl: string | null;
	email: string | null;
	active: boolean;
};

export type SellerContext =
	| { state: 'anon' }
	| { state: 'unlinked'; user: User }
	| { state: 'suspended'; user: User; seller: SellerSummary }
	| { state: 'ok'; user: User; seller: SellerSummary };
