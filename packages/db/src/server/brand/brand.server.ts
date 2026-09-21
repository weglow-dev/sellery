/**
 * 브랜드 콘솔 세션 컨텍스트 · 게이트 — 인플루언서 `../partner/seller.server.ts` 의 브랜드 판 (docs/brand-console-plan.md §3 결정 5).
 *
 * **콘솔 게이트의 진실은 `brands.user_id and active`** 이다. `profiles.role` / `app_role()` 은 관리자·집계 판정용이고
 * `user_metadata.partner_role` 은 비신뢰 값이라 여기서 보지 않는다(행이 없을 때 foreign/guest 를 가르는 데만 쓴다).
 * apps/brand `hooks.server.ts` 의 게이트는 세션 유무만 보므로 **모든 콘솔 page · form action 이 `requireBrand()` 를 직접 호출**한다.
 *
 *   getBrandContext(event): 세션 → service role 로 `brands.user_id = uid` 1행 + `celery_balances(owner_type='brand')` 잔액. 상태는 다섯:
 *     anon(세션 없음) · foreign(세션은 있는데 브랜드 계정이 아님 — 고객 카카오 세션 **또는 인플루언서 세션**(`partner_role='seller'` ·
 *     `link_seller_id`)이 같은 오리진의 쿠키로 들어온 경우 → /brand/login?switch=1) · guest(브랜드 가입 흔적은 있는데 행 없음 → /brand/apply)
 *     · suspended(active=false → /brand/suspended) · ok. `event.locals.memo` 로 요청당 1회만 조회한다(layout 상단 바 + page).
 *   requireBrand(event, { next }): **redirect 를 던지지 않고 결과를 돌려준다** — 앱이 `if (!r.ok) redirect(303, r.location)`.
 *   rateLimit 은 `../partner/seller.server.ts` 의 것을 그대로 쓴다(프로세스 메모리 30분 20건).
 */
import type { User } from "@supabase/supabase-js";
import { partnerRoleOf, safeNext } from "../../auth";
import { consolePath } from "../../console-paths";
import { createAdminClient, type Admin } from "../admin.server";
import { memoized, type DbEvent } from "../event.server";
import { linkSellerIdOf } from "../partner/signup.server";
import { isBrandAccount } from "./signup.server";

export type BrandSummary = {
  id: string;
  code: string | null;
  name: string;
  /** '건강기능식품' | '이너뷰티' (0001 check) */
  category: string;
  /** brand_grade_tiers.name 캐시 — 정산 실행이 갱신 (표시용) */
  grade: string | null;
  active: boolean;
  manager_name: string | null;
  /** 계좌 등록 여부만 (원문 bank_info 는 콘솔 응답에 싣지 않는다) */
  has_bank_info: boolean;
  /** 사업자등록증 업로드 여부 (biz_doc_url 은 partner-docs object path — 콘솔 응답에 싣지 않는다) */
  has_biz_doc: boolean;
  logo_url: string | null;
  ref_code: string | null;
  created_at: string;
};

export type BrandContext =
  | { state: "anon" }
  /** 브랜드 계정이 아닌 세션(카카오 고객 · 인플루언서) — 콘솔과 고객 사이트가 같은 오리진(경로 모드)이라 쿠키를 공유하므로 생긴다 */
  | { state: "foreign"; user: User; kind: "seller" | "customer" }
  | { state: "guest"; user: User }
  | { state: "suspended"; user: User; brand: BrandSummary }
  | { state: "ok"; user: User; brand: BrandSummary; balance: number };

export type BrandReady = Extract<BrandContext, { state: "ok" }>;

const BRAND_COLS = "id, code, name, category, grade, active, manager_name, bank_info, biz_doc_url, logo_url, ref_code, created_at";

const MEMO_KEY = "brand_context";

/** 인플루언서 계정 흔적 — `partner_role='seller'` 또는 `app_metadata.link_seller_id` (브랜드 콘솔에서는 foreign) */
function isSellerAccount(user: User): boolean {
  return partnerRoleOf(user) === "seller" || linkSellerIdOf(user) !== null;
}

export function getBrandContext(event: DbEvent, admin?: Admin): Promise<BrandContext> {
  return memoized(event, MEMO_KEY, async (): Promise<BrandContext> => {
    const { user } = await event.locals.safeGetSession();
    if (!user) return { state: "anon" };

    const a = admin ?? createAdminClient();
    const { data: row, error } = await a.from("brands").select(BRAND_COLS).eq("user_id", user.id).maybeSingle();
    if (error) {
      // DB 오류는 guest 로 취급하지 않는다(보완 폼이 새 행을 만들 수 있다) — 요청을 실패시킨다.
      throw new Error(`brands lookup failed: ${error.message}`);
    }
    if (!row) {
      // 행이 없는 세션 — 인플루언서 흔적이 있으면 foreign(seller) · 브랜드 흔적도 없으면 foreign(customer) · 브랜드 흔적만 있으면 guest(보완 폼).
      if (isSellerAccount(user)) return { state: "foreign", user, kind: "seller" };
      if (!isBrandAccount(user)) return { state: "foreign", user, kind: "customer" };
      return { state: "guest", user };
    }

    const brand: BrandSummary = {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      grade: row.grade,
      active: row.active,
      manager_name: row.manager_name,
      has_bank_info: row.bank_info !== null && typeof row.bank_info === "object",
      has_biz_doc: typeof row.biz_doc_url === "string" && row.biz_doc_url.length > 0,
      logo_url: row.logo_url,
      ref_code: row.ref_code,
      created_at: row.created_at,
    };
    if (!brand.active) return { state: "suspended", user, brand };

    const { data: bal, error: balError } = await a
      .from("celery_balances")
      .select("balance")
      .eq("owner_type", "brand")
      .eq("brand_id", brand.id)
      .maybeSingle();
    if (balError) console.error("[brand] celery_balances read failed:", balError.message);
    return { state: "ok", user, brand, balance: bal?.balance ?? 0 };
  });
}

/** 콘솔 상대 경로 — `brandPath('/my')` → `/brand/my` (경로 모드 고정) */
export function brandPath(path: string): string {
  return consolePath("brand", path);
}

/**
 * `?next=` 검증 — `safeNext` 통과값. 비었거나 거부돼 "/" 이면 콘솔 홈("/" 는 고객 홈이라 그대로 쓰지 않는다).
 * 공개 페이지(login · signup)가 로그인 뒤 복귀 지점을 만들 때 쓴다.
 */
export function consoleNextOf(raw: string | string[] | undefined | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = safeNext(v);
  return n === "/" ? brandPath("/home") : n;
}

export type RequireBrandResult =
  | { ok: true; ctx: BrandReady }
  /** ok 가 아닐 때 — 앱은 `redirect(303, location)` 한다 (패키지는 SvelteKit 의 redirect 를 던지지 않는다) */
  | { ok: false; state: Exclude<BrandContext["state"], "ok">; location: string };

/**
 * ok 가 아니면 보낼 곳을 돌려준다. `next` 는 접두 없는 콘솔 경로(예 `/products`) — 로그인 뒤 복귀 지점.
 *   const r = await requireBrand(event, { next: '/home' }); if (!r.ok) redirect(303, r.location); const { brand } = r.ctx;
 */
export async function requireBrand(event: DbEvent, opts: { next?: string; admin?: Admin } = {}): Promise<RequireBrandResult> {
  const ctx = await getBrandContext(event, opts.admin);
  if (ctx.state === "ok") return { ok: true, ctx };
  const next = brandPath(opts.next ?? "/home");
  switch (ctx.state) {
    case "anon":
      return { ok: false, state: ctx.state, location: `${brandPath("/login")}?next=${encodeURIComponent(next)}` };
    case "foreign":
      return { ok: false, state: ctx.state, location: `${brandPath("/login")}?switch=1&next=${encodeURIComponent(next)}` };
    case "guest":
      return { ok: false, state: ctx.state, location: brandPath("/apply") };
    case "suspended":
      return { ok: false, state: ctx.state, location: brandPath("/suspended") };
  }
}
