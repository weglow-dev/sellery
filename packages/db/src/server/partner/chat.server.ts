/**
 * 캠페인 스레드 채팅 — 인플루언서 · 브랜드 콘솔 공용 (docs/brand-console-plan.md §4 "0016 app_campaign_chat" · §5 `/campaigns/[code]` `?/chat`).
 * 프로토타입 원본: actions.ts sendChat · helpers.ts pushChat(연락처/카톡 감지 → warn).
 *
 *   sendCampaignChat(role, actorId, userId, campaignCode, body)
 *     role 'seller' → actorId = requireSeller().seller.id · 'brand' → actorId = requireBrand().brand.id (함수가 campaigns.seller_id / brand_id 로 당사자를 다시 대조한다 — 남의 것은 NOT_FOUND).
 *     userId 는 세션 user.id(감사 열 actor_user_id). body 는 parseChatInput 결과(함수가 1~1000자 · 제어문자를 다시 검사).
 *     감지되면 결과 `leak:true` + 스레드에 leak_warned 시스템 행이 함께 생긴다 — 라우트는 성공 뒤 스레드를 다시 읽으면 된다.
 * 순수 규칙(LEAK_RE · parseChatInput · 문구 · senderLabel)은 `../../partner/chat-rules.ts`.
 */
import { CAMPAIGN_CODE_RE } from "../../campaign";
import { parseChatResult, type ChatResult } from "../../partner/chat-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { ChatResult, ChatEvent } from "../../partner/chat-rules";

export type ChatRole = "seller" | "brand";

/** 당사자 캠페인 code → id (role 에 따라 seller_id / brand_id 필터). 없거나 남의 것이면 null, DB 오류는 "error". */
async function campaignIdOf(admin: Admin, role: ChatRole, actorId: string, code: string): Promise<string | null | "error"> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin
    .from("campaigns")
    .select("id")
    .eq(role === "seller" ? "seller_id" : "brand_id", actorId)
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("[partner/chat] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

export async function sendCampaignChat(
  role: ChatRole,
  actorId: string,
  userId: string | null,
  campaignCode: string,
  body: string,
  admin: Admin = createAdminClient(),
): Promise<ChatResult> {
  if (role !== "seller" && role !== "brand") return { ok: false, code: "BAD_ROLE" };
  const id = await campaignIdOf(admin, role, actorId, campaignCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_campaign_chat", {
    p_actor_role: role,
    p_actor_id: actorId,
    // 생성 타입은 uuid 를 string 으로 요구하지만 함수는 null 을 받는다(감사 열 · 스크립트 호출) — 세션이 없으면 null 그대로
    p_actor_user_id: userId as string,
    p_campaign_id: id,
    p_body: body,
  });
  if (error) {
    console.error("[partner/chat] app_campaign_chat failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseChatResult(data);
}
