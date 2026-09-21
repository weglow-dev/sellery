// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** hooks.server.ts 가 요청마다 만든 Supabase SSR 클라이언트 — PUBLIC_SUPABASE_URL·ANON_KEY 가 비어 있으면 null (docs/monorepo-migration.md §2.1). Database 제네릭은 PR-2(@sellery/db) 에서 */
			supabase: import('@supabase/supabase-js').SupabaseClient | null;
			/** 세션 + getUser() 로 검증한 사용자 — 세션이 없거나 supabase 가 null 이면 둘 다 null */
			safeGetSession(): Promise<{ session: import('@supabase/supabase-js').Session | null; user: import('@supabase/supabase-js').User | null }>;
			/** 요청당 메모 — S2 부터 fetchCampaignCard · getSellerContext 가 쓴다 (React cache() 대체, §3.4) */
			memo: Map<string, unknown>;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
