/**
 * 관리자 콘솔 "파트너 관리 — 상품 검수" (docs/admin-console-plan.md "파트너 관리" · docs/brand-console-plan.md §0 결정 9).
 * 데모 `(demo)/products`(프로토타입 `vAdminProducts`) 의 열 구성 + 운영 스크립트 `partner-admin.mjs` 의
 * `products [--pending] [--brand]` · `review-product <p> approve|reject|pause` 를 화면용으로 옮긴 것.
 *
 * **마이그레이션 없음.** 검수는 0015 `app_admin_review_product(p_product_id, p_decision, p_reason)` 를 그대로 호출한다
 * (승인 시 재고 0 이면 `platform_settings.default_stock_on_approve` 로 채우는 것도 함수 안에 있다).
 * 목록·집계는 `products` · `campaigns` · `orders` 읽기뿐이다.
 *
 * 전부 service role + 화면의 `requireAdmin()` 뒤에서만. 검수는 **code → id 로 먼저 해석**한 뒤 RPC 에 uuid 를 넘긴다 —
 * 클라이언트가 보낸 ref 를 그대로 믿지 않는다(inf-console-plan §4.9).
 *
 *   listAdminProducts({ status, brand, category, q, limit })  목록 + 카운트(상태별) + 브랜드·카테고리 칩
 *   reviewProduct(ref, decision, reason)                      0015 RPC — approve · reject · pause
 * 순수 규칙(상태 칩·수수료 문구·실패 문구)은 `../../admin/product-rules.ts`.
 */
import { reviewFailMessage, type ProductStatus } from "../../admin/product-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { notifySlack } from "../partner/slack.server";

export type { ProductStatus } from "../../admin/product-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_COLUMNS =
  "id, code, brand_id, name, description, emoji, thumb_url, category, consumer_price, sale_price, commission_rate, stock, status, reject_reason, exclusive_grade, exclusive_label, exclusive_seller_id, created_at, updated_at";

export type AdminProductRow = {
  id: string;
  code: string | null;
  brand_id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  thumb_url: string | null;
  category: string | null;
  consumer_price: number;
  sale_price: number;
  commission_rate: number;
  stock: number;
  status: ProductStatus | string;
  reject_reason: string | null;
  exclusive_grade: string | null;
  exclusive_label: string | null;
  exclusive_seller_id: string | null;
  created_at: string;
  updated_at: string;
  /** 표시용 */
  brand_name: string | null;
  brand_code: string | null;
  brand_grade: string | null;
  campaigns_total: number;
  campaigns_live: number;
  /** 확정 매출 합(PAID 주문 · 환불 제외) — 데모 `gmvOf` */
  net: number;
};

export type AdminProductList = {
  rows: AdminProductRow[];
  counts: Record<string, number> & { all: number };
  brands: { id: string; code: string | null; name: string; count: number }[];
  categories: { name: string; count: number }[];
};

export type AdminProductActionResult =
  | { ok: true; code: string; status: string }
  | { ok: false; code: string; message: string };

/* ------------------------------------------------------------ 조회 ------------------------------------------------------------ */

/** code('p1') 또는 uuid → id. 삭제된 상품은 없는 것으로 본다 */
async function productIdOf(admin: Admin, ref: string): Promise<string | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  if (UUID_RE.test(r)) return r;
  const { data, error } = await admin.from("products").select("id").eq("code", r).is("deleted_at", null).maybeSingle();
  if (error) {
    console.error("[admin/products] product lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 브랜드 ref(code 또는 uuid) → id */
async function brandIdOf(admin: Admin, ref: string): Promise<string | null> {
  const r = ref.trim();
  if (!r) return null;
  if (UUID_RE.test(r)) return r;
  const { data, error } = await admin.from("brands").select("id").eq("code", r).maybeSingle();
  if (error) {
    console.error("[admin/products] brand lookup failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * 목록 — `partner-admin.mjs cmdProducts` 의 확장(등록일 내림차순 그대로). 삭제된 상품은 제외한다.
 * 카운트·칩은 필터와 무관하게 전체 기준. 판매·매출 집계는 `campaigns` + `orders` 를 한 번에 읽어 메모리에서 묶는다
 * (상품 수가 수백 단위라는 전제 — 넘으면 집계 뷰나 RPC 로 옮긴다).
 */
export async function listAdminProducts(
  opts: { status?: ProductStatus | null; brand?: string | null; category?: string | null; q?: string | null; limit?: number } = {},
  admin: Admin = createAdminClient(),
): Promise<AdminProductList> {
  const { status = null, brand = null, category = null, q = null, limit = 300 } = opts;
  const empty: AdminProductList = { rows: [], counts: { all: 0 }, brands: [], categories: [] };

  const [allProducts, brandRows, campaigns, orders] = await Promise.all([
    admin.from("products").select("id, brand_id, status, category").is("deleted_at", null),
    admin.from("brands").select("id, code, name, grade"),
    admin.from("campaigns").select("id, product_id, status"),
    admin.from("orders").select("campaign_id, status, unit_price, qty, refund_amount"),
  ]);
  if (allProducts.error || brandRows.error || campaigns.error || orders.error) {
    console.error(
      "[admin/products] list aggregates failed:",
      allProducts.error?.message ?? brandRows.error?.message ?? campaigns.error?.message ?? orders.error?.message,
    );
    return empty;
  }

  const all = allProducts.data ?? [];
  const counts: Record<string, number> & { all: number } = { all: all.length };
  for (const p of all) counts[p.status as string] = (counts[p.status as string] ?? 0) + 1;

  const brandMap = new Map((brandRows.data ?? []).map((b) => [b.id as string, b]));
  const brandCount = new Map<string, number>();
  const catCount = new Map<string, number>();
  for (const p of all) {
    brandCount.set(p.brand_id as string, (brandCount.get(p.brand_id as string) ?? 0) + 1);
    if (p.category) catCount.set(p.category as string, (catCount.get(p.category as string) ?? 0) + 1);
  }

  // 캠페인별 확정 매출 → 상품으로 합산 (데모 gmvOf = Σ calc(c).net)
  const campNet = new Map<string, number>();
  for (const o of orders.data ?? []) {
    if (!o.campaign_id || o.status !== "PAID") continue;
    const amount = Number(o.unit_price ?? 0) * Number(o.qty ?? 0) - Number(o.refund_amount ?? 0);
    campNet.set(o.campaign_id as string, (campNet.get(o.campaign_id as string) ?? 0) + Math.max(0, amount));
  }
  const cAgg = new Map<string, { total: number; live: number; net: number }>();
  for (const c of campaigns.data ?? []) {
    const pid = c.product_id as string;
    const a = cAgg.get(pid) ?? { total: 0, live: 0, net: 0 };
    a.total += 1;
    if (c.status === "LIVE") a.live += 1;
    a.net += campNet.get(c.id as string) ?? 0;
    cAgg.set(pid, a);
  }

  let sel = admin
    .from("products")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) sel = sel.eq("status", status);
  if (category) sel = sel.eq("category", category);
  if (brand) {
    const bid = await brandIdOf(admin, brand);
    sel = bid ? sel.eq("brand_id", bid) : sel.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const term = (q ?? "").trim();
  if (term) {
    const like = `%${term.replace(/[%,]/g, "")}%`;
    sel = sel.or(`name.ilike.${like},description.ilike.${like},code.ilike.${like},category.ilike.${like}`);
  }

  const { data, error } = await sel;
  if (error) {
    console.error("[admin/products] list failed:", error.message);
    return { ...empty, counts };
  }

  const rows: AdminProductRow[] = ((data ?? []) as Omit<AdminProductRow, "brand_name" | "brand_code" | "brand_grade" | "campaigns_total" | "campaigns_live" | "net">[]).map((p) => {
    const b = brandMap.get(p.brand_id);
    const a = cAgg.get(p.id) ?? { total: 0, live: 0, net: 0 };
    return {
      ...p,
      brand_name: (b?.name as string) ?? null,
      brand_code: (b?.code as string) ?? null,
      brand_grade: (b?.grade as string) ?? null,
      campaigns_total: a.total,
      campaigns_live: a.live,
      net: a.net,
    };
  });

  return {
    rows,
    counts,
    brands: [...brandCount.entries()]
      .map(([id, count]) => {
        const b = brandMap.get(id);
        return { id, code: (b?.code as string) ?? null, name: (b?.name as string) ?? id, count };
      })
      .sort((a, b) => b.count - a.count),
    categories: [...catCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "ko")),
  };
}

/* ------------------------------------------------------------ 쓰기 ------------------------------------------------------------ */

/**
 * 검수 — 0015 `app_admin_review_product` 호출. `partner-admin.mjs review-product` 와 같은 계약이다.
 * `ref` 는 code('p1') 또는 uuid — **여기서 id 로 해석한 뒤** RPC 에 넘긴다.
 * 결과 코드는 화면 문구용: `approved` · `approved_already` · `rejected` · `paused` · `resumed`.
 * `approve` 는 pending·rejected·paused 에서 모두 쓰이므로, 이전 상태를 보고 "재개"와 "승인"을 구분한다.
 */
export async function reviewProduct(
  ref: string,
  decision: "approve" | "reject" | "pause",
  reason: string | null = null,
  admin: Admin = createAdminClient(),
): Promise<AdminProductActionResult> {
  const id = await productIdOf(admin, ref);
  if (id === "error") return { ok: false, code: "DB_ERROR", message: reviewFailMessage("DB_ERROR") };
  if (!id) return { ok: false, code: "NOT_FOUND", message: reviewFailMessage("NOT_FOUND") };

  const before = await admin.from("products").select("status, name, code").eq("id", id).maybeSingle();
  const prevStatus = (before.data?.status as string) ?? null;

  const { data, error } = await admin.rpc("app_admin_review_product", {
    p_product_id: id,
    p_decision: decision,
    p_reason: reason ?? undefined,
  });
  if (error) {
    console.error("[admin/products] app_admin_review_product failed:", error.message);
    return { ok: false, code: "DB_ERROR", message: reviewFailMessage("DB_ERROR") };
  }
  const res = (data ?? {}) as { ok?: boolean; code?: string; already?: boolean; status?: string };
  if (!res.ok) return { ok: false, code: res.code ?? "DB_ERROR", message: reviewFailMessage(res.code) };

  const name = (before.data?.name as string) ?? ref;
  const code = (before.data?.code as string) ?? ref;
  let msgCode = "approved";
  if (decision === "reject") msgCode = "rejected";
  else if (decision === "pause") msgCode = "paused";
  else if (res.already) msgCode = "approved_already";
  else if (prevStatus === "paused") msgCode = "resumed";

  const verb = decision === "reject" ? "반려" : decision === "pause" ? "노출 중단" : prevStatus === "paused" ? "노출 재개" : "승인";
  await notifySlack(`[셀러리] 상품 ${verb} · ${code} · ${name}${reason ? ` · ${reason}` : ""}`);
  return { ok: true, code: msgCode, status: res.status ?? "" };
}
