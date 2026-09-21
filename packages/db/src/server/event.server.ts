/**
 * 서버 함수가 받는 `event` 의 구조적 타입 — SvelteKit `RequestEvent` 의 부분집합 (docs/monorepo-migration.md §2.1 · §3.4).
 *
 * 패키지는 `@sveltejs/kit` 을 import 하지 않는다(런타임·타입 모두) — `App.Locals` 는 앱마다 `app.d.ts` 로 선언되므로 여기서는
 * hooks(PR-1) 가 채우는 세 필드만 구조적으로 요구한다. 실제 `RequestEvent` 는 이 타입에 그대로 대입된다.
 *   - `locals.supabase`: hooks 가 요청마다 만든 SSR 클라이언트. `PUBLIC_SUPABASE_*` 가 비어 있으면 **null**(데모·키 없는 로컬) —
 *     서버 함수는 null 이면 "없음"(null · 빈 배열 · anon 상태)으로 돌려주고 throw 하지 않는다.
 *   - `locals.safeGetSession()`: getSession + getUser(JWT 검증) — 세션 사용자의 유일한 입구.
 *   - `locals.memo`: 요청당 Map — React `cache()` 대체(`memoized()`).
 */
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/** anon/세션 SSR 클라이언트 (RLS 적용) — service role 은 `admin.server.ts` 의 `Admin` */
export type DbClient = SupabaseClient<Database>;

export type SessionResult = { session: Session | null; user: User | null };

export interface DbLocals {
  supabase: DbClient | null;
  safeGetSession(): Promise<SessionResult>;
  memo: Map<string, unknown>;
}

export interface DbEvent {
  locals: DbLocals;
  cookies: { get(name: string): string | undefined };
  request: Request;
  url: URL;
}

/**
 * 요청당 1회 메모 — `fetchCampaignCard` · `getSellerContext` 가 쓴다(§3.4).
 * 진행 중인 Promise 를 저장하므로 같은 요청의 병렬 호출(layout + page)도 DB 는 한 번만 간다. 실패하면 메모를 지운다(재시도 가능).
 */
export async function memoized<T>(event: DbEvent, key: string, fn: () => Promise<T>): Promise<T> {
  const memo = event.locals.memo;
  if (!memo) return fn();
  if (memo.has(key)) return memo.get(key) as Promise<T>;
  const p = fn();
  memo.set(key, p);
  try {
    return await p;
  } catch (e) {
    memo.delete(key);
    throw e;
  }
}
