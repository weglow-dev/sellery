/**
 * 관리자 콘솔 "고객 문의" — 전 브랜드 열람 **만** (0020 app_admin_cs_list · app_admin_cs_thread). CLAUDE.md "고객 문의는 브랜드사로 바로 · 관리자는 열람만".
 * 답변·종료는 브랜드 콘솔(`../brand/cs.server.ts`). 행 모양은 0018 cs_conversation_json 과 같아 `../../cs/cs-rules` 파서를 그대로 쓴다(campaign.brand 포함).
 *   listAdminCs(status, limit)     → CsConversation[]   status: null | OPEN | ANSWERED | CLOSED
 *   getAdminCsThread(ref)          → CsThread | null    ref: code('cs100') 또는 uuid
 */
import { parseCsConversations, parseCsThread, type CsConversation, type CsStatus, type CsThread } from "../../cs/cs-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { CsConversation, CsStatus, CsThread } from "../../cs/cs-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listAdminCs(status?: CsStatus | string | null, limit = 200, admin: Admin = createAdminClient()): Promise<CsConversation[]> {
  const { data, error } = await admin.rpc("app_admin_cs_list", { p_status: status ?? undefined, p_limit: limit });
  if (error) {
    console.error("[admin/cs] app_admin_cs_list failed:", error.message);
    return [];
  }
  return parseCsConversations(data);
}

export async function getAdminCsThread(ref: string, admin: Admin = createAdminClient()): Promise<CsThread | null> {
  const r = ref.trim();
  if (!r) return null;
  let id = r;
  if (!UUID_RE.test(r)) {
    const { data, error } = await admin.from("cs_conversations").select("id").eq("code", r.toLowerCase()).maybeSingle();
    if (error || !data) return null;
    id = data.id;
  }
  const { data, error } = await admin.rpc("app_admin_cs_thread", { p_conversation_id: id });
  if (error) {
    console.error("[admin/cs] app_admin_cs_thread failed:", error.message);
    return null;
  }
  return parseCsThread(data);
}
