import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/**
 * Refreshes the Supabase auth session on every request and writes the
 * rotated cookies back onto the response. Called from src/proxy.ts (Next 16: proxy, 구 middleware).
 *
 * `rewriteTo` 가 있으면 응답을 `NextResponse.rewrite(rewriteTo, { request })` 로 만든다 — 콘솔 호스트 리라이트
 * (docs/inf-console-plan.md §3.2 규칙 4). 회전 쿠키는 그 응답에 실린다. 반환값의 `user` 는 proxy 의 세션 게이트
 * (규칙 5) 전용 — 세션 유무만 보고 DB 는 조회하지 않는다.
 *
 * Do not run code between createServerClient and getUser() — it guards
 * against hard-to-debug session desync (per Supabase SSR guidance).
 * 링크 유입 쿠키(slry_linkctx)는 proxy 가 이 함수가 돌려준 응답에 덧붙인다 (app-plan §8).
 * 쿠키 옵션(`cookieOptions`)은 지정하지 않는다 — host-only 유지(inf-console-plan 결정 10).
 */
export type UpdateSessionOptions = {
  /** 내부 리라이트 목적지(절대 URL). 없으면 `NextResponse.next({ request })`. */
  rewriteTo?: URL | null;
};

export type UpdateSessionResult = { response: NextResponse; user: User | null };

export async function updateSession(
  request: NextRequest,
  { rewriteTo = null }: UpdateSessionOptions = {},
): Promise<UpdateSessionResult> {
  const fresh = () => (rewriteTo ? NextResponse.rewrite(rewriteTo, { request }) : NextResponse.next({ request }));
  let supabaseResponse = fresh();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = fresh();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session so Server Components receive a valid token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user: user ?? null };
}
