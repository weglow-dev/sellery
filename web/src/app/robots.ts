import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { consoleRoleOf } from "@/lib/hosts";

/**
 * /robots.txt (app-plan §2 · reuse-map §1.2 · inf-console-plan §3.2-7).
 *   - 콘솔 호스트(`consoleRoleOf(host)` 있음): 전체 비색인 `disallow: ['/']`. `/robots.txt` 는 REWRITE_EXCLUDE 라
 *     inf 호스트에서도 리라이트 없이 이 파일이 응답한다. `(partner)/layout.tsx` 의 `robots: { index: false }` 와 이중.
 *   - 고객 호스트: 판매 링크 `/s/` · `/c/` 와 홈, 이용약관·개인정보처리방침은 색인 허용, 개인화·결제·인증·API 경로와
 *     경로 모드 콘솔(`/influencer`, `/brand`)은 제외. 슬라이스 1 에는 sitemap 이 없다.
 * `headers()` 를 읽으므로 요청 시점에 생성된다(정적 robots.txt 아님).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  if (consoleRoleOf(host)) {
    return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/s/", "/c/", "/terms", "/privacy"],
        disallow: ["/api/", "/checkout", "/account", "/login", "/auth/", "/influencer", "/brand"],
      },
    ],
  };
}
