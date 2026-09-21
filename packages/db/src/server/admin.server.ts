/**
 * Service-role Supabase 클라이언트. **서버 전용** — RLS 를 우회한다 (web/src/lib/supabase/admin.ts 의 이식).
 * 모든 쓰기(checkout_sessions · orders · customers · payment_events · app_* 함수)는 이 클라이언트로만.
 *
 * `import "server-only"` 의 대체는 세 겹이다(docs/monorepo-migration.md §3.3): 파일명 `*.server.ts` + `exports` `./server/*` +
 * 앱의 `$lib/server/*` 배럴(SvelteKit 이 브라우저 도달 코드에서 import 하면 빌드 실패) + `scripts/check-boundaries.mjs`.
 *
 * 키는 `configureDb({ url, serviceKey })` 로 주입된 값을 쓰고, 인자로 넘기면 그 값이 우선한다(스크립트·테스트).
 * 키가 없으면 **호출 시점에만** throw 한다(빌드·모듈 로드는 통과 — 비밀 없이 빌드하는 CI 원칙, 결정 11).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { dbConfig } from "./config.server";

export type Admin = SupabaseClient<Database>;

export type AdminEnv = { url?: string; serviceKey?: string };

export function createAdminClient(env: AdminEnv = {}): Admin {
  const cfg = dbConfig();
  const url = env.url || cfg.url;
  const serviceKey = env.serviceKey || cfg.serviceKey;
  if (!url) throw new Error("PUBLIC_SUPABASE_URL is not set — configureDb({ url }) in hooks.server.ts (docs/monorepo-migration.md §2.1).");
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — configureDb({ serviceKey }) in hooks.server.ts from $env/dynamic/private.");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * 쿠키 없는 anon 클라이언트 — 세션과 무관한 공개 조회(`public_stats` 60초 메모, §3.4) 용.
 * `configureDb({ url, anonKey })` 가 없으면 null (호출자는 빈 값으로 렌더).
 */
export function createAnonClient(env: { url?: string; anonKey?: string } = {}): SupabaseClient<Database> | null {
  const cfg = dbConfig();
  const url = env.url || cfg.url;
  const anonKey = env.anonKey || cfg.anonKey;
  if (!url || !anonKey) return null;
  return createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
