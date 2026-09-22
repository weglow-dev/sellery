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

## 거래 메일 (앱이 Resend HTTP API 로 직접 발송 · 2026-09-22)

주문·발송·환불·문의 알림은 Supabase 가 아니라 **앱 서버가 Resend `POST /emails` 로 보낸다** — 대시보드 템플릿이 아니라 코드다(대표 결정 2026-09-22 "이메일 보내야지", docs/launch-checklist.md §5).
같은 디자인(테이블 레이아웃 · 배경 `#eef3dc` · 버튼 `#4f8a2c` · 로고 `https://sellery.life/email/celery.png` · 푸터 사업자 정보는 `packages/db/src/company.ts` COMPANY) 을 `packages/db/src/mail/layout.ts` 가 만든다.

| 이벤트 | 템플릿(`packages/db/src/mail/templates.ts`) | 받는 사람 | 제목 | 훅 위치 |
|---|---|---|---|---|
| 주문 확인(결제 완료) | `orderPaidCustomerMail` | 고객 | `[셀러리] 주문이 접수되었어요 · O2001` | `@sellery/payments` checkout-sync `confirmDone` — confirm 라우트 · 웹훅 · reconcile 공통, 새 주문일 때 1회 |
| 새 주문 | `orderPaidBrandMail` | 브랜드(`brands.email`) | `[셀러리] 새 주문 · O2001 · 상품명` | 〃 (배송지·연락처 없음 — 콘솔에서) |
| 배송 시작 | `orderShippedMail` | 고객 | `[셀러리] 상품이 발송되었어요 · O2001` | `brand/orders.server` `shipOrder` · `shipOrdersBulk`(행마다 1통 · 정정은 새 송장으로 다시) |
| 환불 완료 | `orderRefundedMail` | 고객 | `[셀러리] 환불이 완료되었어요 · O2001` | checkout-sync `afterRefundRecorded` — 고객 셀프 · 브랜드 · 관리자 · 토스 콘솔 취소 전부(부분취소 제외) |
| 문의 답변 | `csRepliedMail` | 고객 | `[셀러리] 문의에 답변이 달렸어요 · CS100` | `brand/cs.server` `replyCs` |
| 새 문의 · 추가 문의 | `csOpenedBrandMail` | 브랜드 | `[셀러리] 새 고객 문의 · CS100 · 유형` | `cs.server` `openCs` · `customerReplyCs` |

- 발신 `Sellery <noreply@sellery.life>` · 환경변수 `RESEND_API_KEY`(shop · brand 필수 · admin 선택 — deploy.md §1.2 · §5.7). 키가 없으면 발송 비활성(서버 로그 1회 안내) — 로컬·CI·Preview.
- 고객 주소는 `orders.buyer_email` → `customers.email` → 회원 auth 이메일 순 — 셋 다 없으면(비회원이 이메일을 안 적음 · 카카오 계정에 이메일 없음) 조용히 건너뛴다. 샘플 구매 주문(`is_sample`)은 보내지 않는다.
- 멱등: Resend `Idempotency-Key` = `<event>:<id>`(`order_paid:customer:<order id>` · `order_shipped:<order id>:<택배사>:<송장>` · `cs_replied:<message id>` …) + 프로세스 안 24시간 가드 → 웹훅 재시도·새로고침에도 한 통.
- 사용자 입력(옵션명 · 배송지 · 사유 · 문의 본문)은 전부 HTML 이스케이프. 링크는 `PUBLIC_SITE_URL` 오리진 + 앱 경로(회원 `/account/orders/<code>` · 비회원 `/orders/lookup` · `/cs/<code>` · `/brand/orders` · `/brand/cs/<code>`).
- 테스트 `packages/db/src/test/mail-templates.test.ts` · `mail-resend.test.ts`(fetch 주입 · 비활성 · 멱등 · 실패 흡수). 로컬에서 실제 요청을 보려면 `RESEND_API_URL` 을 목 서버로(deploy.md §5.7).
