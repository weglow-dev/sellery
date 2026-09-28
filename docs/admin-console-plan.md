# 관리자 콘솔 구현 계획 — `apps/admin` 데모 → 실서비스 (sellery.life/admin/*)

> **상태(2026-09-28): 관리자 콘솔 실서비스 전환 완료 — 담당자 1명.** 탭 5개가 모두 열렸다: 홈 · 인플루언서 · 브랜드 · 상품 · 정산.
> `/admin/*` 는 더 이상 localStorage 데모가 아니다(남은 데모 화면은 `(demo)` 그룹 — dev 또는 `PUBLIC_DEMO=1` 에서만).
>
> 이 문서는 두 절로 나뉜다. **"정산 · 돈"**(§정산·돈) 은 돈이 움직이는 쪽 — 정산 실행 · 지급 처리 · 이체 파일 · 원천징수 자료 ·
> 주문/환불/결제 정합성/문의 열람(마이그레이션 0020 · 0021). **"파트너 관리"**(§파트너 관리) 는 파트너·상품·캠페인 쪽 —
> 셸 · 인증 · 인플루언서/브랜드 목록 · 정지/복구 · 채널 인증 큐 · 상품 검수 · 홈 대시보드 · 캠페인 상세 · 매칭·자동 제안(**마이그레이션 0건**) ·
> 매출·순수익(**0022** — 손익 집계 · 운영비 저장).
>
> 2026-09-22~27 에는 두 작업자가 나눠 만들었고 서로의 파일을 고치지 않는 규칙이 있었다. **그 분담은 끝났다** —
> 담당이 1명이 된 뒤 홈(`(console)/home/+page.*`)에 양쪽 카드를 한 PR 에 올렸다(#63). 아래 파일 표는 소유자 구분이 아니라
> **어디에 무엇이 있는지** 찾는 용도로 남긴다.
>
> **4 앱이 같이 쓰는 공용 파일**(append-only · 고칠 때 영향 범위를 확인한다):
> `packages/db/src/server/admin.server.ts`(`createAdminClient` · `createAnonClient` — 관리자 게이트가 아니라 service role 클라이언트 팩토리) ·
> `packages/db/package.json` exports · `apps/admin/src/routes/(console)/+layout.*`(셸 적용 지점) · `packages/ui/css/site.css`.
>
> 근거: 브랜드 콘솔 계획서 골격(`docs/brand-console-plan.md`) · `docs/settlement-policy.md` §3 · §5 · §7 · §8 · §9 · §11.4 · `docs/data-model.md` §4 · §5.2 · `docs/points-policy.md` ·
> `docs/inf-console-plan.md` §5.9 · `packages/core/src/{helpers,actions}.ts` `calc` · `runSettle` · `runSettleAll` · 0004 · 0005 · 0013 · 0018 · 0019.

---

## 정산 · 돈 (PR-A 서버 계층 2026-09-22 · PR-B 화면 2026-09-22 — §6)

### 0. 결정 요약

| # | 결정 | 이유 |
|---|---|---|
| M1 | 정산 실행은 **DB 함수 한 개 = 한 트랜잭션**(`app_admin_settle_run`) — 스냅샷 · 지급 2행 · 캠페인 SETTLED · 🥬 · 추천 보상 · 등급 재계산 · 스레드 메시지를 한 번에. SETTLED 면 `already` | 데모 `runSettle` 이 하던 일을 그대로(settlement-policy §8.2) · settlements 유니크가 이중 실행의 마지막 방어선 |
| M2 | 숫자는 0013 `app_seller_settlements` · 0019 `app_brand_settlements` 의 "pending" 행과 **같은 식 · 같은 반올림**(라인 독립 half-up) — 정산 뒤 두 파트너 콘솔이 `kind:'settled'` 로 같은 값을 본다 | 스모크: c5 인플루언서 실수령 2,493,188 · 브랜드 정산액 9,334,661 이 세 함수에서 동일. 저장값끼리의 ±1원(예: 0019 `platform_pg` 1,507,296 vs 계산 1,507,297)은 0004 반올림 계약 |
| M3 | 기준일(D+21) 도래 CLEARING 만 실행 · `p_force` 는 운영 예외(스냅샷 memo '기준일 전 강제 실행'). 일괄은 `app_admin_settle_run_due`(크론 후보) | §8.1 "정산 실행에 한해서는 관리자가 버튼으로" — 자동 실행은 아직 켜지 않는다 |
| M4 | 지급 보류 = 계좌 미등록(`BANK_MISSING`) + **개인인데 주민번호 미등록(`RRN_MISSING`)** + 사업자인데 사업자번호/세금계산서 정보 없음(`TAX_INFO_MISSING`) · 브랜드는 정산 정보 4개 미완비(`SETTLE_INFO_INCOMPLETE`). 보류여도 정산은 기록되고(SETTLED) 지급만 `held` | 데모는 계좌만(§8.3) — 원천징수 의무자로서 주민번호 없이는 지급명세서를 낼 수 없다(inf §5.9). `payouts.hold_code`(코드) + `hold_reason`(문구 — 파트너 콘솔이 그대로 노출) |
| M5 | 보류 해제(`app_admin_payout_release`)는 완비를 **다시 검사**(미완비면 `STILL_INCOMPLETE`) · 지급 완료(`app_admin_payout_mark_paid`)는 pending 만 · 양측 paid 면 정산 paid | "정보 등록하면 다음 배치" 를 코드로 |
| M6 | `payouts.bank_snapshot` 은 **마스킹**. 이체 파일(`app_admin_payout_export`)만 원문을 읽고 **건마다 `sensitive_access_log(field 'bank_info')`** 를 남긴다 · 콘솔 페이지 데이터에 원문을 싣지 않는다(CSV 다운로드 응답 전용 · `Cache-Control: no-store`) | 0013 결정(계좌 평문 jsonb · 콘솔 마스킹 · 열람 로그) 연장 |
| M7 | 🥬 획득 = 원장 `earned` 행 합이 `floor(기준액/500만)` 이 되도록 **차분만** 적재(회수 없음). 기준액: 인플루언서 `m3_sales_base + Σ settlements.net(전 기간)` · 브랜드 `brand_gmv()` | 0005 헤더 "획득분도 원장" · points-policy §열린 결정 1(누적 기준 채택 — 잔액 음수 방지) |
| M8 | 인플루언서 등급 = **롤링 3개월**: `m3_sales = m3_sales_base(이관 시점 값 · 감소 없음) + Σ settlements.net(settled_at ≥ 오늘 − 3개월)` → 0001 트리거가 `grade` 갱신(`app_seller_grade_recalc`) | data-model §9.1-6 결정. 시드 base 는 정산 스냅샷이 없어 창으로 못 옮긴다 — 시드 캠페인(c5)이 정산되면 그 net 이 base 위에 **더해진다**(데모의 "시드 id<100 제외" 는 재현하지 않음 · 시드 한정 이슈) |
| M9 | 관리자 환불 = 발송 후 제한 없음 · SETTLED 도 허용(0008 `adjust`: 주문 CANCELED + `refund_needs_adjust`, 스냅샷 불변) · 샘플 주문 거부 · 결제키 없는 주문은 `recordOnly`(토스 없이 기록) | 0008 헤더의 조정 큐 설계 그대로. SQL 추가 없음 |
| M10 | 고객 문의는 **열람만**(`app_admin_cs_list/thread`) · 주문도 열람 + 환불만 | CLAUDE.md "관리자는 열람만" |
| M11 | 부분취소(PAID · `refund_amount>0`)는 정산 `refunds` 에 차감한다 — 0013/0019 의 pending 예상액과 그 경우에만 다를 수 있다(운영 규칙상 발생하지 않음) | 0008 헤더 "정산 calc 이관 슬라이스에서 refund_amount 차감" |

### 1. 파일 배치 (이 절이 만든 것)

```
supabase/migrations/0020_admin_settlement.sql        NEW  아래 §2 계약 전부 · 헤더에 규칙→코어 대응표
packages/db/src/admin/settle-rules.ts                NEW  순수 — calcSettlement(calc() 전체) · sellerHoldReason/brandHoldReason · 파서 · payoutCsv/rrnCsv(BOM+CRLF) · 문구
packages/db/src/server/admin/settle.server.ts        NEW  previewSettlement · runSettlement · runDueSettlements · listAdminSettlements · markPayoutPaid · holdPayout · releasePayout · exportPayouts · exportRrn · recalcSellerGrade/BrandGrade
packages/db/src/server/admin/orders.server.ts        NEW  listAdminOrders · getAdminOrder · orderIdOf
packages/db/src/server/admin/payments.server.ts      NEW  getPaymentsHealth · paymentsHealthIssues
packages/db/src/server/admin/cs.server.ts            NEW  listAdminCs · getAdminCsThread
packages/payments/src/server/admin-refund.server.ts  NEW  refundOrderAsAdmin (brand-refund 의 관리자 판)
packages/db/src/test/admin-settle-rules.test.ts      NEW  c1 · c5 · 제안서 §12 핀 · 보류 매트릭스 · CSV
packages/db/package.json                             EDIT exports "./admin/*" · "./server/admin/*"
apps/admin/package.json                              EDIT dependency @sellery/payments
apps/admin/src/lib/server/money.ts                   NEW  배럴(위 전부) + TOSS_SECRET_KEY · RRN_ENC_KEY 주입 — `./db`(다른 작업자) 와 별개
packages/db/scripts/partner-admin.mjs                EDIT settle-preview · settle-run · settle-due · settlements · payouts · payouts-export · payout-paid · payout-hold · payout-release · payments-health · admin-orders
```

PR-B 가 만드는 화면(이 절의 몫): `apps/admin/src/routes/(console)/settle`(대기 큐 · [정산 실행] · [도래분 일괄] · 완료 표 · 지급 [완료]/[보류]/[해제] · [이체 파일 CSV] · [지급명세서 CSV]) ·
`orders`(전 브랜드 표 · 필터 · 검색 · 상세 · [환불] · [조정 큐로 기록]) · `payments`(정합성 카드 · 운영 큐) · `cs`(열람) · 홈 카드 "정산 기준일 도래 n건 · 지급 보류 n건 · 미처리 결제 이벤트 n건".
탭은 `packages/ui/src/site/console/PartnerShell.svelte` `TABS.admin` 의 한 줄씩이다(5개 전부 활성 — PR #49 #55 #58 #59 #60).

### 2. 계약 (0020 — 전부 security definer · service_role · `{ok, code}`)

| 함수 | 반환 · 코드 | TS |
|---|---|---|
| `app_admin_settle_preview(p_campaign_id)` | LIVE·CLEARING → `source:'live'` calc() 전 라인(settlements 컬럼명) + `holds{seller,brand:{code,label}}` + `due_on` · `eligible` · `reason(NOT_DUE\|WRONG_STATUS)` · SETTLED → `source:'snapshot'`(+ `settlement` · `payouts`) · 스냅샷 없음 → `source:'none' reason NO_SNAPSHOT` · 그 외 상태 `WRONG_STATUS{status}` · `NOT_FOUND` | `previewSettlement(ref)` → `SettlePreview` |
| `app_admin_settle_run(p_campaign_id, p_actor_user_id, p_force)` | `{ok, already:false, settlement_id, net, seller_fee_total, seller_wht, seller_payout, brand_payout, platform_fee, platform_net, holds, payouts{seller,brand}, celery{sample_refund_cel,cash,seller_earned,brand_earned}, referral{seller_reward,brand_reward}, grades{seller,brand}, forced}` · `already:true` · `NOT_FOUND` · `WRONG_STATUS{status}` · `NOT_DUE{due_on,today}` | `runSettlement(ref, {actorUserId, force})` → `SettleRunResult` · `settleRunSummary()` |
| `app_admin_settle_run_due(p_actor_user_id)` | `{today, count, settled, failed, results[]}` | `runDueSettlements()` |
| `app_admin_settlements(p_status, p_limit)` | `{today, queue[CLEARING live 요약], rows[스냅샷 전체], counts{due_now, clearing, pending, held, paid, payouts_pending, payouts_held, payouts_pending_amount}}` · `BAD_STATUS` | `listAdminSettlements(status, limit)` |
| `app_admin_payout_mark_paid(p_payout_id, p_actor_user_id, p_memo)` | `{already, payout, settlement_status}` · `HELD{hold_code}` · `NOT_FOUND` · 이벤트 `payout_paid` | `markPayoutPaid(id, {actorUserId, memo})` |
| `app_admin_payout_hold(p_payout_id, p_reason)` / `app_admin_payout_release(p_payout_id)` | held ↔ pending · `ALREADY_PAID` · release 는 `STILL_INCOMPLETE{hold_code,label}` · 해제 시 bank_snapshot 갱신 | `holdPayout` · `releasePayout` |
| `app_admin_payout_export(p_status, p_actor, p_purpose)` | 계좌 **원문** 행 + `logged` · `ACTOR_REQUIRED` · `BAD_STATUS` | `exportPayouts(status, {actor, purpose})` → `payoutCsv(rows)` |
| `app_admin_rrn_export(p_settlement_ids[], p_actor, p_key, p_purpose)` | 정산건별 주민번호(개인만 · 0013 복호 · 행별 `code BIZ\|NO_RRN\|RRN_DECRYPT_FAILED`) · `RRN_KEY_MISSING` | `exportRrn(ids, {actor, purpose})` → `rrnCsv(rows)` — `RRN_ENC_KEY` 없으면 DB 를 부르지 않는다 |
| `app_seller_grade_recalc(p_seller_id)` | `{previous_grade, grade, previous_m3_sales, m3_sales, changed}` | `recalcSellerGrade` (브랜드는 0019 `app_brand_grade_recalc`) |
| `app_admin_orders(p_filter, p_q, p_limit)` | `filter all\|paid\|unshipped\|shipped\|refunded\|sample\|manual\|partial` · `q` 주문번호/구매자/캠페인 코드/상품/핸들/브랜드/paymentKey · rows = 0018 `brand_order_json` + `brand` · `has_payment_key` · totals | `listAdminOrders(filter, q, limit)` |
| `app_admin_order(p_order_id)` | `{order, session(checkout_sessions 요약), payment_events[20], campaign_events[이 주문 20], cs[]}` | `getAdminOrder(ref)` |
| `app_admin_payments_health()` | `checkout_sessions{pending, confirming, stale_confirming, expired_due, cancel_pending, confirmed_24h}` · `payment_events{unhandled, unhandled_oldest, last_received_at, errors_7d}` · `partner_payments{…}` · `orders{paid_without_key, partial_refund, canceled_adjust, refund_needs_adjust, refund_after_ship}` · `settlements{…, due_now}` · `reconcile{last_at, last_result}` | `getPaymentsHealth()` · `paymentsHealthIssues()` |
| `app_admin_cs_list(p_status, p_limit)` · `app_admin_cs_thread(p_conversation_id)` | 0018 `cs_conversation_json` / `cs_thread_json` (전 브랜드) | `listAdminCs` · `getAdminCsThread` |
| (SQL 없음) 관리자 환불 | 0008 `app_refund_precheck(order,'admin')` → 토스 취소 → `app_refund_record(actor 'admin')` — SETTLED 는 `adjust` · `recordOnly` | `refundOrderAsAdmin(ref, reason, {allowSettled, recordOnly, actorUserId})` |

헬퍼: `seller_confirmed_sales(seller, since)` · `admin_payout_hold_reason(type, seller, brand)` · `admin_hold_label(code)` · `admin_bank_snapshot(jsonb)` · `admin_settlement_json(st)` · `admin_payout_json(po)` · `admin_settlement_sync_status(id)` · `admin_order_json(o)`.
열: `sellers.m3_sales_base`(백필 = 0020 이전 `m3_sales`) · `payouts.hold_code` · `sensitive_access_log.brand_id`.

### 3. 규칙 → 구현 대응 (요약 — 전체는 0020 헤더 표)

| 규칙 | 코어 | 0020 |
|---|---|---|
| net · sample_net · pg · sf · gBonus · boost/refReward(첫 5회) · bBoost/bReward(첫 3회) · bDisc(실시간 브랜드 등급) · pfGross · costs · pf · vat · pfNet · sfTotal · brandPay | `calc()` | `app_admin_settle_preview` → `settlements` 스냅샷(라인 독립 round) |
| 원천징수 biz 0 / 그 외 3.3% · 실수령 + 샘플 환급 현금 | `sellerWht` · `runSettle refundCash` | `wht_rate` · `seller_payout` · `sample_refund_*` · 원장 `sample_refund` |
| D+21 · 도래분만 · 일괄 | `settleDue` · `runSettleAll` | `due_on` · `NOT_DUE` · `app_admin_settle_run_due` |
| 보류(계좌) + 주민번호/세금계산서 · 브랜드 4개 | `holdS/holdB` + inf §5.9 · 0019 `brand_settle_info_complete` | `admin_payout_hold_reason` → `payouts.status/hold_code/hold_reason` · `settlements.hold_*` |
| 🥬 획득 차분 · 등급 롤링 3개월 · 브랜드 등급 캐시 | `celEarned` · `gradeOf` · `bgradeOf` | 원장 `earned` · `app_seller_grade_recalc` · `app_brand_grade_recalc` |
| 추천 보상 기록 + 메시지 · 정산 완료/보류/환급 메시지 | `runSettle pushSys` | `referral_earnings(settlement_id)` · `campaign_events(settled · payout_held · ref_reward · brand_ref_reward · sample_refunded · payout_paid)` |

### 4. 적용 · 스모크 기록 (2026-09-22 · 클라우드 `sellery` · 전부 롤백)

- `db push --linked` 0020 적용 · `gen:types` 갱신(`app_admin_*` 14개 · `m3_sales_base` · `hold_code`).
- 미리보기 c1: sfTotal 276,276 · wht 9,117 · 실수령 267,159 · brandPay 902,502 · pg 24,996 · pf 111,826 · vat 10,166 · pfNet 101,660 = `calcSellerShare`/`calcBrandPay`/`calcSettlement` 핀과 동일. c12: `BANK_MISSING`. c6: `source none · NO_SNAPSHOT`.
- c5(CLEARING · 종료 2026-09-02 · 기준일 09-23): `settle_run(force=false)` → `NOT_DUE{due_on 09-23, today 09-22}` · `force=true` → net 13,221,900 · 인플 세전 2,578,271 − 원천징수 85,083 = **2,493,188**(held `RRN_MISSING`) · 브랜드 **9,334,661**(pending) · 플랫폼 793,314 / 순수익 721,195 · 🥬 earned +3(s3 기준액 26,443,800 → 5 − 기존 2) · 추천 보상 264,438(→ s1) · s3 실버 → **골드**(m3 26,443,800) · b1 골드 유지 · 이벤트 ref_reward · payout_held · settled · 다시 실행 → `already`.
- `app_seller_settlements(s3)` · `app_brand_settlements(b1)` 의 c5 행이 `kind settled` 로 같은 금액(2,493,188 / 9,334,661 · platform_pg 1,507,296 = 저장값 조립).
- 지급: held 인플 → mark_paid `HELD` · release `STILL_INCOMPLETE(RRN_MISSING)` · 브랜드 mark_paid → 정산 `held` 유지 · 주민번호 등록 후 release → pending → paid → 정산 **paid**(paid_at) · paid 건 hold → `ALREADY_PAID`.
- 이체 파일 `export('all')` 2행 · `sensitive_access_log` +2 · actor 없이 `ACTOR_REQUIRED` · `rrn_export` 행 `NO_RRN`(복호 로그 남음) · `run_due` 0건 · `settlements` queue 2(c1 · c12) · health/orders/cs/order 상세 응답 정상 · c6 `run` → `already`, 스냅샷 0.

### 5. 열린 결정

1. 시드 파트너의 `m3_sales_base` 는 시드 캠페인 net 을 이미 포함한 값이라 시드 캠페인(c5 등)이 정산되면 **이중 가산**된다(M8). 실계약자에게는 base=0 이라 영향 없음 — 시드 정리 때 `m3_sales_base` 를 손으로 낮추거나 무시.
2. 🥬 획득 기준액을 "누적"으로 바꿨다(M7). points-policy 의 "3개월 이동창 파생" 설명은 문서 갱신 대상.
3. `bank_snapshot` 마스킹(M6) — 이체 시점 계좌가 정산 시점과 다르면 최신 계좌로 보낸다. "정산 시점 계좌로 고정" 이 필요하면 원문 스냅샷 + 암호화가 함께 와야 한다.
4. 자동 정산(크론)은 `app_admin_settle_run_due` 로 준비만 — 켜는 시점·Slack 알림은 운영 결정.
5. 브랜드 `brand_payout` 이 음수가 되는 요율 조합은 `payouts.amount ≥ 0` 제약 때문에 0 으로 저장된다(스냅샷 `brand_payout` 은 음수 그대로) — 실제로는 요율 상한(총 요율 ≤ 100%) 이 막는다.
6. `sellers.m3_sales` 를 갱신하는 다른 경로가 생기면(운영 스크립트) `app_seller_grade_recalc` 를 거쳐야 base 와 어긋나지 않는다.

### 6. PR-B 화면 (2026-09-22 적용) — `apps/admin/src/routes/(console)/(money)/*`

전부 `requireAdmin()` 뒤 `$lib/server/money.ts` 배럴만 호출한다. 셸(`(console)/+layout.svelte` · 다른 작업자)은 손대지 않았다 — 아직 탭 배열이 없어서 돈 화면만의 내비를 `$lib/money-nav.ts`(정산 · 지급 · 주문 · 결제 · 문의) + `(money)/+layout.svelte`(상단 바 + 칩) 로 그린다. 셸에 탭이 생기면 그 표를 한 줄로 옮긴다. 스타일은 `packages/ui/css/site.css` "관리자 정산" 블록(`.admin-*` · 공용 표 `.admin-table` 은 640px 아래 카드 모드 · 375px 가로 스크롤 없음).

| 화면 | 하는 일 | 서버 |
|---|---|---|
| `/settle` | 상단 띠(기준일 도래 · 지급 보류 · 미지급 합계 · 명세 건수) · [도래분 일괄 실행] `?/runDue`(confirm · 건별 `settleRunSummary` 를 ActionData 로) · 대기 큐(CLEARING 실시간 예상 · `dueLabel` · 보류 예고 · [미리보기]) · 정산 명세 표 `?status=pending\|held\|paid` | `listAdminSettlements` · `runDueSettlements` |
| `/settle/[code]` | calc() 전 라인 명세표(매출 → 취소/환불 → 순매출 → PG → 인플루언서 수수료(+보너스·부스트) → 플랫폼 수수료 총액 → 플랫폼 부담 → 수익/부가세/순수익 → 브랜드 지급 → 원천징수 → 인플루언서 지급 → 샘플 환급) · 보류 예고 · [정산 실행] `?/run`(기준일 전은 `force` 체크 + confirm · 결과 ActionData) · 실행 뒤 지급 카드 2장(마스킹 계좌 · [지급 완료] 메모 `?/paid` · [보류] 사유 `?/hold` · [보류 해제] `?/release`) · 이벤트(`listSettleEvents` — ended · settled · payout_held · payout_paid · ref_reward · brand_ref_reward · sample_refunded · refunded · refund_needs_adjust) | `previewSettlement` · `runSettlement` · `markPayoutPaid` · `holdPayout` · `releasePayout` · `listSettleEvents`(PR-B 에서 settle.server.ts 에 추가) |
| `/settle/payouts` | 스냅샷 행을 지급 건으로 펼쳐 `?status=pending(기본)\|held\|paid\|all` · 행별 완료/보류/해제 · [이체 파일 CSV] `GET /settle/payouts/export.csv?status=&purpose=`(purpose 필수 · 계좌 원문 · `Cache-Control: no-store` · 건마다 `sensitive_access_log`) · [원천징수 자료 CSV] `GET /settle/rrn.csv?ids=&purpose=`(표에서 인플루언서 건 체크 · `RRN_ENC_KEY` 없으면 400 문구) | `listAdminSettlements` · `exportPayouts` → `payoutCsv` · `exportRrn` → `rrnCsv` |
| `/orders` · `/orders/[code]` | 검색 `?q=` · 필터 `?f=`(ADMIN_ORDER_FILTERS) · 합계 띠 · 표 → 상세(주문 kv · 수취인 원문 · 토스 세션 · payment_events · campaign_events · 문의) · [환불] `?/refund`(REFUND_REASONS + 메모 · confirm · SETTLED 면 "정산 조정으로 기록" 안내 · 결제키 없는 시드·수기 주문은 폼 대신 안내, 액션도 `NO_PAYMENT_KEY` 문구 · `recordOnly` 는 콘솔에 없음) | `listAdminOrders` · `getAdminOrder` · `refundOrderAsAdmin` |
| `/payments` | 운영 큐 카드(`paymentsHealthIssues` · 0 이 아닌 것만 · 처리 자리 링크) + 영역별 카운트(세션 · 이벤트 · 샘플 결제 · 주문 · 정산) · 마지막 reconcile · 크론 실행법(deploy §8.2) — 버튼 없음 | `getPaymentsHealth` |
| `/cs` · `/cs/[code]` | 전 브랜드 문의 목록 `?status=` · 스레드 **읽기 전용**(답변·종료 폼 없음 — 브랜드 콘솔) · 주문 상세/정산 상세 링크 | `listAdminCs` · `getAdminCsThread` |

데모 정리: `(demo)/settle` `(demo)/orders` 삭제 · `$lib/demo.ts` DEMO_PATHS 에서 `/settle` `/orders` 제거 · 데모 탭에서 "주문·CS" "정산 실행" 제거(브랜드 4·5단계와 같은 규칙 — 데모의 `go.screen('settle'|'orders')` 는 콘솔 화면에 닿는다). `parseAdminOrderRow` 에 `is_sample` 추가(0018 brand_order_json 에 있던 값).

**검증(2026-09-22 · 클라우드 `sellery` · dev 서버 5177 · dev 관리자 계정)** — `/settle` 큐 c5·c1·c12(2,493,188 / 9,334,661 = PR-A 스모크와 동일) · `/settle/c5` 명세 전 라인 · 보류 예고 RRN_MISSING · 기준일 전 강제 체크. 일회성 픽스처 c9901(s7 × p3 · PAID 3건 · 종료 D−10)에서 강제 실행 → 스냅샷(net 74,700 · 인플 13,219 held BANK_MISSING · 브랜드 52,738 pending) → 브랜드 보류(MANUAL) → 해제 → 지급 완료(메모 · 이벤트 payout_paid) → 인플루언서 해제 `STILL_INCOMPLETE(정산 계좌 미등록)` → 이체 파일 CSV 200(BOM EF BB BF · CRLF · `x-sellery-logged` 2 · purpose 없으면 400 ACTOR_REQUIRED) → 원천징수 CSV 200(NO_RRN 행 · ids 없으면 400) → `/orders?q=c9901` · o101 상세(결제키 없음 안내) · `?/refund` POST → `NO_PAYMENT_KEY` 문구로 303 · `/payments` 카드 · `/cs` cs105 읽기 전용 · 375px 6화면 `scrollWidth === innerWidth`. 정리: 픽스처 campaigns 1 · orders 3 · campaign_events 3 · settlements 1 · payouts 2 · sensitive_access_log 4 삭제 · s7/b1 등급 재계산(변화 없음). 시드 c5·c106·s101·b2 는 손대지 않았다.

**미룬 것** — ~~홈 카드~~는 **PR #63 에서 올렸다**(담당이 1명이 된 뒤 파트너 카드와 한 PR 로 · `getPaymentsHealth` 재사용 · 아래 §파트너 관리 5) · 이체 파일은 브라우저 다운로드만(배치 기록 없음 · "지급 완료" 는 행별) · 정산 후 환불 조정(`refund_needs_adjust`) 처리 화면 없음(주문 상세 안내 + 정합성 카드까지) · 자동 정산 크론 미연결(M3) · 관리자 계정 교체(deploy §5.6 주의).

---

## 파트너 관리 (2026-09-23~28 · PR #38 #40 #45 #49 #50 #52 #55 #58 #59 #60 #62 #63 #64)

셸 · 인증 · 인플루언서/브랜드 목록 · 정지/복구 · 채널 인증 큐 · 상품 검수 · 홈 대시보드 · 캠페인 상세.
데모 `apps/admin/src/routes/(demo)/*`(프로토타입 `js/50-admin.js`)를 화면 단위로 옮겼다.

### 0. 결정 요약

| # | 결정 | 이유 |
|---|---|---|
| 1 | **마이그레이션 0건** | 필요한 컬럼·함수가 이미 다 있었다(아래 1) |
| 2 | 쓰기는 **`code` → `id` 를 서버에서 먼저 해석**한 뒤 id 로 UPDATE | 클라이언트가 보낸 ref 를 믿지 않는다. `partner-admin.mjs` 와 같은 방식 |
| 3 | 목록에는 **되돌릴 수 있는 동작만**. 정지 · 채널 인증 승인은 상세에서만 | 목록은 한 화면에 여러 행이라 오클릭 비용이 크다 |
| 4 | 상세페이지 미리보기 = **저장하지 않는 합성 `CampaignCard`** · 판매자는 대역 · shop 에 라우트를 두지 않는다 | 검수 전 상품이 공개 URL 로 노출되면 안 된다. 관리자 앱 안에서는 `requireAdmin()` 하나로 막힌다 |
| 5 | 판매 실적 표에 데모 모달의 **익명화 · 블러 · 🥬 확인권을 넣지 않는다** | 그 셋은 남의 실적을 돈 내고 보는 인플루언서용 장치다. 관리자는 자기 플랫폼 데이터를 실명으로 본다 |
| 6 | 판매 링크는 **`SCHEDULE_CONFIRMED` 부터** | 0003 `campaign_card` 의 `status in (...)` 과 **같은 목록이어야 한다**. 어긋나면 링크가 404 거나 있는 링크가 안 보인다 |
| 7 | 대시보드 금액은 캠페인마다 **`app_admin_settle_preview`(0020) 를 부른다** | 정산 규칙(등급 보너스 · 추천 부스트 · 브랜드 할인)을 관리자 쪽에서 다시 구현하지 않는다. 대가는 N+1 호출 |
| 8 | 캠페인 대행 쓰기는 **브랜드 RPC(`app_brand_*`) 를 그대로 부른다** | 상태 전이·이벤트 문구·기간 우선권 검사가 브랜드 콘솔과 같아야 한다. `p_brand_id` 를 인자로 받고 service_role 에 grant 돼 있다 |
| 9 | 관리자 발신은 `sender='admin'`(**"셀러리 관리자"** + 인증 배지) | **열린 결정 — 아래 6** |
| 10 | 데모 **[데이터 초기화]** 는 옮기지 않는다 | localStorage 시드 복원용 데모 버튼(`act.reset()`). 실서비스에서 같은 문구는 운영 데이터를 지우는 뜻이 되어서는 안 된다 |
| 11 | 매출·순수익의 **GMV 는 샘플 구매분을 포함**한다(대시보드는 제외) | 샘플 구매는 실제 `orders` 행(`is_sample` · PAID)이라 돈이 들어온 것이고, 정산 규칙도 이미 다룬다(`base = net − sample_net` → 인플루언서 수수료 0 · PG·플랫폼 10% 적용). 데모와 같다(sample-policy §169 · 두 화면 차이는 §172). 브랜드 지급 규칙은 미정이라(0019:45) 해당 행에 표시한다 |
| 12 | 매출·순수익 금액은 **0022 `admin_campaign_pnl` 이 계산**한다 | 0020 `app_admin_settle_preview` 는 정산 **실행 대상**만 봐서 `SAMPLE_PURCHASED` 를 거부한다(0020:336). 집계에는 같은 게이트를 쓸 이유가 없다. 계산식은 0020 과 동일하고 LIVE·CLEARING 21항목이 일치함을 확인했다 |
| 13 | 자동 제안 발송은 **브랜드 RPC `app_brand_invite_seller`(0016) 대행**이다 | 상태 전이·이벤트 문구·게이트(비공개 · 우선권 등급 · 독점 · 중복)를 다시 구현하지 않는다(결정 8 과 같은 방식). 성공한 건에 `auto_proposed=true` 와 `admin_proxy_action` 을 남긴다 — 그 RPC 는 브랜드 직접 제안용이라 `invited=true` 만 세운다 |

### 1. 마이그레이션 — 0022 하나뿐

파트너 관리 화면은 거의 다 **기존 컬럼·함수로** 만들었다. 새로 만든 것은 **0022(매출·순수익)** 하나다.

```
sellers.active · sellers.hidden                          0001  정지/복구 · 갤러리 노출
seller_channels.verified · vcode · vcode_confirmed_at    0001 · 0010  채널 인증 큐
sellers.followers · likes_avg                            0001  판매 실적 지표(likes_avg 는 0001:398 공개 grant 차단)
brands.active · auto_propose · bank_info · tax_info      0001 · 0019  정지 · 자동제안 · 정산정보 유무
celery_ledger.reason='admin_grant'                       0005  🥬 지급(platform_settings.admin_grant_cel)
app_admin_review_product(product, decision, reason)      0015  상품 승인 · 반려 · 노출 중단
brand_gmv(uuid)                                          0004  브랜드 누적 GMV
exclusive_requests.status='PENDING'                      0002  독점권 신청 대기 카운트
campaign_events(kind, sender, actor_role, actor_user_id) 0003  스레드 열람 · 관리자 발신
campaign_post_chat(campaign, role, actor_user_id, body)  0016  발신(역할을 인자로 받는다) · 연락처 감지 포함
app_brand_{approve,reject}_sample · ship_sample ·        0015 · 0016  브랜드 대행 액션
  confirm_schedule · reject_schedule
app_admin_settle_preview · app_admin_payments_health     0020  정산 미리보기 · 대시보드 정산 숫자
app_brand_invite_candidates · app_brand_invite_seller    0016  자동 제안 후보 조건 · 발송(대행)
sellers.recent_likes · categories.group_name             0001  성장세 · 카테고리 적합
grade_tiers.is_priority · invite_cost_cel                0001  우선권 등급 제안 게이트(6단계)
platform_settings.opex_default                           0001  매출·순수익 운영비 기본값
```

**`sellers.hidden` 쓰기 경로만 새로 생겼다** — 그전에는 읽기만 있었다(`seller_is_public()` · 공개 조인).

**0022_admin_revenue.sql** (매출·순수익 — 읽기 2 + `platform_settings` 한 행 쓰기):

```
admin_campaign_pnl(uuid)     캠페인 1건 손익. 0020 app_admin_settle_preview 의 계산부와 같은 식 · **상태 게이트 없음**
app_admin_revenue()          손익 요약 19항목 + 판매별 행 + 셀러리 손익 + celCover + opex
app_admin_save_opex(jsonb)   운영 비용 저장 — 아는 키만 · 음수·비숫자는 0
```

되돌리려면 세 함수를 `drop` 하면 된다(기존 테이블·함수를 바꾸지 않았다). `opex_default` 값은 보고용이라
정산·지급에 영향이 없다.

### 2. 파일 배치

```
packages/db/src/admin/seller-rules.ts        순수 — 필터 · 등급 칩 · 상태 문구 · 액션 메시지          20개 테스트
packages/db/src/admin/brand-rules.ts         순수 — 필터 · 등급 · 정산정보 유무 문구                 16개 테스트
packages/db/src/admin/product-rules.ts       순수 — 상태 칩 · 필터 · 총 수수료 · 반려 사유            19개 테스트
packages/db/src/admin/campaign-rules.ts      순수 — 상태 라벨·톤(데모 `ST` 이식) · 흐름 스테퍼 ·      10개 테스트
                                                    대행 액션 분기 · 기간 표기
packages/db/src/admin/revenue-rules.ts       순수 — 손익 파서 · 운영비 집계 · 손익분기             21개 테스트
packages/db/src/admin/match-rules.ts         순수 — 성장세 · 매칭 점수 · 카테고리 적합 · 후보 선정   27개 테스트
packages/db/src/server/admin/sellers.server.ts    listSellers · getSeller · listPendingChannels ·
                                                  setSellerActive/Hidden · setChannelVerified · grantCelery
packages/db/src/server/admin/brands.server.ts     listBrands · getBrand · setBrandActive/AutoPropose · grantBrandCelery
packages/db/src/server/admin/products.server.ts   listAdminProducts · getAdminProduct · getProductPreviewCard · reviewProduct
packages/db/src/server/admin/dashboard.server.ts  getAdminDashboard(카운트 · KPI · 오늘 할 일 · 캠페인) · listRecentActivity
packages/db/src/server/admin/campaigns.server.ts  getAdminCampaign · 브랜드 대행 5종 · postAdminChat
packages/db/src/server/admin/revenue.server.ts    getAdminRevenue · saveOpex (0022)
packages/db/src/server/admin/match.server.ts      getAdminMatch · runAutoPropose · toggleAutoPropose
apps/admin/src/lib/server/{env,db,admin}.ts       getAdminContext · requireAdmin · adminPath · adminNextOf
apps/admin/src/lib/server/partners.ts             배럴(위 server/admin/* 전부)
packages/db/src/console-paths.ts                  ConsoleRole += 'admin'
packages/ui/src/site/console/PartnerShell.svelte  ROLE_LABEL.admin · TABS.admin (5탭)
packages/ui/src/site/store/StoreView.svelte       `preview?: boolean` 한 줄(기본 false — shop 영향 없음)
packages/db/src/console-paths.ts                  activeNavHref — 내비 활성 판정(접두 포함 전체 경로)
packages/ui/src/site/console/ConsoleTabs.svelte   activeNavHref 사용 + `ConsoleTab.match`(탭 하나가 여러 화면)
apps/admin/src/lib/money-nav.ts                   정산·돈 칩 표 + `moneyNavHref` · `MONEY_NAV_HREFS`
apps/admin/src/lib/server/money.ts                배럴(정산 + 매출·순수익)
```

화면:

```
(console)/login · auth/signout                 관리자 로그인 게이트
(console)/home                                 대시보드 — 히어로 띠 · KPI 4장 · 오늘 할 일 · 최근 활동 · 전체 캠페인
(console)/sellers · sellers/[code]             인플루언서 목록 · 상세(채널 인증 · 정지/복구 · 🥬 지급)
(console)/brands · brands/[code]               브랜드 목록 · 상세(GMV · 상품 · 정산정보 · 자동제안 · 정지/복구)
(console)/products · products/[code]           상품 목록 · 검수 상세(승인/반려/노출 · 판매 실적 · 상세 이미지)
(console)/products/[code]/preview              상세페이지 미리보기(고객 화면과 같은 `StoreView` · 구매 불가)
(console)/campaigns/[code]                     캠페인 상세 — 흐름 스테퍼 · 스레드 · 브랜드 대행 · 정산 미리보기
(console)/match                                매칭·자동 제안 — 뜨는 인플루언서 · 브랜드 ON/OFF · 후보 · 실행 · 이력
(console)/(money)/revenue                      매출·순수익 — KPI · 손익 요약 · 셀러리 손익 · 운영비 · 판매별 손익
```

탭 배치 — 매칭·자동 제안은 **인플루언서 탭**(`ConsoleTab.match`), 매출·순수익은 **정산 탭의 화면 칩**(`money-nav`),
캠페인 상세는 **홈 탭**(홈 대시보드에서 들어온다).

### 3. 데모 → 실서비스 대응

| 데모 화면 | 실서비스 | 비고 |
|---|---|---|
| 대시보드 히어로 · KPI 4장 · 오늘 할 일 · 최근 활동 · 전체 캠페인 | `(console)/home` | 최근 활동은 `campaign_events.body` 를 그대로 쓴다(DB 가 완성된 한 줄을 갖고 있어 문구 매핑이 없다) |
| 대시보드 **[데이터 초기화]** | 없음 | 결정 10 |
| 오늘 할 일 **"자동 제안 후보"** | `(console)/home` 에 있음 | 매칭 화면이 생겨 셀 수 있게 됐다(`getAdminMatch().candidates`) |
| 오늘 할 일 "미인증 채널" | **두 줄로 나눔** | 데모는 `!verified` 전부. 관리자가 누를 것이 있는 건은 인증 코드까지 넣은 것뿐이라 "채널 인증 승인 대기" 와 "미인증 채널" 을 따로 둔다 |
| 상품 목록 **[실적]** 모달 | 상품 상세의 "판매 실적" 표 | 같은 내용이 상세에 있어 모달을 따로 두면 정보가 두 곳에 생긴다. 익명화·블러·🥬 확인권은 빼고 실명으로(결정 5) |
| 상품 목록 **[상세페이지]** | `products/[code]/preview` | 결정 4 |
| 캠페인 상세(스레드 · 브랜드 액션 · 정산 미리보기) | `campaigns/[code]` | 결정 8 · 9 |
| 매출·순수익(KPI 4장 · 손익 요약 · 셀러리 손익 · 운영비 · 판매별 손익) | `(console)/(money)/revenue` | 결정 11 · 12. 운영비 기본값은 `platform_settings.opex_default`(0001 시드)에 이미 있었다 |
| 매출·순수익 **운영 비용 입력** | 같은 화면 | 저장은 `app_admin_save_opex`(0022)가 `opex_default` 한 행에 쓴다. 입력을 바꾸면 저장 전에도 아래 표가 다시 계산된다(데모 `bind:value`) |
| 매칭·자동 제안(뜨는 인플루언서 · 브랜드 ON/OFF · 후보 · 실행 · 이력) | `(console)/match` | 결정 13. 적격 조건은 `app_brand_invite_candidates`(0016)와 같다 — 데모보다 게이트가 셋 많다(아래) |
| 매칭 화면의 **비공개·우선권 등급 후보** | 후보에서 제외 | 데모는 비공개를 후보에 넣고 점수만 −5 했다. 실서비스는 익명 스카우트·🥬 제안권이 **6단계**라 `app_brand_invite_seller` 가 `SELLER_HIDDEN` · `PRIORITY_INVITE_GATED` 로 막는다. 데모 안내문 "다이아·블랙은 브랜드 🥬 10 자동 차감" 이 그 게이트다. 뜨는 인플루언서 목록에는 **전원**을 보여주고 적격이 아니면 사유를 적는다 |
| 매칭 화면의 **자동 제안 실행** | 관리자 수동 버튼 | 데모 안내는 "매일" 이지만 데모도 버튼이다. 크론 연결은 운영 결정 |
| `(demo)/products` · `(demo)/brands` · `(demo)/revenue` · `(demo)/match` | 삭제 | 콘솔 라우트가 같은 URL 을 받으면 데모를 지운다(정산 쪽이 `settle`/`orders` 에서 쓴 방식) |

### 4. 검증 방식

로컬 Supabase 를 쓴다(클라우드에 쓰지 않는다 — `docs/deploy.md §7.1`).

```
npm run check:boundaries · npm run check · npm test · npm run build   4개 전부
dev 서버를 빈 포트에 띄우고(5175 는 건드리지 않는다) 세션 쿠키를 만들어 curl
  sb-127-auth-token=base64-<base64url(JSON.stringify(session))>
POST 폼 액션은 Origin · Accept: text/html · Content-Type 을 모두 넣는다
  (Content-Type 없으면 415 · Accept: */* 면 JSON `{"type":"redirect"}`)
쓰기는 DB 값을 직접 확인한 뒤 **시드를 되돌리고** 되돌아갔는지 다시 확인한다
레이아웃 · 375px 카드 모드는 curl 로 볼 수 없다 → PR 본문에 "확인 불가" 로 적고 브라우저 확인을 요청한다
```

### 5. 미착수 — 만들지 않은 이유

| 항목 | 이유 |
|---|---|
| 반려 사유 입력이 `prompt()` | 디자인 시스템 모달이 없다(`influencer-spec §1.3`). 모달이 생길 때 상품 반려(목록 · 상세 2곳) · 캠페인 거절을 함께 고친다 |
| 일괄 정산 미리보기 RPC | 대시보드와 매출·순수익이 캠페인마다 `app_admin_settle_preview` / `admin_campaign_pnl` 을 부른다(결정 7 · 12). 캠페인이 수백 건이 되면 일괄 RPC 를 추가한다 |
| 자동 제안 크론 | 지금은 관리자 수동 버튼이다(결정 13). 매일 돌릴지 · 몇 건씩 · 실패 알림은 운영 결정 |
| 6단계 의존 화면 | 🥬 제안권 · 갤러리 열람(익명 스카우트) · 셀러리 샵 — 그게 들어오면 매칭 후보에 우선권 등급·비공개 인플루언서가 포함된다 |

**매칭·자동 제안과 매출·순수익은 만들었다** — 미착수 화면은 이제 없다(§3 대응 표).

### 6. 열린 결정 — 관리자 발신자 표시

`docs/data-model-design-notes.md §1.5` 는 **`sender='brand', actor_role='admin'`**(화면은 브랜드명 · DB 에 감사 이력)으로 적고 있고
`(사용자 결정)` 표시가 있다. 데모도 "브랜드(관리자 대행)로 발신" 이다 — 다만 데모는 `pushChat(cid,'brand',…)` 로 저장해
**관리자가 썼다는 흔적이 없다**(`packages/core/src/actions.ts:248`).

현재 구현은 **`sender='admin'`** 이다 — 두 콘솔이 `senderLabel()` 로 "셀러리 관리자" + 인증 배지를 표시한다.
`campaign_post_chat`(0016) 이 `sender` 와 `actor_role` 을 같은 값으로 넣으므로 "브랜드로 표시 + 관리자로 감사" 는
지금 함수로 만들 수 없다(0022 가 필요하다).

운영에 확인할 것:

1. 브랜드 콘솔에 **자기가 쓰지 않은 메시지가 자기 이름으로** 남는 것이 의도된 동작인가
2. 맞다면 브랜드 화면에 "운영팀 대행" 표시를 할 것인가(안 하면 문의가 늘고, 하면 결국 현재 구현과 비슷해진다)
3. 브랜드 명의로 인플루언서에게 의사표시를 하는 **약관 근거**가 있는가(약관에서 대행 조항을 찾지 못했다)
4. 상태를 바꾸는 대행(샘플 승인 → 브랜드 배송 의무 · 일정 확정 → 판매 링크 생성)을 어떤 조건에서 허용하는가
   (되돌리는 RPC 는 없다 · 예: "브랜드 무응답 N일 경과 시")

대행 액션은 `admin_proxy_action` 이벤트로 추적되고 양쪽 스레드에 보인다.
용어가 갈려 있다 — `senderLabel('admin')` = "셀러리 관리자" 인데 `csSenderLabel('admin')`(고객 문의) 과
`logProxyAction` 문구는 "셀러리 운영팀" 이다. 한쪽으로 통일해야 한다.
