import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Client Components / browser code (anon key — RLS guards the data).
 * 슬라이스 1 에서는 /login 의 signInWithOAuth 에만 쓴다.
 */
export function createBrowserClient() {
  return createSsrBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
