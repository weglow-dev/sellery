/**
 * 로그아웃 버튼 — 소유: B (glo account/sign-out-button.tsx 복사, 클래스만 제거).
 * Server-side sign out: POST /auth/signout 이 httpOnly 세션 쿠키를 지우고 303 / 로 보낸다.
 * A plain form needs no client JS. 버튼 스타일은 전역 button 규칙(A) 을 따른다.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form method="post" action="/auth/signout">
      <button type="submit" className={className}>
        로그아웃
      </button>
    </form>
  );
}
