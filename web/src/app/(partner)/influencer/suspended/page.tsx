import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { COMPANY } from "@/lib/company";
import { getSellerContext, sellerPath } from "@/lib/partner/seller";

/**
 * `/suspended` — 이용 정지 안내 (docs/inf-console-plan.md §4.4). 폼 없음: `partner-admin.mjs reactivate` 로만 복귀.
 * `requireSeller()` 가 suspended 를 여기로 보내므로 이 페이지는 `getSellerContext()` 를 직접 본다(루프 방지).
 * 정지 사유 컬럼은 없다(§4.7 — 사유는 스크립트 stdout·Slack 한 줄로만). 고객센터 이메일 = COMPANY.email.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "이용 정지" };

export default async function SuspendedPage() {
  const ctx = await getSellerContext();
  if (ctx.state === "anon") {
    redirect(`${sellerPath(ctx, "/login")}?next=${encodeURIComponent(sellerPath(ctx, "/home"))}`);
  }
  if (ctx.state === "ok") redirect(sellerPath(ctx, "/home"));
  if (ctx.state === "guest") redirect(sellerPath(ctx, "/apply"));
  if (ctx.state === "foreign") redirect(`${sellerPath(ctx, "/login")}?switch=1`);

  return (
    <div className="console-auth">
      <section className="card static">
        <div className="lbl-sm">인플루언서 콘솔</div>
        <h2 className="console-title">이용이 정지되었습니다</h2>
        <p className="meta">
          <b>{ctx.seller.name}</b> 님의 인플루언서 계정은 현재 이용이 정지된 상태예요. 진행 중이던 캠페인·정산은 셀러리 운영팀이 별도로
          안내드립니다.
        </p>
        <p className="meta" style={{ marginTop: 8 }}>
          정지 사유 확인이나 이의 신청은 가입한 이메일로 <a href={COMPANY.csUrl}>{COMPANY.email}</a> 에 보내주세요.
        </p>
        <div className="foot">
          <span>{ctx.user.email ?? ""}</span>
          <form method="post" action={`/auth/signout?next=${encodeURIComponent(sellerPath(ctx, "/login"))}`}>
            <button type="submit" className="ghost sm">
              로그아웃
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
