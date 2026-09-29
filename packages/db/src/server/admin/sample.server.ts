/**
 * 판매로 이어지지 않은 샘플 구매 대금 — 0024.
 *   listSampleSettleDue()    발송 후 종결된 캠페인의 샘플 대금 정산 대기
 *   settleSampleAsAdmin()    한 건 정산 (브랜드 지급 · 멱등)
 *   listSampleRefundDue()    결제 후 영업일 5일 미발송 — 환불 대상 **목록만**
 *
 * 환불 실행은 여기 없다 — 토스 현금 취소가 먼저여서(0012 §5.7) `app_partner_payment_refund` 를 부르는
 * 운영 스크립트가 순서를 지킨다. 화면은 대상을 보여주고 그 사실을 안내한다.
 */
import { createAdminClient, type Admin } from "../admin.server";
import {
  parseSampleRefundDue,
  parseSampleSettleResult,
  parseSampleSettleRows,
  type SampleRefundDue,
  type SampleSettleResult,
  type SampleSettleRow,
} from "../../admin/sample-rules";

export type { SampleRefundDue, SampleRefundRow, SampleSettleResult, SampleSettleRow } from "../../admin/sample-rules";

export async function listSampleSettleDue(admin: Admin = createAdminClient()): Promise<SampleSettleRow[]> {
  const { data, error } = await admin.rpc("app_admin_sample_settle_due");
  if (error) {
    console.error("[admin/sample] app_admin_sample_settle_due 실패:", error.message);
    return [];
  }
  return parseSampleSettleRows(data);
}

export async function listSampleRefundDue(admin: Admin = createAdminClient()): Promise<SampleRefundDue> {
  const { data, error } = await admin.rpc("app_admin_sample_refund_due");
  if (error) {
    console.error("[admin/sample] app_admin_sample_refund_due 실패:", error.message);
    return { today: null, shipDays: 5, rows: [] };
  }
  return parseSampleRefundDue(data);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 샘플 대금 정산 — 대상은 `code` → `id` 를 서버에서 해석한다(클라이언트가 보낸 ref 를 믿지 않는다) */
export async function settleSampleAsAdmin(
  campaignRef: string,
  actorUserId: string,
  admin: Admin = createAdminClient()
): Promise<SampleSettleResult> {
  const r = campaignRef.trim();
  if (!r) return { ok: false, code: "NOT_FOUND" };

  let id = r;
  if (!UUID_RE.test(r)) {
    const { data, error } = await admin.from("campaigns").select("id").eq("code", r.toLowerCase()).maybeSingle();
    if (error) {
      console.error("[admin/sample] 캠페인 조회 실패:", error.message);
      return { ok: false, code: "DB_ERROR" };
    }
    if (!data) return { ok: false, code: "NOT_FOUND" };
    id = data.id as string;
  }

  const { data, error } = await admin.rpc("app_admin_settle_sample", { p_campaign_id: id, p_actor_user_id: actorUserId });
  if (error) {
    console.error("[admin/sample] app_admin_settle_sample 실패:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSampleSettleResult(data);
}
