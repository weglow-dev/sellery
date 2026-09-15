/**
 * 세션 · 표시명 · next 검증 — 계약 docs/app-plan.md §10.0 · §4.1. 소유: B.
 *
 * - getSessionUser(): 쿠키 세션의 사용자 (서버 컴포넌트·route handler 전용)
 * - displayName(user): 카카오 user_metadata 에서 표시명
 * - safeNext(next):   오픈 리다이렉트 방지 — 로그인 시작·콜백·redirectTo 의 next 는 전부 이 함수를 거친다
 * - getRole(user):    profiles.role (app_role RPC) — 파트너 센터 게이트용, 슬라이스 1 에서는 화면 없음
 */
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** profiles.role 값 (0001). 고객 경로는 보지 않는다 — 파트너 센터(다음 슬라이스) 게이트용. */
export type AppRole = "customer" | "seller" | "brand" | "admin";

const APP_ROLES: readonly AppRole[] = ["customer", "seller", "brand", "admin"];

/** 쿠키 세션의 사용자 (lib/supabase/server.ts createClient → auth.getUser). 없으면 null. */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** user_metadata.nickname ?? name ?? full_name ?? preferred_username ?? "고객" */
export function displayName(user: User): string {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ["nickname", "name", "full_name", "preferred_username"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "고객";
}

/**
 * 같은 오리진의 경로만 통과시키는 next 검증 (오픈 리다이렉트 방지). 판정은 **WHATWG URL 파서 기준**이다 — 정규식만으로는
 * 파서가 파싱 전에 제거하는 ASCII 탭/개행(`"/\t/evil.com"` → `//evil.com`)을 놓친다.
 *   - 형식: `/` 로 시작, `//`·`/\` 금지(브라우저는 `/\evil.com` 을 `//evil.com` 으로 해석), C0 제어문자(탭·CR/LF 포함)·DEL 금지
 *   - `new URL(next, base)` 로 파싱한 결과의 origin 이 base 와 같아야 한다(다르면 외부로 새는 값)
 *   - 반환값은 파서가 정규화한 `pathname + search + hash` (콜백·login-client 는 이 값을 그대로 `new URL(next, origin)` 에 넣는다)
 *   - `/auth/`·`/login` 으로 시작하는 경로는 루프를 만들므로 제외
 * 통과하지 못하면 "/".
 */
const SAFE_NEXT_RE = /^\/(?![/\\])/;
const SAFE_NEXT_BASE = "http://sellery.invalid";

/** C0 제어문자(U+0000–U+001F: 탭·CR/LF 포함)·DEL — WHATWG 파서가 조용히 제거하거나 다르게 해석하는 문자 */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export function safeNext(next: string | null | undefined): string {
  if (typeof next !== "string" || !next) return "/";
  if (!SAFE_NEXT_RE.test(next) || hasControlChar(next)) return "/";
  let parsed: URL;
  try {
    parsed = new URL(next, SAFE_NEXT_BASE);
  } catch {
    return "/";
  }
  if (parsed.origin !== SAFE_NEXT_BASE) return "/";
  const out = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!out.startsWith("/") || out.startsWith("//")) return "/";
  if (out.startsWith("/auth/") || out.startsWith("/login")) return "/";
  return out;
}

/** `app_role()` RPC — 파트너 센터 게이트용 (슬라이스 1 에서는 화면 없음, app-plan §4.2). 세션이 없거나 값이 낯설면 null. */
export async function getRole(user: User): Promise<AppRole | null> {
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_role");
  if (error || typeof data !== "string") return null;
  return (APP_ROLES as readonly string[]).includes(data) ? (data as AppRole) : null;
}
