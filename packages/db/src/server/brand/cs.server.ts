/**
 * 브랜드 콘솔 — 고객 문의함 · 상세 · 답변 · 처리 종료 (docs/brand-console-plan.md §4 "0018" · §5 `/brand/cs` `/brand/cs/[code]` · CLAUDE.md "고객 CS 는 브랜드로 바로").
 * 프로토타입 원본: apps/brand (demo) demo-cs/+page.svelte · actions.ts saveCSReply / csClose · helpers.ts csOf / csOpen.
 *
 * 전부 0018 RPC(security definer · service role) + **`brand_id = <requireBrand 의 brand.id>`** — 남의 문의는 코드를 바꿔도 null / NOT_FOUND(라우트 404).
 *   listBrandCs(brandId, status?)                     `app_brand_cs_list` — OPEN → ANSWERED → CLOSED · 최근 메시지순 · ≤ 500
 *   getBrandCsThread(brandId, code)                   `app_brand_cs_thread` — 대화 + 메시지 시간순. 내 것이 아니면 null
 *   replyCs(brandId, code, userId, body)              `app_brand_cs_reply` — → ANSWERED · replied_at · 이벤트 cs_replied. CLOSED 면 CLOSED
 *   closeCs(brandId, code)                            `app_brand_cs_close` — → CLOSED · 멱등
 * 행 파서·폼·칩·문구는 순수 모듈 `../../cs/cs-rules.ts`. 고객 측(접수 · 토큰 조회 · 추가 문의)은 `../cs.server.ts`.
 */
import { parseCsActionResult, parseCsConversations, parseCsThread, type CsActionResult, type CsConversation, type CsStatus, type CsThread, isCsStatus } from "../../cs/cs-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { notifyCsReplied } from "../mail-events.server";

export type { CsActionResult, CsConversation, CsMessage, CsStatus, CsThread } from "../../cs/cs-rules";

/** cs 코드 형식 — 시드 cs1 · 생성 cs100~ */
export const CS_CODE_RE = /^cs\d{1,10}$/i;

/** 내 브랜드 문의 code → id. 없거나 남의 것이면 null, DB 오류는 "error". */
async function conversationIdOf(admin: Admin, brandId: string, code: string): Promise<string | null | "error"> {
  const c = code.trim().toLowerCase();
  if (!CS_CODE_RE.test(c)) return null;
  const { data, error } = await admin.from("cs_conversations").select("id").eq("brand_id", brandId).eq("code", c).maybeSingle();
  if (error) {
    console.error("[brand/cs] conversation lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 문의함 — status 를 주면 그 상태만. RPC 오류는 throw(페이지 500). */
export async function listBrandCs(brandId: string, status?: CsStatus | string | null, admin: Admin = createAdminClient()): Promise<CsConversation[]> {
  const { data, error } = await admin.rpc("app_brand_cs_list", {
    p_brand_id: brandId,
    ...(isCsStatus(status) ? { p_status: status } : {}),
  });
  if (error) throw new Error(`app_brand_cs_list failed: ${error.message}`);
  return parseCsConversations(data);
}

/** 문의 상세. 내 것이 아니거나 없는 코드면 null → 라우트 404. */
export async function getBrandCsThread(brandId: string, code: string, admin: Admin = createAdminClient()): Promise<CsThread | null> {
  const id = await conversationIdOf(admin, brandId, code);
  if (id === "error") throw new Error("conversation lookup failed");
  if (!id) return null;
  const { data, error } = await admin.rpc("app_brand_cs_thread", { p_brand_id: brandId, p_conversation_id: id });
  if (error) throw new Error(`app_brand_cs_thread failed: ${error.message}`);
  return parseCsThread(data);
}

/** 답변 — body 는 parseCsReplyInput 결과. userId 는 세션 user.id(감사 열 actor_user_id · null 허용). */
export async function replyCs(brandId: string, code: string, userId: string | null, body: string, admin: Admin = createAdminClient()): Promise<CsActionResult> {
  const id = await conversationIdOf(admin, brandId, code);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_brand_cs_reply", {
    p_brand_id: brandId,
    p_conversation_id: id,
    // 생성 타입은 uuid 를 string 으로 요구하지만 함수는 null 을 받는다(0016 chat 과 같은 관례)
    p_actor_user_id: userId as string,
    p_body: body,
  });
  if (error) {
    console.error("[brand/cs] app_brand_cs_reply failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const res = parseCsActionResult(data);
  // 문의 답변 메일(고객) — 답변 메시지 1건당 한 통(멱등 키 = 메시지 id). 절대 throw 하지 않는다.
  if (res.ok && res.message) await notifyCsReplied(admin, res.conversationId, { messageId: res.message.id, body: res.message.body });
  return res;
}

/** 처리 종료 — 멱등(already). */
export async function closeCs(brandId: string, code: string, admin: Admin = createAdminClient()): Promise<CsActionResult> {
  const id = await conversationIdOf(admin, brandId, code);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_brand_cs_close", { p_brand_id: brandId, p_conversation_id: id });
  if (error) {
    console.error("[brand/cs] app_brand_cs_close failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseCsActionResult(data);
}
