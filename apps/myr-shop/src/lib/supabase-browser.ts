/** 브라우저 Supabase 클라이언트 — 로그인 시작(카카오 OAuth · 개발용 이메일)에만 쓴다. 데이터는 전부 서버(`lib/server`) 가 읽는다.
 *  `@supabase/ssr` 의 createBrowserClient 는 세션을 쿠키에 두어 hooks.server.ts 의 서버 클라이언트와 같은 세션을 본다. */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
export function browserSupabase(url: string, anonKey: string): SupabaseClient {
	client ??= createBrowserClient(url, anonKey);
	return client;
}
