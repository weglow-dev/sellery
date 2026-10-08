# 실판매 전 체크리스트 (첫 실제 주문 전에 끝낼 것)

작성 2026-09-22 · 대상: 대표(결정) · 운영 담당 · 개발. 기능은 완료됐고(README "현재 서비스 상태") 이 문서는 **돈이 실제로 오가기 전** 코드 밖에서 해야 할 일을 모은다. 모든 항목은 저장소 파일에서 확인한 것만 적었고, 파일로 확인할 수 없는 것은 **확인 필요(결정자)** 로 표시했다. 값(키·비밀번호)은 어디에도 쓰지 않는다. 배포·운영 절차의 정본은 [deploy.md](deploy.md), 정책은 `docs/*-policy.md`.

---

## 0. 한눈에

"실판매 가능" = 실제 고객이 `https://sellery.life/s/<핸들>/<코드>` 에서 **라이브 키로 카드 결제**하고, 그 돈이 D+21 뒤 관리자 화면(`/admin/settle`)에서 실제 브랜드·인플루언서 계좌로 이체되는 상태. 지금(2026-09-22)은 **테스트 키 · 시드 데이터 · 거래 메일은 코드만(키 미투입)** 이라 "화면은 전부 있으나 돈은 가짜" 다.

**전환일: 2026-10-14(화) — 대표 결정 2026-10-08.** D-1(10-13) 과 D-day 의 순서·명령은 §10 런북.

**하드 블로커 3개** — 하나라도 남으면 첫 실제 주문을 받지 않는다.

- [ ] **① 토스 라이브 키** — Vercel Production 4 프로젝트 전부 `test_gck_/test_gsk_` (§1). D-day 에 `packages/db/scripts/toss-live-switch.mjs --apply` 로 한 번에 교체(§10) + 재배포 + 라이브 상점 웹훅 등록 + 실결제·환불 1건 리허설. 지급대행은 **MID A `peerkeamf5`(다른 서비스와 잔액 공유 → 공유 잔액 가드 · §1)**.
- [ ] **② 시드 데이터 정리** — 클라우드 DB 에 `supabase/seed.sql` 의 가짜 브랜드 2 · 인플루언서 8 · 상품 10 · 캠페인 15 · 주문 ~1,000 이 있다(§2). D-1 에 `packages/db/scripts/purge-seed.mjs`(0043 · dry-run → `--confirm PURGE`)로 지운다(§2 · §10).
- [x] **③ 알림 방식 결정 → 이메일(2026-09-22 · Resend · 주문·발송·환불·문의 6종 구현)** — 남은 것: Vercel 에 `RESEND_API_KEY` 투입(§5 · deploy.md §5.7) · CS 당번.

그 외 §3 비밀 회전 · §4 법률 · §7 데모 노출 끄기(완료) · §8 리허설은 블로커와 같은 주에 끝낸다.

---

## 1. 결제 — 토스페이먼츠 라이브 전환 (deploy.md §5.3 · §1.2 · §8.3 · §10)

- [ ] 토스 가맹 심사 통과 · 상점 `NHN_shingoonk` 라이브 상점 활성 — **확인 필요(대표)**. 심사 상태는 저장소로 알 수 없다.
- [ ] 개발자센터 → 내 개발정보 → **결제위젯 연동 키** 라이브 짝 `live_gck_…` / `live_gsk_…` 발급. API 개별연동 키(`ck_/sk_`)와 섞지 않는다.
- [ ] 라이브 상점 **결제위젯 설정**: 결제수단에서 **가상계좌 · 계좌이체 비활성화**(카드·간편결제만). 코드는 가상계좌를 승인 뒤 자동 취소한다(`supabase/migrations/0009_fix_virtual_account_check.sql` `VIRTUAL_ACCOUNT_NOT_SUPPORTED` · `packages/payments/src/checkout-rules.ts:158` · 약관 `packages/db/src/legal/terms.ts:205` "가상계좌·계좌이체는 지원하지 않는다"). 위젯 UI 변형 이름 2개(결제수단·약관)가 테스트 상점과 다르면 `PUBLIC_TOSS_WIDGET_VARIANT` · `packages/ui/src/site/checkout/PaymentWidget.svelte` `AGREEMENT_VARIANT_KEY` 확인.
- [ ] Vercel **Production** 환경변수 교체 — **스크립트로 한 번에**: 라이브 짝을 루트 `.env.cloud.local` 에 `TOSS_LIVE_WIDGET_CLIENT_KEY` · `TOSS_LIVE_WIDGET_SECRET_KEY` · `TOSS_LIVE_PAYOUT_SECRET_KEY` · `TOSS_LIVE_PAYOUT_SECURITY_KEY` 이름으로 적은 뒤 `node packages/db/scripts/toss-live-switch.mjs`(계획 · 값은 접두/길이만 출력) → `--apply`(Production 4 프로젝트 업서트 · Preview 는 테스트 짝 유지) → 적용 뒤 프로젝트별 접두 재조회. 되돌리기 `--rollback --apply`(`PUBLIC_TOSS_CLIENT_KEY` · `TOSS_SECRET_KEY` · `TOSS_PEER_SECRET_KEY` · `TOSS_PEER_PAYOUT_SECURITY_KEY` 의 테스트 값). 네 값이 전부 기대 형식(`live_gck_`/`live_gsk_`/`live_sk_`/64자 hex)이어야 한 건이라도 적는다. Vercel 토큰은 `vercel login` 이 만든 `%APPDATA%/com.vercel.cli/Data/auth.json`(deploy.md §8.1). 손으로 할 때의 표(값은 대시보드에만 · deploy.md §1.2):

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
- [ ] **토스 지급대행(0040 · deploy.md §5.3.1 · 2026-10-07 결정)** — D+21 지급을 이체 파일 대신 토스 API 로: ① ~~지급대행 계약·상점 결정~~ **결정(2026-10-08): A — MID `peerkeamf5`. 이 상점은 같은 회사의 다른 서비스와 함께 쓰므로 토스 지급대행 잔액이 공유 풀이다** → 코드 가드(0043 · `packages/payments/src/payout-rules.ts` `checkPayoutGuard`): 셀러리는 한 배치에서 (a) 토스 `availableAmount` 를 넘지 않고(잔액을 못 읽으면 `BALANCE_UNKNOWN` 으로 요청 안 함) (b) **셀러리 지급 대기 합계(requestable 행의 합 = 우리 몫)** 를 넘지 않고 (c) 하루(KST) 요청 합계가 `platform_settings.payout_daily_cap`(기본 ₩5,000,000 · `partner-admin.mjs payout-cap <원>`)을 넘지 않는다 — 하나라도 걸리면 **한 건도 보내지 않고** `payout_events` 에 `request.refused` 를 남긴다(`DAILY_CAP_EXCEEDED` 등). 관리자 `/admin/settle/payouts` 상단 줄 "토스 잔액 ₩X · 셀러리 지급 대기 ₩Y · 오늘 요청 ₩Z / 상한 ₩C" 로 확인. 첫 주는 상한을 낮게(예 ₩1,000,000) 두고 올린다. ② 그 상점의 **API 개별 연동 시크릿 키(`live_sk_`) + 보안 키(64자 hex)** → `.env.cloud.local` `TOSS_LIVE_PAYOUT_SECRET_KEY` · `TOSS_LIVE_PAYOUT_SECURITY_KEY` → `toss-live-switch.mjs --apply` 가 Vercel 4 프로젝트 `TOSS_PAYOUT_SECRET_KEY` · `TOSS_PAYOUT_SECURITY_KEY` 에(Production 라이브 · Preview 테스트) ③ 지급대행 상점 웹훅 `https://sellery.life/api/payouts/webhook`(`seller.changed` · `payout.changed`) + Firewall 레이트리밋 ④ 파트너 정산 정보 재저장(또는 `partner-admin.mjs toss-seller-sync`)으로 셀러 등록 — **개인 인플루언서의 본인인증 문자는 라이브 상점에서만 온다**(테스트 상점은 CORPORATE 만 KYC_REQUIRED 까지 · deploy.md §5.3.1) → 라이브 전환 뒤 첫 인플루언서가 `APPROVAL_REQUIRED` → 문자 인증 → `PARTIALLY_APPROVED` 가 되는지 본다 ⑤ `partner-admin.mjs payout-mode toss` ⑥ **지급 리허설(§8-13)**: 실결제 1건 → `settle-run --force` → `toss-payout-request --id` **₩1,000 × 2건**(브랜드 법인 계좌 1건 · 인플루언서 본인인증 완료 뒤 1건) → `payout.changed` `COMPLETED` 웹훅 → `/admin/settle/payouts` 지급 완료 · 실제 입금 확인 · `payout_events` 에 요청/웹훅 행. 켜기 전(`manual`)에는 아무것도 바뀌지 않는다.

---

## 2. 데이터 정리 — 시드 제거 (`supabase/seed.sql` · 클라우드 `sellery`)

시드 헤더가 스스로 "**개발·스테이징 전용 — 프로덕션에서는 절대 실행하지 않는다**(가짜 계좌·사업자번호·이메일)" 라고 적혀 있는데, 스테이징 프로젝트가 없어 클라우드에 들어가 있다(`.env.example` 주석 · deploy.md §6.1).

**지운다(전부 시드 §4~§15)**: `brands` b1 바인허브 · b2 글로헬스 / `sellers` s1~s8(`*@sellery.demo`) / `seller_channels` ch1~ch9 / `products` p1~p10 / `campaigns` c1~c13 + 검증용 c14·c15 / `orders` o100~o1151(c1 34 · c12 57 · c5 412 · c6 548 · 샘플 1) / `campaign_events` / `celery_ledger` / `data_views` / `exclusive_requests` / `product_views` / `seller_external_sales` / `referral_earnings` / `cs_conversations` · `cs_messages` cs1·cs2.
**남긴다(시드 §1~§3 = 정책 마스터)**: `platform_settings` · `grade_tiers` 7행 · `brand_grade_tiers` 7행 · `categories` 7행. 없으면 등급 계산·상품 등록이 깨진다.

- [x] **방식 결정(2026-10-08): (A) 스크립트로 행 삭제** — `node packages/db/scripts/purge-seed.mjs`(0043 `admin_purge_demo_data` · deploy.md §8.1). 기본이 **dry-run**(표별 삭제/잔존 건수 · 지워질 auth 계정(마스킹) · 스토리지 객체 · 시퀀스 계획)이고 `--confirm PURGE` 만 실행한다 — DB 는 **RPC 한 트랜잭션**(아래 순서 그대로) → auth 계정 `auth.admin.deleteUser` → `partner-docs` · `public-assets` 의 지워진 파트너 객체(best-effort) → 표별 잔존 count 후검사. **항상 남는 것**: `platform_settings`(`payout_mode` · `payout_daily_cap` 포함 — 값 불변) · `grade_tiers` · `brand_grade_tiers` · `categories` · 관리자(`profiles.role='admin'` — 단 `*@sellery.demo` · `*@sellery.test` 는 데모/개발 계정이라 관리자여도 삭제, `dev-admin@sellery.test` 포함). **기본은 관리자 외 전부 삭제**(비회원·카카오 고객 · 대표 테스트 계정 포함). 남기려면 `--keep-email a@b,c@d`(그 계정·파트너·고객과 밑에 달린 행 — 브랜드의 상품, 양쪽이 다 남는 캠페인, 그 주문·정산·🥬 원장) · `--keep-owner`(대표 실계정 3개 = `scripts/lib/purge-plan.mjs` `OWNER_EMAILS` · **대표 결정 대기 — §9-2**) · `--keep s104,b101,c107`(코드) · `--reset-seq`(빈 표의 코드 시퀀스만 처음값으로). 로컬 검증(2026-10-08 · `db reset` 시드 + dev 계정 4개): dry-run 25표 1,172행 · auth 3 → 실행 → 후검사 마스터 4표(29·7·7·7) + `profiles`/`auth.users` 관리자 1 만 남음 → 고객 홈 빈 상태 · `/admin/login` 정상 → `db reset` 복구. 한 쪽(인플루언서 또는 브랜드)이라도 지워지는 캠페인은 restrict FK 때문에 같이 지운다(아래 s101 × 시드 상품).
- [ ] (A) 삭제 순서(= 0043 `v_steps` · 스크립트가 그대로 실행) — `on delete restrict` FK(주문→캠페인, 캠페인→상품/인플루언서, 체크아웃 세션→캠페인)가 있어 **자식부터**, 한 트랜잭션:
  1. `payouts` → `settlements`(시드엔 없음 — 정산을 실행했다면 생김) · `partner_payments` · `payment_events` · `checkout_sessions`(시드 없음 · 테스트 결제로 생김)
  2. `orders`(캠페인 c1~c15 소속) → `cs_messages` → `cs_conversations`
  3. `campaign_events` → `campaigns` c1~c15
  4. `product_views` · `exclusive_requests` · `data_views` · `seller_external_sales` · `referral_earnings`
  5. `products` p1~p10 → `seller_channels` → `sellers` s1~s8 → `brands` b1·b2 (`celery_ledger` 는 소유자 cascade)
  6. `auth.users` 의 `dev-*@sellery.test` 4계정(§3) — `profiles` 는 cascade, `sellers.user_id`/`brands.user_id` 는 set null
  7. `sensitive_access_log` · `celery_purchases` 는 남겨도 무해(감사 기록) — 시드 관련 행만 확인
- [ ] **대표 실계정과 시드의 연결을 먼저 끊거나 결정**: s101 신쿤(`shingoonk@weglow.biz`) 의 캠페인 c105(DECLINED) · c106(CLEARING) 은 **시드 상품**에 걸려 있어 p1~p10 을 지우면 restrict 로 실패 → c105·c106 도 같이 지우거나 상품을 남긴다. `orangebear851011@gmail.com` 은 **시드 b2 글로헬스**에 연결 — b2 를 지우면 브랜드 계정이 빈다 → 실제 상호로 새로 가입하게 할지 결정(**확인 필요(대표)**). — 이 셋은 대표가 준 사실이며 저장소로는 확인 불가.
- [ ] 관리자 정산 큐: 시드 c1·c5·c12 는 CLEARING 이라 `/admin/settle` 에 D+21 도래분으로 뜬다 — **정리 전에 [정산 실행]을 누르지 않는다**(가짜 계좌로 payouts 가 생기고 `m3_sales_base` 이중 가산 · admin-console-plan.md §5.1).
- [ ] 시퀀스: `campaign_code_seq` 100~ · `order_code_seq` 2000~ · `cs_code_seq` 100~ · `seller_code_seq` 100~ · `seller_channel_code_seq` 100~ · `brand_code_seq` 100~ · `product_code_seq` 100~(0003 · 0004 · 0005 · 0010 · 0014 · 0015). 시드 코드(c1~c15 · o100~o1151)와 겹치지 않으므로 재시작은 선택 — `purge-seed.mjs --reset-seq` 는 **삭제 뒤 표가 빈 시퀀스만** 처음값으로 되돌린다(남는 행이 있으면 건너뜀 · 코드 유일성). 전부 지우는 기본 모드면 7개 모두 리셋돼 첫 실제 캠페인이 `c100` 부터.
- [x] ~~후속 작업: purge 스크립트~~ → `packages/db/scripts/purge-seed.mjs`(2026-10-08 · 0043). production 거부 없음(목적이 클라우드 정리) — 대신 로컬이 아니면 호스트를 보여주고 10초 카운트다운. **실행 전 Supabase 백업 확인**(Database → Backups · 되돌릴 수 없다).
- [ ] 정리 뒤 확인: `https://sellery.life/`(빈 홈 또는 실상품만) · `/influencers`(실인플루언서만) · `/admin/settle` 대기 0건 · `partner-admin.mjs list` · `brands` 에 실계약자만 · 스크립트 후검사 표에서 마스터 4표 외 0(남긴 것 제외).

---

## 3. 계정 · 권한 · 비밀

**회전 목록(2026-10-08 확정 · D-1 에 전부 — §10)**

| # | 비밀 | 왜 | 어디서 · 누가 |
|---|---|---|---|
| 1 | **카카오 Client Secret** | 채팅에 노출됨 | 카카오 개발자 콘솔 → 보안 → 재발급 → Supabase → Authentication → Providers → Kakao 교체(deploy.md §5.1 · §5.2). 재발급 직후 카카오 로그인 1회 확인 |
| 2 | **Resend API 키** | 옛 Vercel `sellery-app` 프로젝트에 넣었던 키가 노출됨 | Resend → API Keys 에서 **그 키가 이미 삭제됐는지 확인**(없으면 삭제) → 새 키(Sending access · `sellery.life`) 발급 → Vercel `sellery-shop` · `sellery-brand` · `sellery-admin` `RESEND_API_KEY` 교체 → 가입 메일 1통 확인(deploy.md §5.7) |
| 3 | **관리자 비밀번호** `official@weglow.biz` | 채팅에 노출됨 | Supabase → Authentication → Users → 재설정 · 서비스 이름 없는 랜덤 문자열 · 팀 금고. **담당: Soyunnlee** |
| 4 | **`RRN_ENC_KEY` 보관 위치** | 단일 사본(대표 PC `.env.cloud.local` + Vercel) | **Soyunnlee 에게 확인**: 금고에 있는지 · Production influencer/admin 두 값이 같은지(§6 첫 정산 `rrn.csv` 확인) |
| 5 | `CRON_SECRET` · `SLACK_WEBHOOK_URL` | 노출 여부 불명 | 노출됐으면 회전(shop 만 / Slack 재발급) — **확인 필요(개발)** |

- [ ] 위 표 1~4 완료 체크. Supabase secret key 는 이미 회전됨(2026-09-21 · deploy.md §1.1 표).
- [x] **개발 계정 삭제(런칭 전)**: `dev-somin@sellery.test`(s7) · `dev-brand@sellery.test`(b1) · `dev-admin@sellery.test`(admin) · `dev@sellery.test`(고객) — `purge-seed.mjs` 가 `*@sellery.test` · `*@sellery.demo` 계정을 관리자여도 지운다(§2). `dev-*.mjs` 는 production 거부라 재생성되지 않는다.
- [ ] 관리자 계정 목록 확정: 남길 admin 은 `official@weglow.biz` 1개(운영 결정 2026-09-21) — 개인별 계정으로 나눌지 **확인 필요(대표)**. 확인 쿼리: `select u.email, p.role from auth.users u join public.profiles p on p.id=u.id where p.role='admin'`.
- [ ] **`RRN_ENC_KEY` 백업** — 지금은 대표 PC 루트 `.env.cloud.local` + Vercel `sellery-influencer`/`sellery-admin` 에만 있다(단일 사본). 잃으면 저장된 주민등록번호 복구 불가(deploy.md §6.4-3). 비밀번호 관리 도구(팀 금고)에 보관하고 Production/Preview 값이 다른지 확인. **(2026-10-06: Production 양쪽을 새 키로 통일 — deploy.md §6.4 재발급 기록. 금고 보관 확인 필요)**
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

**현재 발신되는 것**: Supabase 인증 메일 3종(가입 확인 · 비밀번호 재설정 · 초대 — `docs/emails/*.html` · Resend `noreply@sellery.life`) · **거래 메일 6종(2026-09-22 — 주문 확인 고객+브랜드 · 배송 시작 · 환불 완료 · 문의 답변 · 새 문의/추가 문의 → 브랜드, 앱 서버가 Resend HTTP API 로 직접 · `docs/emails/README.md` "거래 메일" · deploy.md §5.7)** · 선택적 Slack 한 줄(`SLACK_WEBHOOK_URL` — 파트너 가입 · 채널 인증 확인 · 브랜드 가입/정지 · 샘플 환불 · 상품 검수, `packages/db/src/server/partner/slack.server.ts`). 정산 알림(브랜드·인플루언서)과 샘플 요청/승인/발송 알림(인플루언서)은 아직 없다. 알림톡·SMS 연동도 없다.

- [x] **방식 결정 — 대표 결정 2026-09-22: (b) 이메일** ("이메일 보내야지"). 구현 완료 — 남은 운영 작업:
  - [ ] Vercel `sellery-shop` · `sellery-brand`(필수) · `sellery-admin`(선택) Production 에 `RESEND_API_KEY`(Sending access · 도메인 `sellery.life`) — deploy.md §1.2 · §5.7. **없으면 조용히 비활성**이라 넣기 전까지는 알림이 나가지 않는다. Preview 는 비워 둔다.
  - [ ] 시드 `brands.email`(`*.example`)은 반송된다 — §2 시드 정리 때 실제 담당자 주소로.
  - [ ] **Resend 무료 플랜 한도**: 월 3,000통 · **하루 100통** · 도메인 1개(2026-10 기준 — Resend 요금 페이지에서 재확인). 거래 메일은 주문당 2통(고객+브랜드) + 발송 1 + 문의 왕복이라 **하루 주문 ~30건을 넘으면 메일이 끊긴다**(앱은 조용히 실패 · 재발송 큐 없음). 첫 캠페인 예상 주문이 하루 50건 이상이면 **Pro($20/월 · 5만 통)** 로 올린다. 발송량은 Resend → Emails 에서 매일(§6).
  - [x] **고객 화면 문구를 이 결정에 맞춤 (2026-10-08)** — 결정은 2026-09-22 였는데 화면은 계속 "카카오 알림톡으로 안내"라고 말하고 있었다. 고친 곳: 판매 페이지 배송 카드(`packages/ui/src/site/ShippingPolicyCard.svelte` — "운송장은 **내 주문**에서 확인, 이메일을 남기면 메일로도 안내") · `/about` 회원 혜택 카드 · `/cs/[code]` 주석(답변 메일이 실제로 가므로 "알림 없다"는 낡은 기술) · 데모 4곳(`views/Store.svelte` · `modals/{OrderDoneModal,CSModal}` · `core/actions.ts`).
  - [x] **오픈 알림을 이메일로 구현 (2026-10-08 · 0044)** — 문구만 있던 기능을 실제로 만들었다. `campaign_alerts` 테이블 + 신청/취소/수신거부 RPC + `campaignOpenMail` 템플릿 + 틱 발송 훅(`/api/cron/campaign-tick`).
    - **이메일이 등록된 회원만** 신청할 수 있다 — 비회원은 받지 않는다. 이메일을 새로 수집하지 않으므로 **개인정보 수집 항목이 늘지 않는다**(방침 §2 표 수정 불필요). 회원이 이미 제공한 주소를 쓰고, 신청 행위가 그 목적에 대한 동의다. 이메일은 저장하지 않고 발송 시점에 계정에서 읽는다(주소를 바꾸면 바뀐 곳으로, 탈퇴하면 cascade 로 신청도 사라진다).
    - 수신거부 2경로 — 메일 하단 1클릭(`/alerts/off?t=<토큰>` · 로그인 불필요 · 추측 불가 uuid) · 판매 페이지에서 신청 취소.
    - 발송 창은 **KST 8~22시**(`inAlertSendWindow`). 캠페인은 KST 00:05 에 LIVE 가 되지만 그때 보내면 새벽에 도착한다.
    - **발송량은 위 Resend 한도를 주문 메일과 함께 쓴다** — 신청자 1명당 캠페인 1건에 1통이고 오픈일 아침에 몰린다. 신청자가 많은 캠페인이면 그날 주문 메일을 밀어낼 수 있으니 첫 캠페인 전에 플랜을 확인한다.
    - [ ] **법률 검토 — 오픈 알림이 광고성 정보에 해당하는지**(정보통신망법 제50조: 명시적 사전 동의 · 제목 `(광고)` 표기 · 수신거부 수단). 거래 메일 6종은 거래 이행이라 해당 없지만 오픈 알림은 성격이 다르다. 수신거부 수단은 이미 넣었고 동의는 신청 행위로 받는다 — **남은 것은 제목 표기 여부**다. 검토 결과 광고성으로 보면 `campaignOpenMail` 의 subject 에 `(광고)` 를 붙이고 방침에 마케팅 수신동의 항목을 추가한다. **확인 필요(대표·법률)**
  - (a) 카카오 알림톡은 보류(발신 프로필 · 템플릿 심사 · 대행사 계약 필요). 비회원·카카오 회원은 이메일이 없을 수 있으므로(`privacy.ts:81` "이메일(있는 경우)") 메일은 보조 수단, 주문 조회 화면이 정본.
  - [x] **인플루언서 팔로우 — 메일 없이 구현 (2026-10-08 · 0045)** — `/about` "팔로우하면 다음 판매 일정이 홈에 먼저 표시" 가 구현 없이 적혀 있었다. `follows` 테이블 + `/influencers` 토글 + 홈 정렬 우대(★ 추천 다음 · 규칙은 **docs/period-policy.md §10-1**).
    - **메일을 보내지 않는다** — 셀러 단위 상시 동의는 건별 오픈 알림보다 광고성 정보 요건이 무거워 위 법률 검토 항목이 끝난 뒤에 따로 다룬다. 그래서 이 기능은 검토와 무관하게 병합할 수 있다.
    - 새 개인정보 수집 없음(`user_id` ↔ `seller_id`) — 방침 §2 표 수정 불필요.
    - [ ] **후속(검토 뒤)**: "팔로우한 셀러의 새 판매 오픈 메일" 을 붙일지. 붙인다면 발송 경로를 새로 만들지 않고 틱에서 팔로워를 `campaign_alerts` 행으로 펼치면 중복·수신거부·멱등이 0044 구조로 해결된다(`(campaign_id, user_id)` 유니크). 그때 **Resend 한도**(위 항목 · 하루 100통)를 함께 본다 — 팔로워 많은 셀러가 판매를 열면 한 번에 수십~수백 통이다.
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
- [ ] **첫 정산 직후 `rrn.csv` 를 1건 내려받아 주민번호가 복호되는지 확인한다.** `RRN_ENC_KEY` 는 인플루언서 앱이
  암호화하고 관리자 앱이 복호하는데 Vercel `Secret` 은 값을 읽을 수 없어 **두 값이 같은지 사전 확인이 불가능하다**
  (deploy.md §6.4 2026-10-06 재발급 기록). 불일치면 행에 `RRN_DECRYPT_FAILED` 가 뜨고, 그 인플루언서에게 재입력을
  요청하면 복구된다(번호는 본인 신분증에 있으므로 소실이 아니다). **위험은 인원수에 비례한다** — 1명일 때 발견하면
  비용이 거의 없고, 여러 명이 등록한 뒤 세무 신고 때 발견하면 전원 재입력이다. 그래서 **첫 건에서** 확인한다.
  (개인 `settle_type='personal'` 만 대상. 사업자는 `BIZ` 로 나오는 것이 정상)
- [ ] 장애 시 롤백: 코드 문제는 Vercel → 해당 프로젝트 → Deployments → 이전 배포 "Promote to Production"(deploy.md §3.6). DB 마이그레이션은 되돌리지 않는다(§6.1).

---

## 7. 데모 · 검색 노출

- [x] **`sellery-brand` Production 의 `PUBLIC_DEMO=1` 제거 — 완료(2026-10-08 확인)**. `/brand/demo` · `/brand/camps` `/dm` `/gallery` `/shop` `/c` `/s` 는 Production 404(`apps/brand/src/lib/demo.ts` `DEMO_PATHS`). 데모 시연은 Preview 에만.
- [x] `sellery-influencer`(`/influencer/demo` …) · `sellery-admin`(`/admin/demo` `/products` `/influencers` `/brands` `/match` `/revenue`) 도 `PUBLIC_DEMO` 없음 → 404 확인.
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
| 1 | ~~토스 라이브 심사 상태 · 전환일~~ **결정(2026-10-08): 전환일 2026-10-14 · 지급대행 MID A `peerkeamf5`(공유 잔액 → 가드 · `payout_daily_cap`)** | — | §1 · §10 |
| 2 | ~~시드 정리 방식~~ **결정: 스크립트 행 삭제(A · `purge-seed.mjs`)**. **남은 결정: 대표 테스트 계정(s104 강신욱 · b101 · b2 연결 · 카카오 고객 `chrisneeds@daum.net` · 비회원 고객)도 지울지** — 기본은 관리자 외 전부 삭제, 남기려면 `--keep-owner`(`OWNER_EMAILS`) 또는 `--keep-email` | 전부 삭제 후 실계정 재가입 | §2 |
| 3 | ~~알림 방식 — 알림톡 / 이메일 / 없음~~ **결정(2026-09-22): 이메일(Resend)** — 남은 것은 `RESEND_API_KEY` 투입 | — | §5 |
| 4 | 세무사 위탁 여부(원천징수·지급명세서) → 방침 개정 | 회사가 직접 신고(방침 그대로) | §4 |
| 5 | "에스크로" 문구 유지 vs 수정 vs 실제 예치 서비스 | 법률 검토 전까지 문구 수정 보류 | §4 |
| 6 | 첫 판매 시점 · 첫 브랜드/인플루언서(파일럿) | — | §8 |
| 7 | 비회원 주문 PII 보관 — 30일 파기(`purge_checkout_pii` 기본값)가 CS·환불 기간(청약철회 7일 + D+21)과 맞는지 | 30일 | §6 |
| 8 | 관리자 계정 — 공용 1개 vs 개인별 | 공용 1개(`official@weglow.biz`) | §3 |
| 9 | Supabase PITR 애드온 · 자동 정산 크론 켜는 시점 | PITR 미사용 · 수동 정산 | §6 |
| 10 | 데모 화면 — Preview 에만 vs 완전 삭제 | Production `PUBLIC_DEMO` 제거, 코드는 유지 | §7 |
| 11 | 기본 OG 이미지 · sitemap | 없음(후속) | §7 |

**저장소로 확인 못 한 것(이 문서의 가정)**: Vercel 각 프로젝트의 현재 env 값 종류(테스트/라이브) · 토스 심사 상태 · Vercel Firewall 규칙 · Supabase 플랜/백업 설정 · 각 대시보드 2FA · 클라우드 Auth 의 dev-* 계정과 대표 실계정 · c105/c106/b2 연결 — 전부 대표가 준 사실(2026-09-22)이며 실행 전 대시보드에서 다시 본다.

---

## 10. D-1 / D-day 런북 (전환일 2026-10-14 · 작성 2026-10-08)

전부 **저장소 루트**(대표 PC · `.env.cloud.local` 이 있는 곳)에서. 명령은 위에서 아래 순서 그대로, 한 단계의 기대 결과가 안 나오면 멈춘다. 값은 어디에도 붙여 넣지 않는다. `main` 이 최신인지 먼저(`git pull`). `node --env-file=.env.cloud.local …` 는 그 명령만 클라우드를 보게 한다(루트 `.env.local` 은 로컬 Supabase).

### D-1 — 2026-10-13(월) · 데이터 · 비밀 · 상한

```bash
# 0) 전제 — 마이그레이션 0043 이 클라우드에 있는지(없으면 push) · 백업 확인(Supabase → Database → Backups 에 오늘 날짜)
npx supabase migration list --linked                      # 0043_purge_demo_data 가 Remote 열에 보여야 한다
npx supabase db push --linked                             # 없을 때만

# 1) 시드·데모·개발 데이터 정리 — dry-run 을 먼저 읽는다(표별 삭제/잔존 · auth 계정(마스킹) · 스토리지 · 시퀀스)
node --env-file=.env.cloud.local packages/db/scripts/purge-seed.mjs
#    대표 테스트 계정을 남기기로 했으면(§9-2) --keep-owner 또는 --keep-email a@b,c@d 를 같이. 기본은 관리자 외 전부 삭제.
node --env-file=.env.cloud.local packages/db/scripts/purge-seed.mjs --confirm PURGE --reset-seq      # 10초 카운트다운 뒤 실행 → 후검사 표
#    기대: 후검사에 platform_settings 29 · grade_tiers 7 · brand_grade_tiers 7 · categories 7 · profiles/auth.users = 관리자(+남긴 계정) · 나머지 0
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs list         # 비어 있거나 남긴 인플루언서만
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs brands       # 비어 있거나 남긴 브랜드만
#    브라우저: https://sellery.life/ 빈 홈 · /influencers 빈 목록 · /admin/settle 대기 0

# 2) 지급 하루 상한 — 첫 주는 낮게(공유 잔액 보호 · §1). payout_mode 는 아직 manual 그대로.
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs payout-cap 1000000
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs payout-mode  # → manual (D-day 리허설 뒤에 toss)

# 3) 비밀 회전(§3 표 1~4) — 대시보드 작업, 순서 무관
#    카카오 Client Secret 재발급 → Supabase Kakao provider 교체 → 카카오 로그인 1회
#    Resend: 노출된 sellery-app 키 삭제 확인 → 새 키 → Vercel shop·brand·admin RESEND_API_KEY → 가입 메일 1통
#    관리자 비밀번호(Soyunnlee) · RRN_ENC_KEY 보관 위치 확인(Soyunnlee)

# 4) 라이브 키 준비 — 토스 개발자센터에서 발급한 라이브 짝을 .env.cloud.local 에 이 이름으로 적는다(값은 파일에만)
#    TOSS_LIVE_WIDGET_CLIENT_KEY=live_gck_…  TOSS_LIVE_WIDGET_SECRET_KEY=live_gsk_…  TOSS_LIVE_PAYOUT_SECRET_KEY=live_sk_…  TOSS_LIVE_PAYOUT_SECURITY_KEY=<64자 hex>
node packages/db/scripts/toss-live-switch.mjs             # 계획만 — 14건 · 접두가 live_ 로 보이면 OK · Vercel 현재값은 test_ 여야 한다
```

### D-day — 2026-10-14(화) 오전 · 키 전환 · 리허설 · 지급대행 켜기

```bash
# 1) 라이브 키 → Vercel Production 4 프로젝트 (Preview 는 그대로 테스트 짝)
node packages/db/scripts/toss-live-switch.mjs --apply     # 적용 후 프로젝트별 접두 표가 live_ 로
#    PUBLIC_TOSS_CLIENT_KEY 는 빌드 시 인라인 → shop · influencer 재배포(deploy.md §8.3: commandForIgnoringBuildStep 잠시 비움 → Redeploy → 복구) · brand · admin 은 Redeploy
curl -s https://sellery.life/api/health                   # {"ok":true,"checks":{"supabaseAdmin":"ok","toss":"ok"}}

# 2) 웹훅 — 토스 개발자센터(라이브 상점 둘 다)
#    결제: https://sellery.life/api/payments/webhook  PAYMENT_STATUS_CHANGED  · 지급대행(peerkeamf5): https://sellery.life/api/payouts/webhook  seller.changed · payout.changed
#    "웹훅 테스트 전송" → 200 · payment_events / payout_events 1행

# 3) 실결제 리허설(§8-13) — 실카드 소액 1건
#    고객 브라우저: https://sellery.life/s/<핸들>/<코드> → 결제 → /brand/orders PAID → (환불 테스트는 별도 1건) → /admin/payments 이상 0
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs payments-health

# 4) 지급 리허설 — 파트너 2명이 /settle 에서 정산 정보 저장(토스 셀러 등록) · 인플루언서는 본인인증 문자(라이브에서만 온다) 완료
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs toss-queue    # 셀러 상태 PARTIALLY_APPROVED/APPROVED · requestable Y
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs payout-mode toss
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs toss-balance   # 토스 잔액 · 셀러리 지급 대기 · 오늘 요청/상한 한 줄
#    리허설 캠페인 정산(settle-run <c> --force) 뒤 payouts 2건(브랜드 법인 · 인플루언서)을 ₩1,000 으로 — 금액은 리허설 정산건 그대로 쓰거나 관리자 화면에서 해당 건만 체크
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs toss-payout-request --id <payout id 브랜드>
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs toss-payout-request --id <payout id 인플루언서>
#    가드 줄이 먼저 찍힌다(이번 · 대기 · 잔액 · 오늘/상한). 거절(DAILY_CAP_EXCEEDED · BALANCE_*)이면 payout_events request.refused — 상한/잔액 확인 뒤 재시도
#    → payout.changed COMPLETED 웹훅 → /admin/settle/payouts 지급 완료 · 실제 입금 확인(브랜드 통장 · 인플루언서 통장)
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs toss-payout-refresh <payout id>   # 웹훅이 안 왔을 때만

# 5) 마무리
node --env-file=.env.cloud.local packages/db/scripts/partner-admin.mjs payout-cap     # 첫 주 상한 확인(₩1,000,000) — 실적에 맞춰 올린다
#    리허설 주문은 토스 콘솔 전액 취소 또는 실계약이면 유지(§8-12) · 운영 루틴(§6) 시작
```

**되돌리기**: 키는 `node packages/db/scripts/toss-live-switch.mjs --rollback --apply` + 재배포(테스트 짝으로) · 지급대행은 `payout-mode manual`(이체 파일로) · 코드는 Vercel 이전 배포 Promote(deploy.md §3.6). DB 삭제는 되돌릴 수 없다(백업 복원뿐).
