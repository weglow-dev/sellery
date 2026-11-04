// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { SellerContext } from '@sellery/myr-core/seller';

declare global {
	namespace App {
		interface Locals {
			/** 요청마다 만든 Supabase SSR 클라이언트(세션 쿠키) — 환경변수가 없으면 null */
			supabase: SupabaseClient | null;
			/** JWT 를 검증한 세션 · 사용자(쿠키 값만 믿지 않는다) */
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			/** 요청당 1회 — 레이아웃과 페이지가 같이 불러도 DB 조회는 한 번(`$lib/server/seller` requireSeller) */
			sellerCtx?: Promise<SellerContext>;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
