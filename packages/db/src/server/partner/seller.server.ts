/**
 * 인플루언서 콘솔 세션 컨텍스트 · 게이트 — web/src/lib/partner/seller.ts 의 이식 (docs/inf-console-plan.md §4.4 · docs/monorepo-migration.md §2.2 · §2.4).
 *
 * **콘솔 게이트의 진실은 `sellers.user_id and active`** 이다. `profiles.role` / `app_role()` 은 관리자·집계 판정용이고
 * `user_metadata.partner_role` 은 비신뢰 값이라 여기서 보지 않는다. influencer `hooks.server.ts` 의 게이트는 세션 유무만 보므로
 * **모든 콘솔 page · form action · `api/partner/*` 가 `requireSeller()` 를 직접 호출**한다 — layout 에만 두면 형제 페이지 이동 시
 * 정지(`active=false`)된 계정이 세션 동안 계속 들어온다.
 *
 *   getSellerContext(event): 세션 → service role 로 `sellers.user_id = uid` 1행 + `celery_balances` 잔액. 상태는 넷:
 *     anon(세션 없음) · foreign(세션은 있는데 파트너 계정이 아님 — 고객 카카오 세션이 같은 쿠키로 들어온 경우 →
 *     /login?switch=1 "다른 계정으로") · guest(파트너 세션인데 행 없음 → /apply 보완 폼) · suspended(active=false → /suspended) · ok
 *     `event.locals.memo` 로 요청당 1회만 조회한다(layout 상단 바 + page 가 같이 불러도 DB 는 한 번 — React cache() 대체).
 *   requireSeller(event, { next }): **redirect 를 던지지 않고 결과를 돌려준다** — 앱이 `if (!r.ok) redirect(303, r.location)`.
 *     anon → `/influencer/login?next=<next>` · foreign → `/influencer/login?switch=1&next=` · guest → `/influencer/apply` · suspended → `/influencer/suspended`.
 *   assertSameSiteAction(): 삭제 — SvelteKit 내장 CSRF(form actions Origin 대조) 가 대신한다(§2.2).
 *   rateLimit(): checkout 과 같은 30분 20건 — 프로세스 메모리 기준(서버리스 인스턴스마다 따로 센다; DB 표를 두지 않는다).
 * 호스트 모드(`host` 필드 · `consolePath(role, path, host)`)는 폐기 — 경로 모드 고정(`/influencer` 접두).
 */
import type { User } from "@supabase/supabase-js";
import type { Json } from "../../database.types";
import { isPartnerUser, safeNext } from "../../auth";
import { consolePath } from "../../console-paths";
import { createAdminClient, type Admin } from "../admin.server";
import { memoized, type DbEvent } from "../event.server";
import { linkSellerIdOf } from "./signup.server";

export type SellerSummary = {
  id: string;
  code: string | null;
  name: string;
  /** `@` 포함 (DB 규약) */
  handle: string;
  platform: string;
  grade: string | null;
  active: boolean;
  followers: number;
  settle_type: string | null;
  /** 계좌 등록 여부만 (원문 bank_info 는 콘솔 응답에 싣지 않는다 — §4.9) */
  has_bank_info: boolean;
  sample_address: Json | null;
  ref_code: string | null;
  created_at: string;
};

export type SellerContext =
  | { state: "anon" }
  /** 파트너가 아닌 세션(카카오 고객 등) — 콘솔과 고객 사이트가 같은 오리진(경로 모드)이라 쿠키를 공유하므로 생긴다 */
  | { state: "foreign"; user: User }
  | { state: "guest"; user: User }
  | { state: "suspended"; user: User; seller: SellerSummary }
  | { state: "ok"; user: User; seller: SellerSummary; balance: number };

export type SellerReady = Extract<SellerContext, { state: "ok" }>;

const SELLER_COLS =
  "id, code, name, handle, platform, grade, active, followers, settle_type, bank_info, sample_address, ref_code, created_at";

const MEMO_KEY = "seller_context";

export function getSellerContext(event: DbEvent, admin?: Admin): Promise<SellerContext> {
  return memoized(event, MEMO_KEY, async (): Promise<SellerContext> => {
    const { user } = await event.locals.safeGetSession();
    if (!user) return { state: "anon" };

    const a = admin ?? createAdminClient();
    const { data: row, error } = await a.from("sellers").select(SELLER_COLS).eq("user_id", user.id).maybeSingle();
    if (error) {
      // DB 오류는 guest 로 취급하지 않는다(보완 폼이 새 행을 만들 수 있다) — 요청을 실패시킨다.
      throw new Error(`sellers lookup failed: ${error.message}`);
    }
    if (!row) {
      // 행이 없는 세션 — 파트너 가입 흔적(user_metadata.partner_role · app_metadata.link_seller_id)이 없으면 고객 세션이다.
      // 비신뢰 값이지만 여기서는 "보완 폼을 보여줄지, 다른 계정으로 로그인하라고 할지" 만 가르므로 안전하다(행 생성은 RPC 가 다시 검사).
      if (!isPartnerUser(user) && linkSellerIdOf(user) === null) return { state: "foreign", user };
      return { state: "guest", user };
    }

    const seller: SellerSummary = {
      id: row.id,
      code: row.code,
      name: row.name,
      handle: row.handle,
      platform: row.platform,
      grade: row.grade,
      active: row.active,
      followers: row.followers,
      settle_type: row.settle_type,
      has_bank_info: row.bank_info !== null && typeof row.bank_info === "object",
      sample_address: row.sample_address,
      ref_code: row.ref_code,
      created_at: row.created_at,
    };
    if (!seller.active) return { state: "suspended", user, seller };

    const { data: bal, error: balError } = await a
      .from("celery_balances")
      .select("balance")
      .eq("owner_type", "seller")
      .eq("seller_id", seller.id)
      .maybeSingle();
    if (balError) console.error("[seller] celery_balances read failed:", balError.message);
    return { state: "ok", user, seller, balance: bal?.balance ?? 0 };
  });
}

/** 콘솔 상대 경로 — `sellerPath('/my')` → `/influencer/my` (경로 모드 고정) */
export function sellerPath(path: string): string {
  return consolePath("seller", path);
}

/**
 * `?next=` 검증 — `safeNext` 통과값. 비었거나 거부돼 "/" 이면 콘솔 홈("/" 는 고객 홈이라 그대로 쓰지 않는다).
 * 공개 페이지(login · signup)가 로그인 뒤 복귀 지점을 만들 때 쓴다.
 */
export function consoleNextOf(raw: string | string[] | undefined | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = safeNext(v);
  return n === "/" ? sellerPath("/home") : n;
}

export type RequireSellerResult =
  | { ok: true; ctx: SellerReady }
  /** ok 가 아닐 때 — 앱은 `redirect(303, location)` 한다 (패키지는 SvelteKit 의 redirect 를 던지지 않는다, §2.4) */
  | { ok: false; state: Exclude<SellerContext["state"], "ok">; location: string };

/**
 * ok 가 아니면 보낼 곳을 돌려준다. `next` 는 접두 없는 콘솔 경로(예 `/my`) — 로그인 뒤 복귀 지점.
 *   const r = await requireSeller(event, { next: '/my' }); if (!r.ok) redirect(303, r.location); const { seller } = r.ctx;
 */
export async function requireSeller(event: DbEvent, opts: { next?: string; admin?: Admin } = {}): Promise<RequireSellerResult> {
  const ctx = await getSellerContext(event, opts.admin);
  if (ctx.state === "ok") return { ok: true, ctx };
  const next = sellerPath(opts.next ?? "/home");
  switch (ctx.state) {
    case "anon":
      return { ok: false, state: ctx.state, location: `${sellerPath("/login")}?next=${encodeURIComponent(next)}` };
    case "foreign":
      return { ok: false, state: ctx.state, location: `${sellerPath("/login")}?switch=1&next=${encodeURIComponent(next)}` };
    case "guest":
      return { ok: false, state: ctx.state, location: sellerPath("/apply") };
    case "suspended":
      return { ok: false, state: ctx.state, location: sellerPath("/suspended") };
  }
}

// ------------------------------------------------------------
// 레이트리밋 (30분 20건 — checkout 의 MAX_SESSIONS_PER_30M 와 같은 값). 프로세스 메모리 기준.
// ------------------------------------------------------------
const RL_WINDOW_MS = 30 * 60 * 1000;
const RL_MAX = 20;
const rlBuckets = new Map<string, number[]>();

/** `key`(보통 `<액션>:<user id>`) 의 최근 30분 호출이 20건 이상이면 false. 통과 시 이번 호출을 기록한다. */
export function rateLimit(key: string, max = RL_MAX, windowMs = RL_WINDOW_MS): boolean {
  const now = Date.now();
  const hits = (rlBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    rlBuckets.set(key, hits);
    return false;
  }
  hits.push(now);
  rlBuckets.set(key, hits);
  // 메모리 상한 — 오래된 키 정리
  if (rlBuckets.size > 5_000) {
    for (const [k, v] of rlBuckets) {
      if (v.length === 0 || now - v[v.length - 1] > windowMs) rlBuckets.delete(k);
    }
  }
  return true;
}

export const RATE_LIMIT_MESSAGE = "요청이 너무 많아요 — 잠시 후 다시 시도해주세요";
