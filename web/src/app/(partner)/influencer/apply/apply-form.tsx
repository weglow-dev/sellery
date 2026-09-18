"use client";

import { useActionState } from "react";
import { completeSignup, type ApplyState } from "./actions";
import { NAME_MAX, PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/partner/signup-rules";

/**
 * 보완 폼 — 가입 폼과 같은 필드(활동명 · 플랫폼 · 핸들 · 추천 코드)를 user_metadata 로 프리필. 약관 동의가 메타에 없으면 체크박스를 다시 받는다.
 * 제출은 서버 액션 `completeSignup`(useActionState) — 실패 문구는 state.error.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export function ApplyForm({
  defaults,
}: {
  defaults: { name: string; platform: Platform; handle: string; referralCode: string; termsAgreed: boolean };
}) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(completeSignup, { error: null });

  return (
    <form action={action}>
      <div className="fld">
        <label htmlFor="name">활동명</label>
        <input id="name" name="name" defaultValue={defaults.name} maxLength={NAME_MAX} required placeholder="예: 지유" />
      </div>
      <div className="fld">
        <label htmlFor="platform">메인 SNS 플랫폼</label>
        <select id="platform" name="platform" defaultValue={defaults.platform}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label htmlFor="handle">계정 핸들</label>
        <input
          id="handle"
          name="handle"
          defaultValue={defaults.handle}
          autoCapitalize="none"
          autoComplete="off"
          placeholder="@my_account"
          maxLength={31}
          pattern="@?[A-Za-z0-9._]{2,30}"
          required
        />
        <div className="hint">영문·숫자·점(.)·밑줄(_) 2~30자. 이미 쓰이는 핸들은 등록할 수 없어요.</div>
      </div>
      <div className="fld">
        <label htmlFor="referral_code">
          추천 코드 <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(선택)</span>
        </label>
        <input
          id="referral_code"
          name="referral_code"
          defaultValue={defaults.referralCode}
          autoComplete="off"
          maxLength={20}
          style={{ textTransform: "uppercase" }}
        />
      </div>
      {!defaults.termsAgreed && (
        <label className="console-check">
          <input type="checkbox" name="terms" required />
          <span>
            <a href={`${SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
              이용약관
            </a>
            ·
            <a href={`${SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
              개인정보처리방침
            </a>
            에 동의합니다.
          </span>
        </label>
      )}
      <p className="console-err" role="alert">
        {state.error ?? ""}
      </p>
      <button type="submit" className="pri" disabled={pending} style={{ width: "100%" }}>
        {pending ? "저장 중…" : "확인하고 콘솔 들어가기 →"}
      </button>
    </form>
  );
}
