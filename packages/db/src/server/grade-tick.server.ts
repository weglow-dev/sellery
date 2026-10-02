/**
 * 등급 월간 재계산 틱 — 인플루언서·브랜드 전원의 등급을 최근 3개월 확정 매출로 다시 계산한다
 * (0032 `app_grade_recalc_all` · 크론 `/api/cron/grade-tick`).
 *
 * 배경: 등급 캐시(`sellers.grade` · `brands.grade`)는 `m3_sales`/GMV 가 바뀔 때 트리거가 맞춰 주지만,
 *   그 값을 갱신하던 주체가 **정산 실행뿐**이었다(0020:679 — 그 캠페인 당사자만). 판매가 끊기면 등급이
 *   고점에 멈춰, 인플루언서 홈의 "등급은 … 매달 다시 계산되고" 안내와 달랐다.
 *   운영 결정(2026-10-02): 매월 1일 전원 재계산 · 판매가 끊기면 강등. 지급은 정산 실행 시점 등급.
 *
 *   runGradeTick()   `app_grade_recalc_all` — 전원 · 멱등 · `m3_sales_base` 백필 보정 포함
 *
 * 계산 규칙은 1건 함수(`app_seller_grade_recalc` · `app_brand_grade_recalc`)를 그대로 쓴다 — 두 곳에 두지 않는다.
 * 응답 파서·타입은 순수 모듈 `../grade-tick.ts` (테스트가 서버 모듈을 import 하지 않도록 — check-boundaries (c)).
 */
import { parseGradeTickResult, type GradeTickResult } from "../grade-tick";
import { createAdminClient, type Admin } from "./admin.server";

export { parseGradeTickResult };
export type { GradeTickResult };

/** 전원 재계산. RPC 오류는 null — 라우트가 500 으로 알린다(조용히 성공으로 보고하지 않는다). */
export async function runGradeTick(admin: Admin = createAdminClient()): Promise<GradeTickResult | null> {
  const { data, error } = await admin.rpc("app_grade_recalc_all");
  if (error) {
    console.error("[grade-tick] app_grade_recalc_all failed:", error.message);
    return null;
  }
  return parseGradeTickResult(data);
}
