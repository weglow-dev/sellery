// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** hooks.server.ts 가 요청마다 만든 Supabase SSR 클라이언트 — PUBLIC_SUPABASE_URL·ANON_KEY 가 비어 있으면 null */
			supabase: import('@supabase/supabase-js').SupabaseClient | null;
			/** 세션 + getUser() 로 검증한 사용자 — 세션이 없거나 supabase 가 null 이면 둘 다 null */
			safeGetSession(): Promise<{ session: import('@supabase/supabase-js').Session | null; user: import('@supabase/supabase-js').User | null }>;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
