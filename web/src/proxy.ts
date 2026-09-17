import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LINKCTX_COOKIE, LINKCTX_MAX_AGE, LINK_CODE_RE } from "@/lib/linkctx";
import {
  PREFIX_OF,
  consoleHostOf,
  consoleRoleOf,
  consoleUrl,
  isConsoleBlockedPath,
  isConsolePublicPath,
  isRewriteExcluded,
  schemeFor,
  stripPrefix,
  type ConsoleRole,
} from "@/lib/hosts";

/**
 * Next.js 16: `middleware` → `proxy`. 규칙은 docs/inf-console-plan.md §3.2 (curl 검사 §8.2) 로 고정한다.
 *
 *   1. `rewrite` 는 **내부 URL 에만**, `redirect` 는 **원 요청 pathname 에만** 적용한다 — 리라이트 결과가 다시
 *      308 조건에 걸리는 루프를 만들지 않는다. **사용자 제어 경로(pathname 유래)를 `new URL(path, base)` 로 해석하지
 *      않는다** — `//evil.com` 이 프로토콜 상대 URL 로 풀려 오리진이 바뀐다(오픈 리다이렉트). Location 의 오리진은
 *      문자열 결합으로 고정하고 `//`·`/\` 로 시작하는 경로는 `/` 로 떨어뜨린다(`noProtoRelative`). `next start` 의
 *      base-server 는 `//` 를 먼저 정규화하지만 Vercel 의 프록시는 그보다 앞서 실행되므로 그 정규화에 기대지 않는다.
 *   2. 콘솔 호스트(`host ∈ HOST_PREFIX`)에서 `REWRITE_EXCLUDE` 가 아닌 경로 → `prefix + pathname` 으로 리라이트.
 *      pathname 이 이미 `prefix` 로 시작하면 접두를 뗀 경로로 308 (정규 URL 하나). 고객 전용 엔드포인트
 *      `CONSOLE_BLOCKED_PATHS`(`/api/checkout`·`/api/payments/{confirm,cancel}`)는 `REWRITE_EXCLUDE` 안이라도
 *      콘솔 호스트에서 **404** — 파트너 세션으로 고객 체크아웃을 열어 `customers` 행이 생기는 경로를 막는다.
 *      트레일링 슬래시 `/influencer/` 는 Next 가 먼저 308(`/influencer`) 하므로 2홉(루프 아님 · §7(e) 의 `/home` 홉
 *      기준과 별개 — `skipTrailingSlashRedirect` 는 고객 URL 정규화가 바뀌어 켜지 않는다).
 *   3. 고객 호스트(`NEXT_PUBLIC_SITE_URL` 의 host)에서 `/influencer/*`·`/brand/*` → 해당 콘솔 호스트로 308.
 *      콘솔 호스트가 설정돼 있고 **요청 host 가 `*.vercel.app` 이 아닐 때만** — apex 이전 전에는
 *      `sellery-app.vercel.app` 이 고객 호스트이자 임시 확인 주소라 경로 모드 접근을 막지 않는다.
 *      `HOST_PREFIX` 가 비어 있으면(Preview·로컬) 아무것도 하지 않는다(경로 모드).
 *   4. `updateSession(request, { rewriteTo })` — 리라이트 응답에 회전 쿠키를 싣는다. glo 와 동일하게
 *      createServerClient 와 getUser() 사이에 코드를 넣지 않는다.
 *   5. 리라이트 대상(또는 경로 모드의 `/influencer/*`) 중 `CONSOLE_PUBLIC_PATHS` 가 아닌 경로에서 user 가 없으면
 *      `<login>?next=<접두 없는 경로>` 302 — 둘 다 상대 경로(호스트 모드 `/login?next=/home`, 경로 모드
 *      `/influencer/login?next=/influencer/home`). 어느 형태를 쓸지는 env 가 아니라 **이 요청의 host** 로 정한다
 *      (호스트 모드 Production 에서 `*.vercel.app/influencer/...` 로 열면 경로 모드 링크여야 착지가 맞다).
 *      **DB 는 조회하지 않는다** — 승인·정지 판정은 각 page 의 requireSeller() (2단계). **프록시 게이트는 보조다** —
 *      `config.matcher` 제외 경로(`_next/*`·`assets/*`·favicon)는 통과하므로 확장자로는 제외하지 않고 정적 디렉터리로만
 *      제외하며, `(partner)/influencer/**` 페이지는 예외 없이 `requireSeller()` 로 자체 게이트한다(inf-console-plan §2.1).
 *   6. 링크 유입 보호 쿠키(app-plan §8)는 고객 호스트에서만: GET/HEAD `/s/:handle/:code` 에서 `:code` 가 형식에
 *      맞고 `sec-fetch-site` 가 same-origin 이 아닐 때(새 유입)만 `slry_linkctx=<code>` 를 덧붙인다.
 *      `/c/:code` 는 308 로 `/s/` 에 도달하므로 별도 처리 없음.
 *   7. robots 는 src/app/robots.ts (콘솔 호스트 전체 disallow).
 *
 * glo 의 `/admin` Basic Auth 블록은 복사하지 않는다 (app-plan §3 — updateSession 을 건너뛰는 구조라 금지).
 */
const STORE_PATH_RE = /^\/s\/[^/]+\/([^/]+)$/;
const CONSOLE_ROLES: readonly ConsoleRole[] = ["seller", "brand"];

/** `NEXT_PUBLIC_SITE_URL` 의 host(소문자). 규칙 3 의 "고객 호스트" 판정 — 정확 일치만. */
function customerHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "").host.toLowerCase() || null;
  } catch {
    return null;
  }
}
const CUSTOMER_HOST = customerHost();

/** 규칙 5 의 게이트 정보 — 어느 형태의 로그인 경로로 보낼지는 요청 host 로 정해진 값. `base` 는 302 Location 의 오리진. */
type Gate = { relPath: string; loginPath: string; nextPath: string; base: string | URL };

/**
 * 같은 호스트로 보내는 redirect 의 오리진. `NextResponse.redirect` 는 절대 URL 만 받는데 dev 서버의 `request.url` 은
 * 기동 주소(127.0.0.1)라 Host 와 다를 수 있다. **설정값과 정확 일치한 host** 에서만 부른다(콘솔 호스트) —
 * 그 밖의 host(Preview 등)에서는 `request.url` 을 그대로 쓴다(임의 Host 헤더를 Location 에 되돌리지 않는다).
 * 스킴은 `schemeFor(host)`(로컬만 http) — `x-forwarded-proto` 는 셀프 호스트에서 클라이언트가 보낼 수 있어 믿지 않는다.
 */
function sameHostOrigin(host: string): string {
  return `${schemeFor(host)}://${host.toLowerCase()}`;
}

/** 사용자 제어 경로가 프로토콜 상대 URL(`//evil.com` · `/\evil.com`)이 되지 않게 — 그런 경로는 `/` 로 떨어뜨린다(규칙 1) */
function noProtoRelative(path: string): string {
  return /^\/[/\\]/.test(path) ? "/" : path;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  const entry = consoleRoleOf(host);

  let rewriteTo: URL | null = null;
  let gate: Gate | null = null;

  if (entry && host) {
    // 콘솔 호스트 — 고객 전용 엔드포인트는 REWRITE_EXCLUDE 안이라도 열지 않는다 (규칙 2)
    if (isConsoleBlockedPath(pathname)) return new NextResponse(null, { status: 404 });
    // 규칙 2
    if (!isRewriteExcluded(pathname)) {
      const origin = sameHostOrigin(host);
      const stripped = stripPrefix(pathname, entry.prefix);
      if (stripped !== null) {
        // `/influencer/home` 을 콘솔 호스트에서 열면 정규 URL `/home` 으로 (원 요청 pathname 기준 · 루프 없음).
        // 오리진은 문자열로 고정 — `new URL(상대, base)` 는 `//evil.com` 을 절대 URL 로 해석해 오픈 리다이렉트가 된다(규칙 1)
        return NextResponse.redirect(`${origin}${noProtoRelative(stripped)}${search}`, 308);
      }
      rewriteTo = new URL(`${entry.prefix}${pathname === "/" ? "" : pathname}${search}`, request.url);
      gate = { relPath: pathname, loginPath: "/login", nextPath: `${pathname}${search}`, base: origin };
    }
  } else {
    // 고객 호스트 · Preview · 로컬 — 규칙 3 (호스트 모드에서만 · *.vercel.app 제외)
    const h = host?.toLowerCase() ?? "";
    if (h && CUSTOMER_HOST && h === CUSTOMER_HOST && !h.endsWith(".vercel.app")) {
      for (const role of CONSOLE_ROLES) {
        if (!consoleHostOf(role)) continue;
        const stripped = stripPrefix(pathname, PREFIX_OF[role]);
        // consoleUrl 은 문자열 결합(오리진 고정) — `//` 시작 경로는 규칙 1 대로 `/` 로
        if (stripped !== null) return NextResponse.redirect(`${consoleUrl(role, noProtoRelative(stripped))}${search}`, 308);
      }
    }
    // 경로 모드 `/influencer/*` · `/brand/*` — 규칙 5 의 게이트만 (리라이트 없음)
    for (const role of CONSOLE_ROLES) {
      const prefix = PREFIX_OF[role];
      const stripped = stripPrefix(pathname, prefix);
      if (stripped !== null) {
        gate = { relPath: stripped, loginPath: `${prefix}/login`, nextPath: `${pathname}${search}`, base: request.url };
        break;
      }
    }
  }

  // 규칙 4
  const { response, user } = await updateSession(request, { rewriteTo });

  // 규칙 5 — 세션 유무만(DB 조회 없음)
  if (gate && !user && !isConsolePublicPath(gate.relPath)) {
    // loginPath 는 상수(`/login` · `/influencer/login`), 사용자 경로는 쿼리에 인코딩돼 들어가므로 new URL 해석이 안전하다(규칙 1)
    const to = new URL(`${gate.loginPath}?next=${encodeURIComponent(gate.nextPath)}`, gate.base);
    const redirect = NextResponse.redirect(to, 302);
    // 만료 세션을 지우는 회전 쿠키(Set-Cookie)가 있으면 리다이렉트 응답에도 싣는다
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  // 규칙 6 — 고객 호스트(또는 경로 모드)에서만
  if (!entry && (request.method === "GET" || request.method === "HEAD")) {
    const m = STORE_PATH_RE.exec(pathname);
    const code = m?.[1];
    if (code && LINK_CODE_RE.test(code)) {
      const site = request.headers.get("sec-fetch-site");
      // 헤더가 없는 구형 UA 는 설정한다 (보수적).
      if (site !== "same-origin") {
        response.cookies.set(LINKCTX_COOKIE, code, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: LINKCTX_MAX_AGE,
        });
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 자산(`_next/static`·`_next/image`·favicon·`public/assets/*`)만 뺀 모든 경로 — **확장자로 제외하지 않는다**:
     * `.png` 로 끝나는 앱 경로(3단계 `/influencer/campaigns/abc.png` 같은 동적 세그먼트)가 리라이트·세션 갱신·규칙 5
     * 게이트를 건너뛰지 않게. `/`, `/home`(콘솔 호스트 리라이트 대상), `/influencer/*`(경로 모드),
     * `/auth/*`·`/api/*`·`/robots.txt`(REWRITE_EXCLUDE — 세션 갱신만) 전부 매치된다.
     * public/ 에 새 정적 디렉터리를 두면 여기에도 추가한다.
     */
    "/((?!_next/static|_next/image|favicon\\.(?:ico|svg)|assets/).*)",
  ],
};
