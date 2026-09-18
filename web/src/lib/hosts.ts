/**
 * 콘솔 호스트 표 — 계약 docs/inf-console-plan.md §3.2 (상수는 여기 한 곳에만 둔다).
 *
 * 두 가지 모드:
 *   - 호스트 모드: `NEXT_PUBLIC_INF_HOST`(예 `inf.sellery.life`) 가 있으면 proxy 가 그 호스트의 요청을
 *     `/influencer/*` 로 리라이트한다. 사용자에게는 접두 없는 URL(`https://inf.sellery.life/home`).
 *   - 경로 모드: 값이 없으면(Preview·로컬 기본) 아무 리라이트 없이 `/influencer/*` 로 직접 연다.
 *
 * 호스트 비교는 **소문자·정확 일치(포트 포함)** 만 한다 — 부분 일치·endsWith 는 쓰지 않는다.
 * Host 헤더는 클라이언트가 보내는 값이라 `evil.inf.sellery.life` 같은 스푸핑으로 리다이렉트 목적지를
 * 조작할 수 없어야 한다.
 */

export type ConsoleRole = "seller" | "brand";
export type ConsolePrefix = "/influencer" | "/brand";
export type HostEntry = { role: ConsoleRole; prefix: ConsolePrefix };

/** 역할 → 라우트 접두 (경로 모드 URL · 리라이트 목적지) */
export const PREFIX_OF: Record<ConsoleRole, ConsolePrefix> = {
  seller: "/influencer",
  brand: "/brand",
};

/** env 값 정규화: 공백 제거 · 소문자 · 실수로 붙인 스킴/경로 제거. 비어 있으면 null. */
function normHost(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // "https://" 등
  h = h.replace(/\/.*$/, ""); // 경로
  return h || null;
}

const INF_HOST = normHost(process.env.NEXT_PUBLIC_INF_HOST);
const BRAND_HOST = normHost(process.env.NEXT_PUBLIC_BRAND_HOST);

/** host(소문자) → 콘솔 역할·접두. 값이 없는 역할은 표에 없다(= 그 역할은 경로 모드). */
export const HOST_PREFIX: Record<string, HostEntry> = {
  ...(INF_HOST ? { [INF_HOST]: { role: "seller", prefix: "/influencer" } as HostEntry } : {}),
  ...(BRAND_HOST ? { [BRAND_HOST]: { role: "brand", prefix: "/brand" } as HostEntry } : {}),
};

/** 리라이트하지 않는 공유 경로(어느 호스트에서도 같은 경로). `/login` 은 넣지 않는다 — 콘솔 호스트의
 *  `/login` 은 콘솔 로그인(`/influencer/login`)으로 리라이트되고, 고객 카카오 `/login` 은 고객 호스트 한정. */
export const REWRITE_EXCLUDE = ["/auth/", "/api/", "/_next/", "/favicon", "/robots.txt"] as const;

/** 콘솔 안에서 세션 없이 열리는 경로(접두 제외 형태). proxy 규칙 5 의 게이트 예외. */
export const CONSOLE_PUBLIC_PATHS = ["/login", "/signup", "/verify-sent", "/password", "/password/new"] as const;

/**
 * 콘솔 호스트에서 열지 않는 **고객 전용** 경로 — `REWRITE_EXCLUDE`(`/api/`) 안이지만 공유하지 않는다(proxy 가 404).
 * 파트너 세션(host-only 쿠키 · 콘솔 호스트에만 존재)으로 `/api/checkout` 을 부르면 `ensureCustomer` 가 파트너 계정에
 * `customers` 행을 만든다(inf-console-plan §4.2 위반 경로). 웹훅·health·me 는 막지 않는다.
 */
export const CONSOLE_BLOCKED_PATHS = ["/api/checkout", "/api/payments/confirm", "/api/payments/cancel"] as const;

/** pathname 이 REWRITE_EXCLUDE 에 해당하는가 (접두 일치) */
export function isRewriteExcluded(pathname: string): boolean {
  return REWRITE_EXCLUDE.some((p) => pathname.startsWith(p));
}

/** 접두 없는 콘솔 경로가 공개 경로인가 (정확 일치 또는 그 하위) */
export function isConsolePublicPath(relPath: string): boolean {
  return CONSOLE_PUBLIC_PATHS.some((p) => relPath === p || relPath.startsWith(`${p}/`));
}

/** pathname 이 콘솔 호스트에서 막는 고객 전용 경로인가 (정확 일치 또는 그 하위) */
export function isConsoleBlockedPath(pathname: string): boolean {
  return CONSOLE_BLOCKED_PATHS.some((b) => pathname === b || pathname.startsWith(`${b}/`));
}

/** 역할의 콘솔 호스트(env 기준). 없으면 null(경로 모드). */
export function consoleHostOf(role: ConsoleRole): string | null {
  return role === "seller" ? INF_HOST : BRAND_HOST;
}

/** Host 헤더 → 콘솔 역할·접두. 소문자·정확 일치만(포트 포함). 표에 없으면 null. */
export function consoleRoleOf(host: string | null | undefined): HostEntry | null {
  if (!host) return null;
  const key = host.trim().toLowerCase();
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(HOST_PREFIX, key) ? HOST_PREFIX[key] : null;
}

/** 경로가 `prefix` 자체이거나 `prefix/` 로 시작하면 접두를 뗀 경로("/…"), 아니면 null */
export function stripPrefix(pathname: string, prefix: ConsolePrefix): string | null {
  if (pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return null;
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * 이 요청이 역할의 콘솔 호스트에서 왔는가(= 접두 없는 경로를 써야 하는가).
 *   - `host` 를 주면 **그 요청 기준**: 콘솔 호스트면 true, 아니면 false(예: 호스트 모드 Production 에서
 *     `sellery-app.vercel.app/influencer/...` 로 임시 확인할 때 — §2.2 — 경로 모드로 링크를 만들어야 한다).
 *   - `host` 를 생략하면 env 기준(호스트가 설정돼 있으면 true).
 */
export function isConsoleHostMode(role: ConsoleRole, host?: string | null): boolean {
  if (host === undefined) return consoleHostOf(role) !== null;
  return consoleRoleOf(host)?.role === role;
}

/**
 * 항상 **상대 경로**: 호스트 모드 `/apply`, 경로 모드 `/influencer/apply`.
 * `next=` · `redirect()` · proxy 규칙 5 · 콘솔 내부 <Link> 전용. `safeNext` 가 같은 오리진 경로만 통과시키므로
 * 절대 URL 을 넣지 않는다. 서버에서 요청 host 를 알면 세 번째 인자로 넘겨 그 요청 기준으로 판정한다.
 */
export function consolePath(role: ConsoleRole, path: string, host?: string | null): string {
  const p = ensureLeadingSlash(path);
  if (isConsoleHostMode(role, host)) return p;
  const prefix = PREFIX_OF[role];
  return p === "/" ? prefix : `${prefix}${p}`;
}

/**
 * 로컬 호스트(localhost · *.localhost · 127.0.0.1)면 http, 그 외 https. 설정값(env)에서 온 host 에만 쓴다 —
 * `x-forwarded-proto` 같은 요청 헤더로 스킴을 정하지 않는다(셀프 호스트에서 클라이언트가 http 로 다운그레이드시킬 수 있다).
 */
export function schemeFor(host: string): "http" | "https" {
  const bare = host.replace(/:\d+$/, "");
  return bare === "localhost" || bare.endsWith(".localhost") || bare === "127.0.0.1" ? "http" : "https";
}

/**
 * 절대 URL(<a href> · 복사용 링크 전용): 호스트 모드면 접두 없는 절대 URL(`https://inf.sellery.life/home`),
 * 경로 모드면 상대 경로 `/influencer/home`(붙일 호스트가 없다). 값에 `${origin}` 을 또 붙이면 안 된다.
 */
export function consoleUrl(role: ConsoleRole, path: string): string {
  const host = consoleHostOf(role);
  const p = ensureLeadingSlash(path);
  if (!host) return consolePath(role, p);
  return `${schemeFor(host)}://${host}${p === "/" ? "" : p}`;
}

/** 배포 모드 표시(api/health 용) — 호스트 표가 하나라도 있으면 "host" */
export function hostsMode(): "host" | "path" {
  return Object.keys(HOST_PREFIX).length > 0 ? "host" : "path";
}
