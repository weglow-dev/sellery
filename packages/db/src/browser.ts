/**
 * 브라우저 Supabase 클라이언트 (anon 키 — RLS 가 데이터를 지킨다). web/src/lib/supabase/client.ts 의 이식.
 * 환경변수는 호출자가 `$env/static/public` 에서 읽어 넘긴다 — 패키지는 `$env` 를 import 할 수 없다(docs/monorepo-migration.md §3.1).
 *
 * 쓰는 곳(§2.2): shop `/login`(signInWithOAuth · DEV 폼) · 홈 카드 인증 확인(anon rpc('campaign_card')) ·
 * 콘솔 `login` `signup` `verify-sent`(resend) `password`(resetPasswordForEmail) `password/new`(updateUser).
 * `+*.server.ts` 에서는 쓰지 않는다 — 서버는 `event.locals.supabase`(hooks 가 만든 SSR 클라이언트).
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createBrowserSupabase(url: string, anonKey: string) {
  return createBrowserClient<Database>(url, anonKey);
}

export type BrowserSupabase = ReturnType<typeof createBrowserSupabase>;
