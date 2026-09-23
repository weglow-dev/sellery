/**
 * 관리자 콘솔 "파트너 관리 — 브랜드" (docs/admin-console-plan.md "파트너 관리" · docs/brand-console-plan.md §3 · §8).
 * 데모 `(demo)/brands`(프로토타입 `vAdminBrands`) 의 열 구성 + 운영 스크립트 `partner-admin.mjs` 의
 * `brands [--inactive]` · `suspend-brand` · `reactivate-brand` 를 화면용으로 옮긴 것.
 *
 * **마이그레이션 없음.** 컬럼이 전부 있다: `brands.active` · `grade` · `gmv_base` · `bank_info` · `biz_no` ·
 * `tax_info` · `auto_propose` · `logo_url` · `manager_name`(0001 · 0019). 누적 GMV 는 `brand_gmv(uuid)`(0004).
 * 브랜드에는 `hidden` 이 없다(인플루언서 전용).
 *
 * 전부 service role + 화면의 `requireAdmin()` 뒤에서만. 쓰기는 **대상을 먼저 조회한 뒤 그 `id` 로 update** —
 * 클라이언트가 보낸 ref 를 그대로 믿지 않는다(inf-console-plan §4.9).
 * 계좌 원문(`bank_info`)은 읽지 않는다 — 있는지 여부만 본다(계획서 M6: 원문은 이체 파일 경로만 · 열람 로그 대상).
 *
 *   listBrands({ filter, grade, q, limit })  목록 + 카운트 + 등급별 카운트. 누적 GMV 내림차순
 *   getBrand(ref)                            상세 1건 + 🥬 잔액 + 집계 (ref: code('b1') 또는 uuid)
 *   setBrandActive(ref, active, reason)       정지 · 복귀 (Slack 한 줄 · listed 상품은 내리지 않는다)
 *   setBrandAutoPropose(ref, on)              자동 제안 ON/OFF
 *   grantBrandCelery(ref, delta?)             🥬 관리자 이벤트 지급 — celery_ledger(owner_type 'brand')
 * 순수 규칙(필터·칩·검색)은 `../../admin/brand-rules.ts`.
 */
import { type BrandFilter } from "../../admin/brand-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { notifySlack } from "../partner/slack.server";

export type { BrandFilter } from "../../admin/brand-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `bank_info` · `tax_info` 는 **원문을 select 하지 않는다** — 존재 여부만 따로 조회한다(M6). */
const LIST_COLUMNS =
  "id, code, name, category, manager_name, manager_phone, email, logo_url, biz_no, mail_order_no, grade, gmv_base, auto_propose, po_enabled, po_email, referred_by, active, created_at";

export type AdminBrandBase = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  email: string | null;
  logo_url: string | null;
  biz_no: string | null;
  mail_order_no: string | null;
  grade: string | null;
  gmv_base: number;
  auto_propose: boolean;
  po_enabled: boolean;
  po_email: string | null;
  referred_by: string | null;
  active: boolean;
  created_at: string;
};

export type AdminBrandRow = AdminBrandBase & {
  /** 표시용 집계 */
  gmv: number;
  products_total: number;
  products_listed: number;
  products_pending: number;
  campaigns_total: number;
  campaigns_live: number;
  celery: number;
  has_bank_info: boolean;
  has_tax_info: boolean;
  referrer_name: string | null;
};

export type AdminBrandList = {
  rows: AdminBrandRow[];
  counts: { all: number; suspended: number; noSettleInfo: number; pendingProduct: number };
  grades: Record<string, number>;
};

export type AdminBrandActionResult = { ok: true; code: string } | { ok: false; code: "err_not_found" | "err" };

/* ------------------------------------------------------------ 조회 ------------------------------------------------------------ */

async function findBrand(admin: Admin, ref: string): Promise<AdminBrandBase | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  const q = admin.from("brands").select(LIST_COLUMNS);
  const { data, error } = UUID_RE.test(r) ? await q.eq("id", r).maybeSingle() : await q.eq("code", r).maybeSingle();
  if (error) {
    console.error("[admin/brands] brand lookup failed:", error.message);
    return "error";
  }
  return (data as AdminBrandBase | null) ?? null;
}

/** 정산 정보 존재 여부만 — 원문은 읽지 않는다(M6). `bank_info`·`tax_info` 가 null 이 아니면 true */
async function settleInfoFlags(admin: Admin): Promise<Map<string, { bank: boolean; tax: boolean }>> {
  const { data, error } = await admin.from("brands").select("id, bank_info, tax_info");
  if (error) {
    console.error("[admin/brands] settle info flags failed:", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.id as string, { bank: r.bank_info !== null, tax: r.tax_info !== null }]));
}

/** 🥬 잔액 — `celery_balances` 뷰의 브랜드 행 */
async function brandCelery(admin: Admin): Promise<Map<string, number>> {
  const { data, error } = await admin.from("celery_balances").select("brand_id, balance").eq("owner_type", "brand");
  if (error) {
    console.error("[admin/brands] celery_balances failed:", error.message);
    return new Map();
  }
  return new Map((data ?? []).filter((r) => r.brand_id).map((r) => [r.brand_id as string, Number(r.balance ?? 0)]));
}

/** 누적 GMV — 0004 `brand_gmv(uuid)`. 실패하면 `gmv_base` 로 대체한다(화면이 0 으로 보이지 않게) */
async function brandGmv(admin: Admin, ids: string[], fallback: Map<string, number>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await admin.rpc("brand_gmv", { p_brand: id });
      if (error) {
        console.error("[admin/brands] brand_gmv failed:", error.message);
        out.set(id, fallback.get(id) ?? 0);
        return;
      }
      out.set(id, Number(data ?? 0));
    }),
  );
  return out;
}

/**
 * 목록 — 데모와 같이 **누적 GMV 내림차순**. 집계(상품·캠페인·🥬·정산 정보)는 전체를 한 번에 읽어 메모리에서 묶는다
 * (브랜드 수가 수백을 넘지 않는 전제 — 넘으면 집계 뷰나 RPC 로 옮긴다).
 * `filter='pending_product'` 는 검수 대기(status 'pending') 상품을 가진 브랜드만.
 */
export async function listBrands(
  opts: { filter?: BrandFilter; grade?: string | null; q?: string | null; limit?: number } = {},
  admin: Admin = createAdminClient(),
): Promise<AdminBrandList> {
  const { filter = "all", grade = null, q = null, limit = 300 } = opts;
  const empty: AdminBrandList = {
    rows: [],
    counts: { all: 0, suspended: 0, noSettleInfo: 0, pendingProduct: 0 },
    grades: {},
  };

  const [products, campaigns, flags, celery, allRows] = await Promise.all([
    admin.from("products").select("id, brand_id, status"),
    admin.from("campaigns").select("product_id, status"),
    settleInfoFlags(admin),
    brandCelery(admin),
    admin.from("brands").select("id, code, name, grade, active"),
  ]);
  if (products.error || campaigns.error || allRows.error) {
    console.error(
      "[admin/brands] list aggregates failed:",
      products.error?.message ?? campaigns.error?.message ?? allRows.error?.message,
    );
    return empty;
  }

  const prodBrand = new Map<string, string>();
  const pAgg = new Map<string, { total: number; listed: number; pending: number }>();
  for (const p of products.data ?? []) {
    const bid = p.brand_id as string;
    prodBrand.set(p.id as string, bid);
    const a = pAgg.get(bid) ?? { total: 0, listed: 0, pending: 0 };
    a.total += 1;
    if (p.status === "listed") a.listed += 1;
    if (p.status === "pending") a.pending += 1;
    pAgg.set(bid, a);
  }
  const cAgg = new Map<string, { total: number; live: number }>();
  for (const c of campaigns.data ?? []) {
    const bid = prodBrand.get(c.product_id as string);
    if (!bid) continue;
    const a = cAgg.get(bid) ?? { total: 0, live: 0 };
    a.total += 1;
    if (c.status === "LIVE") a.live += 1;
    cAgg.set(bid, a);
  }

  const all = allRows.data ?? [];
  const nameById = new Map(all.map((r) => [r.id as string, r.name as string]));
  const counts = {
    all: all.length,
    suspended: all.filter((r) => !r.active).length,
    noSettleInfo: all.filter((r) => !(flags.get(r.id as string)?.bank ?? false)).length,
    pendingProduct: all.filter((r) => (pAgg.get(r.id as string)?.pending ?? 0) > 0).length,
  };
  const grades: Record<string, number> = {};
  for (const r of all) {
    const g = (r.grade as string | null) ?? "스타터";
    grades[g] = (grades[g] ?? 0) + 1;
  }

  let sel = admin.from("brands").select(LIST_COLUMNS).limit(limit);
  if (filter === "active") sel = sel.eq("active", true);
  if (filter === "suspended") sel = sel.eq("active", false);
  if (filter === "no_settle_info") sel = sel.is("bank_info", null);
  if (filter === "pending_product") {
    const ids = all.map((r) => r.id as string).filter((id) => (pAgg.get(id)?.pending ?? 0) > 0);
    sel = ids.length ? sel.in("id", ids) : sel.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  if (grade) sel = sel.eq("grade", grade);
  const term = (q ?? "").trim();
  if (term) {
    const like = `%${term.replace(/[%,]/g, "")}%`;
    sel = sel.or(`name.ilike.${like},manager_name.ilike.${like},email.ilike.${like},code.ilike.${like},category.ilike.${like}`);
  }

  const { data, error } = await sel;
  if (error) {
    console.error("[admin/brands] list failed:", error.message);
    return { ...empty, counts, grades };
  }
  const base = (data ?? []) as AdminBrandBase[];
  const fallback = new Map(base.map((b) => [b.id, Number(b.gmv_base ?? 0)]));
  const gmv = await brandGmv(admin, base.map((b) => b.id), fallback);

  const rows: AdminBrandRow[] = base
    .map((b) => {
      const p = pAgg.get(b.id) ?? { total: 0, listed: 0, pending: 0 };
      const c = cAgg.get(b.id) ?? { total: 0, live: 0 };
      const f = flags.get(b.id) ?? { bank: false, tax: false };
      return {
        ...b,
        gmv: gmv.get(b.id) ?? 0,
        products_total: p.total,
        products_listed: p.listed,
        products_pending: p.pending,
        campaigns_total: c.total,
        campaigns_live: c.live,
        celery: celery.get(b.id) ?? 0,
        has_bank_info: f.bank,
        has_tax_info: f.tax,
        referrer_name: b.referred_by ? (nameById.get(b.referred_by) ?? null) : null,
      };
    })
    .sort((a, b) => b.gmv - a.gmv);

  return { rows, counts, grades };
}

/**
 * 상세 — 브랜드 1건 + 집계. 없으면 null.
 * 집계를 목록과 **같은 식**으로 내기 위해 `listBrands` 를 재사용한다 — 브랜드 수가 수백 단위라 비용이 낮고,
 * 두 곳에서 따로 계산하면 숫자가 어긋난다. 수가 늘면 집계를 함수로 빼거나 RPC 로 옮긴다.
 */
export async function getBrand(ref: string, admin: Admin = createAdminClient()): Promise<AdminBrandRow | null> {
  const b = await findBrand(admin, ref);
  if (!b || b === "error") return null;
  const { rows } = await listBrands({ limit: 1000 }, admin);
  const hit = rows.find((r) => r.id === b.id);
  if (hit) return hit;
  // 목록 쿼리가 실패한 경우에도 상세는 열린다(집계는 0 · GMV 는 gmv_base)
  return {
    ...b,
    gmv: Number(b.gmv_base ?? 0),
    products_total: 0,
    products_listed: 0,
    products_pending: 0,
    campaigns_total: 0,
    campaigns_live: 0,
    celery: 0,
    has_bank_info: false,
    has_tax_info: false,
    referrer_name: null,
  };
}

/* ------------------------------------------------------------ 쓰기 ------------------------------------------------------------ */

/**
 * 정지 · 복귀 — `partner-admin.mjs cmdSuspendBrand` 와 같은 patch(`{ active }`).
 * 정지하면 다음 요청부터 `requireBrand()` 가 `/brand/suspended` 로 보낸다.
 * **판매 중(listed) 상품은 자동으로 내리지 않는다** — 스크립트가 경고만 출력하는 것과 같은 동작(brand-console-plan §8).
 * 사유는 저장하지 않는다(컬럼이 없다) — Slack 한 줄만.
 */
export async function setBrandActive(
  ref: string,
  active: boolean,
  reason = "",
  admin: Admin = createAdminClient(),
): Promise<AdminBrandActionResult> {
  const b = await findBrand(admin, ref);
  if (b === "error") return { ok: false, code: "err" };
  if (!b) return { ok: false, code: "err_not_found" };
  if (b.active === active) return { ok: true, code: active ? "reactivated" : "suspended" };

  const { error } = await admin.from("brands").update({ active }).eq("id", b.id);
  if (error) {
    console.error("[admin/brands] setBrandActive failed:", error.message);
    return { ok: false, code: "err" };
  }
  const verb = active ? "복귀" : "정지";
  await notifySlack(`[셀러리] 브랜드 ${verb} · ${b.code ?? b.id} · ${b.name}${reason ? ` · ${reason}` : ""}`);
  return { ok: true, code: active ? "reactivated" : "suspended" };
}

/** 자동 제안 ON/OFF — 데모 `act.toggleAutoPropose` 의 DB 판(`brands.auto_propose`) */
export async function setBrandAutoPropose(
  ref: string,
  on: boolean,
  admin: Admin = createAdminClient(),
): Promise<AdminBrandActionResult> {
  const b = await findBrand(admin, ref);
  if (b === "error") return { ok: false, code: "err" };
  if (!b) return { ok: false, code: "err_not_found" };
  if (b.auto_propose === on) return { ok: true, code: on ? "auto_on" : "auto_off" };

  const { error } = await admin.from("brands").update({ auto_propose: on }).eq("id", b.id);
  if (error) {
    console.error("[admin/brands] setBrandAutoPropose failed:", error.message);
    return { ok: false, code: "err" };
  }
  return { ok: true, code: on ? "auto_on" : "auto_off" };
}

/** `platform_settings.admin_grant_cel` — 없으면 3 */
async function adminGrantCel(admin: Admin): Promise<number> {
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", "admin_grant_cel").maybeSingle();
  if (error) {
    console.error("[admin/brands] admin_grant_cel read failed:", error.message);
    return 3;
  }
  const n = Number(data?.value ?? 3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

/**
 * 🥬 관리자 이벤트 지급(브랜드) — 인플루언서 `grantCelery` 의 브랜드 판.
 * `celery_ledger` 에 `owner_type='brand'` · `reason='admin_grant'` 행 1건. 멱등이 아니라 화면에서 confirm 을 건다.
 * 회수(음수)는 여기서 하지 않는다 — 운영 조정은 `reason='adjust'`(정산·돈 범위 · 계획서 M7).
 */
export async function grantBrandCelery(
  ref: string,
  delta?: number,
  admin: Admin = createAdminClient(),
): Promise<AdminBrandActionResult> {
  const b = await findBrand(admin, ref);
  if (b === "error") return { ok: false, code: "err" };
  if (!b) return { ok: false, code: "err_not_found" };

  const amount = delta && delta > 0 ? Math.floor(delta) : await adminGrantCel(admin);
  const { error } = await admin.from("celery_ledger").insert({
    owner_type: "brand",
    brand_id: b.id,
    delta: amount,
    reason: "admin_grant",
    memo: "관리자 이벤트 지급",
    ref_type: "brand",
    ref_id: b.id,
  });
  if (error) {
    console.error("[admin/brands] grantBrandCelery failed:", error.message);
    return { ok: false, code: "err" };
  }
  await notifySlack(`[셀러리] 🥬 ${amount} 지급(브랜드) · ${b.code ?? b.id} · ${b.name}`);
  return { ok: true, code: "celery_granted" };
}
