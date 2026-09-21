/**
 * 패키지 설정 주입 — 비밀은 앱의 `hooks.server.ts` 가 `$env/dynamic/private` 에서 읽어 **모듈 로드 시 1회** 넘긴다
 * (docs/monorepo-migration.md §2.1 · §3.1). 패키지는 `$env` 도 `process.env` 도 읽지 않는다.
 *
 *   configureDb({ url: PUBLIC_SUPABASE_URL, anonKey: PUBLIC_SUPABASE_ANON_KEY,
 *                 serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, slackWebhookUrl: env.SLACK_WEBHOOK_URL });
 *
 * 값이 없어도 configure 는 실패하지 않는다 — 실제로 필요한 호출 시점에만 throw(`createAdminClient`) 하거나 조용히 건너뛴다(`notifySlack`).
 * web 의 `lib/supabase/admin.ts`("키가 없으면 호출 시점에만 throw — 빌드는 통과") 와 같은 규칙.
 */

export type DbConfig = {
  /** PUBLIC_SUPABASE_URL */
  url?: string;
  /** PUBLIC_SUPABASE_ANON_KEY — 쿠키 없는 anon 클라이언트(`fetchPublicStats`) 용 */
  anonKey?: string;
  /** SUPABASE_SERVICE_ROLE_KEY — service role (RLS 우회) */
  serviceKey?: string;
  /** SLACK_WEBHOOK_URL — 없으면 알림을 보내지 않는다 */
  slackWebhookUrl?: string;
};

let config: DbConfig = {};

/** 부분 갱신 — 빈 문자열은 "없음" 으로 정규화한다 */
export function configureDb(next: DbConfig): void {
  const clean: DbConfig = {};
  for (const k of ["url", "anonKey", "serviceKey", "slackWebhookUrl"] as const) {
    const v = next[k];
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
    else if (k in next) clean[k] = undefined;
  }
  config = { ...config, ...clean };
}

export function dbConfig(): Readonly<DbConfig> {
  return config;
}

/** 테스트 전용 — 설정을 비운다 */
export function resetDbConfig(): void {
  config = {};
}
