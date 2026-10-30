/**
 * service-role Supabase 클라이언트 — **서버 전용**(`$lib/server`). RLS 를 우회하므로 0057~ 의 `myr_*` 쓰기 RPC 를 부를 때만.
 * 셀러리 `packages/db/src/server/admin.server.ts` 의 골격 복사(docs/myr.md 결정: 셀러리 코드는 복사만 · import 금지).
 * 키는 `SUPABASE_SERVICE_ROLE_KEY`(`$env/dynamic/private` · Vercel `myr-shop` 환경변수 — docs/deploy.md MYR 표). 없으면 **호출 시점에만** throw —
 * 빌드·모듈 로드는 통과(비밀 없이 빌드하는 CI 원칙). 라우트는 `hasAdmin()` 으로 먼저 보고 503 을 돌려준다.
 */
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

export const hasAdmin = (): boolean => !!(PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export function admin(): SupabaseClient {
	if (client) return client;
	if (!hasAdmin()) throw new Error('SUPABASE_SERVICE_ROLE_KEY 또는 PUBLIC_SUPABASE_URL 이 없습니다 — docs/deploy.md MYR 표');
	client = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false, autoRefreshToken: false } });
	return client;
}
