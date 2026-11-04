// myr-invites.mjs 의 순수 부분 — 기본 콘솔 주소 · 목록 표(vitest: packages/db/src/test/myr-invites-plan.test.ts)

export const DEFAULT_CONSOLE_URL = "https://myr-influencer.vercel.app";

/** 콘솔 주소 — http(s) 오리진만 · 끝 슬래시 정리 · 아니면 null */
export function consoleBase(raw) {
  const v = String(raw ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/.test(v) ? v : null;
}

const pad = (s, n) => {
  const str = String(s ?? "");
  const width = [...str].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
  return str + " ".repeat(Math.max(0, n - width));
};
const kst = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "-");
const STATE = { pending: "대기", used: "가입 완료", expired: "만료", revoked: "취소" };

/** 초대 목록 표 — 토큰 · 링크는 목록에 없다(발급 때 한 번만 보인다) */
export function formatInvitesTable(invites) {
  if (!invites.length) return "  (없음)";
  const head = `  ${pad("이메일", 30)} ${pad("상태", 10)} ${pad("보냄", 14)} ${pad("만료", 14)} ${pad("새 초대 요청", 14)} 크리에이터`;
  const body = invites.map((i) => {
    const state = i.state === "revoked" && i.revoked_reason === "reissued" ? "취소(재발급)" : (STATE[i.state] ?? i.state);
    const req = i.requested_at ? `${kst(i.requested_at)}${i.request_count > 1 ? ` ×${i.request_count}` : ""}` : "-";
    const who = i.seller ? `${i.seller.handle} ${i.seller.name}` : "-";
    return `  ${pad(i.email, 30)} ${pad(state, 10)} ${pad(kst(i.created_at), 14)} ${pad(kst(i.expires_at), 14)} ${pad(req, 14)} ${who}`;
  });
  return [head, ...body].join("\n");
}
