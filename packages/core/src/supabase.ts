/* ============ Supabase 어댑터 자리 ============
   supabase/migrations 0001~0006 이 클라우드 프로젝트 `sellery`에 적용돼 있다.
   앱↔DB 연동 시 이 파일에서 Storage 인터페이스를 구현하고 setStore()로 교체한다.
   - 읽기: 공개 카탈로그(RLS 허용 컬럼) → anon 키
   - 쓰기: 서버(SvelteKit +server.ts) 에서 service role 로만
   키는 각 앱의 .env (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY) 에서 읽는다. */
import type { Storage } from './storage';

export function createSupabaseStore(_url: string, _anonKey: string): Storage {
	throw new Error('Supabase 어댑터는 아직 연결되지 않았습니다 — packages/core/src/supabase.ts 를 구현하고 setStore()로 교체하세요.');
}
