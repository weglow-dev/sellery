// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Locals {} — 인증을 붙일 때 Supabase SSR 클라이언트 · requireAdmin 결과
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
