/**
 * (주)위글로우 사업자 정보 — 푸터 통신판매중개자 고지 · 판매자 정보 카드. 소유: A.
 * 계약: docs/app-plan.md §10.0 `COMPANY = { name, ceo, bizNo, mailOrderNo, address, email, csUrl }`.
 *
 * ★ 플레이스홀더: 아래 `PENDING` 값은 사용자가 확정값을 주기 전까지 "확인 중" 으로 노출된다
 *   (app-plan §13 "사업자 정보 확정", ux-spec §2.3). 전자상거래법상 모든 페이지 푸터에 필요하므로
 *   값이 확정되기 전에는 실서비스 배포 금지 — `warnIfCompanyPending()` 이 서버 콘솔에 1회 경고한다.
 */

/** 미확정 표시 문자열 — 확정값으로 교체되면 자동으로 사라진다 */
export const PENDING = "확인 중";

export const COMPANY = {
  name: "(주)위글로우",
  ceo: "강신욱",
  bizNo: "517-86-00666",
  mailOrderNo: "제2022-서울강남-00726호",
  address: "서울시 성동구 왕십리로 38(홍성빌딩), 3층",
  email: "official@weglow.biz",
  /** 고객센터 = 이메일 (사용자 결정 2026-09-17 — 채널톡 등 별도 채널은 두지 않는다) */
  csUrl: "mailto:official@weglow.biz",
  csLabel: "고객센터",
  /** 표시용 도메인 (프로토타입 원문 "sellery.life") */
  siteHost: "sellery.life",
  /** 이용약관 페이지 (src/app/terms · 본문 src/content/legal/terms.ts) — 비우면 푸터가 링크 대신 텍스트로 렌더 */
  termsUrl: "/terms",
  /** 개인정보처리방침 페이지 (src/app/privacy · 본문 src/content/legal/privacy.ts) */
  privacyUrl: "/privacy",
} as const;

export type Company = typeof COMPANY;

/** 아직 "확인 중" 인 필드 이름들 (푸터 경고 · 배포 전 점검용) */
export function companyPendingFields(): string[] {
  const pending: string[] = [];
  for (const k of ["ceo", "bizNo", "mailOrderNo", "address"] as const) {
    if ((COMPANY[k] as string) === PENDING) pending.push(k); // 확정값이 들어오면 리터럴 타입이 겹치지 않아 string 으로 넓혀 비교
  }
  if (!COMPANY.termsUrl) pending.push("termsUrl");
  if (!COMPANY.privacyUrl) pending.push("privacyUrl");
  return pending;
}

export function isCompanyConfirmed(): boolean {
  return companyPendingFields().length === 0;
}

let warned = false;
/** 서버 프로세스당 1회 콘솔 경고 (푸터 렌더 시 호출). 확정되면 아무것도 하지 않는다. */
export function warnIfCompanyPending(): void {
  if (warned) return;
  warned = true;
  const pending = companyPendingFields();
  if (pending.length === 0) return;
  console.warn(
    `[company] 사업자 정보 미확정 필드: ${pending.join(", ")} — web/src/lib/company.ts 를 확정값으로 교체하세요 (docs/app-plan.md §13).`,
  );
}
