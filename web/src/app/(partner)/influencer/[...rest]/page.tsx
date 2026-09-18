import { notFound } from "next/navigation";

/**
 * 콘솔 안의 미매치 경로(아직 없는 탭 `/products` · `/campaigns` · `/sales` · `/my` 포함)를 셸 안의
 * `influencer/not-found.tsx` 로 보낸다 — 없으면 셸 없는 `global-not-found.tsx` 가 뜬다.
 * 정적 라우트(`/influencer/home`, `/influencer/login` …)가 먼저 매치되므로 이 catch-all 은 나머지만 받는다.
 */
export const dynamic = "force-dynamic";

export default function InfluencerCatchAll() {
  notFound();
}
