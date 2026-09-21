/**
 * @sellery/db — 순수 모듈만 re-export 한다 (`server/*` · `browser` 없음 — docs/monorepo-migration.md §3.1).
 * 서버 전용은 `@sellery/db/server/<name>`(앱의 `$lib/server/*` 배럴을 통해서만), 브라우저 클라이언트는 `@sellery/db/browser`,
 * 법적 문서 본문은 `@sellery/db/legal/{terms,privacy}`(크기 때문에 여기서 재수출하지 않는다).
 * 이 파일은 append-only (§9 규칙).
 */
export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database.types";
export * from "./types";
export * from "./auth";
export * from "./linkctx";
export * from "./console-paths";
export * from "./campaign";
export * from "./dates";
export * from "./text";
export * from "./carriers";
// order-status 의 `won`(null 허용) 은 campaign 의 `won` 과 이름이 겹친다 — 여기서는 campaign 쪽을 쓰고, 필요하면 `@sellery/db/order-status` 로 직접.
export {
  orderStatusLabel,
  shipLabel,
  isRefundable,
  REFUND_BLOCK_MESSAGES,
  REFUND_NOTICE,
  REFUND_REASONS,
  REFUND_REASON_MAX,
  DEFAULT_CLEAR_DAYS,
} from "./order-status";
export type { OrderLike, CampaignLike, StatusTone, RefundBlockCode, RefundReason } from "./order-status";
export * from "./legal";
export * from "./company";
export * from "./partner/signup-rules";
export * from "./partner/sample-rules";
export * from "./partner/settle-rules";
export * from "./partner/schedule-rules";
export * from "./partner/chat-rules";
