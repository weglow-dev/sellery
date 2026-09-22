# 관리자 콘솔 구현 계획 — `apps/admin` 데모 → 실서비스 (sellery.life/admin/*)

> **상태(2026-09-22): 두 작업자가 나눠 만든다.** 셸 · 인증 · **파트너 관리**(인플루언서/브랜드 목록 · 정지/복구 · 채널 인증 큐 · 상품 검수)는 Soyunnlee 가
> `apps/admin/src/routes/(console)/{login,home,auth}` · `apps/admin/src/lib/server/{env,db,admin}.ts` · `packages/db/src/server/admin.server.ts`(`getAdminContext` · `requireAdmin` · `adminPath` · `adminNextOf`, PR #28 #29 #38 #40)
> 로 만들고, 그 문서는 이 파일의 다른 절(작업자가 채운다)이다. 이 절("정산 · 돈")은 **돈이 움직이는 쪽만** 다룬다 — 정산 실행 · 지급 처리 · 이체 파일 · 원천징수 자료 ·
> 주문/환불/결제 정합성/문의 열람. 마이그레이션 번호는 **0020 이 이 절**, 0021 부터 파트너 관리. 두 쪽은 서로의 파일을 고치지 않는다(아래 파일 표).
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

### 1. 파일 · 경계 (다른 작업자 파일은 손대지 않는다)

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
탭 추가는 셸 담당자와 조율(`PartnerShell`/관리자 셸의 탭 배열 한 줄).

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

**미룬 것** — 홈 카드("정산 기준일 도래 n건 · 지급 보류 n건 · 미처리 결제 이벤트 n건")는 홈이 셸 담당자 파일이라 넣지 않았다(`getPaymentsHealth` 한 줄로 붙일 수 있다) · 이체 파일은 브라우저 다운로드만(배치 기록 없음 · "지급 완료" 는 행별) · 정산 후 환불 조정(`refund_needs_adjust`) 처리 화면 없음(주문 상세 안내 + 정합성 카드까지) · 자동 정산 크론 미연결(M3) · 관리자 계정 교체(deploy §5.6 주의).
