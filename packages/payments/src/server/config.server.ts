/**
 * 결제 설정 주입 — 앱의 `hooks.server.ts` 가 `$env/dynamic/private` 의 `TOSS_SECRET_KEY` 를 모듈 로드 시 1회 넘긴다
 * (docs/monorepo-migration.md §2.1 · §3.2). 패키지는 `$env` 도 `process.env` 도 읽지 않는다.
 *
 *   configurePayments({ secretKey: env.TOSS_SECRET_KEY });
 *   configurePayouts({ secretKey: env.TOSS_PAYOUT_SECRET_KEY, securityKey: env.TOSS_PAYOUT_SECURITY_KEY });   // 지급대행(0040) — 결제 키와 별개
 *
 * 키가 없어도 configure 는 실패하지 않는다 — 토스 호출 시점에 `CONFIG_ERROR`(4xx 취급) 로 드러난다 (web lib/toss.ts 와 동일).
 */

export type PaymentsConfig = {
  /** TOSS_SECRET_KEY — 결제위젯 키 짝 test_gsk_/live_gsk_ (API 개별연동 키 test_sk_ 를 섞으면 승인 실패, app-plan §3) */
  secretKey?: string;
  /** TOSS_PAYOUT_SECRET_KEY — 지급대행 상점의 **API 개별 연동 시크릿 키**(test_sk_/live_sk_) · Basic 인증 (0040) */
  payoutSecretKey?: string;
  /** TOSS_PAYOUT_SECURITY_KEY — 지급대행 보안 키(64자 16진수) · 셀러 등록/지급 요청 본문 JWE 암호화 (0040) */
  payoutSecurityKey?: string;
};

let config: PaymentsConfig = {};

const norm = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function configurePayments(next: Pick<PaymentsConfig, "secretKey">): void {
  config = { ...config, secretKey: norm(next.secretKey) };
}

/** 지급대행 키 — 결제 키와 분리해 넣는다(상점이 다를 수 있다 · docs/deploy.md §5.3.1) */
export function configurePayouts(next: { secretKey?: string; securityKey?: string }): void {
  config = { ...config, payoutSecretKey: norm(next.secretKey), payoutSecurityKey: norm(next.securityKey) };
}

export function paymentsConfig(): Readonly<PaymentsConfig> {
  return config;
}

/** 지급대행 키가 둘 다 있는지 — 없으면 셀러 동기화·지급 요청을 조용히 건너뛴다(`payouts.server.ts`) */
export function payoutsConfigured(): boolean {
  return !!config.payoutSecretKey && !!config.payoutSecurityKey;
}

export function payoutsConfig(): Readonly<Pick<PaymentsConfig, "payoutSecretKey" | "payoutSecurityKey">> {
  return config;
}

/** 테스트 전용 */
export function resetPaymentsConfig(): void {
  config = {};
}
