/**
 * 관리자 "매칭 · 자동 제안" 서버 — 데모 `(demo)/match`(프로토타입 `vAdminMatch` · `runAutoPropose`)의 실서비스 판.
 *
 * **마이그레이션 없음.** 읽기는 기존 테이블 조합이고(적격 조건은 `app_brand_invite_candidates`(0016) 와 같다),
 * 쓰기는 브랜드 RPC `app_brand_invite_seller`(0036) 를 **대행 호출**한다 — 캠페인 상세의 브랜드 대행과 같은 방식.
 *   0036 부터 다이아·블랙에 제안권 🥬 10 이 들고(`grade_tiers.invite_cost_cel`) 브랜드 잔액이 모자라면
 *   `CEL_INSUFFICIENT` 로 건너뛴다(프로토타입 `runAutoPropose` 의 "브랜드 셀러리 부족으로 보류" 와 같다).
 *   원장 사유는 `p_reason: 'auto_invite'` 로 구분한다.
 * 상태 전이 · 이벤트 문구 · 게이트(비공개 · 우선권 등급 · 독점 · 중복)를 관리자 쪽에서 다시 구현하지 않는다.
 *
 * 적격 필터를 TypeScript 로 한 번 더 쓰는 것은 의도한 중복이다 — 후보를 **여러 브랜드·상품에 걸쳐** 점수순으로
 * 뽑아야 해서 상품마다 `app_brand_invite_candidates` 를 부르면 N+1 이 된다. 어긋나면 발송 단계에서 RPC 가
 * 거절하고 화면이 그 사유를 보여주므로(권위는 RPC), 잘못된 쓰기는 생기지 않는다.
 */
import { createAdminClient, type Admin } from "../admin.server";
import {
  AUTO_PROPOSE_BATCH,
  growthOf,
  inviteFailMessage,
  pickCandidates,
  risingSellers,
  type AutoProposeOutcome,
  type CategoryGroups,
  type MatchCandidate,
  type MatchProduct,
  type MatchSeller,
} from "../../admin/match-rules";

export type { MatchCandidate, MatchProduct, MatchSeller, AutoProposeOutcome } from "../../admin/match-rules";

/** 우선권 등급은 제안에 🥬 제안권(6단계)이 필요해 후보에서 뺀다 — `grade_tiers.is_priority` */
type Tier = { name: string; is_priority: boolean; invite_cost_cel: number };

export type MatchBrand = {
  id: string;
  code: string | null;
  name: string;
  grade: string | null;
  autoPropose: boolean;
  /** 노출 중(listed) 상품 수 */
  listedProducts: number;
  celery: number;
};

export type AutoProposedRow = {
  campaignId: string;
  campaignCode: string | null;
  status: string;
  createdAt: string | null;
  productName: string | null;
  productCode: string | null;
  sellerName: string | null;
  sellerHandle: string | null;
  brandName: string | null;
};

export type AdminMatchView = {
  /** 요즘 뜨는 인플루언서 — 전원 대상(관리자는 비공개도 실명으로 본다) */
  rising: (MatchSeller & { hidden: boolean; active: boolean; eligible: boolean; reason: string | null })[];
  brands: MatchBrand[];
  candidates: MatchCandidate[];
  /** 자동 제안으로 만들어진 캠페인 */
  history: AutoProposedRow[];
  /** 한 번 실행에 보낼 건수 */
  batch: number;
  /** 후보가 왜 적은지 화면이 설명할 수 있게 — 적격에서 빠진 이유별 인원 */
  excluded: { hidden: number; priority: number; unverified: number; suspended: number };
};

type SellerRow = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  platform: string | null;
  category: string | null;
  grade: string | null;
  m3_sales: number | null;
  followers: number | null;
  recent_likes: number[] | null;
  hidden: boolean | null;
  active: boolean | null;
};

/**
 * 적격 여부 — `app_brand_invite_candidates`(0036) 의 where 절과 같은 조건.
 * 0036 부터 **우선권 등급(다이아·블랙)은 제외하지 않는다** — 제안권 🥬 10 이 들 뿐이다.
 * 비용·잔액 판정은 브랜드가 정해지는 후보 단계에서 한다(`costCel`·`affordable`).
 * 비공개는 **브랜드별**로 갈리므로(열람 여부) 여기서는 여전히 제외하고, 갤러리에서 열람한 브랜드가
 * 상품 초대 화면으로 제안한다 — 자동 제안은 브랜드를 대신 고르므로 익명을 넣지 않는다.
 */
function eligibilityOf(
  s: SellerRow,
  tiers: Map<string, Tier>,
  verifiedPrimary: Set<string>
): { eligible: boolean; reason: string | null } {
  if (s.active === false) return { eligible: false, reason: "정지" };
  if (s.hidden === true) return { eligible: false, reason: "비공개 — 브랜드가 갤러리에서 레퍼런스를 열람한 뒤 제안" };
  if (!verifiedPrimary.has(s.id)) return { eligible: false, reason: "메인 채널 미인증" };
  return { eligible: true, reason: null };
}

export async function getAdminMatch(admin: Admin = createAdminClient()): Promise<AdminMatchView | null> {
  const [sellersRes, brandsRes, productsRes, campaignsRes, channelsRes, catsRes, tiersRes, celeryRes] = await Promise.all([
    admin.from("sellers").select("id, code, name, handle, platform, category, grade, m3_sales, followers, recent_likes, hidden, active"),
    admin.from("brands").select("id, code, name, grade, auto_propose"),
    admin.from("products").select("id, code, name, category, status, brand_id, exclusive_seller_id").is("deleted_at", null),
    admin
      .from("campaigns")
      .select("id, code, status, created_at, product_id, seller_id, brand_id, auto_proposed")
      .order("created_at", { ascending: false }),
    admin.from("seller_channels").select("seller_id, is_primary, verified"),
    admin.from("categories").select("name, group_name"),
    admin.from("grade_tiers").select("name, is_priority, invite_cost_cel"),
    admin.from("celery_balances").select("owner_id, balance, owner_type"),
  ]);

  const err = sellersRes.error ?? brandsRes.error ?? productsRes.error ?? campaignsRes.error ?? channelsRes.error ?? catsRes.error ?? tiersRes.error;
  if (err) {
    console.error("[admin/match] 조회 실패:", err.message);
    return null;
  }

  const tiers = new Map<string, Tier>((tiersRes.data ?? []).map((t) => [t.name as string, t as unknown as Tier]));
  const verifiedPrimary = new Set<string>((channelsRes.data ?? []).filter((c) => c.is_primary && c.verified).map((c) => c.seller_id as string));
  const groups: CategoryGroups = Object.fromEntries((catsRes.data ?? []).map((c) => [c.name as string, (c.group_name as string) ?? null]));
  const celeryOf = new Map<string, number>(
    (celeryRes.data ?? []).filter((c) => c.owner_type === "brand").map((c) => [c.owner_id as string, Number(c.balance ?? 0)])
  );

  const sellerRows = (sellersRes.data ?? []) as unknown as SellerRow[];
  const toMatchSeller = (s: SellerRow): MatchSeller => ({
    id: s.id,
    code: s.code,
    name: s.name,
    handle: s.handle,
    platform: s.platform,
    category: s.category,
    grade: s.grade,
    m3Sales: Number(s.m3_sales ?? 0),
    followers: Number(s.followers ?? 0),
    growth: growthOf(s.recent_likes),
  });

  // priority 는 0036 부터 제외 사유가 아니다 — 0 으로 남겨 화면·테스트의 모양을 지킨다
  const excluded = { hidden: 0, priority: 0, unverified: 0, suspended: 0 };
  const eligibleSellers: MatchSeller[] = [];
  const rising: AdminMatchView["rising"] = [];

  for (const s of sellerRows) {
    const m = toMatchSeller(s);
    const e = eligibilityOf(s, tiers, verifiedPrimary);
    rising.push({ ...m, hidden: s.hidden === true, active: s.active !== false, eligible: e.eligible, reason: e.reason });
    if (e.eligible) eligibleSellers.push(m);
    else if (s.active === false) excluded.suspended += 1;
    else if (s.hidden === true) excluded.hidden += 1;
    else excluded.unverified += 1;
  }

  const brandById = new Map((brandsRes.data ?? []).map((b) => [b.id as string, b]));
  const productRows = productsRes.data ?? [];

  const brands: MatchBrand[] = (brandsRes.data ?? [])
    .map((b) => ({
      id: b.id as string,
      code: (b.code as string) ?? null,
      name: b.name as string,
      grade: (b.grade as string) ?? null,
      autoPropose: b.auto_propose === true,
      listedProducts: productRows.filter((p) => p.brand_id === b.id && p.status === "listed").length,
      celery: celeryOf.get(b.id as string) ?? 0,
    }))
    .sort((a, b) => Number(b.autoPropose) - Number(a.autoPropose) || a.name.localeCompare(b.name));

  // 후보 대상 상품 — 자동 제안 ON 브랜드의 노출 상품
  const products: MatchProduct[] = productRows
    .filter((p) => p.status === "listed" && brandById.get(p.brand_id as string)?.auto_propose === true)
    .map((p) => {
      const b = brandById.get(p.brand_id as string);
      return {
        id: p.id as string,
        code: (p.code as string) ?? null,
        name: p.name as string,
        category: (p.category as string) ?? null,
        brandId: p.brand_id as string,
        brandCode: (b?.code as string) ?? null,
        brandName: (b?.name as string) ?? "",
      };
    });

  // 진행 중인 쌍 — 재요청 가능 상태(거절 · 패스 · 정산 완료)는 막지 않는다(0016 와 같은 목록)
  const REUSABLE = new Set(["REJECTED", "PASSED", "DECLINED", "SETTLED"]);
  const activePairs = new Set<string>(
    (campaignsRes.data ?? []).filter((c) => !REUSABLE.has(c.status as string)).map((c) => `${c.product_id}:${c.seller_id}`)
  );
  const exclusiveOf: Record<string, string | null> = Object.fromEntries(
    productRows.map((p) => [p.id as string, (p.exclusive_seller_id as string) ?? null])
  );

  const candidates = pickCandidates({
    products,
    sellers: eligibleSellers,
    groups,
    activePairs,
    exclusiveOf,
    // 0036 — 제안권 비용·브랜드 잔액. 모자라면 affordable:false 로 담고 실행이 건너뛴다
    costOf: (s) => tiers.get(s.grade ?? "")?.invite_cost_cel ?? 0,
    balanceOf: (brandId) => celeryOf.get(brandId) ?? 0,
  });

  const sellerById = new Map(sellerRows.map((s) => [s.id, s]));
  const productById = new Map(productRows.map((p) => [p.id as string, p]));
  const history: AutoProposedRow[] = (campaignsRes.data ?? [])
    .filter((c) => c.auto_proposed === true)
    .map((c) => {
      const p = productById.get(c.product_id as string);
      const s = sellerById.get(c.seller_id as string);
      return {
        campaignId: c.id as string,
        campaignCode: (c.code as string) ?? null,
        status: c.status as string,
        createdAt: (c.created_at as string) ?? null,
        productName: (p?.name as string) ?? null,
        productCode: (p?.code as string) ?? null,
        sellerName: s?.name ?? null,
        sellerHandle: s?.handle ?? null,
        brandName: (brandById.get(c.brand_id as string)?.name as string) ?? null,
      };
    });

  return { rising: risingSellers(rising, 6) as AdminMatchView["rising"], brands, candidates, history, batch: AUTO_PROPOSE_BATCH, excluded };
}

/* ------------------------------------------------------------ 쓰기 ------------------------------------------------------------ */

/** 브랜드 자동 제안 ON/OFF — 브랜드 상세와 같은 경로(`setBrandAutoPropose`)를 쓰지 않고 code→id 를 여기서 해석한다 */
export async function toggleAutoPropose(
  brandRef: string,
  on: boolean,
  admin: Admin = createAdminClient()
): Promise<{ ok: true; on: boolean } | { ok: false; code: "NOT_FOUND" | "DB_ERROR" }> {
  const r = brandRef.trim();
  if (!r) return { ok: false, code: "NOT_FOUND" };
  const sel = admin.from("brands").select("id");
  const { data, error } = await (/^[0-9a-f-]{36}$/i.test(r) ? sel.eq("id", r) : sel.eq("code", r.toLowerCase())).maybeSingle();
  if (error) {
    console.error("[admin/match] 브랜드 조회 실패:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  if (!data) return { ok: false, code: "NOT_FOUND" };
  const up = await admin.from("brands").update({ auto_propose: on }).eq("id", data.id);
  if (up.error) {
    console.error("[admin/match] auto_propose 갱신 실패:", up.error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return { ok: true, on };
}

/** 관리자 대행 기록 — 캠페인 상세(#64)와 같은 이벤트. 실패해도 발송은 되돌리지 않는다 */
async function logProxyInvite(admin: Admin, campaignId: string, actorUserId: string, what: string): Promise<void> {
  const { error } = await admin.from("campaign_events").insert({
    campaign_id: campaignId,
    kind: "system",
    sender: "system",
    actor_role: "admin",
    actor_user_id: actorUserId,
    body: `셀러리 관리자가 브랜드를 대신해 ${what}`,
    event_type: "admin_proxy_action",
    payload: { what, source: "auto_propose" },
  });
  if (error) console.error("[admin/match] 대행 기록 실패:", error.message);
}

/**
 * 자동 제안 실행 — 후보 상위 N 건을 브랜드 명의로 발송(데모 `runAutoPropose`).
 * `app_brand_invite_seller`(0016)를 그대로 부르므로 비공개 · 우선권 등급 · 독점 · 중복 게이트가 모두 적용된다.
 * 한 건이 실패해도 나머지는 계속 보내고, 결과를 행별로 돌려준다.
 */
export async function runAutoPropose(
  actorUserId: string,
  limit = AUTO_PROPOSE_BATCH,
  admin: Admin = createAdminClient()
): Promise<{ ok: true; rows: AutoProposeOutcome[] } | { ok: false; code: "DB_ERROR" }> {
  const view = await getAdminMatch(admin);
  if (!view) return { ok: false, code: "DB_ERROR" };

  const rows: AutoProposeOutcome[] = [];
  for (const c of view.candidates.slice(0, Math.max(0, limit))) {
    const base0 = {
      productCode: c.product.code,
      productName: c.product.name,
      sellerName: c.seller.name,
      sellerHandle: c.seller.handle,
    };
    // 0036 — 브랜드 🥬 가 모자라면 RPC 를 부르지 않고 보류한다(프로토타입 runAutoPropose 와 같다).
    // RPC 도 CEL_INSUFFICIENT 로 막지만, 미리 걸러 "왜 안 보냈나" 를 정확히 알려준다.
    if (!c.affordable) {
      rows.push({ ...base0, ok: false, reason: `브랜드 셀러리 부족 — ${c.seller.grade ?? ""} 제안권 🥬 ${c.costCel} 필요`.replace("  ", " "), campaignCode: null });
      continue;
    }
    const { data, error } = await admin.rpc("app_brand_invite_seller", {
      p_brand_id: c.product.brandId,
      p_seller_id: c.seller.id,
      p_product_id: c.product.id,
      p_actor_user_id: actorUserId,
      // 0036 — 원장 사유를 자동 제안으로 구분한다(프로토타입 runAutoPropose 와 같다).
      // 차감 금액·환급 규칙은 브랜드 직접 제안과 동일하다.
      p_reason: "auto_invite",
    });
    const base = {
      productCode: c.product.code,
      productName: c.product.name,
      sellerName: c.seller.name,
      sellerHandle: c.seller.handle,
    };
    if (error) {
      console.error("[admin/match] app_brand_invite_seller 실패:", error.message);
      rows.push({ ...base, ok: false, reason: inviteFailMessage("DB_ERROR"), campaignCode: null });
      continue;
    }
    const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
    if (o?.ok === true) {
      const id = o.campaign_id as string | undefined;
      if (id) {
        // `app_brand_invite_seller` 는 브랜드 직접 제안이라 `invited=true` 만 세운다 — 자동 매칭으로 만든 건임을 따로 표시해야
        // 이력·대시보드("자동" 배지)가 구분할 수 있다(데모 `c.auto`).
        const mark = await admin.from("campaigns").update({ auto_proposed: true }).eq("id", id);
        if (mark.error) console.error("[admin/match] auto_proposed 표시 실패:", mark.error.message);
        await logProxyInvite(admin, id, actorUserId, `${c.seller.name}(${c.seller.handle})에게 ${c.product.name} 판매를 제안했습니다 (자동 매칭)`);
      }
      rows.push({ ...base, ok: true, reason: null, campaignCode: (o.campaign_code as string) ?? null });
    } else {
      rows.push({ ...base, ok: false, reason: inviteFailMessage(typeof o?.code === "string" ? o.code : "DB_ERROR"), campaignCode: null });
    }
  }

  return { ok: true, rows };
}
