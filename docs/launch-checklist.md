# 실판매 전 체크리스트 (첫 실제 주문 전에 끝낼 것)

작성 2026-09-22 · 대상: 대표(결정) · 운영 담당 · 개발. 기능은 완료됐고(README "현재 서비스 상태") 이 문서는 **돈이 실제로 오가기 전** 코드 밖에서 해야 할 일을 모은다. 모든 항목은 저장소 파일에서 확인한 것만 적었고, 파일로 확인할 수 없는 것은 **확인 필요(결정자)** 로 표시했다. 값(키·비밀번호)은 어디에도 쓰지 않는다. 배포·운영 절차의 정본은 [deploy.md](deploy.md), 정책은 `docs/*-policy.md`.

---

## 0. 한눈에

"실판매 가능" = 실제 고객이 `https://sellery.life/s/<핸들>/<코드>` 에서 **라이브 키로 카드 결제**하고, 그 돈이 D+21 뒤 관리자 화면(`/admin/settle`)에서 실제 브랜드·인플루언서 계좌로 이체되는 상태. 지금(2026-09-22)은 **테스트 키 · 시드 데이터 · 알림 없음** 이라 "화면은 전부 있으나 돈은 가짜" 다.

**하드 블로커 3개** — 하나라도 남으면 첫 실제 주문을 받지 않는다.

- [ ] **① 토스 라이브 키** — Vercel Production 4 프로젝트 전부 `test_gck_/test_gsk_` (§1). 라이브 짝으로 바꾸고 재배포 + 라이브 상점 웹훅 등록 + 실결제·환불 1건 리허설.
- [ ] **② 시드 데이터 정리** — 클라우드 DB 에 `supabase/seed.sql` 의 가짜 브랜드 2 · 인플루언서 8 · 상품 10 · 캠페인 15 · 주문 ~1,000 이 있다(§2). 고객 홈 · `/influencers` · 관리자 정산 큐(c1·c5·c12 CLEARING)에 그대로 보인다.
- [ ] **③ 알림·CS 운영 방식 결정** — 주문·발송·환불 알림이 **하나도 없다**(Supabase 인증 메일뿐, §5). 알림톡/이메일/수동 중 택일하고 CS 당번을 정한다.

그 외 §3 비밀 회전 · §4 법률 · §7 데모 노출 끄기 · §8 리허설은 블로커와 같은 주에 끝낸다.

---

## 1. 결제 — 토스페이먼츠 라이브 전환 (deploy.md §5.3 · §1.2 · §8.3 · §10)

- [ ] 토스 가맹 심사 통과 · 상점 `NHN_shingoonk` 라이브 상점 활성 — **확인 필요(대표)**. 심사 상태는 저장소로 알 수 없다.
- [ ] 개발자센터 → 내 개발정보 → **결제위젯 연동 키** 라이브 짝 `live_gck_…` / `live_gsk_…` 발급. API 개별연동 키(`ck_/sk_`)와 섞지 않는다.
- [ ] 라이브 상점 **결제위젯 설정**: 결제수단에서 **가상계좌 · 계좌이체 비활성화**(카드·간편결제만). 코드는 가상계좌를 승인 뒤 자동 취소한다(`supabase/migrations/0009_fix_virtual_account_check.sql` `VIRTUAL_ACCOUNT_NOT_SUPPORTED` · `packages/payments/src/checkout-rules.ts:158` · 약관 `packages/db/src/legal/terms.ts:205` "가상계좌·계좌이체는 지원하지 않는다"). 위젯 UI 변형 이름 2개(결제수단·약관)가 테스트 상점과 다르면 `PUBLIC_TOSS_WIDGET_VARIANT` · `packages/ui/src/site/checkout/PaymentWidget.svelte` `AGREEMENT_VARIANT_KEY` 확인.
- [ ] Vercel **Production** 환경변수 교체(값은 대시보드에만 · deploy.md §1.2 표):

  | 프로젝트 | `PUBLIC_TOSS_CLIENT_KEY` | `TOSS_SECRET_KEY` | 왜 |
  |---|---|---|---|
  | `sellery-shop` | 필수 | 필수 | 고객 결제 · 환불 · 웹훅 · `/api/health` |
  | `sellery-influencer` | 필수(shop 과 같은 값) | 필수 | 샘플 유상 구매(`/influencer/pay/*`) |
  | `sellery-brand` | — | 필수 | 브랜드 환불 = 토스 취소 |
  | `sellery-admin` | — | 선택(없으면 관리자 환불 `CANCEL_FAILED`) | 관리자 환불(0020) |

  Preview 는 테스트 짝 그대로 둔다(같은 이름 · 환경만 다르게).
- [ ] **재배포**: `PUBLIC_TOSS_CLIENT_KEY` 는 빌드 시 인라인이라 env 변경만으로는 반영되지 않고, Ignored Build Step 때문에 Redeploy 가 CANCELED 된다 → deploy.md §8.3 절차(`commandForIgnoringBuildStep` 잠시 비움 → redeploy → 복구). shop · influencer 둘 다.
- [ ] 라이브 상점 **웹훅 등록**: 개발자센터 → 웹훅 → `https://sellery.life/api/payments/webhook` · 이벤트 `PAYMENT_STATUS_CHANGED`(테스트 상점과 같은 URL — 상점별로 따로 등록). "웹훅 테스트 전송" → 200 · `payment_events` 1행.
- [ ] `curl -s https://sellery.life/api/health` → `{"ok":true,"checks":{"supabaseAdmin":"ok","toss":"ok"}}` (라이브 시크릿이 맞는지 로그인 없이 확인 · deploy.md §10).
- [ ] Vercel Firewall → `/api/payments/webhook` IP 레이트리밋(예 분당 60) — 웹훅은 서명 없는 공개 엔드포인트(deploy.md §5.3). **확인 필요(개발)**: 현재 규칙이 있는지.
- [ ] **실결제 리허설 1건**: 본인 카드로 소액 주문(§8) → `/brand/orders` 에 PAID → 브랜드 콘솔에서 환불 → 토스 콘솔 취소 확인 → `/admin/payments` 정합성 0건 이상 없음.
- [ ] 운영 규칙 공유: 토스 콘솔에서 **부분취소 금지**(전액 취소만 정식 지원 — 부분취소는 `payment_events handled=false` 큐로 남아 수동 조정 · deploy.md §5.3). 정산 완료 뒤 콘솔 취소도 같은 큐.

---

## 2. 데이터 정리 — 시드 제거 (`supabase/seed.sql` · 클라우드 `sellery`)

시드 헤더가 스스로 "**개발·스테이징 전용 — 프로덕션에서는 절대 실행하지 않는다**(가짜 계좌·사업자번호·이메일)" 라고 적혀 있는데, 스테이징 프로젝트가 없어 클라우드에 들어가 있다(`.env.example` 주석 · deploy.md §6.1).

**지운다(전부 시드 §4~§15)**: `brands` b1 바인허브 · b2 글로헬스 / `sellers` s1~s8(`*@sellery.demo`) / `seller_channels` ch1~ch9 / `products` p1~p10 / `campaigns` c1~c13 + 검증용 c14·c15 / `orders` o100~o1151(c1 34 · c12 57 · c5 412 · c6 548 · 샘플 1) / `campaign_events` / `celery_ledger` / `data_views` / `exclusive_requests` / `product_views` / `seller_external_sales` / `referral_earnings` / `cs_conversations` · `cs_messages` cs1·cs2.
**남긴다(시드 §1~§3 = 정책 마스터)**: `platform_settings` · `grade_tiers` 7행 · `brand_grade_tiers` 7행 · `categories` 7행. 없으면 등급 계산·상품 등록이 깨진다.

- [ ] **방식 결정 — 확인 필요(대표 + 개발)**: (A) 클라우드에서 시드 행만 삭제(아래 순서) vs (B) 새 Supabase 프로젝트에 `0001~0021` 만 push 하고 시드 §1~§3 만 투입한 뒤 Vercel · Kakao · Resend 를 옮김. (B) 가 깨끗하지만 §3 의 실계정(대표 계정 3개)과 Auth 사용자도 새로 만들어야 한다.
- [ ] (A) 삭제 순서 — `on delete restrict` FK(주문→캠페인, 캠페인→상품/인플루언서, 체크아웃 세션→캠페인)가 있어 **자식부터**, 한 트랜잭션, 먼저 `--dry-run` 성격의 `select count(*)` 로 대상 확인:
  1. `payouts` → `settlements`(시드엔 없음 — 정산을 실행했다면 생김) · `partner_payments` · `payment_events` · `checkout_sessions`(시드 없음 · 테스트 결제로 생김)
  2. `orders`(캠페인 c1~c15 소속) → `cs_messages` → `cs_conversations`
  3. `campaign_events` → `campaigns` c1~c15
  4. `product_views` · `exclusive_requests` · `data_views` · `seller_external_sales` · `referral_earnings`
  5. `products` p1~p10 → `seller_channels` → `sellers` s1~s8 → `brands` b1·b2 (`celery_ledger` 는 소유자 cascade)
  6. `auth.users` 의 `dev-*@sellery.test` 4계정(§3) — `profiles` 는 cascade, `sellers.user_id`/`brands.user_id` 는 set null
  7. `sensitive_access_log` · `celery_purchases` 는 남겨도 무해(감사 기록) — 시드 관련 행만 확인
- [ ] **대표 실계정과 시드의 연결을 먼저 끊거나 결정**: s101 신쿤(`shingoonk@weglow.biz`) 의 캠페인 c105(DECLINED) · c106(CLEARING) 은 **시드 상품**에 걸려 있어 p1~p10 을 지우면 restrict 로 실패 → c105·c106 도 같이 지우거나 상품을 남긴다. `orangebear851011@gmail.com` 은 **시드 b2 글로헬스**에 연결 — b2 를 지우면 브랜드 계정이 빈다 → 실제 상호로 새로 가입하게 할지 결정(**확인 필요(대표)**). — 이 셋은 대표가 준 사실이며 저장소로는 확인 불가.
- [ ] 관리자 정산 큐: 시드 c1·c5·c12 는 CLEARING 이라 `/admin/settle` 에 D+21 도래분으로 뜬다 — **정리 전에 [정산 실행]을 누르지 않는다**(가짜 계좌로 payouts 가 생기고 `m3_sales_base` 이중 가산 · admin-console-plan.md §5.1).
- [ ] 시퀀스: `campaign_code_seq` 100~ · `order_code_seq` 2000~ · `cs_code_seq` 100~ · `seller_code_seq` 100~ · `product_code_seq`(0003 · 0004 · 0005 · 0010 · 0015). 시드 코드(c1~c15 · o100~o1151)와 겹치지 않으므로 **재시작 불필요** — 이미 소비된 번호(c105 · p104 등)를 되돌리려면 `alter sequence … restart` 인데 코드 유일성만 지키면 되므로 권장하지 않음(**확인 필요(개발)**: 첫 실제 캠페인이 `c107` 처럼 보여도 되는지).
- [ ] 후속 작업(이 문서에서는 쓰지 않음): `partner-admin.mjs purge-seed [--dry-run] --confirm` — 위 순서를 한 트랜잭션으로, 삭제 전 count 표 출력, production 은 `--confirm` 없으면 거부. 이슈 템플릿 task 로 등록.
- [ ] 정리 뒤 확인: `https://sellery.life/`(빈 홈 또는 실상품만) · `/influencers`(실인플루언서만) · `/admin/settle` 대기 0건 · `partner-admin.mjs list` · `brands` 에 실계약자만.

---

## 3. 계정 · 권한 · 비밀

- [ ] **관리자 비밀번호 교체**: `official@weglow.biz`(`profiles.role='admin'` · deploy.md §5.6) 의 비밀번호가 채팅에 노출됨 → Supabase Authentication → Users → 재설정. 서비스 이름이 들어가지 않은 랜덤 문자열 · 팀 금고 보관.
- [ ] **카카오 Client Secret 재발급 권장** → 카카오 개발자 콘솔 → 보안 → Supabase Providers → Kakao 에 교체(deploy.md §5.1 · §5.2). Supabase secret key 는 이미 회전됨(2026-09-21 · deploy.md §1.1 표).
- [ ] 채팅·문서에 값이 보인 적 있는 키는 전부 회전 후보로 본다: `CRON_SECRET`(회전 시 shop 만) · `SLACK_WEBHOOK_URL`(있다면 Slack 에서 재발급) — **확인 필요(개발)**: 노출 여부.
- [ ] **개발 계정 삭제(런칭 전)**: `dev-somin@sellery.test`(s7) · `dev-brand@sellery.test`(b1) · `dev-admin@sellery.test`(admin) · `dev@sellery.test`(고객) — 클라우드 Auth 에 존재. `dev-*.mjs` 는 production 거부라 재생성되지 않는다. `dev-admin` 은 `role='admin'` 이므로 반드시.
- [ ] 관리자 계정 목록 확정: 남길 admin 은 `official@weglow.biz` 1개(운영 결정 2026-09-21) — 개인별 계정으로 나눌지 **확인 필요(대표)**. 확인 쿼리: `select u.email, p.role from auth.users u join public.profiles p on p.id=u.id where p.role='admin'`.
- [ ] **`RRN_ENC_KEY` 백업** — 지금은 대표 PC 루트 `.env.cloud.local` + Vercel `sellery-influencer`/`sellery-admin` 에만 있다(단일 사본). 잃으면 저장된 주민등록번호 복구 불가(deploy.md §6.4-3). 비밀번호 관리 도구(팀 금고)에 보관하고 Production/Preview 값이 다른지 확인.
- [ ] **2단계 인증(대표 계정)**: Supabase · Vercel(`weglow-team`) · GitHub(`weglow-dev` 조직 2FA 강제) · 토스 개발자센터 · 카카오 개발자 · Resend · 호스팅케이알(DNS). 저장소로 확인 불가 — **확인 필요(대표)**.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 를 가진 PC 목록 정리(운영 스크립트 실행자 = 실 DB 쓰기 권한). 퇴사·기기 교체 시 회전.

---

## 4. 법률 · 문서

- [ ] 이용약관 **v1.1 · 시행 2026-09-22**(`packages/db/src/legal/terms.ts:16-17`) · 개인정보처리방침 **v1.2 · 시행 2026-09-22**(`privacy.ts:17-18`). 둘 다 "오늘" 시행 — 약관 제3조는 불리한 변경 30일 전 공지(`terms.ts:58`), 방침은 중요 변경 30일 전(`privacy.ts:475`). 첫 실판매 전 회원이 거의 없어 실익은 작지만, **다음 개정부터는 시행일을 30일 뒤로** 잡고 화면 공지를 남긴다.
- [ ] 처리위탁 표(`privacy.ts:269-296`)는 **토스페이먼츠 · Supabase · Vercel** 3곳. 빠진 후보 — **확인 필요(법률 검토)**: (a) **Resend**(인증 메일 발송 = 이메일 주소 처리 · deploy.md §5.5) (b) **세무사**(원천징수 신고·지급명세서 대행 시 주민등록번호 위탁 — `privacy.ts:146` 은 "국세청 외 제3자 제공 없음"이라 세무사에게 맡기면 개정 필요) (c) 알림톡 사업자(§5 결정 뒤).
- [ ] 사업자 정보 `packages/db/src/company.ts`: `companyPendingFields()` 기준 **미확정 필드 없음**(대표 강신욱 · 517-86-00666 · 통신판매업 제2022-서울강남-00726호 · 성동구 주소 · `official@weglow.biz`). 푸터 `packages/ui/src/site/SiteFooter.svelte` 가 통신판매업 신고번호를 표시. 주소·대표가 바뀌면 여기 한 곳.
- [ ] **에스크로 문구**: 약관·방침은 사용자 결정(2026-09-17)으로 결제대금예치·피해보상보험 언급을 뺐다(`terms.ts:11` 주석 · app-plan.md §13). 그런데 고객 화면에는 "고객 결제 → 셀러리 보관(에스크로)"(`apps/shop/src/routes/about/+page.svelte:97`) · "셀러리 에스크로 보관 · 종료 후 21일 환불 보호"(`packages/ui/src/site/VerifyModal.svelte:48`) 가 남아 있다. 전자상거래법상 "에스크로" 표기는 결제대금예치업 등록 또는 PG 의 예치 서비스 이용을 전제로 오해 소지 → **법률 검토 요청(결정: 대표)** — 문구를 "판매 종료 후 21일 뒤 정산" 으로 바꿀지, 실제 예치 서비스를 붙일지. 여기서 정하지 않는다.
- [ ] 방침 `privacy.ts:303` "고객 문의는 회사가 이메일로 직접 응대" vs 실제 흐름은 고객 문의가 **브랜드 콘솔 `/brand/cs` 로 바로** 간다(CLAUDE.md "고객 CS" · 0018). 브랜드가 수취인 이름·연락처·주소를 보는 구조가 방침 제3자 제공 항목에 있는지 **확인 필요(법률 검토)**.
- [ ] 청약철회(약관 제12조 `terms.ts:237`) 7일 · 발송 후 고객 셀프 환불 불가(app-plan.md §0-8) 가 브랜드 CS 응대 매뉴얼에 반영됐는지.

---

## 5. 알림 · CS 운영

**현재 발신되는 것**: Supabase 인증 메일 3종(가입 확인 · 비밀번호 재설정 · 초대 — `docs/emails/*.html` · Resend `noreply@sellery.life`)과 선택적 Slack 한 줄(`SLACK_WEBHOOK_URL` — 파트너 가입 · 채널 인증 확인 · 브랜드 가입/정지 · 샘플 환불 · 상품 검수, `packages/db/src/server/partner/slack.server.ts`). **주문 접수 · 발송 · 환불 · 정산 알림은 고객·브랜드·인플루언서 누구에게도 가지 않는다.** 알림톡·SMS 연동도 없다.

- [ ] **방식 결정 — 확인 필요(대표)**:
  - (a) **카카오 알림톡** — 발신 프로필(채널) 개설 + 사업자 인증 + 템플릿 심사(주문 · 발송 · 환불 최소 3종) + 발송 대행사(NHN Cloud · 솔라피 등) 계약 → 코드 작업 1 슬라이스(발송 모듈 + 주문/발송/환불 훅 + 실패 큐).
  - (b) **이메일만** — Resend 는 이미 있으나 **주문 메일 템플릿·발송 코드가 없다**(Auth 메일만) → 코드 작업 1 슬라이스. 비회원·카카오 회원은 이메일이 없을 수 있다(`privacy.ts:81` "이메일(있는 경우)").
  - (c) **런칭 시점엔 없음** — 고객은 `/orders/lookup`(비회원) · `/account/orders`(회원)에서 직접 확인, 브랜드는 `/brand/orders` 를 매일 열어 본다. 첫 소량 판매라면 가능하나 발송 알림 부재는 CS 문의를 늘린다.
- [ ] **CS 당번**: 고객 문의는 `/cs/new` → 해당 브랜드 `/brand/cs` 로 직행, 관리자는 `/admin/cs` 열람만. 브랜드가 며칠 안 보면 아무도 모른다 → 브랜드 SLA(예 영업일 1일) 를 입점 안내에 명시하고, 운영자가 매일 `/admin/cs` 또는 `partner-admin.mjs cs --open` 으로 미답변을 본다. 담당자 **확인 필요(대표)**.
- [ ] `official@weglow.biz` 메일함(푸터 고객센터 · 방침 §303)을 누가 보는지, 응답 시간.
- [ ] Slack: 운영 채널에 `SLACK_WEBHOOK_URL` 을 shop · influencer · brand 세 프로젝트에 넣으면 가입·인증·환불이 한 줄씩 온다(개인정보 없이). 주문 알림은 코드에 없다.
- [ ] `@sellery.official` 인스타 DM 수신함 담당자(채널 인증 코드 확인 · deploy.md §5.5).

---

## 6. 운영 루틴 (런칭 후 매일/매주)

| 주기 | 할 일 | 어디서 |
|---|---|---|
| 매일 | 결제 정합성(만료 세션 · 미처리 이벤트 · 부분취소 · 정산 후 취소) | `/admin/payments` 또는 `partner-admin.mjs payments-health` |
| 매일 | 미발송 주문 · 미답변 문의 | `/admin/orders`(필터 unshipped) · `/admin/cs` · `partner-admin.mjs cs --open` |
| 매일 | 채널 인증 대기 → bio/DM 코드 확인 → 승인 | `partner-admin.mjs channels --pending` · `verify-channel <ch>` (관리자 화면은 파트너 관리 PR 뒤) |
| 매일 | 상품 검수 대기 | `partner-admin.mjs products --pending` · `review-product <p> approve\|reject "사유"` |
| 매일 | 세션 만료 | `npx supabase db query --linked "select expire_checkout_sessions()"` (deploy.md §8.2) |
| 주 1회 | 비회원·실패 세션 PII 파기(30일 경과 · 0021) | `select purge_checkout_pii()` |
| 주 1회 | **정산 도래분(D+21)** 실행 → 지급 보류 확인 → 이체 파일 → 은행 이체 → 지급 완료 처리 | `/admin/settle` → `/admin/settle/payouts` → `payouts-export --purpose "…"` → 이체 → `payout-paid <id>` |
| 주 1회 | 크론 2개(`campaign-tick` 매시 · `reconcile` 10분) 마지막 실행 200 | Vercel → `sellery-shop` → Settings → Cron Jobs(Pro 필요 · deploy.md §8.2) |
| 주 1회 | `sensitive_access_log` 감사(주민번호·계좌 원문 열람 기록) | `select * from sensitive_access_log order by at desc limit 50` |
| 월 1회 | Supabase 백업 · Vercel 사용량/청구 · Resend 발송량 | 각 대시보드 |

- [ ] **Supabase 백업**: 플랜이 Pro(CLAUDE.md "Pro/Micro")면 일일 백업 7일 보관이 기본, **PITR 은 유료 애드온** — 결제·주민번호가 들어가는 DB 이므로 켤지 **확인 필요(대표)**. 저장소로 현재 설정 확인 불가.
- [ ] 자동 정산 크론은 준비만 됐고 꺼져 있다(`app_admin_settle_run_due` · admin-console-plan.md §5.4) — 첫 달은 수동 실행 권장.
- [ ] 원천징수 자료(`/admin/settle/rrn.csv` · `exportRrn`)는 `RRN_ENC_KEY` 가 `sellery-admin` 에 있어야 한다. 세무사 전달 경로(§4) 결정 뒤.
- [ ] 장애 시 롤백: 코드 문제는 Vercel → 해당 프로젝트 → Deployments → 이전 배포 "Promote to Production"(deploy.md §3.6). DB 마이그레이션은 되돌리지 않는다(§6.1).

---

## 7. 데모 · 검색 노출

- [ ] **`sellery-brand` Production 의 `PUBLIC_DEMO=1` 제거** — 지금 `/brand/demo` · `/brand/camps` `/dm` `/gallery` `/shop` `/c` `/s` 가 공개(`apps/brand/src/lib/demo.ts` `DEMO_PATHS` · deploy.md §1.2 "2단계 병합까지"인데 5단계까지 끝남). `PUBLIC_*` 라 제거 후 §8.3 절차로 재배포. 데모 시연이 필요하면 Preview 에만 둔다.
- [ ] `sellery-influencer`(`/influencer/demo` …) · `sellery-admin`(`/admin/demo` `/products` `/influencers` `/brands` `/match` `/revenue`) 은 이미 `PUBLIC_DEMO` 없음 → 404. Production 에서 직접 열어 404 확인.
- [ ] `(demo)` 라우트 그룹 삭제는 별도 PR(제안서 PDF 시연용으로 남긴 것 — brand-console-plan.md §2). 런칭 블로커 아님.
- [ ] robots: `apps/shop/src/routes/robots.txt/+server.ts` 가 `/influencer` `/brand` `/admin` `/api/` `/checkout` `/account` `/orders` `/cs` `/login` `/auth/` disallow, 판매 링크 `/s/` `/c/` · `/about` `/influencers` · 약관 allow. **sitemap 없음**(주석 "슬라이스 1 에는 sitemap 이 없다") — 검색 유입을 원하면 후속.
- [ ] OG: 홈은 `og:title` 만(`apps/shop/src/routes/+page.svelte:32`), 판매 링크는 상품 이미지가 있을 때만 `og:image`(`s/[handle]/[code]/+page.svelte:17`). 카톡 공유 미리보기용 기본 이미지가 없다 — 인플루언서가 링크를 뿌리기 전에 `apps/shop/static/` 에 기본 OG 이미지 추가 권장(후속).
- [ ] 제안서 PDF 의 옛 데모 주소(`junho763-dotcom.github.io/sellery-prototype`)는 그대로 둔다(CLAUDE.md).

---

## 8. 리허설 — 실계정 엔드투엔드 (라이브 키 전환 **전** 테스트 키로 1회, 전환 **후** 소액 실결제로 1회)

시드 정리(§2) 뒤 빈 DB 에서 시작. 브라우저 2개(파트너 · 고객) + 운영 PC(스크립트). 각 단계의 기대 화면이 안 나오면 멈추고 이슈 등록.

1. [ ] 브랜드 가입 `https://sellery.life/brand/signup`(실제 상호·사업자번호) → 인증 메일(다른 기기에서 열기) → `/brand/home` · `brands` 1행 · 🥬5.
2. [ ] 상품 등록 `/brand/products/new`(이미지 · 판매가 · 총 요율 · 샘플 정책) → `pending` → 운영 PC `partner-admin.mjs review-product <p> approve` → `listed`.
3. [ ] 인플루언서 가입 `/influencer/signup` → 메일 인증 → `/influencer/my` 채널 등록 → [인증 확인] → 운영 PC `channels --pending` → bio 코드 확인 → `verify-channel`.
4. [ ] 샘플: `/influencer/products/<p>` 무상 요청(또는 유상 `/influencer/pay/new` 테스트 카드) → `/brand/requests` 승인 → 발송(택배사·송장) → 인플루언서 `/influencer/campaigns/<c>` [수령 확인] → TESTING.
5. [ ] 일정: 인플루언서 제안 → 브랜드 `/brand/campaigns/<c>` 확정 → SCHEDULE_CONFIRMED. 시작일을 오늘로 두고 `partner-admin.mjs tick-campaign <c>`(크론은 매시 5분) → LIVE.
6. [ ] 고객 주문 2건 `https://sellery.life/s/<핸들>/<c>`: (a) 카카오 회원 → `/checkout` → 결제 → `/checkout/success` → `/account/orders` (b) 비회원 → 결제 → `/orders/lookup`(주문번호+연락처). `/brand/orders` 에 PAID 2건 · `/admin/payments` 이상 없음.
7. [ ] 발송: `/brand/orders` 운송장 입력(또는 `ship-template.csv` 업로드) → 고객 화면 SHIPPED.
8. [ ] CS: 고객 `/cs/new`(비회원은 주문번호) → `/brand/cs/<code>` 답변 → 고객 `/cs/<code>` 확인 → 종료.
9. [ ] 환불: 회원 주문 1건을 브랜드 콘솔에서 환불 → 토스 콘솔 취소 확인 → `/admin/orders/<code>` REFUNDED.
10. [ ] 종료: 종료일 경과 → `tick-campaign` → CLEARING → `/admin/settle` 대기 목록에 표시(D+21 전이라 실행 불가 · `settle-preview <c>` 로 라인 확인) → 계좌 미등록이면 보류 예고.
11. [ ] 정산: `settle-run <c> --force`(리허설 한정) → `/admin/settle/<code>` 스냅샷 · `/admin/settle/payouts` → `payouts-export --purpose "리허설"` → CSV 열어 계좌 원문 확인 → `payout-paid` → paid. `sensitive_access_log` 에 기록.
12. [ ] 뒷정리: 리허설 행 삭제(§2 순서) 또는 실계약이면 유지. 테스트 결제는 토스 콘솔에서 전액 취소.
13. [ ] 라이브 전환(§1) 뒤 6·9 만 **실카드 소액**으로 반복 → 실제 입금·취소를 토스 정산 내역에서 확인.

---

## 9. 열린 결정 (대표)

| # | 결정 | 기본값(미결정 시) | 관련 |
|---|---|---|---|
| 1 | 토스 라이브 심사 상태 · 전환일 | 테스트 키 유지 = 실판매 불가 | §1 |
| 2 | 시드 정리 방식 — 행 삭제(A) vs 새 프로젝트(B) · 실계정 3개(s101 · b2 연결 · 카카오 고객) 처리 | A · s101 캠페인 c105/c106 삭제 · b2 는 실제 상호로 재가입 | §2 |
| 3 | 알림 방식 — 알림톡 / 이메일 / 없음 | 없음 + 수동 CS(첫 소량 판매) | §5 |
| 4 | 세무사 위탁 여부(원천징수·지급명세서) → 방침 개정 | 회사가 직접 신고(방침 그대로) | §4 |
| 5 | "에스크로" 문구 유지 vs 수정 vs 실제 예치 서비스 | 법률 검토 전까지 문구 수정 보류 | §4 |
| 6 | 첫 판매 시점 · 첫 브랜드/인플루언서(파일럿) | — | §8 |
| 7 | 비회원 주문 PII 보관 — 30일 파기(`purge_checkout_pii` 기본값)가 CS·환불 기간(청약철회 7일 + D+21)과 맞는지 | 30일 | §6 |
| 8 | 관리자 계정 — 공용 1개 vs 개인별 | 공용 1개(`official@weglow.biz`) | §3 |
| 9 | Supabase PITR 애드온 · 자동 정산 크론 켜는 시점 | PITR 미사용 · 수동 정산 | §6 |
| 10 | 데모 화면 — Preview 에만 vs 완전 삭제 | Production `PUBLIC_DEMO` 제거, 코드는 유지 | §7 |
| 11 | 기본 OG 이미지 · sitemap | 없음(후속) | §7 |

**저장소로 확인 못 한 것(이 문서의 가정)**: Vercel 각 프로젝트의 현재 env 값 종류(테스트/라이브) · 토스 심사 상태 · Vercel Firewall 규칙 · Supabase 플랜/백업 설정 · 각 대시보드 2FA · 클라우드 Auth 의 dev-* 계정과 대표 실계정 · c105/c106/b2 연결 — 전부 대표가 준 사실(2026-09-22)이며 실행 전 대시보드에서 다시 본다.
