import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { consolePath } from "@/lib/hosts";
import { EMAIL_RE } from "@/lib/partner/signup-rules";
import { ResendButton } from "./resend-button";

/**
 * 인증 메일 안내 — 프로토타입 login.html fVerify("인증 메일을 보냈어요 ✉ · 메일의 버튼을 누르면 가입이 완료됩니다").
 * 인증 전엔 세션이 없으므로 공개 경로(hosts.ts CONSOLE_PUBLIC_PATHS). `?email=` 은 표시·재발송용(형식 밖이면 표시하지 않는다).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "인증 메일 안내" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function VerifySentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const host = (await headers()).get("host");
  const raw = (first(sp.email) ?? "").trim().toLowerCase();
  const email = EMAIL_RE.test(raw) ? raw : null;

  return (
    <div className="console-auth">
      <section className="card static">
        <div className="lbl-sm">인플루언서 콘솔</div>
        <h2 className="console-title">인증 메일을 보냈어요 ✉</h2>
        <p className="meta">
          {email ? (
            <>
              <b>{email}</b> 로 인증 링크를 보냈습니다.{" "}
            </>
          ) : (
            "가입한 이메일로 인증 링크를 보냈습니다. "
          )}
          메일의 버튼을 누르면 가입이 완료되고 바로 콘솔에 들어갈 수 있어요. 링크는 다른 기기(휴대폰 메일 앱)에서 열어도 됩니다.
        </p>
        <p className="meta" style={{ marginTop: 8 }}>
          메일이 보이지 않으면 스팸함을 확인해주세요. 발신 주소는 <b>no-reply@sellery.life</b> 입니다.
        </p>
        {email ? <ResendButton email={email} nextPath={consolePath("seller", "/home", host)} /> : null}
        <div className="foot">
          <span>이미 인증을 마쳤나요?</span>
          <Link href={consolePath("seller", "/login", host)}>로그인으로</Link>
        </div>
      </section>
    </div>
  );
}
