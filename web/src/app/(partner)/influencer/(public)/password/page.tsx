import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { consolePath } from "@/lib/hosts";
import { PasswordResetForm } from "./password-form";

/**
 * 비밀번호 재설정 요청 — 프로토타입 login.html fReset. `resetPasswordForEmail` → 메일(token_hash · type=recovery) →
 * /auth/confirm → /password/new (docs/inf-console-plan.md §4.1). 계정 존재 여부는 문구로 드러내지 않는다.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "비밀번호 재설정" };

export default async function PasswordResetPage() {
  const host = (await headers()).get("host");
  return (
    <div className="console-auth">
      <section className="card static">
        <div className="lbl-sm">인플루언서 콘솔</div>
        <h2 className="console-title">비밀번호 재설정</h2>
        <p className="meta">가입한 이메일을 입력하면 재설정 링크를 보내드려요. 링크는 다른 기기에서 열어도 됩니다.</p>
        <PasswordResetForm newPasswordPath={consolePath("seller", "/password/new", host)} />
        <div className="foot">
          <span />
          <Link href={consolePath("seller", "/login", host)}>로그인으로</Link>
        </div>
      </section>
    </div>
  );
}
