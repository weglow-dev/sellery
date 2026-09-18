import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { USER_ICON } from "@/components/icons";

/**
 * 앱바 (ux-spec §2.1): 좌 워드마크(→ /) · 우 마이페이지 아이콘 버튼.
 * 프로토타입 `gotoMy`: 로그인 상태면 /account/orders, 아니면 /login?next=/account/orders.
 * 역할 탭(인플루언서 센터 등)은 고객 사이트에 없다. 서버 컴포넌트 — user 는 layout 이 넘긴다.
 */
export function AppBar({ signedIn }: { signedIn: boolean }) {
  const my = signedIn ? "/account/orders" : `/login?next=${encodeURIComponent("/account/orders")}`;
  return (
    <header className="appbar">
      <Wordmark />
      <div className="master">
        <Link href={my} className="iconbtn" aria-label="마이페이지" title="마이페이지">
          <USER_ICON />
        </Link>
      </div>
    </header>
  );
}
