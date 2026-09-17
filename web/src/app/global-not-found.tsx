import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { fontVars } from "@/app/fonts";

/**
 * 앱 전체의 미매치 URL 404 (`next.config.ts` experimental.globalNotFound — Next 16 not-found.md "global-not-found.js").
 * root layout 이 둘((customer)·(partner))이라 어느 레이아웃으로도 전역 404 를 조합할 수 없어 html/body 째로 렌더한다.
 * 레이아웃을 거치지 않으므로 전역 스타일·폰트를 직접 import 한다. 실제로는 두 그룹의 `[...rest]` catch-all 이
 * 대부분의 미매치 경로를 각 셸 안의 not-found 로 보내고, 여기는 그마저 벗어난 경로(예: `/brand/*` 이전)만 받는다.
 * 돌아가기 링크는 `/` — 콘솔 호스트면 콘솔, 고객 호스트면 고객 홈.
 */
export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다 — 셀러리",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function GlobalNotFound() {
  return (
    <html lang="ko" className={fontVars}>
      <body>
        <main id="main" className="site-main">
          <div className="store">
            <div className="card static">
              <div className="empty">페이지를 찾을 수 없습니다</div>
              <div style={{ textAlign: "center", paddingBottom: 6 }}>
                <Link href="/" className="btn ghost sm">
                  ← 처음으로
                </Link>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
