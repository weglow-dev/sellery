/**
 * 콘솔 경로 표 — web/src/lib/hosts.ts 의 **경로 모드만** 남긴 것 (docs/monorepo-migration.md §3.1 · 결정 11).
 *
 * 호스트 모드(`NEXT_PUBLIC_INF_HOST` · `HOST_PREFIX` · `consoleRoleOf` · `schemeFor` · `stripPrefix` · `isRewriteExcluded` ·
 * `isConsoleBlockedPath` · `hostsMode`)는 폐기됐다 — 한 도메인(`sellery.life`) 아래 `/influencer/*` `/brand/*` 를
 * apps/shop 의 vercel.json rewrites 가 각 프로젝트로 프록시한다(§1.3). 브라우저 오리진은 항상 하나다.
 * 순수 모듈 — 환경변수를 읽지 않는다(절대 URL 이 필요하면 호출자가 `PUBLIC_SITE_URL` 을 넘긴다).
 */

export type ConsoleRole = "seller" | "brand" | "admin";
export type ConsolePrefix = "/influencer" | "/brand" | "/admin";

/** 역할 → 라우트 접두 (각 앱의 `paths.base` 와 같다) */
export const PREFIX_OF: Record<ConsoleRole, ConsolePrefix> = {
  seller: "/influencer",
  brand: "/brand",
  admin: "/admin",
};

/** 콘솔 안에서 세션 없이 열리는 경로(접두 제외 형태). influencer `hooks.server.ts` 세션 게이트의 예외(§2.2).
 *  **파트너(seller · brand) 전용 목록이다** — 관리자 콘솔은 가입·비밀번호 재설정이 없고 `/login` 하나뿐이라
 *  `apps/admin/src/lib/server/admin.ts` 의 `ADMIN_PUBLIC_PATHS` 를 쓴다(계정은 수동 승격 — docs/deploy.md §5.6). */
export const CONSOLE_PUBLIC_PATHS = ["/login", "/signup", "/verify-sent", "/password", "/password/new"] as const;

/** 접두 없는 콘솔 경로가 공개 경로인가 (정확 일치 또는 그 하위) */
export function isConsolePublicPath(relPath: string): boolean {
  return CONSOLE_PUBLIC_PATHS.some((p) => relPath === p || relPath.startsWith(`${p}/`));
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * 항상 **상대 경로**: `consolePath('seller', '/apply')` → `/influencer/apply`, `'/'` → `/influencer`.
 * `next=` · `redirect()` · 콘솔 내부 링크 전용. `safeNext` 가 같은 오리진 경로만 통과시키므로 절대 URL 을 넣지 않는다.
 */
export function consolePath(role: ConsoleRole, path: string): string {
  const p = ensureLeadingSlash(path);
  const prefix = PREFIX_OF[role];
  return p === "/" ? prefix : `${prefix}${p}`;
}

/**
 * 절대 URL(복사용 링크 · 메일 `emailRedirectTo` 전용): `siteUrl`(`PUBLIC_SITE_URL`, 예 `https://sellery.life`) + `consolePath`.
 * `siteUrl` 이 비어 있으면 상대 경로를 그대로 돌려준다.
 */
export function consoleUrl(role: ConsoleRole, path: string, siteUrl: string | null | undefined): string {
  const rel = consolePath(role, path);
  const base = (siteUrl ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}${rel}` : rel;
}
