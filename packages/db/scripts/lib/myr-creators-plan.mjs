// MYR 크리에이터 계정 스크립트(myr-creators.mjs) 순수 부분 — 입력 검증 · 비밀번호 생성 · 초대 링크 주소 · 표 출력. 테스트: src/test/myr-creators-plan.test.ts
import { randomBytes } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8; // 크리에이터 콘솔 로그인 규칙(apps/myr-influencer lib/console-auth.ts PASSWORD_MIN)과 같은 값

/** 이메일 — 공백 제거 · 소문자. 형식이 아니면 null */
export function normEmail(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 254 ? e : null;
}

/** 비밀번호 — 8~72자. 아니면 오류 문구, 맞으면 null */
export function passwordProblem(pw) {
  const s = String(pw ?? "");
  if (s.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다`;
  if (s.length > 72) return "비밀번호는 72자까지입니다";
  return null;
}

/** 임시 비밀번호 — 영문 대소문자 + 숫자 14자(헷갈리는 0 O 1 l I 제외). 운영자가 크리에이터에게 따로 전달하고, 크리에이터는 콘솔 "비밀번호 찾기"로 바꿀 수 있다 */
export function generatePassword(len = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  // 숫자가 하나도 없으면 마지막 글자를 숫자로(사람이 읽기 쉬운 규칙 — 보안 강도와 무관)
  return /\d/.test(out) ? out : out.slice(0, -1) + "7";
}

/**
 * 초대 메일 링크가 돌아올 주소 — 콘솔의 `/auth/confirm?next=/`.
 * Supabase 이메일 템플릿이 `{{ .RedirectTo }}&token_hash=…&type=invite` 라서 **반드시 `?` 쿼리가 있어야** 한다(없으면 `&token_hash` 가 경로에 붙어 깨진다).
 * 콘솔 주소가 http(s) 오리진이 아니면 null.
 */
export function inviteRedirect(consoleUrl) {
  try {
    const u = new URL(String(consoleUrl ?? "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}/auth/confirm?next=%2F`;
  } catch {
    return null;
  }
}

/** 크리에이터 표 — 탭 구분(스프레드시트에 붙여 넣기 쉽게) */
export function formatCreatorsTable(rows) {
  if (!rows.length) return "(없음)";
  const head = ["핸들", "이름", "상품(listed/전체)", "active", "로그인 계정"].join("\t");
  return [head, ...rows.map((r) => [r.handle, r.name, `${r.listed}/${r.total}`, r.active ? "Y" : "N(정지)", r.email ?? "(미연결)"].join("\t"))].join("\n");
}
