/**
 * 캠페인 서버 조회 — 계약 docs/app-plan.md §10.0. 소유: C.
 * 전부 anon 으로 읽는다 — service role 불필요 (공개 RLS·컬럼 grant 범위만).
 *   · campaign_card(p_code) RPC → parseCampaignCard (fetchCampaignCard — React cache() 로 요청당 1회)
 *   · campaigns → products/sellers/brands `!inner` 조인 (seller 조인이 비면 행 제외 = hidden 인플루언서)
 *   · public_stats() 는 unstable_cache 60초 — anon 트래픽이 orders 스캔으로 직결되지 않게 (app-plan §5).
 *     unstable_cache 안에서는 cookies() 를 쓸 수 없어 쿠키 없는 anon 클라이언트를 따로 만든다.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { CAMPAIGN_CODE_RE, parseCampaignCard, type CampaignCard, type HomeCard } from "@/lib/campaign";
import type { CampaignStatus } from "@/lib/types";

/** anon `campaign_card(p_code)` RPC → parseCampaignCard. 없는 코드·비공개·형식 불일치·RPC 오류 → null. */
export const fetchCampaignCard = cache(async (code: string): Promise<CampaignCard | null> => {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("campaign_card", { p_code: code });
    if (error) {
      console.error("[campaign] campaign_card rpc failed", error.message);
      return null;
    }
    return parseCampaignCard(data);
  } catch (e) {
    console.error("[campaign] campaign_card threw", e);
    return null;
  }
});

/* ---------------- 홈 · 다른 판매 (테이블 조인) ---------------- */

const HOME_SELECT =
  "id, code, status, start_date, end_date, qty, sold_qty, home_featured_at, seller_id, product_id, brand_id, " +
  "product:products!inner(id, name, description, emoji, thumb_url, category, consumer_price, sale_price), " +
  "seller:sellers!inner(id, code, name, handle, platform, avatar_url, grade), " +
  "brand:brands!inner(id, name)";

const HOME_STATUSES: readonly CampaignStatus[] = ["LIVE", "SCHEDULE_CONFIRMED", "CLEARING"];

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

/** 조인 행 → HomeCard (임베드가 배열/누락이면 제외 — PostgREST 형태 방어) */
function parseHomeCard(row: unknown): HomeCard | null {
  const r = obj(row);
  if (!r) return null;
  const p = obj(r.product);
  const s = obj(r.seller);
  const b = obj(r.brand);
  const id = str(r.id);
  const code = str(r.code);
  const status = str(r.status);
  const sellerId = str(r.seller_id);
  const productId = str(r.product_id);
  const brandId = str(r.brand_id);
  if (!p || !s || !b || !id || !code || !status || !sellerId || !productId || !brandId) return null;
  if (!(HOME_STATUSES as readonly string[]).includes(status)) return null;
  const pId = str(p.id);
  const pName = str(p.name);
  const pCat = str(p.category);
  const cp = int(p.consumer_price);
  const gp = int(p.sale_price);
  const sId = str(s.id);
  const sName = str(s.name);
  const sHandle = str(s.handle);
  const bId = str(b.id);
  const bName = str(b.name);
  if (!pId || !pName || !pCat || cp === null || gp === null || !sId || !sName || !sHandle || !bId || !bName) return null;
  return {
    id,
    code,
    status: status as CampaignStatus,
    start_date: str(r.start_date),
    end_date: str(r.end_date),
    qty: int(r.qty) ?? 0,
    sold_qty: int(r.sold_qty) ?? 0,
    home_featured_at: str(r.home_featured_at),
    seller_id: sellerId,
    product_id: productId,
    brand_id: brandId,
    product: {
      id: pId,
      name: pName,
      description: str(p.description),
      emoji: str(p.emoji) || "📦",
      thumb_url: str(p.thumb_url),
      category: pCat,
      consumer_price: cp,
      sale_price: gp,
    },
    seller: {
      id: sId,
      code: str(s.code),
      name: sName,
      handle: sHandle,
      platform: str(s.platform) || "",
      avatar_url: str(s.avatar_url),
      grade: str(s.grade),
    },
    brand: { id: bId, name: bName },
  };
}

function toHomeCards(rows: unknown[] | null): HomeCard[] {
  const out: HomeCard[] = [];
  for (const row of rows ?? []) {
    const c = parseHomeCard(row);
    if (c) out.push(c);
  }
  return out;
}

/** 홈 목록: status in (LIVE, SCHEDULE_CONFIRMED, CLEARING) + 공개 조인(seller 조인이 비면 제외 = hidden). 오류 시 빈 배열. */
export async function fetchHomeCampaigns(): Promise<HomeCard[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select(HOME_SELECT)
      .in("status", [...HOME_STATUSES])
      .order("start_date", { ascending: true });
    if (error) {
      console.error("[campaign] home campaigns failed", error.message);
      return [];
    }
    return toHomeCards(data);
  } catch (e) {
    console.error("[campaign] home campaigns threw", e);
    return [];
  }
}

/** 같은 인플루언서의 다른 LIVE·SCHEDULE_CONFIRMED 캠페인 ("다른 판매"). hidden 인플루언서면 RLS 로 0건. */
export async function fetchSellerOtherCampaigns(sellerId: string, exceptCampaignId: string): Promise<HomeCard[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select(HOME_SELECT)
      .eq("seller_id", sellerId)
      .neq("id", exceptCampaignId)
      .in("status", ["LIVE", "SCHEDULE_CONFIRMED"])
      .order("start_date", { ascending: true });
    if (error) {
      console.error("[campaign] seller other campaigns failed", error.message);
      return [];
    }
    return toHomeCards(data);
  } catch (e) {
    console.error("[campaign] seller other campaigns threw", e);
    return [];
  }
}

/* ---------------- 공개 인플루언서 목록 (홈 우측 칩) ---------------- */

export type PublicSeller = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  platform: string;
  avatar_url: string | null;
  grade: string | null;
};

/** sellers 공개 행 (RLS: active and not hidden) — 이름순. 오류 시 빈 배열. */
export async function fetchPublicSellers(): Promise<PublicSeller[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sellers")
      .select("id, code, name, handle, platform, avatar_url, grade")
      .order("name", { ascending: true });
    if (error) {
      console.error("[campaign] public sellers failed", error.message);
      return [];
    }
    return (data ?? []).map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      handle: s.handle,
      platform: s.platform,
      avatar_url: s.avatar_url,
      grade: s.grade,
    }));
  } catch (e) {
    console.error("[campaign] public sellers threw", e);
    return [];
  }
}

/* ---------------- public_stats() — 60초 캐시 ---------------- */

export type PublicStats = { today_qty: number; gmv: number; sellers: number; brands: number; today: string | null };

const EMPTY_STATS: PublicStats = { today_qty: 0, gmv: 0, sellers: 0, brands: 0, today: null };

/** 쿠키 없는 anon 클라이언트 — unstable_cache 스코프 안에서는 cookies() 를 쓸 수 없다 */
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const cachedPublicStats = unstable_cache(
  async (): Promise<PublicStats> => {
    const supabase = anonClient();
    if (!supabase) return EMPTY_STATS;
    const { data, error } = await supabase.rpc("public_stats");
    if (error) {
      console.error("[campaign] public_stats failed", error.message);
      return EMPTY_STATS;
    }
    const o = obj(data);
    if (!o) return EMPTY_STATS;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return { today_qty: n(o.today_qty), gmv: n(o.gmv), sellers: n(o.sellers), brands: n(o.brands), today: str(o.today) };
  },
  ["public_stats"],
  { revalidate: 60 },
);

/** 홈 상단 집계 (플랫폼 합계만). 실패해도 0 으로 렌더 — 홈이 죽지 않는다. */
export async function fetchPublicStats(): Promise<PublicStats> {
  try {
    return await cachedPublicStats();
  } catch (e) {
    console.error("[campaign] public_stats threw", e);
    return EMPTY_STATS;
  }
}
