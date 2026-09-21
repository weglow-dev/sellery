# 파트너 인증 메일 템플릿 (Supabase Auth → Emails → Templates)

옛 `web/emails/*` 의 이동본 — S5 PR-11 에서 `web/` 삭제, 이 폴더가 정본 (docs/monorepo-migration.md 결정 K · §5.4). 본문은 각 html 파일 내용을 Supabase 대시보드에 그대로 붙여넣는다 — **대시보드 값 변경 없음**.
로고는 `apps/shop/static/email/celery.png`(URL `https://sellery.life/email/celery.png` 불변). 링크는 token_hash 방식(`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=…`) —
`.RedirectTo` 에 앱이 준 `emailRedirectTo`/`redirectTo`(콘솔은 `/influencer/auth/confirm?next=…`, 고객은 `/auth/confirm?next=…`)가 그대로 실리므로 템플릿은 라우트 위치를 모른다.
설계는 docs/inf-console-plan.md §4.1 · §4.8, 대시보드 설정 항목·현재값 기록은 docs/deploy.md §5.5.

| 템플릿 | 파일 | 제목 | 링크 type |
|---|---|---|---|
| Confirm signup | emails/confirm-signup.html | 셀러리 파트너 이메일 인증 | `signup` |
| Reset password | emails/reset-password.html | 셀러리 비밀번호 재설정 | `recovery` |
| Invite user | emails/invite.html | 셀러리 파트너 초대 | `invite` (`packages/db/scripts/partner-admin.mjs invite`) |

문구는 역할 중립('셀러리 파트너') — 템플릿은 프로젝트당 1벌이라 브랜드 가입 메일과 공유된다.
