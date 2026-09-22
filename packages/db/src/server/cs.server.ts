/**
 * 고객 문의(CS) — shop 측: 접수 · 스레드 조회 · 추가 문의 · 회원 목록 (docs/brand-console-plan.md §4 "0018 app_cs_open" · §6 행 4 shop 짝 · §8 "고객 CS 접수 화면 위치").
 * 프로토타입 원본: actions.ts submitCS(캠페인 · 유형 · 본문 · 주문번호 원문) · 60-customer 문의 모달.
 *
 * 전부 0018 RPC(security definer · service role). 인증은 두 가지 — 비회원 client_token(접수 응답에서 1회 → 쿠키 `csTokenCookieName(code)` HttpOnly)
 * 또는 회원 user_id(세션). 둘 다 없거나 안 맞으면 NOT_FOUND/null — 코드·토큰 불일치를 구분하지 않는다.
 *   openCs(campaignCode, input, who)                  `app_cs_open` — LIVE · CLEARING · SETTLED 캠페인만 · brand_id 파생 · order_code 해석 · 이벤트 cs_received
 *   getCsThread(code, { clientToken?, userId? })      `app_cs_thread` — 대화 + 메시지
 *   customerReplyCs(code, { clientToken?, userId? }, body)  `app_cs_customer_reply` — ANSWERED → OPEN · CLOSED 면 CLOSED
 *   listCsForUser(userId)                             `app_cs_list_for_user` — /account/orders "판매자 문의" 행
 * 레이트리밋은 라우트가 `rateLimit`(server/partner/seller) 로 — 접수는 IP·세션당 분당 소수(§8 결정은 PR-B).
 * 폼·파서·문구·쿠키 이름은 순수 모듈 `../cs/cs-rules.ts`.
 */
import { CAMPAIGN_CODE_RE } from "../campaign";
import { parseCsActionResult, parseCsConversations, parseCsOpenResult, parseCsThread, type CsActionResult, type CsConversation, type CsOpenResult, type CsThread, type CsType } from "../cs/cs-rules";
import { createAdminClient, type Admin } from "./admin.server";

export type { CsActionResult, CsConversation, CsMessage, CsOpenResult, CsThread } from "../cs/cs-rules";

export type CsCustomerKey = { clientToken?: string | null; userId?: string | null };

export type CsOpenInput = { type: CsType; body: string; buyerName: string | null; orderCode: string | null };

/** 접수자 — 회원이면 userId(+ customers.id 가 있으면 customerId), 비회원은 둘 다 null */
export type CsOpener = { userId?: string | null; customerId?: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 캠페인 code → id (상태는 함수가 검사한다). */
async function campaignIdOf(admin: Admin, code: string): Promise<string | null | "error"> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin.from("campaigns").select("id").eq("code", code).maybeSingle();
  if (error) {
    console.error("[cs] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 문의 접수 — input 은 parseCsOpenInput 결과. 성공 응답의 clientToken 은 비회원용 비밀값(쿠키에 보관 · 화면에 노출하지 않는다). */
export async function openCs(campaignCode: string, input: CsOpenInput, who: CsOpener = {}, admin: Admin = createAdminClient()): Promise<CsOpenResult> {
  const id = await campaignIdOf(admin, campaignCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_cs_open", {
    p_campaign_id: id,
    // 생성 타입은 uuid 를 string 으로 요구하지만 함수는 null 을 받는다(비회원)
    p_customer_id: (who.customerId ?? null) as string,
    p_user_id: (who.userId ?? null) as string,
    p_buyer_name: input.buyerName ?? "",
    p_type: input.type,
    p_body: input.body,
    ...(input.orderCode ? { p_order_code: input.orderCode } : {}),
  });
  if (error) {
    console.error("[cs] app_cs_open failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseCsOpenResult(data);
}

function keyArgs(key: CsCustomerKey): { p_client_token?: string; p_user_id?: string } | null {
  const token = key.clientToken && UUID_RE.test(key.clientToken) ? key.clientToken : null;
  const user = key.userId && UUID_RE.test(key.userId) ? key.userId : null;
  if (!token && !user) return null;
  return { ...(token ? { p_client_token: token } : {}), ...(user ? { p_user_id: user } : {}) };
}

/** 고객 스레드 — 토큰·회원 어느 쪽도 없거나 안 맞으면 null(라우트 404). */
export async function getCsThread(conversationCode: string, key: CsCustomerKey, admin: Admin = createAdminClient()): Promise<CsThread | null> {
  const args = keyArgs(key);
  if (!args) return null;
  const { data, error } = await admin.rpc("app_cs_thread", { p_conversation_code: conversationCode.trim(), ...args });
  if (error) throw new Error(`app_cs_thread failed: ${error.message}`);
  return parseCsThread(data);
}

/** 추가 문의 — body 는 parseCsReplyInput 결과. */
export async function customerReplyCs(conversationCode: string, key: CsCustomerKey, body: string, admin: Admin = createAdminClient()): Promise<CsActionResult> {
  const args = keyArgs(key);
  if (!args) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_cs_customer_reply", {
    p_conversation_code: conversationCode.trim(),
    p_client_token: (args.p_client_token ?? null) as string,
    p_user_id: (args.p_user_id ?? null) as string,
    p_body: body,
  });
  if (error) {
    console.error("[cs] app_cs_customer_reply failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseCsActionResult(data);
}

/** 회원의 문의 목록 — 최신순 ≤ 100. 호출자는 세션 user.id 를 넘긴다. */
export async function listCsForUser(userId: string, admin: Admin = createAdminClient()): Promise<CsConversation[]> {
  if (!UUID_RE.test(userId)) return [];
  const { data, error } = await admin.rpc("app_cs_list_for_user", { p_user_id: userId });
  if (error) throw new Error(`app_cs_list_for_user failed: ${error.message}`);
  return parseCsConversations(data);
}
