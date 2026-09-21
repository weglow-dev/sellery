/**
 * 세션 사용자 · 역할 — web/src/lib/auth.ts 의 서버부 (docs/monorepo-migration.md §2.2 "세션 사용자" · §3.1).
 *
 * - getSessionUser(event): `event.locals.safeGetSession()` 의 user (getUser() 로 JWT 를 검증한 값). 없으면 null.
 * - getRole(supabase, user): `app_role()` RPC → profiles.role — 파트너 센터 게이트용(슬라이스 1 에서는 화면 없음, app-plan §4.2).
 *   클라이언트는 `event.locals.supabase`(세션 쿠키가 실린 SSR 클라이언트) 를 넘긴다.
 */
import type { User } from "@supabase/supabase-js";
import { isAppRole, type AppRole } from "../auth";
import type { DbClient, DbEvent } from "./event.server";

export async function getSessionUser(event: DbEvent): Promise<User | null> {
  const { user } = await event.locals.safeGetSession();
  return user ?? null;
}

/** 세션이 없거나 값이 낯설면 null. RPC 오류도 null. */
export async function getRole(supabase: DbClient | null, user: User | null | undefined): Promise<AppRole | null> {
  if (!user || !supabase) return null;
  const { data, error } = await supabase.rpc("app_role");
  if (error || typeof data !== "string") return null;
  return isAppRole(data) ? data : null;
}
