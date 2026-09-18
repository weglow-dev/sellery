"use server";

import { redirect } from "next/navigation";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameSiteAction, rateLimit, requireSeller, sellerPath, type SellerReady } from "@/lib/partner/seller";
import { notifySlack } from "@/lib/partner/slack";
import { isPlatform } from "@/lib/partner/signup-rules";
import { cleanText } from "@/lib/text";

/**
 * 마이페이지 채널 액션 — 프로토타입 js/80-actions.js addCh/saveCh/delCh/setPrimaryCh/openVerify/confirmVerify 를 서버 확인 방식으로
 * (docs/inf-console-plan.md §4.7 · §6 `/my`). 전부: assertSameSiteAction → requireSeller() → rate limit → `seller_id` 필터로만 읽고 쓴다
 * (클라이언트가 보낸 채널 id 는 본인 행일 때만 통과). 결과는 `/my?msg=<code>` 로 돌아가 안내 문구(page.tsx MY_MESSAGES).
 *
 *   issueVerifyCode  [인증하기]  vcode 'SLRY-XXXX' 발급·저장(이미 있으면 재사용) → /my?verify=<id> (코드 + 방법 1·2 안내)
 *   confirmVerify    [인증 확인]  **vcode_confirmed_at=now() 만 기록** — verified=true 전환은 운영자(partner-admin.mjs verify-channel)만
 *   setPrimaryCh     [메인 SNS로 설정]  verified 채널만 · sellers.platform/handle/followers 동기화
 *   saveChannel      추가·수정  핸들/플랫폼이 바뀌면 verified=false, vcode=null, vcode_confirmed_at=null (primary 는 유지)
 *   deleteChannel    삭제  primary 불가
 */
type Ch = Database["public"]["Tables"]["seller_channels"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0010 partner_random_code 와 같은 알파벳 (0/O · 1/I 제외)

function newVcode(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += VCODE_ALPHABET[b % VCODE_ALPHABET.length];
  return `SLRY-${out}`;
}

function idOf(formData: FormData): string | null {
  const v = formData.get("id");
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

function back(ctx: SellerReady, query: string): never {
  redirect(`${sellerPath(ctx, "/my")}${query ? `?${query}` : ""}`);
}

/** 공통 진입 — CSRF · 게이트 · 레이트리밋 (실패 시 /my?msg=err_rate) */
async function enter(action: string): Promise<{ ctx: SellerReady; admin: ReturnType<typeof createAdminClient> }> {
  await assertSameSiteAction();
  const ctx = await requireSeller({ next: "/my" });
  if (!rateLimit(`${action}:${ctx.user.id}`)) back(ctx, "msg=err_rate");
  return { ctx, admin: createAdminClient() };
}

async function ownChannel(admin: ReturnType<typeof createAdminClient>, ctx: SellerReady, id: string): Promise<Ch | null> {
  const { data, error } = await admin.from("seller_channels").select("*").eq("id", id).eq("seller_id", ctx.seller.id).maybeSingle();
  if (error) {
    console.error("[my] channel read failed:", error.message);
    return null;
  }
  return data ?? null;
}

export async function issueVerifyCode(formData: FormData): Promise<void> {
  const { ctx, admin } = await enter("verify");
  const id = idOf(formData);
  if (!id) back(ctx, "msg=err_input");
  const ch = await ownChannel(admin, ctx, id);
  if (!ch) back(ctx, "msg=err_input");
  if (ch.verified) back(ctx, "msg=already_verified");
  if (!ch.vcode) {
    const { error } = await admin.from("seller_channels").update({ vcode: newVcode() }).eq("id", ch.id).eq("seller_id", ctx.seller.id);
    if (error) {
      console.error("[my] issueVerifyCode failed:", error.message);
      back(ctx, "msg=err_db");
    }
  }
  back(ctx, `verify=${ch.id}`);
}

export async function confirmVerify(formData: FormData): Promise<void> {
  const { ctx, admin } = await enter("verify");
  const id = idOf(formData);
  if (!id) back(ctx, "msg=err_input");
  const ch = await ownChannel(admin, ctx, id);
  if (!ch) back(ctx, "msg=err_input");
  if (ch.verified) back(ctx, "msg=already_verified");
  if (!ch.vcode) back(ctx, `verify=${ch.id}`);
  const { error } = await admin
    .from("seller_channels")
    .update({ vcode_confirmed_at: new Date().toISOString() })
    .eq("id", ch.id)
    .eq("seller_id", ctx.seller.id);
  if (error) {
    console.error("[my] confirmVerify failed:", error.message);
    back(ctx, "msg=err_db");
  }
  // 이메일·핸들·URL 없이 (§4.3)
  void notifySlack(`[셀러리] 채널 인증 확인 요청 · ${ch.code ?? ch.id} · ${ch.platform} · ${ctx.seller.code ?? ctx.seller.id}`);
  back(ctx, "msg=confirmed");
}

export async function setPrimaryCh(formData: FormData): Promise<void> {
  const { ctx, admin } = await enter("channel");
  const id = idOf(formData);
  if (!id) back(ctx, "msg=err_input");
  const ch = await ownChannel(admin, ctx, id);
  if (!ch) back(ctx, "msg=err_input");
  if (!ch.verified) back(ctx, "msg=err_not_verified");
  if (ch.is_primary) back(ctx, "msg=primary");

  // 부분 유니크 (seller_id) where is_primary — 먼저 내리고 올린다
  const unset = await admin.from("seller_channels").update({ is_primary: false }).eq("seller_id", ctx.seller.id).eq("is_primary", true);
  if (unset.error) {
    console.error("[my] setPrimaryCh unset failed:", unset.error.message);
    back(ctx, "msg=err_db");
  }
  const set = await admin.from("seller_channels").update({ is_primary: true }).eq("id", ch.id).eq("seller_id", ctx.seller.id);
  if (set.error) {
    console.error("[my] setPrimaryCh set failed:", set.error.message);
    back(ctx, "msg=err_db");
  }
  const sync: Database["public"]["Tables"]["sellers"]["Update"] = { platform: ch.platform, handle: ch.handle };
  if (ch.followers > 0) sync.followers = ch.followers;
  const s = await admin.from("sellers").update(sync).eq("id", ctx.seller.id);
  if (s.error) {
    // sellers.handle unique 충돌(다른 인플루언서가 같은 핸들) 등 — primary 는 바뀌었으므로 안내만
    console.error("[my] setPrimaryCh sellers sync failed:", s.error.message);
    back(ctx, "msg=primary_nosync");
  }
  back(ctx, "msg=primary");
}

export async function saveChannel(formData: FormData): Promise<void> {
  const { ctx, admin } = await enter("channel");
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? (UUID_RE.test(rawId) ? rawId : null) : null;
  if (typeof rawId === "string" && rawId && !id) back(ctx, "msg=err_input");

  const platformRaw = formData.get("platform");
  const platform = typeof platformRaw === "string" ? platformRaw.trim().toLowerCase() : "";
  if (!isPlatform(platform)) back(ctx, "msg=err_input");
  const handle = cleanText(typeof formData.get("handle") === "string" ? (formData.get("handle") as string) : "").slice(0, 60);
  if (!handle) back(ctx, "msg=err_input");
  const url = cleanText(typeof formData.get("url") === "string" ? (formData.get("url") as string) : "").slice(0, 200) || null;
  const folRaw = formData.get("followers");
  const followers = typeof folRaw === "string" && folRaw.trim() ? Number.parseInt(folRaw.replace(/[^\d]/g, ""), 10) : 0;
  if (!Number.isFinite(followers) || followers < 0 || followers > 1_000_000_000) back(ctx, "msg=err_input");

  if (id) {
    const ch = await ownChannel(admin, ctx, id);
    if (!ch) back(ctx, "msg=err_input");
    const changed = ch.handle !== handle || ch.platform !== platform;
    const patch: Database["public"]["Tables"]["seller_channels"]["Update"] = { platform, handle, url, followers };
    if (changed) {
      // 사칭 방지 — 재인증 대기로 초기화 (primary 는 유지, 0001 주석)
      patch.verified = false;
      patch.vcode = null;
      patch.vcode_confirmed_at = null;
    }
    const { error } = await admin.from("seller_channels").update(patch).eq("id", ch.id).eq("seller_id", ctx.seller.id);
    if (error) {
      console.error("[my] saveChannel update failed:", error.message);
      back(ctx, error.code === "23505" ? "msg=err_handle_taken" : "msg=err_db");
    }
    back(ctx, changed ? "msg=saved_reverify" : "msg=saved");
  }

  // 추가 — 채널이 하나도 없으면 첫 채널을 메인으로
  const { count } = await admin.from("seller_channels").select("id", { count: "exact", head: true }).eq("seller_id", ctx.seller.id);
  const { error } = await admin.from("seller_channels").insert({
    seller_id: ctx.seller.id,
    platform,
    handle,
    url,
    followers,
    verified: false,
    is_primary: (count ?? 0) === 0,
  });
  if (error) {
    console.error("[my] saveChannel insert failed:", error.message);
    back(ctx, error.code === "23505" ? "msg=err_handle_taken" : "msg=err_db");
  }
  back(ctx, "msg=added");
}

export async function deleteChannel(formData: FormData): Promise<void> {
  const { ctx, admin } = await enter("channel");
  const id = idOf(formData);
  if (!id) back(ctx, "msg=err_input");
  const ch = await ownChannel(admin, ctx, id);
  if (!ch) back(ctx, "msg=err_input");
  if (ch.is_primary) back(ctx, "msg=err_primary_delete");
  const { error } = await admin.from("seller_channels").delete().eq("id", ch.id).eq("seller_id", ctx.seller.id);
  if (error) {
    console.error("[my] deleteChannel failed:", error.message);
    back(ctx, "msg=err_db");
  }
  back(ctx, "msg=deleted");
}
