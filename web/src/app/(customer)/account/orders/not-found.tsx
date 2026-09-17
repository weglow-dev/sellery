import Link from "next/link";

/** /account/orders/[code] — 타인 주문·없는 주문번호 (`notFound()`, app-plan §6.1). 소유: F. */
export default function OrderNotFound() {
  return (
    <div className="store">
      <div className="card static">
        <div className="empty">주문을 찾을 수 없습니다</div>
        <div style={{ textAlign: "center", paddingBottom: 6 }}>
          <Link href="/account/orders" className="btn ghost sm">
            ← 내 주문
          </Link>
        </div>
      </div>
    </div>
  );
}
