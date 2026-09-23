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
 *   getAdminProduct(ref)                                      상세 1건 + 브랜드 + 캠페인 목록(인플루언서 · 확정 매출 · 판매 링크)
 *   getProductPreviewCard(ref)                                검수용 상세페이지 미리보기 — StoreView 용 합성 CampaignCard
 *   reviewProduct(ref, decision, reason)                      0015 RPC — approve · reject · pause
 * 순수 규칙(상태 칩·수수료 문구·실패 문구)은 `../../admin/product-rules.ts`.
 */
import { reviewFailMessage, type ProductStatus } from "../../admin/product-rules";
import { DEFAULT_SETTINGS, storeUrl, type CampaignCard } from "../../campaign";
import { createAdminClient, type Admin } from "../admin.server";
import { notifySlack } from "../partner/slack.server";

export type { ProductStatus } from "../../admin/product-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 판매 페이지가 존재하는 캠페인 상태 — **0003 `campaign_card` 의 `status in (...)` 과 같은 목록이어야 한다**.
 * 판매 링크는 인플루언서 일정이 확정되는 순간(`SCHEDULE_CONFIRMED`) 생성되고, 그때 CTA 는 "🔔 오픈 알림 받기" 다(BuyCta).
 * 이 밖의 상태(제안·샘플·테스트·일정 제안 중)에서는 `/s/{handle}/{code}` 가 404 다.
 */
const STORE_OPEN_STATES: readonly string[] = ["SCHEDULE_CONFIRMED", "LIVE", "CLEARING", "SETTLED"];

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

/* ------------------------------------------------------------ 상세 ------------------------------------------------------------ */

/** 상세에서만 읽는 컬럼 — 옵션 · 샘플 정책 · 이미지 */
const DETAIL_COLUMNS = `${LIST_COLUMNS}, options, image_urls, sample_text, sample_free_grade, sample_buy_mode, sample_fixed_price, sample_refund, trend, boosted_at`;

export type AdminProductOption = { n: string; price: number };

/** `products.trend`(jsonb) — 프로토타입 `CAT_TRENDS` 의 상품별 판. `g` 는 증감률 문자열('+240%'), `note` 는 한 줄 설명 */
export type AdminProductTrend = { g: string | null; note: string | null };

export type AdminProductCampaign = {
  id: string;
  code: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  seller_name: string | null;
  seller_handle: string | null;
  seller_code: string | null;
  /** 대표 채널 팔로워(`sellers.followers` — 0001:326 메인 채널 동기화 값) */
  seller_followers: number | null;
  /** 평균 좋아요(`sellers.likes_avg`) — 0001:398 공개 grant 에서 차단된 지표라 관리자만 본다 */
  seller_likes_avg: number | null;
  net: number;
  /** LIVE·CLEARING·SETTLED 처럼 판매가 열린 뒤에만 채워진다 — 없으면 판매 페이지가 없다 */
  store_url: string | null;
};

export type AdminProductDetail = AdminProductRow & {
  options: AdminProductOption[];
  image_urls: string[];
  sample_text: string | null;
  sample_free_grade: string | null;
  sample_buy_mode: string | null;
  sample_fixed_price: number | null;
  sample_refund: boolean;
  trend: AdminProductTrend | null;
  campaigns: AdminProductCampaign[];
};

/** jsonb → { g, note }. 객체가 아니면 null (문자열로 렌더하면 [object Object] 가 된다) */
function parseTrend(v: unknown): AdminProductTrend | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const g = typeof o.g === "string" ? o.g : null;
  const note = typeof o.note === "string" ? o.note : null;
  return g || note ? { g, note } : null;
}

/**
 * 상세 — 상품 1건 + 브랜드 + **캠페인 목록**. 데모의 [실적] 모달(`openModal('productDetail')`)이 하던 일을 화면으로 옮긴 것.
 * 데모의 [상세페이지] 버튼(`go.store('p:' + id)`)은 여기 없다 — 그건 `storeCamp()` 가 **가짜 LIVE 캠페인**을 만들어 열던
 * 데모 전용 동작이고(docs/influencer-spec.md §1.3), 실서비스 판매 페이지는 캠페인 단위(`/s/{handle}/{code}`)다.
 * 대신 캠페인마다 `store_url` 을 채워 **판매가 열린 캠페인만** 링크한다.
 */
export async function getAdminProduct(ref: string, admin: Admin = createAdminClient()): Promise<AdminProductDetail | null> {
  const id = await productIdOf(admin, ref);
  if (!id || id === "error") return null;

  const { data, error } = await admin.from("products").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) {
    if (error) console.error("[admin/products] detail failed:", error.message);
    return null;
  }
  const p = data as Record<string, unknown>;

  const [brand, camps] = await Promise.all([
    admin.from("brands").select("id, code, name, grade").eq("id", p.brand_id as string).maybeSingle(),
    admin
      .from("campaigns")
      .select("id, code, status, start_date, end_date, seller_id, sellers(code, name, handle, followers, likes_avg)")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (camps.error) console.error("[admin/products] detail campaigns failed:", camps.error.message);

  const campRows = (camps.data ?? []) as (Record<string, unknown> & {
    sellers: { code: string | null; name: string; handle: string; followers: number | null; likes_avg: number | null } | null;
  })[];

  // 확정 매출 — 목록과 같은 식(PAID 주문 합 − 환불)
  let netByCamp = new Map<string, number>();
  if (campRows.length) {
    const { data: orders, error: oErr } = await admin
      .from("orders")
      .select("campaign_id, status, unit_price, qty, refund_amount")
      .in("campaign_id", campRows.map((c) => c.id as string));
    if (oErr) console.error("[admin/products] detail orders failed:", oErr.message);
    netByCamp = new Map();
    for (const o of orders ?? []) {
      if (o.status !== "PAID") continue;
      const amount = Number(o.unit_price ?? 0) * Number(o.qty ?? 0) - Number(o.refund_amount ?? 0);
      netByCamp.set(o.campaign_id as string, (netByCamp.get(o.campaign_id as string) ?? 0) + Math.max(0, amount));
    }
  }

  const campaigns: AdminProductCampaign[] = campRows.map((c) => {
    const s = c.sellers;
    const status = c.status as string;
    const opened = STORE_OPEN_STATES.includes(status);
    return {
      id: c.id as string,
      code: (c.code as string) ?? null,
      status,
      start_date: (c.start_date as string) ?? null,
      end_date: (c.end_date as string) ?? null,
      seller_name: s?.name ?? null,
      seller_handle: s?.handle ?? null,
      seller_code: s?.code ?? null,
      seller_followers: s?.followers ?? null,
      seller_likes_avg: s?.likes_avg ?? null,
      net: netByCamp.get(c.id as string) ?? 0,
      store_url: opened && s?.handle && c.code ? storeUrl(s.handle, c.code as string) : null,
    };
  });

  const b = brand.data;
  return {
    ...(p as unknown as AdminProductRow),
    brand_name: (b?.name as string) ?? null,
    brand_code: (b?.code as string) ?? null,
    brand_grade: (b?.grade as string) ?? null,
    campaigns_total: campaigns.length,
    campaigns_live: campaigns.filter((c) => c.status === "LIVE").length,
    net: campaigns.reduce((a, c) => a + c.net, 0),
    options: Array.isArray(p.options) ? (p.options as AdminProductOption[]) : [],
    image_urls: Array.isArray(p.image_urls) ? (p.image_urls as string[]) : [],
    sample_text: (p.sample_text as string) ?? null,
    sample_free_grade: (p.sample_free_grade as string) ?? null,
    sample_buy_mode: (p.sample_buy_mode as string) ?? null,
    sample_fixed_price: p.sample_fixed_price === null || p.sample_fixed_price === undefined ? null : Number(p.sample_fixed_price),
    sample_refund: Boolean(p.sample_refund),
    trend: parseTrend(p.trend),
    campaigns,
  };
}

/* ------------------------------------------------------------ 상세페이지 미리보기 ------------------------------------------------------------ */

/**
 * 검수용 **상세페이지 미리보기** 카드 — 데모의 [상세페이지] 버튼(`go.store('p:' + id)` → `storeCamp()`) 이 하던 일.
 * 판매 링크가 발급되기 전(검수 대기·반려·노출 중단)에도 **고객에게 어떻게 보이는지** 확인해야 검수를 할 수 있다.
 *
 * `StoreView` 는 완성된 `CampaignCard` 를 요구하므로 여기서 **합성**한다 — 데모와 같은 방식이고 같은 한계를 가진다:
 *   campaign  가짜(`code:'preview'` · `status:'LIVE'` · `qty = stock`) — 저장하지 않고 이 요청에서만 존재한다
 *   seller    이 상품의 **가장 최근 캠페인의 인플루언서**, 없으면 공개 인플루언서 중 1명(데모 `storeCamp` 와 같은 규칙).
 *             미리보기 레이아웃을 보여주기 위한 대역이며 실제 판매자가 아니다 — 화면이 "미리보기" 로 명시한다.
 *   product · brand · channels · settings  전부 실제 값
 * 구매 CTA 는 `StoreView preview` 가 비활성 안내로 대체한다(가짜 캠페인으로 체크아웃에 들어가지 못하게).
 */
export async function getProductPreviewCard(ref: string, admin: Admin = createAdminClient()): Promise<CampaignCard | null> {
  const id = await productIdOf(admin, ref);
  if (!id || id === "error") return null;

  const { data: p, error } = await admin
    .from("products")
    .select("id, code, brand_id, name, description, emoji, thumb_url, image_urls, category, consumer_price, sale_price, options, status, stock")
    .eq("id", id)
    .maybeSingle();
  if (error || !p) {
    if (error) console.error("[admin/products] preview product failed:", error.message);
    return null;
  }

  // 대역 인플루언서 — 최근 캠페인의 판매자, 없으면 공개(active · not hidden) 중 1명
  const { data: camp } = await admin
    .from("campaigns")
    .select("seller_id")
    .eq("product_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sellerQuery = admin.from("sellers").select("id, code, name, handle, platform, avatar_url, grade").limit(1);
  const { data: seller } = camp?.seller_id
    ? await sellerQuery.eq("id", camp.seller_id as string).maybeSingle()
    : await sellerQuery.eq("active", true).eq("hidden", false).order("m3_sales", { ascending: false }).maybeSingle();
  if (!seller) {
    console.error("[admin/products] preview needs at least one public seller");
    return null;
  }

  const [{ data: brand }, { data: channels }, { data: settingRows }] = await Promise.all([
    admin.from("brands").select("id, code, name, logo_url, grade, biz_no, mail_order_no").eq("id", p.brand_id as string).maybeSingle(),
    admin.from("seller_channels").select("platform, handle, url, is_primary").eq("seller_id", seller.id as string).eq("verified", true).order("is_primary", { ascending: false }),
    admin.from("platform_settings").select("key, value").in("key", ["clear_days", "link_protect_days", "home_feature_days"]),
  ]);
  if (!brand) return null;

  const setting = (key: keyof CampaignCard["settings"]) => {
    const row = (settingRows ?? []).find((r) => r.key === key);
    const n = Number(row?.value);
    return Number.isInteger(n) && n >= 0 ? n : DEFAULT_SETTINGS[key];
  };

  const rawOptions = Array.isArray(p.options) ? (p.options as AdminProductOption[]) : [];
  const options = rawOptions.length ? rawOptions : [{ n: "기본", price: Number(p.sale_price ?? 0) }];

  return {
    campaign: {
      id: "preview",
      code: "preview",
      status: "LIVE",
      start_date: null,
      end_date: null,
      qty: Number(p.stock ?? 0),
      sold_qty: 0,
      home_featured_at: null,
      today: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
    },
    product: {
      id: p.id as string,
      code: (p.code as string) ?? null,
      name: p.name as string,
      description: (p.description as string) ?? null,
      emoji: (p.emoji as string) ?? "📦",
      thumb_url: (p.thumb_url as string) ?? null,
      image_urls: Array.isArray(p.image_urls) ? (p.image_urls as string[]) : [],
      category: (p.category as string) ?? "",
      consumer_price: Number(p.consumer_price ?? 0),
      sale_price: Number(p.sale_price ?? 0),
      options,
      options_raw: p.options,
      status: p.status as string,
    },
    seller: {
      id: seller.id as string,
      code: (seller.code as string) ?? null,
      name: seller.name as string,
      handle: seller.handle as string,
      platform: seller.platform as string,
      avatar_url: (seller.avatar_url as string) ?? null,
      grade: (seller.grade as string) ?? null,
    },
    brand: {
      id: brand.id as string,
      code: (brand.code as string) ?? null,
      name: brand.name as string,
      logo_url: (brand.logo_url as string) ?? null,
      grade: (brand.grade as string) ?? null,
      biz_no: (brand.biz_no as string) ?? null,
      mail_order_no: (brand.mail_order_no as string) ?? null,
    },
    channels: (channels ?? []).map((c) => ({ platform: c.platform as string, handle: c.handle as string, url: (c.url as string) ?? null })),
    settings: {
      clear_days: setting("clear_days"),
      link_protect_days: setting("link_protect_days"),
      home_feature_days: setting("home_feature_days"),
    },
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
