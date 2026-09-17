"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * 로그인 카드 (ux-spec §3.3 — 프로토타입 `.kwin` 문구 원문, 데모 계정 목록·각주는 버림).
 *
 * `next` 는 서버 페이지(page.tsx)가 이미 safeNext 로 정규화한 값이다 — 여기서 lib/auth 를 import 하면
 * next/headers 가 클라이언트 번들에 끌려 들어오므로 prop 을 그대로 믿는다.
 *
 * 개발용 이메일/비밀번호 로그인: NEXT_PUBLIC_DEV_LOGIN=1 이고 production 빌드가 아닐 때만 렌더한다.
 * 두 값 모두 빌드 시 인라인되는 상수라 프로덕션 번들에서는 조건이 `false` 로 접혀 폼 코드가 남지 않는다.
 * 사용자는 `node --env-file=.env.local scripts/dev-user.mjs <email> <password>` 로 만든다.
 */
const DEV_LOGIN =
  process.env.NEXT_PUBLIC_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";

const FAIL_MSG = "로그인에 실패했어요. 잠시 후 다시 시도해주세요.";

function KakaoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path
        fill="#191919"
        d="M12 3C6.5 3 2 6.4 2 10.6c0 2.7 1.8 5 4.5 6.4l-1 3.6c-.1.3.3.6.5.4l4.3-2.9c.6.1 1.1.1 1.7.1 5.5 0 10-3.4 10-7.6S17.5 3 12 3z"
      />
    </svg>
  );
}

/** 로그인 뒤 목적지 — 서버 컴포넌트가 볼 수 있도록 전체 이동 (쿠키 세션 반영). `?welcome=1` 로 토스트 1회. */
function goAfterLogin(next: string) {
  const dest = new URL(next, window.location.origin);
  dest.searchParams.set("welcome", "1");
  window.location.assign(dest.toString());
}

export function LoginClient({ next, authError }: { next: string; authError: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(authError ? FAIL_MSG : null);

  async function signInWithKakao() {
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // `scopes` 지정 금지 — 지정하면 카카오 싱크 간편가입(약관 + 전체 동의) 화면을 우회한다.
        // 동의 항목은 카카오 개발자 콘솔의 앱 설정이 결정한다 (app-plan §4.1).
      },
    });
    if (error) {
      console.error("[login] Kakao OAuth failed:", error);
      setError(FAIL_MSG);
      setLoading(false);
    }
    // 성공하면 브라우저가 카카오로 이동한다 — 이후 코드는 실행되지 않는다.
  }

  return (
    <div className="mx-auto w-full max-w-[420px] pt-8">
      <section className="rounded-card border-2 border-line bg-surface p-[26px] shadow-hs">
        <div className="pt-1 pb-3.5 text-center">
          <h3 className="m-0 inline-flex items-center gap-1 text-[16px] font-bold">
            <KakaoIcon size={22} />
            카카오계정으로 로그인
          </h3>
          <p className="mt-1 text-[12px] font-normal text-mute">셀러리 고객 로그인은 카카오만 지원해요</p>
        </div>

        <button
          type="button"
          onClick={signInWithKakao}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded border-2 border-line bg-kakao px-4 py-3 font-mono text-[15px] font-bold text-kakao-ink shadow-hs-sm hover:bg-kakao-hover disabled:cursor-wait disabled:opacity-45"
        >
          <KakaoIcon />
          {loading ? "카카오로 이동 중…" : "카카오 로그인"}
        </button>

        {error && (
          <p
            role="alert"
            className="mt-3 border-[1.5px] border-danger bg-danger-soft px-3.5 py-2.5 text-center text-[12.5px] text-danger"
          >
            {error}
          </p>
        )}

        <p className="mt-1.5 text-center text-[11.5px] leading-normal text-mute">
          로그인하면 오픈 알림 · 주문·배송·환불 통합 관리 · 인플루언서 팔로우 · 인증 이력을 쓸 수 있어요
        </p>
        <p className="mt-2 text-center text-[11.5px] leading-normal text-mute">
          로그인하면{" "}
          <Link href="/terms" className="underline underline-offset-2">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            개인정보처리방침
          </Link>
          에 동의한 것으로 봅니다
        </p>
      </section>

      {DEV_LOGIN && <DevLoginForm next={next} />}
    </div>
  );
}

/** 개발 전용 — production 빌드에서는 DEV_LOGIN 이 false 로 접혀 렌더되지 않는다. */
function DevLoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(`실패: ${error.message}`);
      setBusy(false);
      return;
    }
    goAfterLogin(next);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-card border-2 border-dashed border-soft-line bg-surface-2 p-4 text-[12.5px]"
    >
      <p className="m-0 mb-2 font-mono text-[11.5px] font-bold uppercase tracking-[.14em] text-mute">
        DEV LOGIN (이메일 · 비밀번호)
      </p>
      <label className="mb-2 block">
        <span className="mb-1 block text-mute">이메일</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border-2 border-line bg-surface px-3 py-2 font-mono"
        />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-mute">비밀번호</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border-2 border-line bg-surface px-3 py-2 font-mono"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full border-2 border-line bg-ink px-4 py-2.5 font-mono text-[12.5px] font-bold text-surface shadow-hs-accent disabled:cursor-wait disabled:opacity-45"
      >
        {busy ? "로그인 중…" : "개발용 로그인"}
      </button>
      {msg && (
        <p role="alert" className="mt-2 text-danger">
          {msg}
        </p>
      )}
      <p className="mt-2 text-[11px] text-mute">
        계정 생성: <code>node --env-file=.env.local scripts/dev-user.mjs &lt;email&gt; &lt;password&gt;</code>
      </p>
    </form>
  );
}
