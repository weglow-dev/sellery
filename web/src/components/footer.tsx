import { CEL } from "@/components/icons";
import { COMPANY, warnIfCompanyPending } from "@/lib/company";

/**
 * 전역 푸터 (ux-spec §2.3 — 프로토타입에는 없고 `.store-foot` 한 줄만 있었다):
 *   1행 [원문] 통신판매중개자 고지 · 고객센터(이메일 — 채널톡 없음, 사용자 결정 2026-09-17) · sellery.co.kr
 *   2행 (주)위글로우 사업자 정보 — lib/company.ts (플레이스홀더는 "확인 중" 으로 노출)
 *   3행 이용약관 · 개인정보처리방침 — 문서 URL 이 비어 있으면 링크 대신 텍스트
 * 링크 페이지는 이 위에 페이지 전용 `.store-foot`(브랜드명 · #광고) 가 한 번 더 온다 (C).
 */
export function Footer() {
  warnIfCompanyPending();
  const external = /^https?:\/\//.test(COMPANY.csUrl);
  return (
    <footer className="site-footer">
      <div className="store-foot">
        <CEL /> <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드에 있습니다 ·{" "}
        <a href={COMPANY.csUrl} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          {COMPANY.csLabel}
        </a>{" "}
        · {COMPANY.siteHost}
      </div>
      <div className="store-foot">
        {COMPANY.name} · 대표 {COMPANY.ceo} · 사업자등록번호 {COMPANY.bizNo} · 통신판매업신고 {COMPANY.mailOrderNo} · 주소 {COMPANY.address} ·
        이메일 <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </div>
      <div className="store-foot">
        {COMPANY.termsUrl ? <a href={COMPANY.termsUrl}>이용약관</a> : <span>이용약관</span>} ·{" "}
        {COMPANY.privacyUrl ? <a href={COMPANY.privacyUrl}>개인정보처리방침</a> : <span>개인정보처리방침</span>}
      </div>
    </footer>
  );
}
