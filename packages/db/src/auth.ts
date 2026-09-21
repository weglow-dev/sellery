/**
 * 표시명 · next 검증 · 파트너 판정 — 순수 모듈 (web/src/lib/auth.ts 의 순수부, 계약 docs/app-plan.md §10.0 · §4.1).
 * 브라우저·서버·vitest 어디서나 import 가능 — Supabase 클라이언트를 만들지 않는다.
 * 세션이 필요한 `getSessionUser(event)` · `getRole(supabase, user)` 는 `./server/auth.server.ts`.
 *
 * - displayName(user): 카카오 user_metadata 에서 표시명
 * - safeNext(next):   오픈 리다이렉트 방지 — 로그인 시작·콜백·redirectTo 의 next 는 전부 이 함수를 거친다
 * - isPartnerUser(user): user_metadata.partner_role 판정 — 비신뢰 값, 콜백의 ensureCustomer 생략 등 무해한 분기 전용
 */
import type { User } from "@supabase/supabase-js";

/** profiles.role 값 (0001). 고객 경로는 보지 않는다 — 파트너 센터 게이트용. */
export type AppRole = "customer" | "seller" | "brand" | "admin";

export const APP_ROLES: readonly AppRole[] = ["customer", "seller", "brand", "admin"];

export function isAppRole(v: unknown): v is AppRole {
  return typeof v === "string" && (APP_ROLES as readonly string[]).includes(v);
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
 *   - 반환값은 파서가 정규화한 `pathname + search + hash` (콜백·login 페이지는 이 값을 그대로 `new URL(next, origin)` 에 넣는다)
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

/**
 * `user_metadata.partner_role` 이 'seller' | 'brand' 인가 — **비신뢰 값**이다 (docs/inf-console-plan.md §4.2).
 * 사용자가 `supabase.auth.updateUser({ data })` 로 언제든 바꿀 수 있으므로 **무해한 분기에만** 쓴다:
 * `auth/callback`·`auth/confirm` 의 `ensureCustomer` 생략 · `?welcome=1` 생략 · 가입 생성 함수 호출 여부(실제 가드는 함수 안의
 * 신원 확인·중복·유니크 검사). **권한·게이트·집계에는 절대 쓰지 않는다** — 콘솔 게이트의 진실은 `sellers.user_id and active`
 * (`server/partner/seller.server.ts requireSeller`). 시드 행 연결용 `link_seller_id` 는 `app_metadata`(service role 전용) 에 둔다.
 */
export function isPartnerUser(user: User | null | undefined): boolean {
  const role = (user?.user_metadata as Record<string, unknown> | undefined)?.partner_role;
  return role === "seller" || role === "brand";
}
