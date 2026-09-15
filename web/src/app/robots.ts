import type { MetadataRoute } from "next";

/**
 * /robots.txt (app-plan §2 · reuse-map §1.2): 판매 링크 `/s/` · `/c/` 와 홈은 색인 허용,
 * 개인화·결제·인증·API 경로는 제외. 슬라이스 1 에는 sitemap 이 없다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/s/", "/c/"],
        disallow: ["/api/", "/checkout", "/account", "/login", "/auth/"],
      },
    ],
  };
}
