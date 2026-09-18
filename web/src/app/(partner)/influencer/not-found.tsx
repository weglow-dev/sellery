import Link from "next/link";
import { headers } from "next/headers";
import { consolePath } from "@/lib/hosts";

/**
 * 콘솔 404 — `notFound()`(타인 캠페인 코드 등) 와 `[...rest]/page.tsx` 가 던지는 미매치 경로 모두 여기.
 * 셸(상단 바 · 하단 탭) 안에서 렌더된다. 앱 전체의 미매치 URL 은 `src/app/global-not-found.tsx`.
 */
export default async function InfluencerNotFound() {
  const host = (await headers()).get("host");
  return (
    <div className="card static">
      <div className="empty">페이지를 찾을 수 없습니다</div>
      <div style={{ textAlign: "center", paddingBottom: 6 }}>
        <Link href={consolePath("seller", "/home", host)} className="btn ghost sm">
          ← 콘솔 홈
        </Link>
      </div>
    </div>
  );
}
