import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/**
 * Refreshes the Supabase auth session on every request and writes the
 * rotated cookies back onto the response. Called from src/proxy.ts (Next 16: proxy, 구 middleware).
 *
 * Do not run code between createServerClient and getUser() — it guards
 * against hard-to-debug session desync (per Supabase SSR guidance).
 * 링크 유입 쿠키(slry_linkctx)는 proxy 가 이 함수가 돌려준 응답에 덧붙인다 (app-plan §8).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session so Server Components receive a valid token.
  await supabase.auth.getUser();

  return supabaseResponse;
}
