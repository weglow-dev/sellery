import "server-only";

/**
 * 인플루언서 콘솔 세션 컨텍스트 · 게이트 — docs/inf-console-plan.md §4.4 (결정 6).
 *
 * **콘솔 게이트의 진실은 `sellers.user_id and active`** 이다. `profiles.role` / `app_role()` 은 관리자·집계 판정용이고
 * `user_metadata.partner_role` 은 비신뢰 값이라 여기서 보지 않는다. proxy(규칙 5)는 세션 유무만 보므로 **모든 콘솔 page ·
 * 서버 액션 · `api/partner/*` 가 `requireSeller()` 를 직접 호출**한다 — layout 에만 두면 형제 페이지 이동 시 정지(`active=false`)된
 * 계정이 세션 동안 계속 들어온다.
 *
 *   getSellerContext(): 세션 → service role 로 `sellers.user_id = uid` 1행 + `celery_balances` 잔액. 상태는 넷:
 *     anon(세션 없음) · guest(세션은 있는데 행 없음 → /apply 보완 폼) · suspended(행은 있는데 active=false → /suspended) · ok
 *     React `cache()` 로 요청당 1회만 조회한다(layout 상단 바 + page 가 같이 불러도 DB 는 한 번).
 *   requireSeller({ next }): ok 가 아니면 redirect — anon → `/login?next=<next>` · guest → `/apply` · suspended → `/suspended`.
 *     경로는 전부 요청 host 기준 `consolePath`(호스트 모드 `/apply`, 경로 모드 `/influencer/apply`).
 *   assertSameSiteAction(): 서버 액션용 CSRF 가드 — `sec-fetch-site` 만 본다(`rejectCrossSite` 의 JSON 조건은 route handler 용:
 *     서버 액션 본문은 multipart/text-plain 이다). Next 가 Origin↔Host 도 따로 대조한다(data-security.md).
 *   rateLimit(): checkout 과 같은 30분 20건 — 프로세스 메모리 기준(인스턴스마다 따로 센다; DB 표를 두지 않는다).
 */
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Json } from "@/lib/database.types";
import { getSessionUser, safeNext } from "@/lib/auth";
import { consolePath } from "@/lib/hosts";
import { createAdminClient } from "@/lib/supabase/admin";

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
  | { state: "anon"; host: string | null }
  | { state: "guest"; host: string | null; user: User }
  | { state: "suspended"; host: string | null; user: User; seller: SellerSummary }
  | { state: "ok"; host: string | null; user: User; seller: SellerSummary; balance: number };

export type SellerReady = Extract<SellerContext, { state: "ok" }>;

const SELLER_COLS =
  "id, code, name, handle, platform, grade, active, followers, settle_type, bank_info, sample_address, ref_code, created_at";

export const getSellerContext = cache(async (): Promise<SellerContext> => {
  const host = (await headers()).get("host");
  const user = await getSessionUser();
  if (!user) return { state: "anon", host };

  const admin = createAdminClient();
  const { data: row, error } = await admin.from("sellers").select(SELLER_COLS).eq("user_id", user.id).maybeSingle();
  if (error) {
    // DB 오류는 guest 로 취급하지 않는다(보완 폼이 새 행을 만들 수 있다) — 요청을 실패시킨다.
    throw new Error(`sellers lookup failed: ${error.message}`);
  }
  if (!row) return { state: "guest", host, user };

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
  if (!seller.active) return { state: "suspended", host, user, seller };

  const { data: bal, error: balError } = await admin
    .from("celery_balances")
    .select("balance")
    .eq("owner_type", "seller")
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (balError) console.error("[seller] celery_balances read failed:", balError.message);
  return { state: "ok", host, user, seller, balance: bal?.balance ?? 0 };
});

/** 요청 host 기준 콘솔 상대 경로 (호스트 모드 `/my`, 경로 모드 `/influencer/my`) */
export function sellerPath(ctx: { host: string | null }, path: string): string {
  return consolePath("seller", path, ctx.host);
}

/**
 * `?next=` 검증 — `safeNext` 통과값. 비었거나 거부돼 "/" 이면 콘솔 홈(경로 모드에서 "/" 는 고객 홈이라 그대로 쓰지 않는다).
 * 공개 페이지(login · signup)가 로그인 뒤 복귀 지점을 만들 때 쓴다.
 */
export function consoleNextOf(raw: string | string[] | undefined | null, host: string | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = safeNext(v);
  return n === "/" ? consolePath("seller", "/home", host) : n;
}

/**
 * ok 가 아니면 redirect (redirect 는 throw 이므로 이 함수 뒤의 코드는 ok 일 때만 실행된다).
 * `next` 는 접두 없는 콘솔 경로(예 `/my`) — 로그인 뒤 복귀 지점.
 */
export async function requireSeller(opts: { next?: string } = {}): Promise<SellerReady> {
  const ctx = await getSellerContext();
  if (ctx.state === "ok") return ctx;
  if (ctx.state === "anon") {
    const next = sellerPath(ctx, opts.next ?? "/home");
    redirect(`${sellerPath(ctx, "/login")}?next=${encodeURIComponent(next)}`);
  }
  if (ctx.state === "guest") redirect(sellerPath(ctx, "/apply"));
  redirect(sellerPath(ctx, "/suspended"));
}

/**
 * 서버 액션 CSRF 가드 — `sec-fetch-site` 가 있으면 `same-origin`(또는 `none`) 이어야 한다. 아니면 throw.
 * (route handler 는 `lib/checkout-sync.ts rejectCrossSite` — JSON 본문 조건까지 본다.)
 */
export async function assertSameSiteAction(): Promise<void> {
  const site = ((await headers()).get("sec-fetch-site") ?? "").toLowerCase();
  if (site && site !== "same-origin" && site !== "none") throw new Error("BAD_ORIGIN");
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
