import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LINKCTX_COOKIE, LINKCTX_MAX_AGE, LINK_CODE_RE } from "@/lib/linkctx";

/**
 * Next.js 16: `middleware` → `proxy`.
 *   1. updateSession — Supabase 세션 갱신 (회전된 쿠키를 응답에 기록). glo 와 동일.
 *   2. 링크 유입 보호 쿠키 (app-plan §8): GET/HEAD `/s/:handle/:code` 에서 `:code` 가 형식에 맞고
 *      `sec-fetch-site` 가 same-origin 이 아닐 때(외부 링크·직접 입력·다른 사이트 = 새 유입)만
 *      같은 응답에 `slry_linkctx=<code>` 를 덧붙인다. 내부 이동(홈 카드 클릭)은 기존 쿠키를 유지한다.
 *      `/c/:code` 는 308 로 `/s/` 에 도달하므로 별도 처리 없음.
 *
 * glo 의 `/admin` Basic Auth 블록은 복사하지 않는다 (app-plan §3 — updateSession 을 건너뛰는 구조라 금지).
 */
const STORE_PATH_RE = /^\/s\/[^/]+\/([^/]+)$/;

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  if (request.method === "GET" || request.method === "HEAD") {
    const m = STORE_PATH_RE.exec(request.nextUrl.pathname);
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
     * Run on all paths except static assets and image files.
     */
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
