/**
 * 인플루언서 콘솔 홈 3위젯 — 지금 할 일 · 진행 중(LIVE) · 내 자산 (docs/inf-console-plan.md §6 `/home` · §7 3단계).
 * 프로토타입 원본: js/20-seller.js vSellerHome (할 일 카드 · LIVE 카드 · 자산), helpers.ts sampleQuota · sampleLeft · gradeOf.
 *
 * service role + seller_id 필터. DB 왕복은 테이블당 1회: seller_channels · campaigns(+product) · orders(LIVE 캠페인만) · grade_tiers.
 * 인플루언서 요약(`SellerSummary` — grade · m3_sales · sample_extra · has_bank_info)은 `requireSeller()` 가 이미 읽었으므로 다시 읽지 않는다.
 *   getHomeWidgets(seller, balance) → { todos, live, assets }
 */
import type { Status } from "@sellery/core/types";
import { daysBetween, kstToday, md } from "../../dates";
import { storeUrl } from "../../campaign";
import { campaignChip, type CampaignChip } from "../../partner/sample-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { sellerPath, type SellerSummary } from "./seller.server";

export type HomeTodoKind =
  | "channel_verify" // 메인 채널 미인증 → /my (인증하기)
  | "channel_pending" // [인증 확인] 누름 · 운영자 확인 중 → /my
  | "bank_info" // 정산 계좌 미등록 → /settle (5단계 정산 정보 폼)
  | "invited" // 브랜드 제안 · 수락 대기 → /campaigns/<code> [수락 · 거절] (0016)
  | "receive_sample" // SAMPLE_SHIPPED → 수령 확인
  | "testing" // TESTING · 테스트 기한 D-n → [일정 제안] (0016)
  | "schedule_proposed" // 일정 승인 대기 (브랜드 차례 — 안내 · 재제안 가능)
  | "first_product"; // 캠페인이 하나도 없음 → /products

export type HomeTodo = {
  kind: HomeTodoKind;
  title: string;
  desc: string;
  /** 콘솔 절대 경로 (/influencer/...) */
  href: string;
  campaignCode: string | null;
  /** 기한 YYYY-MM-DD (testing) */
  due: string | null;
  /** 액션 버튼 문구 — null 이면 링크만 */
  action: string | null;
};

export type HomeLive = {
  code: string;
  status: string;
  chip: CampaignChip;
  product: { name: string; emoji: string; thumb_url: string | null; sale_price: number };
  start_date: string | null;
  end_date: string | null;
  qty: number;
  sold_qty: number;
  /** 오늘(KST) PAID 주문 합계 (샘플 제외) */
  today_sales: number;
  today_orders: number;
  /** 누적 PAID 합계 (샘플 제외) */
  total_sales: number;
  total_orders: number;
  /** 고객 판매 링크 상대 경로 (/s/<handle>/<code>) — 표시는 SITE_URL + 이 값 */
  store_url: string;
};

export type HomeAssets = {
  balance: number;
  grade: string;
  m3_sales: number;
  /** 다음 등급 (블랙이면 null) */
  next: { grade: string; min: number; remaining: number } | null;
  sample: { quota: number; extra: number; used: number; left: number };
};

export type HomeWidgets = { todos: HomeTodo[]; live: HomeLive[]; assets: HomeAssets };

const LIVE_STATES: readonly Status[] = ["LIVE"];

const CAMPAIGN_SELECT =
  "id,code,status,created_at,invited,purchased,test_due,start_date,end_date,qty,sold_qty," +
  "product:products!campaigns_product_id_fkey(name,emoji,thumb_url,sale_price)";

type RawHomeCampaign = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  invited: boolean;
  purchased: boolean;
  test_due: string | null;
  start_date: string | null;
  end_date: string | null;
  qty: number;
  sold_qty: number;
  product: { name: string; emoji: string; thumb_url: string | null; sale_price: number } | null;
};

/** 이달 1일 00:00 KST 의 ISO — sampleUsed 의 달력월 하한 (0011 app_sample_quote 와 같은 기준) */
export function kstMonthStartIso(today = kstToday()): string {
  return new Date(`${today.slice(0, 7)}-01T00:00:00+09:00`).toISOString();
}

export async function getHomeWidgets(seller: SellerSummary, balance: number, admin: Admin = createAdminClient()): Promise<HomeWidgets> {
  const today = kstToday();
  const [chRes, cRes, tiersRes] = await Promise.all([
    admin.from("seller_channels").select("id, platform, handle, verified, is_primary, vcode, vcode_confirmed_at").eq("seller_id", seller.id),
    admin
      .from("campaigns")
      .select(CAMPAIGN_SELECT)
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false })
      .overrideTypes<RawHomeCampaign[], { merge: false }>(),
    admin.from("grade_tiers").select("name, sort_order, min_m3_sales, sample_quota").order("sort_order", { ascending: true }),
  ]);
  if (chRes.error) throw new Error(`seller_channels read failed: ${chRes.error.message}`);
  if (cRes.error) throw new Error(`campaigns read failed: ${cRes.error.message}`);
  if (tiersRes.error) throw new Error(`grade_tiers read failed: ${tiersRes.error.message}`);
  const channels = chRes.data ?? [];
  const campaigns = cRes.data ?? [];
  const tiers = tiersRes.data ?? [];

  // ---- LIVE 카드 + 주문 집계 (LIVE 캠페인이 있을 때만 orders 1회) ----
  const liveRows = campaigns.filter((c) => (LIVE_STATES as readonly string[]).includes(c.status) && c.product);
  const sales = new Map<string, { today: number; todayN: number; total: number; totalN: number }>();
  if (liveRows.length > 0) {
    const { data: orders, error } = await admin
      .from("orders")
      .select("campaign_id, amount, qty, unit_price, paid_at")
      .in(
        "campaign_id",
        liveRows.map((c) => c.id),
      )
      .eq("status", "PAID")
      .eq("is_sample", false);
    if (error) throw new Error(`orders read failed: ${error.message}`);
    for (const o of orders ?? []) {
      const amt = typeof o.amount === "number" ? o.amount : o.qty * o.unit_price;
      const agg = sales.get(o.campaign_id) ?? { today: 0, todayN: 0, total: 0, totalN: 0 };
      agg.total += amt;
      agg.totalN += 1;
      if (daysBetween(o.paid_at, today) === 0) {
        agg.today += amt;
        agg.todayN += 1;
      }
      sales.set(o.campaign_id, agg);
    }
  }
  const live: HomeLive[] = liveRows.map((c) => {
    const agg = sales.get(c.id) ?? { today: 0, todayN: 0, total: 0, totalN: 0 };
    return {
      code: c.code,
      status: c.status,
      chip: campaignChip(c.status),
      product: { name: c.product!.name, emoji: c.product!.emoji || "📦", thumb_url: c.product!.thumb_url, sale_price: c.product!.sale_price },
      start_date: c.start_date,
      end_date: c.end_date,
      qty: c.qty ?? 0,
      sold_qty: c.sold_qty ?? 0,
      today_sales: agg.today,
      today_orders: agg.todayN,
      total_sales: agg.total,
      total_orders: agg.totalN,
      store_url: storeUrl(seller.handle, c.code),
    };
  });

  // ---- 지금 할 일 (프로토타입 vSellerHome 순서: 캠페인 차례 → 계정 준비) ----
  const todos: HomeTodo[] = [];
  const camp = (kind: HomeTodoKind, c: RawHomeCampaign, title: string, desc: string, action: string | null, due: string | null = null) =>
    todos.push({ kind, title, desc, href: sellerPath(`/campaigns/${encodeURIComponent(c.code)}`), campaignCode: c.code, due, action });
  for (const c of campaigns) {
    const name = c.product?.name ?? c.code;
    switch (c.status) {
      case "SAMPLE_SHIPPED":
        camp("receive_sample", c, `${name} 샘플이 배송 중이에요`, "받으셨으면 수령 확인을 눌러 테스트를 시작하세요 (기한 14일)", "수령 확인");
        break;
      case "TESTING": {
        const left = c.test_due ? daysBetween(today, c.test_due) : NaN;
        const dd = Number.isNaN(left) ? "" : left < 0 ? " · 기한 지남" : left === 0 ? " · 오늘 마감" : ` · D-${left}`;
        camp("testing", c, `${name} 테스트 중${dd}`, c.test_due ? `테스트 기한 ${md(c.test_due)} — 테스트 뒤 판매 일정(시작일 · 기간 · 재고)을 제안하세요` : "테스트 뒤 판매 일정을 제안하세요", "일정 제안", c.test_due);
        break;
      }
      case "INVITED":
        camp("invited", c, `${name} 브랜드 제안이 도착했어요`, "수락하면 샘플 요청 없이 바로 샘플 발송 단계로 — 스레드에서 내용을 확인하고 수락·거절하세요", "확인");
        break;
      case "SCHEDULE_PROPOSED":
        camp("schedule_proposed", c, `${name} 일정 승인 대기`, "브랜드가 제안 일정을 검토 중이에요 — 다른 기간으로 다시 제안할 수도 있어요", null);
        break;
    }
  }
  const primary = channels.find((ch) => ch.is_primary) ?? channels[0] ?? null;
  if (primary && !primary.verified) {
    if (primary.vcode_confirmed_at) {
      todos.push({
        kind: "channel_pending",
        title: `${primary.handle} 인증 확인 중`,
        desc: "운영팀이 프로필 또는 DM 에서 코드를 확인하면 ✓ 인증됨 으로 바뀝니다 (보통 1영업일 이내)",
        href: sellerPath("/my"),
        campaignCode: null,
        due: null,
        action: null,
      });
    } else {
      todos.push({
        kind: "channel_verify",
        title: `${primary.handle} 채널 인증`,
        desc: "사칭 방지를 위해 메인 SNS 를 인증하면 판매 링크에 인증 배지가 붙어요",
        href: sellerPath("/my"),
        campaignCode: null,
        due: null,
        action: "인증하기",
      });
    }
  }
  if (!seller.has_bank_info) {
    todos.push({
      kind: "bank_info",
      title: "정산 계좌 등록",
      desc: "판매 종료 D+21 정산을 받으려면 계좌가 필요해요 — 정산 정보에서 등록하세요",
      href: sellerPath("/settle"),
      campaignCode: null,
      due: null,
      action: "등록하기",
    });
  }
  if (campaigns.length === 0) {
    todos.push({
      kind: "first_product",
      title: "첫 상품 둘러보기",
      desc: "무상 샘플 조건에 맞는 상품을 찾아 첫 캠페인을 시작해보세요",
      href: sellerPath("/products"),
      campaignCode: null,
      due: null,
      action: "상품 보기",
    });
  }

  // ---- 내 자산 ----
  const grade = seller.grade ?? tiers[tiers.length - 1]?.name ?? "스타터";
  const mine = tiers.find((t) => t.name === grade) ?? null;
  const nextTier = mine ? (tiers.find((t) => t.sort_order === mine.sort_order - 1) ?? null) : null;
  const m3 = seller.m3_sales;
  const monthStart = Date.parse(kstMonthStartIso(today));
  const used = campaigns.filter((c) => !c.invited && !c.purchased && Date.parse(c.created_at) >= monthStart).length;
  const quota = mine?.sample_quota ?? 1;
  const extra = seller.sample_extra;
  const assets: HomeAssets = {
    balance,
    grade,
    m3_sales: m3,
    next: nextTier ? { grade: nextTier.name, min: Number(nextTier.min_m3_sales), remaining: Math.max(0, Number(nextTier.min_m3_sales) - m3) } : null,
    sample: { quota, extra, used, left: Math.max(0, quota + extra - used) },
  };

  return { todos, live, assets };
}
