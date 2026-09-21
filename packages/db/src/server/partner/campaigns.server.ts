/**
 * 인플루언서 콘솔 — 내 캠페인 목록 · 상세(스레드) · 샘플 수령 확인 (docs/inf-console-plan.md §6 `/campaigns` `/campaigns/[code]` · §7 3단계).
 * 프로토타입 원본: js/20-seller.js vSellerCamps · campRow, js/70-campaign.js vCampDetail · detActions(seller), actions.ts receiveSample.
 *
 * 전부 service role + **`seller_id = <requireSeller 의 seller.id>` 필터** — 다른 인플루언서 캠페인은 URL 을 바꿔도 null(라우트 404, §7 3단계 (d)).
 *   listSellerCampaigns(sellerId)          본인 캠페인 전부(최신순) + 상품·브랜드 요약 + 상태 칩
 *   getSellerCampaign(sellerId, code)      캠페인 1건 + 배송지 + 스레드(campaign_events 시간순). 본인 것이 아니면 null
 *   receiveSample(sellerId, campaignCode)  `app_receive_sample` RPC — SAMPLE_SHIPPED → TESTING · test_due = 오늘+14 · 멱등
 *   getSellerCampaignCode(sellerId, campaignId)  결제 행의 campaign_id → code (4단계 결제 완료 화면 링크) · 본인 것만
 * 상태 칩·스테퍼는 순수 모듈 `../../partner/sample-rules.ts` (campaignChip · stepIndex).
 */
import type { Shipping } from "../../types";
import { CAMPAIGN_CODE_RE } from "../../campaign";
import { campaignChip, parseStoredShipping, type CampaignChip } from "../../partner/sample-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type SellerCampaign = {
  id: string;
  code: string;
  status: string;
  chip: CampaignChip;
  created_at: string;
  invited: boolean;
  auto_proposed: boolean;
  regongu: boolean;
  purchased: boolean;
  sample_price: number | null;
  sample_cel: number;
  sample_cash: number;
  sample_method: string | null;
  tracking_no: string | null;
  received_at: string | null;
  test_due: string | null;
  proposed_start: string | null;
  proposed_end: string | null;
  proposed_qty: number | null;
  start_date: string | null;
  end_date: string | null;
  qty: number;
  sold_qty: number;
  decision_reason: string | null;
  settled_at: string | null;
  product: {
    id: string;
    code: string | null;
    name: string;
    emoji: string;
    thumb_url: string | null;
    category: string;
    sale_price: number;
    consumer_price: number;
    /** 인플루언서 수수료율 — 상세의 "내 수수료" 안내 */
    commission_rate: number;
    sample_text: string | null;
  };
  brand: { id: string; code: string | null; name: string; logo_url: string | null };
};

export type CampaignEvent = {
  id: string;
  kind: "chat" | "system";
  sender: "seller" | "brand" | "admin" | "system";
  body: string;
  event_type: string | null;
  payload: unknown;
  leak_flag: boolean;
  created_at: string;
};

export type SellerCampaignDetail = {
  campaign: SellerCampaign;
  /** 샘플 배송지 스냅샷 (본인 것이라 원문 노출) */
  sample_shipping: Shipping | null;
  events: CampaignEvent[];
};

const CAMPAIGN_SELECT =
  "id,code,status,created_at,invited,auto_proposed,regongu,purchased,sample_price,sample_cel,sample_cash,sample_method," +
  "tracking_no,received_at,test_due,proposed_start,proposed_end,proposed_qty,start_date,end_date,qty,sold_qty,decision_reason,settled_at,sample_shipping," +
  "product:products!campaigns_product_id_fkey(id,code,name,emoji,thumb_url,category,sale_price,consumer_price,commission_rate,sample_text)," +
  "brand:brands!campaigns_brand_id_fkey(id,code,name,logo_url)";

type RawCampaign = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  invited: boolean;
  auto_proposed: boolean;
  regongu: boolean;
  purchased: boolean;
  sample_price: number | null;
  sample_cel: number;
  sample_cash: number;
  sample_method: string | null;
  tracking_no: string | null;
  received_at: string | null;
  test_due: string | null;
  proposed_start: string | null;
  proposed_end: string | null;
  proposed_qty: number | null;
  start_date: string | null;
  end_date: string | null;
  qty: number;
  sold_qty: number;
  decision_reason: string | null;
  settled_at: string | null;
  sample_shipping: unknown;
  product: {
    id: string;
    code: string | null;
    name: string;
    emoji: string;
    thumb_url: string | null;
    category: string;
    sale_price: number;
    consumer_price: number;
    commission_rate: number | string;
    sample_text: string | null;
  } | null;
  brand: { id: string; code: string | null; name: string; logo_url: string | null } | null;
};

function toCampaign(r: RawCampaign): SellerCampaign | null {
  if (!r.product || !r.brand) return null;
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    chip: campaignChip(r.status),
    created_at: r.created_at,
    invited: r.invited,
    auto_proposed: r.auto_proposed,
    regongu: r.regongu,
    purchased: r.purchased,
    sample_price: r.sample_price,
    sample_cel: r.sample_cel ?? 0,
    sample_cash: r.sample_cash ?? 0,
    sample_method: r.sample_method,
    tracking_no: r.tracking_no,
    received_at: r.received_at,
    test_due: r.test_due,
    proposed_start: r.proposed_start,
    proposed_end: r.proposed_end,
    proposed_qty: r.proposed_qty,
    start_date: r.start_date,
    end_date: r.end_date,
    qty: r.qty ?? 0,
    sold_qty: r.sold_qty ?? 0,
    decision_reason: r.decision_reason,
    settled_at: r.settled_at,
    product: {
      id: r.product.id,
      code: r.product.code,
      name: r.product.name,
      emoji: r.product.emoji || "📦",
      thumb_url: r.product.thumb_url,
      category: r.product.category,
      sale_price: r.product.sale_price,
      consumer_price: r.product.consumer_price,
      commission_rate: Number(r.product.commission_rate) || 0,
      sample_text: r.product.sample_text,
    },
    brand: { id: r.brand.id, code: r.brand.code, name: r.brand.name, logo_url: r.brand.logo_url },
  };
}

/** 본인 캠페인 전부 — 최신순. 조인이 빈 행(FK 불일치)은 제외. */
export async function listSellerCampaigns(sellerId: string, admin: Admin = createAdminClient()): Promise<SellerCampaign[]> {
  const { data, error } = await admin
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .overrideTypes<RawCampaign[], { merge: false }>();
  if (error) throw new Error(`campaigns read failed: ${error.message}`);
  return (data ?? []).map(toCampaign).filter((c): c is SellerCampaign => c !== null);
}

/** 캠페인 1건 + 스레드. 본인 것이 아니거나 없는 코드면 null → 라우트 404 (소유자 불일치를 구분하지 않는다). */
export async function getSellerCampaign(sellerId: string, code: string, admin: Admin = createAdminClient()): Promise<SellerCampaignDetail | null> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("seller_id", sellerId)
    .eq("code", code)
    .maybeSingle()
    .overrideTypes<RawCampaign | null, { merge: false }>();
  if (error) throw new Error(`campaigns read failed: ${error.message}`);
  if (!data) return null;
  const campaign = toCampaign(data);
  if (!campaign) return null;

  const { data: ev, error: evErr } = await admin
    .from("campaign_events")
    .select("id, kind, sender, body, event_type, payload, leak_flag, created_at")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: true });
  if (evErr) throw new Error(`campaign_events read failed: ${evErr.message}`);

  const events: CampaignEvent[] = (ev ?? []).map((e) => ({
    id: e.id,
    kind: e.kind === "chat" ? "chat" : "system",
    sender: e.sender === "seller" || e.sender === "brand" || e.sender === "admin" ? e.sender : "system",
    body: e.body,
    event_type: e.event_type,
    payload: e.payload ?? null,
    leak_flag: e.leak_flag,
    created_at: e.created_at,
  }));

  return { campaign, sample_shipping: parseStoredShipping(data.sample_shipping), events };
}

/** 결제 행의 campaign_id → 캠페인 code (본인 것만 — 결제 완료 화면의 "캠페인 보기" 링크). 없거나 남의 것이면 null. */
export async function getSellerCampaignCode(sellerId: string, campaignId: string, admin: Admin = createAdminClient()): Promise<string | null> {
  const { data, error } = await admin.from("campaigns").select("code").eq("id", campaignId).eq("seller_id", sellerId).maybeSingle();
  if (error) {
    console.error("[campaigns] code read failed:", error.message);
    return null;
  }
  return data?.code ?? null;
}

export type ReceiveSampleResult =
  | { ok: true; already: boolean; campaignCode: string; testDue: string | null }
  | { ok: false; code: "NOT_FOUND" | "NOT_SHIPPED" | "DB_ERROR"; status?: string };

/** `app_receive_sample` jsonb → 결과 */
export function parseReceiveSampleResult(json: unknown): ReceiveSampleResult {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignCode = typeof o.campaign_code === "string" ? o.campaign_code : null;
    if (!campaignCode) return { ok: false, code: "DB_ERROR" };
    return { ok: true, already: o.already === true, campaignCode, testDue: typeof o.test_due === "string" ? o.test_due : null };
  }
  const code = o.code === "NOT_FOUND" || o.code === "NOT_SHIPPED" ? o.code : "DB_ERROR";
  return { ok: false, code, status: typeof o.status === "string" ? o.status : undefined };
}

/** 샘플 수령 확인 — 코드로 본인 캠페인을 찾아 RPC. 본인 것이 아니면 NOT_FOUND (RPC 도 seller_id 를 다시 대조한다). */
export async function receiveSample(sellerId: string, campaignCode: string, admin: Admin = createAdminClient()): Promise<ReceiveSampleResult> {
  if (!CAMPAIGN_CODE_RE.test(campaignCode)) return { ok: false, code: "NOT_FOUND" };
  const { data: c, error: cErr } = await admin.from("campaigns").select("id").eq("seller_id", sellerId).eq("code", campaignCode).maybeSingle();
  if (cErr) {
    console.error("[campaigns] campaign lookup failed:", cErr.message);
    return { ok: false, code: "DB_ERROR" };
  }
  if (!c) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_receive_sample", { p_seller_id: sellerId, p_campaign_id: c.id });
  if (error) {
    console.error("[campaigns] app_receive_sample failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseReceiveSampleResult(data);
}
