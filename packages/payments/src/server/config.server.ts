/**
 * 결제 설정 주입 — 앱의 `hooks.server.ts` 가 `$env/dynamic/private` 의 `TOSS_SECRET_KEY` 를 모듈 로드 시 1회 넘긴다
 * (docs/monorepo-migration.md §2.1 · §3.2). 패키지는 `$env` 도 `process.env` 도 읽지 않는다.
 *
 *   configurePayments({ secretKey: env.TOSS_SECRET_KEY });
 *
 * 키가 없어도 configure 는 실패하지 않는다 — 토스 호출 시점에 `CONFIG_ERROR`(4xx 취급) 로 드러난다 (web lib/toss.ts 와 동일).
 */

export type PaymentsConfig = {
  /** TOSS_SECRET_KEY — 결제위젯 키 짝 test_gsk_/live_gsk_ (API 개별연동 키 test_sk_ 를 섞으면 승인 실패, app-plan §3) */
  secretKey?: string;
};

let config: PaymentsConfig = {};

export function configurePayments(next: PaymentsConfig): void {
  const secretKey = typeof next.secretKey === "string" && next.secretKey.trim() ? next.secretKey.trim() : undefined;
  config = { ...config, secretKey };
}

export function paymentsConfig(): Readonly<PaymentsConfig> {
  return config;
}

/** 테스트 전용 */
export function resetPaymentsConfig(): void {
  config = {};
}
