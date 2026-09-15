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
  /** TODO(§13): 대표자명 */
  ceo: PENDING,
  /** TODO(§13): 사업자등록번호 (000-00-00000) */
  bizNo: PENDING,
  /** TODO(§13): 통신판매업신고번호 (제0000-서울○○-0000호) */
  mailOrderNo: PENDING,
  /** TODO(§13): 사업장 주소 */
  address: PENDING,
  email: "official@weglow.biz",
  /** TODO(§13): 고객센터 채널(채널톡) 링크 — 확정 전에는 메일 링크 */
  csUrl: "mailto:official@weglow.biz",
  /** 고객센터 채널 표시명 (프로토타입 원문 "고객센터 채널톡") */
  csLabel: "고객센터 채널톡",
  /** 표시용 도메인 (프로토타입 원문 "sellery.co.kr") */
  siteHost: "sellery.co.kr",
  /** TODO(§13): 이용약관 URL — 문서가 없으면 빈 문자열 (푸터는 링크 대신 텍스트로 렌더) */
  termsUrl: "",
  /** TODO(§13): 개인정보처리방침 URL — 문서가 없으면 빈 문자열 */
  privacyUrl: "",
} as const;

export type Company = typeof COMPANY;

/** 아직 "확인 중" 인 필드 이름들 (푸터 경고 · 배포 전 점검용) */
export function companyPendingFields(): string[] {
  const pending: string[] = [];
  for (const k of ["ceo", "bizNo", "mailOrderNo", "address"] as const) {
    if (COMPANY[k] === PENDING) pending.push(k);
  }
  if (COMPANY.csUrl.startsWith("mailto:")) pending.push("csUrl");
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
