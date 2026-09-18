import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. SERVER ONLY — bypasses row-level security.
 * 모든 쓰기(checkout_sessions · orders · customers · payment_events · app_* 함수)는 이 클라이언트로만.
 * `import "server-only"` 가 첫 줄이라 Client Component 에서 import 하면 빌드가 실패한다.
 * 키가 없으면 호출 시점에만 throw 한다 (빌드는 통과).
 */
export function createAdminClient(): SupabaseClient<Database> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to web/.env.local.",
    );
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
