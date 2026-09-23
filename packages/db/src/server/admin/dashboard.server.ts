/**
 * 관리자 대시보드 집계 — 데모 `(demo)/demo/+page.svelte`(`vAdminHome`) 의 실서비스 판.
 *
 * 데모가 한 화면에 올린 것: 히어로 띠 카운트 · KPI 4장(누적 GMV · 플랫폼 순수익 · 진행 중 판매 · 환불률) ·
 * 오늘 할 일 · 최근 활동 · 전체 캠페인 표. 이 모듈은 그 **숫자**를 만든다(문구·레이아웃은 화면).
 *
 * 금액은 **정산 규칙을 다시 구현하지 않는다** — 캠페인마다 `app_admin_settle_preview`(0020) 를 부른다.
 * 그 RPC 가 `net`(확정 매출) · `platform_net`(VAT 제외 플랫폼 순수익) · `paid_count` · `refund_count` 를
 * 한 번에 주므로 데모 `calc(c)` 의 `net` · `pfNet` · `paidCnt` · `refCnt` 와 같은 값이다.
 * 등급 보너스 · 추천 부스트 · 브랜드 할인 같은 비용 항목이 규칙대로 반영되려면 이 경로여야 한다.
 *
 * 한계(의도적):
 *   · 캠페인 수만큼 RPC 를 부른다(N+1). 지금 규모(수십 건)에서는 문제가 없고, 늘어나면 일괄 RPC 를 0022 로 추가한다.
 *   · 정산 전(제안 · 샘플 · 테스트 · 일정) 캠페인은 `WRONG_STATUS` 라 0 으로 둔다 — 데모도 ₩0 으로 보여준다.
 *   · "정산 실행 가능" 은 여기서 세지 않는다 — 기준일(D+21) 판정은 `app_admin_payments_health` 의
 *     `settlements.due_now` 가 단일 출처다. 화면이 그 값을 쓴다.
 *   · `SETTLED` 인데 `settlements` 행이 없으면(`NO_SNAPSHOT`) 금액을 알 수 없다. 그 건수를 `noSnapshot` 으로
 *     올려 화면이 "일부 제외" 를 밝힌다. 정상 흐름에서는 정산 실행이 스냅샷을 만들므로 0 이다.
 */
import { createAdminClient, type Admin } from "../admin.server";
import { parseSettlePreview } from "../../admin/settle-rules";

export type AdminActivityItem = {
  id: string;
  /** 캠페인 코드 — 화면이 상품 상세로 보낸다(관리자에 캠페인 상세 화면은 없다) */
  campaign_code: string | null;
  product_name: string | null;
  product_code: string | null;
  event_type: string | null;
  /** 이벤트 문구 — `campaign_events.body` 를 그대로 쓴다(DB 가 이미 완성된 한 줄을 갖고 있다) */
  body: string;
  created_at: string;
};

/**
 * 최근 활동 — 데모 "🕒 최근 활동"(`messages[cid]` 의 `type:'sys'` 최신 8건).
 * 실서비스는 `campaign_events`(0003) 의 `kind='system'` 이고, **문구 매핑이 필요 없다** —
 * `body` 에 "인플루언서 하늘(@haneul_fit)가 샘플을 요청했습니다" 같은 완성된 한 줄이 들어 있다.
 * `chat` 은 제외한다 — 당사자 대화라 관리자 대시보드에 흘리지 않는다(연락처 유출 감지는 별도 경로).
 */
export async function listRecentActivity(limit = 8, admin: Admin = createAdminClient()): Promise<AdminActivityItem[]> {
  const { data, error } = await admin
    .from("campaign_events")
    .select("id, event_type, body, created_at, campaigns(code, products(code, name))")
    .eq("kind", "system")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin/dashboard] 최근 활동 조회 실패:", error.message);
    return [];
  }
  type Row = {
    id: string;
    event_type: string | null;
    body: string;
    created_at: string;
    campaigns: { code: string | null; products: { code: string | null; name: string } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((e) => ({
    id: e.id,
    campaign_code: e.campaigns?.code ?? null,
    product_name: e.campaigns?.products?.name ?? null,
    product_code: e.campaigns?.products?.code ?? null,
    event_type: e.event_type,
    body: e.body,
    created_at: e.created_at,
  }));
}

/** 데모 `done` 과 같은 집합 — 판매가 실제로 일어난 캠페인만 GMV 에 넣는다 */
const REVENUE_STATES: readonly string[] = ["LIVE", "CLEARING", "SETTLED"];

export type AdminDashboardCampaign = {
  id: string;
  code: string | null;
  status: string;
  product_name: string | null;
  /** 상품 코드 — 행 클릭·링크로 캠페인/상품 상세에 쓴다 */
  product_code: string | null;
  /** 목록 아이콘 — 데모 PIcon 과 같이 썸네일·이모지 */
  product_thumb_url: string | null;
  product_emoji: string | null;
  seller_name: string | null;
  seller_handle: string | null;
  seller_code: string | null;
  seller_platform: string | null;
  brand_name: string | null;
  brand_code: string | null;
  start_date: string | null;
  end_date: string | null;
  /** 브랜드가 직접 제안해 만들어진 캠페인(데모 `c.invited`) */
  invited: boolean;
  /** 자동 매칭으로 만들어진 캠페인(데모 `c.auto`) */
  auto: boolean;
  paid_count: number;
  refund_count: number;
  /** 확정 매출 = Σ PAID − 환불 (데모 `calc(c).net`) */
  net: number;
  /** 플랫폼 순수익(VAT 제외) (데모 `calc(c).pfNet`) */
  platform_net: number;
  /** 금액을 알 수 없는 건(정산 스냅샷 없음) — 표에서 "—" 로 구분한다 */
  amountUnknown: boolean;
};

export type AdminDashboard = {
  /** 히어로 띠 — 데모 "캠페인 N건 · 주문 N건 · 상품 N개 · 인플루언서 N명 · 브랜드 N개" */
  totals: { campaigns: number; orders: number; products: number; sellers: number; brands: number };
  kpi: {
    /** 누적 GMV(확정) — LIVE · CLEARING · SETTLED 의 확정 매출 합 */
    gmv: number;
    platformNet: number;
    /** 순 테이크레이트 % — gmv 가 0 이면 null */
    takeRate: number | null;
    /** 금액을 합산하지 못한 캠페인 수(정산 스냅샷 없음) */
    noSnapshot: number;
    live: number;
    ordersToday: number;
    ordersTotal: number;
    /** 환불률 % — 데모와 같이 **건수 기준**(REFUNDED 주문 수 / 전체 주문 수) */
    refundRate: number;
  };
  todo: {
    pendingProducts: number;
    exclusivePending: number;
    unshippedOrders: number;
    /** 인증 코드까지 넣고 승인만 기다리는 채널 — 실제로 관리자가 누를 것이 있는 건 */
    channelsAwaitingApproval: number;
    /** 아직 인증되지 않은 채널 전부(데모 "미인증 채널" 과 같은 기준 — 코드 입력 전도 포함) */
    channelsUnverified: number;
    /** 정산 정보(계좌) 없는 계정 — 데모와 같이 브랜드 + 인플루언서 합 */
    noSettleInfoAccounts: number;
  };
  campaigns: AdminDashboardCampaign[];
  /** 상태별 캠페인 수 — 0 인 상태는 넣지 않는다(데모 `stCounts` 와 같다) */
  statusCounts: { status: string; n: number }[];
};

type CampRow = {
  id: string;
  code: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  invited: boolean | null;
  auto_proposed: boolean | null;
  created_at: string | null;
  products: {
    code: string | null;
    name: string;
    emoji: string | null;
    thumb_url: string | null;
    brands: { code: string | null; name: string } | null;
  } | null;
  sellers: { code: string | null; name: string; handle: string; platform: string | null } | null;
};

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string): Promise<number> {
  const { count: n, error } = await q;
  if (error) {
    console.error(`[admin/dashboard] ${label} 집계 실패:`, error.message);
    return 0;
  }
  return n ?? 0;
}

/** Asia/Seoul 기준 오늘(YYYY-MM-DD) — 주문일 비교용. 서버 TZ 에 의존하지 않는다 */
function seoulToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export async function getAdminDashboard(admin: Admin = createAdminClient()): Promise<AdminDashboard> {
  const head = { count: "exact" as const, head: true };
  const today = seoulToday();

  const [campRes, totalsCampaigns, totalsOrders, totalsProducts, totalsSellers, totalsBrands] = await Promise.all([
    admin
      .from("campaigns")
      .select(
        "id, code, status, start_date, end_date, invited, auto_proposed, created_at, products(code, name, emoji, thumb_url, brands(code, name)), sellers(code, name, handle, platform)"
      )
      .order("created_at", { ascending: false }),
    count(admin.from("campaigns").select("id", head), "캠페인 수"),
    count(admin.from("orders").select("id", head), "주문 수"),
    count(admin.from("products").select("id", head).is("deleted_at", null), "상품 수"),
    count(admin.from("sellers").select("id", head), "인플루언서 수"),
    count(admin.from("brands").select("id", head), "브랜드 수"),
  ]);

  if (campRes.error) console.error("[admin/dashboard] 캠페인 조회 실패:", campRes.error.message);
  const campRows = (campRes.data ?? []) as unknown as CampRow[];

  // 금액 — 캠페인마다 정산 미리보기(규칙의 단일 출처). 실패는 0 으로 두고 사유만 구분한다.
  const previews = await Promise.all(
    campRows.map(async (c) => {
      if (!REVENUE_STATES.includes(c.status)) return { id: c.id, net: 0, pf: 0, paid: 0, ref: 0, unknown: false };
      const { data, error } = await admin.rpc("app_admin_settle_preview", { p_campaign_id: c.id });
      if (error) {
        console.error("[admin/dashboard] settle_preview 실패:", c.code, error.message);
        return { id: c.id, net: 0, pf: 0, paid: 0, ref: 0, unknown: true };
      }
      const p = parseSettlePreview(data);
      // `source:'none'` = 정산 완료인데 스냅샷이 없다(`reason:'NO_SNAPSHOT'`). ok:true 로 오므로 여기서 걸러야
      // 0 이 조용히 합산되지 않는다.
      if (!p || p.source === "none") return { id: c.id, net: 0, pf: 0, paid: 0, ref: 0, unknown: true };
      return { id: c.id, net: p.net, pf: p.platform_net, paid: p.paid_count, ref: p.refund_count, unknown: false };
    })
  );
  const byId = new Map(previews.map((p) => [p.id, p]));

  const campaigns: AdminDashboardCampaign[] = campRows.map((c) => {
    const p = byId.get(c.id);
    return {
      id: c.id,
      code: c.code,
      status: c.status,
      product_name: c.products?.name ?? null,
      product_code: c.products?.code ?? null,
      product_thumb_url: c.products?.thumb_url ?? null,
      product_emoji: c.products?.emoji ?? null,
      seller_name: c.sellers?.name ?? null,
      seller_handle: c.sellers?.handle ?? null,
      seller_code: c.sellers?.code ?? null,
      seller_platform: c.sellers?.platform ?? null,
      brand_name: c.products?.brands?.name ?? null,
      brand_code: c.products?.brands?.code ?? null,
      start_date: c.start_date,
      end_date: c.end_date,
      invited: c.invited === true,
      auto: c.auto_proposed === true,
      paid_count: p?.paid ?? 0,
      refund_count: p?.ref ?? 0,
      net: p?.net ?? 0,
      platform_net: p?.pf ?? 0,
      amountUnknown: p?.unknown === true,
    };
  });

  const revenue = campaigns.filter((c) => REVENUE_STATES.includes(c.status));
  const gmv = revenue.reduce((a, c) => a + c.net, 0);
  const platformNet = revenue.reduce((a, c) => a + c.platform_net, 0);

  const statusMap = new Map<string, number>();
  for (const c of campaigns) statusMap.set(c.status, (statusMap.get(c.status) ?? 0) + 1);

  const [ordersToday, ordersRefunded, pendingProducts, exclusivePending, unshippedOrders, awaitingApproval, unverified, brandsNoBank, sellersNoBank] =
    await Promise.all([
      count(admin.from("orders").select("id", head).gte("paid_at", `${today}T00:00:00+09:00`).lte("paid_at", `${today}T23:59:59+09:00`), "오늘 주문"),
      count(admin.from("orders").select("id", head).eq("status", "REFUNDED"), "환불 주문"),
      count(admin.from("products").select("id", head).eq("status", "pending").is("deleted_at", null), "검수 대기"),
      count(admin.from("exclusive_requests").select("id", head).eq("status", "PENDING"), "독점권 신청 대기"),
      count(admin.from("orders").select("id", head).eq("status", "PAID").is("tracking_no", null), "미발송 주문"),
      count(admin.from("seller_channels").select("id", head).eq("verified", false).not("vcode_confirmed_at", "is", null), "채널 승인 대기"),
      count(admin.from("seller_channels").select("id", head).eq("verified", false), "미인증 채널"),
      count(admin.from("brands").select("id", head).is("bank_info", null), "브랜드 정산정보 미등록"),
      count(admin.from("sellers").select("id", head).is("bank_info", null), "인플루언서 정산정보 미등록"),
    ]);

  return {
    totals: {
      campaigns: totalsCampaigns,
      orders: totalsOrders,
      products: totalsProducts,
      sellers: totalsSellers,
      brands: totalsBrands,
    },
    kpi: {
      gmv,
      platformNet,
      takeRate: gmv > 0 ? (platformNet / gmv) * 100 : null,
      noSnapshot: revenue.filter((c) => c.amountUnknown).length,
      live: statusMap.get("LIVE") ?? 0,
      ordersToday,
      ordersTotal: totalsOrders,
      refundRate: totalsOrders > 0 ? (ordersRefunded / totalsOrders) * 100 : 0,
    },
    todo: {
      pendingProducts,
      exclusivePending,
      unshippedOrders,
      channelsAwaitingApproval: awaitingApproval,
      channelsUnverified: unverified,
      noSettleInfoAccounts: brandsNoBank + sellersNoBank,
    },
    campaigns,
    statusCounts: [...statusMap.entries()].map(([status, n]) => ({ status, n })),
  };
}
