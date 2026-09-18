import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "../globals.css";
import { fontVars } from "@/app/fonts";
import { consoleRoleOf, consoleUrl } from "@/lib/hosts";
import { getSellerContext } from "@/lib/partner/seller";
import { PartnerShell, type ShellMe } from "./partner-shell";

/**
 * 파트너 콘솔 root layout — 앱의 **두 번째 root layout** (docs/inf-console-plan.md 결정 2·3).
 * 첫 번째는 고객 `(customer)/layout.tsx`. 최상위 `app/layout.tsx` 가 없어야 둘 다 root 가 된다
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md "multiple root layouts").
 * 인플루언서·브랜드 콘솔이 이 셸 하나를 공유한다 — 브랜드는 `(partner)/brand/**` 를 같은 셸 아래 추가.
 * 고객 AppBar·SubNav·Footer 는 상속하지 않는다. 콘솔 → 고객 사이트 링크는 `<a href>` 절대 URL(NEXT_PUBLIC_SITE_URL).
 */

function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

/** metadataBase: `NEXT_PUBLIC_INF_HOST` 가 있으면 그 절대 URL, 없으면(경로 모드) 고객 사이트 URL */
function partnerBase(): URL {
  const u = consoleUrl("seller", "/");
  try {
    return u.startsWith("/") ? siteUrl() : new URL(u);
  } catch {
    return siteUrl();
  }
}

export const metadata: Metadata = {
  metadataBase: partnerBase(),
  title: { default: "셀러리 파트너", template: "%s — 셀러리 파트너" },
  description: "셀러리 파트너 콘솔",
  robots: { index: false, follow: false }, // 콘솔 전체 비색인 — robots.ts(콘솔 호스트 disallow /) 와 이중
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#eef3dc",
  width: "device-width",
  initialScale: 1,
};

export default async function PartnerRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 요청 host 로 호스트 모드/경로 모드를 정한다 — 호스트 모드 Production 을 `*.vercel.app/influencer/...` 로 열어도
  // 셸의 링크가 경로 모드(`/influencer/home`)로 맞게 나온다(inf-console-plan §2.2). 브랜드 콘솔이 생기면 role 도 host 로.
  const host = (await headers()).get("host");
  const role = consoleRoleOf(host)?.role ?? "seller";
  // 상단 바 표시용(활동명·등급·🥬) — 게이트가 아니다. 같은 요청의 page 가 requireSeller() 를 불러도 React cache 로 DB 는 한 번.
  // 세션·행이 없으면(공개 페이지·guest) 비워 둔다. 정지 계정은 이름만(잔액 없음).
  let me: ShellMe | null = null;
  try {
    const ctx = await getSellerContext();
    if (ctx.state === "ok") me = { name: ctx.seller.name, grade: ctx.seller.grade, balance: ctx.balance };
    else if (ctx.state === "suspended") me = { name: ctx.seller.name, grade: null, balance: null };
  } catch (e) {
    console.error("[partner/layout] seller context failed:", e instanceof Error ? e.message : e);
  }
  return (
    <html lang="ko" className={fontVars}>
      {/* body 에 Tailwind 폰트 스무딩 유틸을 붙이지 않는다 (Windows subpixel AA 유지 — app-plan §9.1) */}
      <body>
        <PartnerShell role={role} host={host} me={me}>
          {children}
        </PartnerShell>
      </body>
    </html>
  );
}
