/**
 * 관리자 "매출·순수익" 서버 — 0022 `app_admin_revenue` · `app_admin_save_opex`.
 * 데모 원본: `apps/admin/src/routes/(demo)/revenue/+page.svelte`(프로토타입 `vAdminRevenue`).
 *
 * 금액은 **전부 RPC 가 계산한다** — 정산 규칙을 TypeScript 에서 다시 구현하지 않는다.
 * 여기서 더 붙이는 것은 운영 비용 계산에 필요한 건수(주문 · 인플루언서 · 추론 대상)뿐이다.
 */
import { createAdminClient, type Admin } from "../admin.server";
import { opexBreakdown, parseAdminRevenue, profitSummary, type AdminRevenue, type Opex, type OpexBreakdown, type ProfitSummary } from "../../admin/revenue-rules";

export type { AdminRevenue, Opex, OpexBreakdown, ProfitSummary } from "../../admin/revenue-rules";

export type AdminRevenueView = AdminRevenue & {
  /** 운영 비용 계산에 쓰인 건수 — 화면이 "N건 × 3 × ₩15" 처럼 근거를 보여준다 */
  basis: { orders: number; sellers: number; inferences: number };
  breakdown: OpexBreakdown;
  profit: ProfitSummary;
};

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string): Promise<number> {
  const { count: n, error } = await q;
  if (error) {
    console.error(`[admin/revenue] ${label} 집계 실패:`, error.message);
    return 0;
  }
  return n ?? 0;
}

/**
 * 매출·순수익 화면 한 번에.
 * `opexOverride` 가 오면(사용자가 입력만 바꾸고 저장하지 않은 상태) 그 값으로 다시 계산한다 —
 * 저장은 별도 액션이다.
 */
export async function getAdminRevenue(opexOverride?: Opex | null, admin: Admin = createAdminClient()): Promise<AdminRevenueView | null> {
  const head = { count: "exact" as const, head: true };

  const [rpc, orders, sellers, autoProposed, external] = await Promise.all([
    admin.rpc("app_admin_revenue"),
    count(admin.from("orders").select("id", head), "주문 수"),
    count(admin.from("sellers").select("id", head), "인플루언서 수"),
    count(admin.from("campaigns").select("id", head).eq("auto_proposed", true), "자동 제안 캠페인"),
    count(admin.from("seller_external_sales").select("id", head), "외부 판매 감지"),
  ]);

  if (rpc.error) {
    console.error("[admin/revenue] app_admin_revenue 실패:", rpc.error.message);
    return null;
  }
  const parsed = parseAdminRevenue(rpc.data);
  if (!parsed) return null;

  const opex = opexOverride ?? parsed.opex;
  const basis = { orders, sellers, inferences: autoProposed + external };
  const breakdown = opexBreakdown({ opex, ...basis, celCover: parsed.celCover });
  const profit = profitSummary(parsed.totals.net, parsed.totals.platform_net, breakdown.total);

  return { ...parsed, opex, basis, breakdown, profit };
}

export type SaveOpexResult = { ok: true; opex: Opex } | { ok: false; code: "BAD_INPUT" | "DB_ERROR" };

/** 운영 비용 저장 — `platform_settings.opex_default` 한 행(데모 `act.saveOpex`) */
export async function saveOpex(opex: Opex, admin: Admin = createAdminClient()): Promise<SaveOpexResult> {
  const { data, error } = await admin.rpc("app_admin_save_opex", { p_opex: opex });
  if (error) {
    console.error("[admin/revenue] app_admin_save_opex 실패:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (o?.ok !== true) return { ok: false, code: o?.code === "BAD_INPUT" ? "BAD_INPUT" : "DB_ERROR" };
  return { ok: true, opex: (o.opex as Opex) ?? opex };
}
