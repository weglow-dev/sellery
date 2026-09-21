# @sellery/payments

토스페이먼츠 결제 계층 — `web/src/lib/{toss,checkout-sync,money}.ts` · `web/src/components/checkout/rules.ts` 의 이식. 이동 표는 [docs/monorepo-migration.md §3.2](../../docs/monorepo-migration.md). 빌드 없음 — 소스를 그대로 export.

## 경계 규칙

| import | 어디서 |
|---|---|
| `@sellery/payments` · `@sellery/payments/money` · `@sellery/payments/checkout-rules` | **순수** — `+page.svelte` · `+page.server.ts` · vitest. `formatKRW` `generateOrderId(kind?)` `ORDER_ID_PREFIX{customer,partner}` `isPartnerOrderId` `orderIdKind` · `parseCheckoutParams` `validateShipping` `parseSuccessParams` `failText` `failPageReason` … |
| `@sellery/payments/server/toss` · `@sellery/payments/server/checkout-sync` · `@sellery/payments/server/partner-sample` · `@sellery/payments/server/config` | **서버 전용** — 앱 `src/lib/server/payments.ts` 배럴을 통해서만 (`$lib/server/` 가드 + `scripts/check-boundaries.mjs`) |

서버 규칙:

- **시크릿은 주입**: `hooks.server.ts` 가 `configurePayments({ secretKey: env.TOSS_SECRET_KEY })` 1회. `tossConfirm` · `tossCancel` · `tossGetPayment` 는 호출 시점에 그 키를 읽는다(없으면 `CONFIG_ERROR` 4xx 취급 — 빌드는 통과). 키를 명시한 인스턴스는 `createToss({ secretKey })`.
- `checkout-sync` 는 **admin 클라이언트를 인자로** 받는다(`@sellery/db/server/admin` 의 `createAdminClient()`). `apiError(status, code)` · `rejectCrossSite(request)` 는 표준 `Response`(`Response.json`) 를 돌려주므로 `+server.ts` 가 그대로 `return` 한다.
- 나머지(`FAIL_MESSAGES` `failMessage` `parseClaimResult` `parseConfirmResult` `confirmDone` `syncFromPayment` `readCampaignGate` `gateIsLive` `softStockLeft` …)는 web 과 동일 — 분기표 원문은 `docs/app-plan.md §7`.
- `partner-sample` 은 인플루언서 **샘플 구매 결제**(0012 `partner_payments` · docs/inf-console-plan.md §5.5~§5.7): `beginSamplePurchase` → `app_partner_payment_claim`, `confirmSamplePurchase` = 금액 대조 → (현금) `app_partner_payment_confirming` → `tossConfirm` → `app_partner_payment_confirm` → RPC 거부면 전액 취소 → FAILED / (🥬 전액) RPC 바로. `cancelSamplePurchase`(결제 전) · `refundSamplePurchase`(운영: 토스 취소 → `app_partner_payment_refund`) · `findPartnerPaymentForWebhook` + `syncPartnerFromPayment`(웹훅 `slrp_` 분기 — shop `/api/payments/webhook` 에 배선됨) · `expirePartnerPayments` `listStalePartnerPayments` `reconcilePartnerPayment`(reconcile 확장 — PR-B 배선). 순수 규칙·문구는 `@sellery/db/partner/sample-rules`.
- `@tosspayments/tosspayments-sdk`(브라우저 위젯)는 이 패키지가 아니라 **apps/shop 의 devDependency** — `PaymentWidget.svelte` 가 `onMount` 안에서 동적 import(S3).

## 파일

```
src/index.ts                 순수 모듈 re-export
src/money.ts                 formatKRW · generateOrderId(kind) · ORDER_ID_PREFIX{customer:slry_, partner:slrp_} · isPartnerOrderId · orderIdKind
src/checkout-rules.ts        체크아웃 URL 파라미터 · 배송지 검증 · 성공/실패 문구
src/server/config.server.ts  configurePayments · paymentsConfig
src/server/toss.server.ts    createToss · tossConfirm · tossCancel · tossGetPayment · isTossError · isUncertain · tossCanceledTotal
src/server/checkout-sync.server.ts   세션 ↔ 토스 동기화 (839줄, web 과 1:1)
src/server/partner-sample.server.ts  파트너 샘플 구매 결제 (0012) — 선점 · 확정(토스 confirm → RPC → 거부 시 취소) · 취소 · 환불 · 웹훅/reconcile 동기화
src/test/*.test.ts           vitest — money · checkout-rules (루트 `npm test`)
```
