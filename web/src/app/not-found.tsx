import Link from "next/link";

/**
 * 404 — `notFound()` (없는 캠페인 코드 · 타인 주문 등) 와 매치되지 않는 경로 (ux-spec §3.1.9).
 * 문구는 프로토타입 vStore 첫 줄 원문. 돌아가기 버튼은 고객용 `← 셀러리 홈`.
 */
export default function NotFound() {
  return (
    <div className="store">
      <div className="card static">
        <div className="empty">판매 페이지를 찾을 수 없습니다</div>
        <div style={{ textAlign: "center", paddingBottom: 6 }}>
          <Link href="/" className="btn ghost sm">
            ← 셀러리 홈
          </Link>
        </div>
      </div>
    </div>
  );
}
