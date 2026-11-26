# MYR 운영 콘솔(`apps/myr-admin`) 개발 메모

2026-11-12 정리. 화면 구성(무엇이 보이고 무엇을 누르는지)은 **[docs/myr-admin-screens.md](myr-admin-screens.md)** — Claude Design 에 올리는 디자인 요청서다.
이 문서는 그 화면을 **만들 때** 필요한 것 — 이미 있는 RPC · 새로 만들 것 · 대체되는 스크립트 · 열린 결정 · 운영 전 체크 — 을 모았다. 절 제목의 "screens §N" 이 화면 구성 문서의 절이다. 처음 계획은 [docs/myr.md §4.3](myr.md), 진행은 docs/myr.md 작업 순서.

**만드는 시점: 인플루언서 콘솔을 마친 뒤**(2026-11-09 대표 결정) — 그 전까지는 아래 "지금 대신하는 것" 의 스크립트로 운영한다.

## 0. 공통

- 앱: `apps/myr-admin`(아직 없음 · M6) · 게이트 `profiles.role='admin'`(셀러리 `requireAdmin()` 복사) · noindex.
- 권한: 운영자 id 는 서버 세션에서만 정한다(백엔드 원칙 6). RPC 는 service role 만 쓰고, 처리한 사람은 운영자 user id 로 남긴다 — `p_actor` 를 받는 RPC 에는 `admin:<user id>`(지금 스크립트는 `script`).
- 판정 · 계산은 화면에서 다시 하지 않는다(백엔드 원칙 1) — 금액 · 상태 · 버튼 표시 조건은 아래 RPC 응답 필드를 그대로 쓴다. 크리에이터 콘솔과 같은 판정은 같은 함수를 부른다.
- 셀러리 코드는 복사만(결정 11) — 셀러리 어드민(`apps/admin`)의 패턴을 참고하되 import 하지 않는다. MYR 앱끼리 화면 컴포넌트는 복사하거나 `@sellery/myr-core` 로 옮긴다.
- 민감 정보(연락처 · 계좌 원문 · 사업자번호 원문 · 수취인) 열람은 기록을 남긴다(`sensitive_access_log` 패턴).

### 0-1. 우선순위 · 지금 대신하는 것

| 우선 | 화면(screens.md) | 지금 대신하는 것 | 이유 |
|---|---|---|---|
| **1** | 로그인 · 홈(§2 · §3) | — | 게이트 |
| **1** | 상품 검수(§4) | `myr-products.mjs review` · `revisions` · `review-revision` · 재고는 SQL | 크리에이터가 심사 요청을 시작하면 매일 쓴다 · 반려 의견을 터미널로 쓰기 어렵다 |
| **1** | 크리에이터 초대(§5-1) | `myr-invites.mjs send` · `list` · `revoke` | 가입이 초대로만 된다(결정 14) |
| 2 | 주문 · 송장 · 배송 완료 예외(§6) | `myr-ops.mjs orders` · `ship` · `ship-csv` · `undelivered` · `deliver` · 샵 `/api/ops/ship` · `/api/ops/deliver` | 이벗 자동 연동 전까지 발송 처리 · 배송 완료가 찍혀야 정산된다 |
| 2 | 문의(§7-1) | 없음(크리에이터만 답변) | 크리에이터 미응답 대비 |
| 2 | 파트너팀 톡(§7-2) | `myr-talk.mjs list [--waiting]` · `show` · `reply` | 크리에이터 [문의]가 메일 대신 여기로 온다(0125) · 답장이 터미널에서만 된다 |
| 2 | 크리에이터 관리 · 사업자 정보(§5-2 · §5-3) | `myr-creators.mjs list` · `account` · `settle-info` · `settle-verify` · `settle-reject` | 계정 연결 · 정지 · 정산에 필요한 사업자 정보 확인 |
| 2 | 교환 · 환불 운영(§8) | `myr-ops.mjs claims` · `collected` · `reship-claim` · `claim-refund` · 샵 `/api/ops/claims` | 회수 확인이 있어야 환불이 나간다 |
| 2 | 판매 상태(§4-4) | `myr-products.mjs review <code> pause\|approve\|end` | 판매 상태는 운영만 바꾼다 |
| 2 | 제조 원장(§10-1) | `myr-settle.mjs pending` · `mfg` · `mfg-add` · `mfg-deposit` · `mfg-fix` · `mfg-void` · `confirm-held` | 원장 없는 상품은 정산이 보류된다 — 매월 1일 전에 채워야 한다 |
| 2 | 지급(§11) | 자동 이체(0127 · 샵 크론) · `myr-settle.mjs retry` · `paid`(예외) · `unpaid` · `hold` · `release` | 평소 지급은 자동 이체라 운영 할 일이 없다 — 운영 조치 필요 · 결과 확인 필요 같은 예외만 토스 대시보드에서 확인하고 `retry`(다시 보내기) · `paid`(예외 기록)로 마무리 · 보류 · 해제 · 계좌 원문은 다루지 않는다(0127) |
| 2 | 세금계산서 수취 확인(§12) | `myr-settle.mjs invoices` · `invoice-ok` · `invoice-return` | 확인해야 지급 가능이 된다(0104) · 터미널에 사업자등록번호 원문이 보인다 |
| 3 | 월 정산(§10-2 · §10-3) | `myr-settle.mjs report` · `run`(크론 실패 때) | 매월 1일 13:00 크론이 계산 · 확정 |
| 3 | 공구 링크(§9) | 없음 | 운영 확인 |
| 4 | 발주 · 배송 · 반품 · 재고 · 설정 | — | 이벗 확정(§9-14) 뒤 |

## 1. 홈(screens §3) — 숫자 출처

| 카드 | 출처 |
|---|---|
| 신규 · 수정 심사 대기 · 가장 오래 기다린 것 | 상품 목록 RPC(새 · §4) 카운트 |
| 재고 0 판매 중 · 품절 | 같은 RPC |
| 발송 대기 주문 | `myr_app_admin_ship_pending`(0069) |
| 배송 완료 기록 없는 출고 줄 | 배송 완료 예외 목록(0088 · 콘솔은 주문 목록 줄 칩 · 상세 안내 · 홈 칩 → 배송 중 탭 · 시안 2026-11-26) |
| 답변 없는 문의(24시간) | 새 RPC |
| 파트너팀 톡 답할 차례 · 가장 오래 기다린 시간 | `myr_app_admin_partner_threads(true)` 길이 · 응답 `last_message_at`(0125) |
| 새 초대 요청 | `myr_app_admin_invite_list('requested')`(0070) |
| 교환 · 환불 단계별 | `myr_app_admin_claims`(0078) |
| 정산 정보 확인 대기 | `myr_app_admin_settle_infos('pending')`(0085) |
| 제조금액 미입력 판매 중 상품 · 보류된 정산 | `myr_mfg_pending` |
| 지급 가능 N · 금액 합 | 보낼 지급 건 `myr_payout_send_list`(0127 · 요청 시간에만) — 홈은 카운트 전용 RPC 를 새로(`myr_payout_to_pay` 는 0127 에서 지웠다) |
| 지급 보류 N(이유별) · 지급일 지난 지급 대기 | 지급 목록 읽기 RPC(새 · §11) |
| 세금계산서 확인 대기 · 기한 지남 | `myr_tax_invoice_list(null, 'submitted')`(0104) · 기한 지남은 응답 `overdue` — 홈은 카운트 전용 RPC 를 새로(사업자등록번호 원문이 실린다) |

## 2. 상품 검수(screens §4)

- 목록: **새** `myr_app_admin_products(status, seller, q, limit)` — 크리에이터 콘솔 `myr_app_seller_products`(0071) 행 모양 + `seller` · `revision`(열린 수정본 기준은 `myr_product_open_revision` 하나).
- 신규 심사: `myr_app_admin_review_product(id, 'approve'|'reject', reason, admin, items)` · 의견 상한은 `myr_reject_items`(최대 10개 · 300자) · 섹션 번호는 `lib/product-review.ts` `STEP_SECTION`.
- 수정 심사: `myr_app_admin_review_revision(id, 'approve'|'reject', reason, admin, items)` · 바뀐 섹션은 크리에이터 콘솔 `changedSections`(`lib/product-edit.ts` `SECTION_KEYS`)와 **같은 함수** — `@sellery/myr-core` 로 옮겨 같이 쓴다(운영 스크립트 `revisions` 의 키 단위 비교도 섹션 단위로 맞춘다). 상품이 그사이 판매 종료면 수정본은 canceled(0074) · 반려 · 삭제면 `WRONG_STATUS` · `NOT_FOUND`.
- 판매 상태: `review_product` pause · approve(재개) · end(0082 · 0083) — 운영만 · 열린 수정본 취소.

| 새로 만들 것 | 이유 |
|---|---|
| `myr_app_admin_products(...)` 목록 RPC | 목록 · 탭 카운트 · 크리에이터 필터 |
| `myr_app_admin_product(code)` 상세 RPC — 상품 + 열린 수정본 + 수정 · 반려 이력 | 신규 · 수정 심사 화면 한 번에 |
| 재고 저장 — `review_product` 에 `p_stock` 또는 `myr_app_admin_set_stock(id, stock)` | 승인 때 재고 필수(결정 13 · 지금은 SQL) |
| `changedSections` 를 `@sellery/myr-core` 로 | 크리에이터 "변경됨" 과 운영 "바뀐 섹션" 이 같은 판정 |
| 샵 상세 섹션 컴포넌트 복사(myr-shop `/p/[code]`) | 미리보기를 샵과 같은 모양으로 |
| ~~반려 · 승인 알림 메일~~ — 결정(2026-11-13): 메일 없음 · 크리에이터 콘솔 "심사 결과"에서만 | — |
| ~~운영 판매 종료~~ — 0082 `end` | 판매 종료는 운영만 |

- 없어지는 것: `myr-products.mjs` 의 `review` · `revisions` · `review-revision` · `list`(`import` · `creators` 는 시드용으로 남길지 그때).

## 3. 크리에이터(screens §5)

- 초대: `myr_app_admin_invite_create` · `myr_app_admin_invite_list(state, limit)` · `myr_app_admin_invite_revoke`(0070) · 메일은 크리에이터 콘솔 `/api/ops/invites` 와 같은 템플릿.
- 사업자 · 정산 정보: `myr_app_admin_settle_infos` · `myr_app_admin_settle_info_check`(0085) — 화면에 띄운 값의 제출 시각을 같이 보낸다(그사이 바뀌면 `STALE`). 확인 · 반려하면 트리거(`sellers_myr_payout_refresh` · 0102)가 그 크리에이터 지급 건을 다시 정한다.
- 지급 이력: 지급 목록 읽기 RPC(§11 새) 를 크리에이터로 거른 것 + `myr_payout_logs`.
- 새로 만들 것: 크리에이터 목록 · 상세 · 정지 RPC(셀러리 0022~ 파트너 관리 패턴) · 계정 연결(`myr-creators.mjs account` 대체).
- 없어지는 것: `myr-invites.mjs` · 크리에이터 콘솔 `/api/ops/invites`(콘솔 간 `CRON_SECRET` 호출이 필요 없어진다) · `myr-creators.mjs` 의 `settle-*`.

## 4. 주문 · 송장(screens §6)

- 송장: `myr_app_admin_ship`(0069) + 배송 시작 메일(`ship.ts` 를 콘솔로 복사) · ~~CSV 형식은 스크립트 `ship-csv` 와 같다~~ — 송장 일괄 입력 화면은 시안 2026-11-26 에서 빠졌다(screens §6-3).
- 배송 완료 예외: 0088 목록 · `myr_app_admin_deliver`(실제 배송일 · 그 주문의 배송중 줄 전부) — ~~자동으로 찍지 않는다(분실 · 반송도 완료가 되므로 · 2026-11-10 결정)~~ → 아래 2026-11-26 결정.
- **배송 완료 판정(2026-11-26 결정 · 바인허브와 같게)** — 매일 18시 송장 수집(`runEbutShipSync`)에서 줄마다:
    - 이벗 응답에 택배사 배송 완료(`exprStatus` '91')가 오면 → 배송 완료.
    - 응답에 완료가 없어도 배송 중으로 발송(`shipped_at`) 10일이 지나면 → 배송 완료(0118 `myr_line_auto_delivered`). 바인허브 `OrderStatusToDeliveringOrDelivered` 와 같은 기준이다(91 또는 배송중 10일).
    - 분실 · 반송도 10일 뒤 완료로 잡힐 수 있다 — 바인허브와 같은 방식으로 받아들인다(2026-11-10 "자동으로 찍지 않는다"를 바꿈).
    - 서버는 지금 이 동작이다(0077 · 0118) — 바꿀 코드는 없다.
    - **수동 기록은 남긴다** — 자동 판정은 이벗에 발주된 줄(`ebut_registered_at` 있음)이 이벗 응답에 올 때만 돈다. 운영이 [송장 입력]으로 직접 넣은 줄 · 이벗 응답에 안 오는 줄(취소 · 삭제 · 송장 없음) · 크론이 안 도는 동안(키 없음 · 장애)은 자동으로 끝나지 않으므로 운영이 택배 조회로 확인하고 `myr_app_admin_deliver` 로 기록한다. 배송 완료 창 안내 문구는 screens §6-4.
    - **콘솔 배송 완료 예외(UI 2026-11-26)** — 하위 화면을 없앴다 — 시안 2026-11-26 부터 주문 목록 줄의 빨간 칩 · 상세 머리 칩 · 송장 칸 위 안내로 보이고, 홈 처리할 일 칩 "배송 완료 예외"는 배송 중 탭을 연다(배송 중 탭 안 필터도 없앰). 기준을 줄 종류로 나눈다: 직접 입력 송장 = 발송 5일째부터 · 이벗 송장 = 10일이 지나도 배송 중일 때만. 서버 0088 `myr_app_admin_undelivered`(지금 모든 줄 5일 · 응답에 `ebut` 있음)의 기준을 이렇게 바꾸는 마이그레이션이 필요하다(기능 단계 · 백엔드).
- 수취인 · 결제 열람은 기록.
- 이벗 발주 실패(2026-11-25 UI): 지금 11시 크론(`runEbutPrepare`)은 주문마다 3번 다시 시도한 뒤 실패를 서버 로그에만 남긴다(`[ebut] CRITICAL …`) · DB 기록 · 알림 없음 · 줄은 결제완료로 남아 다음 영업일 11시에 다시 시도. 콘솔이 "발주 실패"를 보여 주려면 판정(11시 마감 전 결제인데 아직 결제완료인 줄 — 이름 붙은 DB 함수)이나 실패 기록(`myr_ebut_runs` 등 · 실패 이유 포함)이 필요하다 — 열린 결정 16.
- 없어지는 것: `myr-ops.mjs`(+ `lib/myr-ops-plan.mjs` · 테스트) · 샵 `/api/ops/ship` · `/api/ops/deliver` · `.env.example` 의 `MYR_SHOP_URL`.

## 5. 문의(screens §7)

### 고객 문의(screens §7-1)

- 대행 답변: `sender='seller'` · `actor_role='admin'` — 고객에게는 크리에이터 이름으로.
- 새로 만들 것: 전체 문의 목록 · 미답변 필터 RPC.

### 파트너팀 톡(screens §7-2 · 0125)

| 화면 동작 | RPC | 거절 코드 · 응답 |
|---|---|---|
| 대화방 목록 · 답할 차례 탭 | `myr_app_admin_partner_threads(p_waiting_only)` | `[{seller_id, handle, name, last_sender, last_preview, last_message_at, waiting, unread}]` — 답할 차례 먼저 · 최근 순 · 메시지 없는 방은 안 나옴 |
| 대화 열기(운영 읽음) | `myr_app_admin_partner_talk(p_seller, p_mark_read)` | `NOT_FOUND` · `{messages[{id, sender, body, created_at}], unread}` — 최근 300개 |
| 답장 | `myr_app_admin_partner_reply(p_seller, p_body, p_admin)` | `NOT_FOUND` · `BAD_BODY{max}`(`myr_partner_body_max`) · `{message}` |

- 판정은 DB 함수가 한다: 답할 차례 `myr_partner_waiting` · 운영 안 읽음 `myr_partner_admin_unread` · 본문 형식 `myr_partner_body_ok`. 화면은 응답 `waiting` · `unread` 를 그대로 쓴다.
- `p_admin` 은 서버 세션의 운영자 user id(지금 스크립트는 `null`).
- 읽음 표시는 방 하나에 운영 공용 `admin_read_at` 하나다(운영자별 읽음 없음).
- 새로 만들 것:

| 새로 만들 것 | 이유 |
|---|---|
| 운영용 메시지 JSON(`admin_user_id` → 운영자 이름) | 운영끼리 누가 답했는지 표시 — 지금 `myr_partner_message_json` 은 크리에이터와 같은 모양이라 운영자가 없다(크리에이터에게는 계속 숨긴다) |
| 홈 · 메뉴 배지 카운트 RPC(답할 차례 수 · 가장 오래 기다린 시각) | 목록 RPC 를 홈에서 통째로 읽지 않게 |
| 크리에이터 상세 [파트너팀 톡 열기] | `myr_app_admin_partner_talk(seller)` 로 메시지 없는 크리에이터에게도 먼저 답장할 수 있다(방은 답장 때 생긴다) |

- 없어지는 것: `packages/db/scripts/myr-talk.mjs`.

## 6. 교환 · 환불(screens §8)

- 목록: `myr_app_admin_claims(open_only)`(0078) · 단계는 `myr_refund_request_step`.
- 회수 확인 `myr_app_admin_claim_collected` → 샵이 바로 환불 · 재발송 `myr_app_admin_claim_reship` + 고객 메일 · 환불 다시(크론 10분과 같은 것).
- 운영 승인 · 반려(2026-11-13 결정 — 기한과 관계없이 언제든): 크리에이터용 `myr_app_claim_decide` 는 `p_user` 가 그 상품의 크리에이터여야 한다.
    - 새로 만들 것: `myr_app_admin_claim_decide(code, decision, resolution, message, actor)` — 판정은 같은 함수(`myr_refund_request_options` · `myr_claim_option_blocked` · `myr_claim_option_deduction` · `myr_claim_resolution_refunds` · `myr_claim_resolution_collects` · 0105)를 부르고, 권한 검사 · `decided_by`(운영 표시)만 다르게. 승인 · 반려 본문을 내부 함수 하나로 빼서 둘이 같이 부르게 하는 쪽이 좋다(같은 상태 전이를 두 번 쓰지 않는다).
    - 고객 메일은 크리에이터 처리와 같은 `notifyClaimDecided` · 바로 환불이면 샵 크론이 환불(아래).
    - 요청 표에 "운영이 처리" 표시 칸(예: `decided_role`)이 필요한지 그때 — 크리에이터 콘솔 타임라인에 보인다.
- 환불 실행은 샵 서버만(결제 키는 샵에만 · 2026-11-06 결정) — 운영 콘솔은 샵 운영 API 를 부르거나 토스 키를 둘지 그때(열린 결정 10).
- 없어지는 것: `myr-ops.mjs` 의 `claims` · `collected` · `reship-claim` · `claim-refund` · 샵 `/api/ops/claims`.

## 7. 공구 링크(screens §9)

- 데이터: `myr_groupbuys`(0086 · 종료 = `closed_at`) · 실적은 `myr_groupbuy_seller_json` 과 같은 기준(`myr_sales_lines` 공구 줄).
- 새로 만들 것: 운영 목록 RPC · 강제 종료 RPC(사유 칸 — 크리에이터 종료 함수와 따로) · 할인율 한도 1~70% 는 0086 이 막는다.

## 8. 정산(screens §10)

- 계산 · 확정은 크론(매월 1일 13:00 · `myr_settlement_run`) — 화면에 [확정] 없음. 수동 실행은 크론 실패 때만(이미 있으면 already · 끝난 달만 · 순서).
- 제조 원장: `myr_mfg_pending` · `myr_mfg_ledger` · `myr_mfg_add` · `myr_mfg_deposit` · `myr_mfg_fix`(USED · shortfall · deposit_diff) · `myr_mfg_void`(USED · REFUNDED) · 보류 확정 `myr_settlement_confirm_held`(확정해도 돈은 다음 회차 지급 건 · 0101).
- 회차: `myr_settlement_report`(줄 · 지급 건 · 합계 · 0103 에서 지급 완료 칸) · 줄 구분은 크리에이터 정산 탭과 같은 `myr_settlement_card_rows`.
- 새로 만들 것: 회차 줄 단위 읽기 RPC(줄 펼쳐 보기 — 지금 보고는 줄 수만).

## 9. 지급(screens §11) — 0101 ~ 0103

| 화면 동작 | RPC |
|---|---|
| 지급 대기(자동 이체 대상) · 금액 | `myr_payout_payable` · `myr_payout_sendable` · `myr_payout_amount` · 크론 `myr_payout_send_list`(0127) |
| 자동 이체(0127) | 시작 `myr_payout_send_begin`(가드 · 참조 번호 · 멱등 키) · 결과 `myr_payout_send_result` · 매시간 `myr_payout_check_list` · 다시 보내기 `myr_payout_send_retry`(`NOTE_REQUIRED` · `NOT_FAILED` · `ALREADY_PAID`) · 판정 `myr_payout_toss_outcome` · `myr_payout_toss_fail_kind` · `myr_payout_send_window` · `myr_payout_unknown` · `myr_payout_account_fixed` |
| 상태 문구 · 보류 이유 | `myr_payout_status_label` · `myr_payout_hold_label` · `myr_payout_auto_state` |
| 보류 이유 전부(운영 보류 맨 앞) | `myr_payout_hold_reasons`(자동 이유 목록 · 첫 번째가 `myr_payout_hold_reason`) · `myr_payout_holds_json`(`[{code, label}]` — `myr_settlement_report` · 크리에이터 정산 탭 응답 `holds`) (0104) |
| 지급 완료 기록 | `myr_payout_mark_paid(month, handle, amount, paid_on, note, actor)` — 거절 `NOT_FOUND` · `ALREADY_PAID`(paid_on) · `NOT_PAYABLE`(status · hold_label) · `AMOUNT_MISMATCH`(amount) · `BAD_DATE` · `FUTURE_DATE` · `BEFORE_RUN`(run_on) |
| 지급 완료 취소 | `myr_payout_unmark_paid` — `REASON_REQUIRED` · `NOT_PAID` · `PAID_BY_TOSS`(토스가 완료한 건 — 취소하면 다음 자동 이체에 다시 나가 두 번 지급 · 0127 · 운영 예외 기록만 취소할 수 있다) |
| 운영 보류 · 해제 | `myr_payout_hold` · `myr_payout_release` — `NOTE_REQUIRED` · `ALREADY_PAID` · `ALREADY_HELD` · `NOTHING_TO_PAY` · `NOT_MANUAL` |
| 지급 때 계좌 · 이력 | `paid_bank`(가린 값 · `myr_payout_bank_snapshot`) · `myr_payout_logs` |

| 새로 만들 것 | 이유 |
|---|---|
| 화면용 지급 목록 읽기 RPC(가린 계좌 · 탭 카운트 · 크리에이터 필터 · 줄마다 `holds` = `myr_payout_holds_json`) | `myr_payout_to_pay`(0127 에서 지움)는 계좌 원문을 돌려줬다(스크립트용) · 보류 이유가 여러 개일 수 있다 |
| 계좌 원문 열람 RPC(열람 기록) | 원문은 `sellers.bank_info` 에만 · 이체용 내려받기는 없다(0127 — 수동 이체 없음) |
| 일괄 지급 완료 RPC(같은 이체일 · 줄별 결과 · 일부 실패해도 나머지 기록) | 여러 줄 선택 기록 |
| 지급 건 상세 읽기 RPC(담긴 줄 · 이력) | 지급 건 상세 |
| 홈 카운트 RPC(지급 가능 · 보류 이유별 · 지급일 지난 지급 대기) | 홈 카드 |
| 월/핸들 대신 id 로 부르는 래퍼(지금 RPC 는 정산월 · 핸들) | 화면은 지급 건 id 를 가진다 |

- 없어지는 것: `myr-settle.mjs` 의 `retry` · `paid` · `unpaid` · `hold` · `release`(`to-pay` 는 0127 에서 이미 지웠다)(`report` 는 회차 상세로) — 세금계산서 명령은 §10.

## 10. 세금계산서(screens §12) — 작업 순서 7-4 · 0104

- 금액 · 날짜(2026-11-12 세무 답변): 합계 = 상계 뒤 금액(보증금 환급 제외) · 세액 = 합계 ÷ 11 버림 · 공급가액 = 나머지 · 작성일자 = 정산월 말일 · 발행 기한 = 다음 달 10일 — docs/myr.md §9-6.
- 있는 RPC(service_role · 정산월 · 핸들):

| RPC | 거절 코드 | 화면 |
|---|---|---|
| `myr_tax_invoice_list(month?, status?)` — 필요한 지급 건 · 상태 · 합계 · 공급가액 · 세액 · 작성일자 · 기한 · 기한 지남 · 승인번호 · 요청 사유 · 상호 · 사업자등록번호 원문 | — | 세금계산서 목록 |
| `myr_tax_invoice_accept(month, handle, actor)` → 지급 건 상태 · 지급 가능 | `NOT_FOUND` · `ALREADY_PAID` · `ALREADY_ACCEPTED` · `NOT_SUBMITTED` · `AMOUNT_CHANGED`(낸 합계 · 지금 합계) | [수취 확인] |
| `myr_tax_invoice_return(month, handle, note, actor)` | `NOT_FOUND` · `REASON_REQUIRED` · `ALREADY_PAID` · `NOT_SUBMITTED` | [다시 제출 요청] |
| `myr_app_seller_tax_invoice_submit(user, month, no)`(크리에이터 콘솔) | `NOT_FOUND` · `NOT_NEEDED` · `ALREADY_PAID` · `ALREADY_ACCEPTED` · `BAD_NO` · `DUPLICATE_NO` | 참고 |

- 응답 하나(`myr_payout_invoice_json`)를 정산 탭 · 목록 · 회차 보고가 같이 쓴다 — 화면은 금액 · 날짜 · 기한 지남 · 버튼 조건을 다시 계산하지 않는다.
- 어드민 때 새로 만들 것: id 로 부르는 래퍼 · 홈 카운트(확인 대기 · 기한 지남) · 일괄 확인.
- 대체 스크립트: `myr-settle.mjs invoices` · `invoice-ok` · `invoice-return`.
- 역발행이 되면 표 · 흐름이 바뀐다(MYR 발행 · 크리에이터 승인).

## 11. 열린 결정

1. **디자인 시안** — Claude Design 요청서는 docs/myr-admin-screens.md(시안에서 열어 둘 것은 그 문서 §13).
2. **자주 쓰는 반려 의견 문구** — 운영팀 표준 문구(표시 · 광고 기준). 설정 화면 또는 코드 상수.
3. **재고 입력 위치** — 승인 RPC 에 묶을지, 따로 둘지(나중에 이벗 재고 연동).
4. ~~운영자 강제 판매 종료~~ — 결정(2026-11-09 · 0082): 판매 종료는 운영만.
5. ~~심사 결과 알림~~ — 결정(2026-11-13): 메일 없음 · 크리에이터 콘솔에서만.
6. **수정본 이력 보관** — 반영 · 반려된 수정본을 언제까지 둘지.
7. ~~정산 확정 방식~~ — 결정(2026-11-10): 매월 1일 13:00 크론 자동 확정 · 원장 없는 상품만 보류.
8. ~~재생산~~ — 결정(2026-11-09): 원장에 차수로 쌓는다.
9. **지급 방식** — 결정(2026-11-13): **자동 이체 · 영업일 오후 1시(정산 크론 바로 뒤) · 세금계산서까지 확인된 지급 건부터**. 지급대행 결정(2026-11-18): **토스페이먼츠 지급대행 v2** — 바로지급은 영업일 08~15시만 · 재원은 판매 정산대금(`GET /v2/balances` 지급 가능 안에서만 보냄 · 충전 없음) · 크리에이터마다 토스 셀러 등록 · 본인인증(`POST /v2/sellers` · 웹훅 `seller.changed` · 인증 전이면 지급 보류) · 결과 웹훅 `payout.changed` + 매시간 단건 조회 `GET /v2/payouts/{id}` · 멱등 키 · 요청당 100건 · JWE 암호화(docs/myr-admin-screens.md §5-3 · §11). 남은 것: 토스 실패 코드 → 네 종류 표 · 확인 간격. 본인인증 위치 — 결정(2026-11-18): 크리에이터가 사업자 · 정산 정보를 저장할 때 토스 셀러 등록 → 가입 화면(시안 "MYR Influencer Signup" 토스 단계) · 내 정보에서 인증 · 대표자 휴대폰은 따로 받음 · 법인은 사업자번호로 자동 구분(0121 · docs/myr-admin-screens.md §5-3). 연동 작업 순서는 docs/myr.md "토스 지급대행 작업 순서". 화면 값은 0111(`transfer_*` · 지급 예정 시각 · 크리에이터 상태 문구) — 실패 종류 retry · account · ops · check(크리에이터에게는 운영 쪽 원인을 ops "확인 중"으로). 연동 전까지는 운영이 같은 규칙으로 직접 이체하고 `paid` 로 기록(0103).
10. **교환 · 환불 운영 처리** — ~~대행 조건~~ 결정(2026-11-13): 운영은 처리 대기 요청을 기한과 관계없이 언제든 승인 · 반려(§6). 남은 것: 운영 콘솔의 환불 실행(샵 운영 API vs 토스 키 위치).
11. ~~공구가 한도~~ — 결정(2026-11-10): 1~70%(0086).
12. **세금계산서** — 역발행 가능 여부(운영 확인 중). ~~발행 금액 · 작성일자~~ — 결정(2026-11-12): 상계 뒤 금액이 합계(보증금 환급 제외) · 작성일자 정산월 말일 · 기한 다음 달 10일(0104).
13. ~~지급 완료 알림~~ — 결정(2026-11-13): 메일 없음 · 크리에이터 콘솔 정산 탭의 "지급 완료" 칩 · 이체한 날만.
14. **지급 완료 취소 권한** — 아무 운영자나 · 기록한 사람 · 관리자만. 잘못 보낸 송금의 회수 절차.
15. **지급 지연 기준** — 지급일에서 며칠 지나면 홈 경고 · 오래된 보류(예: 사업자 정보 3개월 미입력) 안내.
16. **이벗 상품코드 두 개(2026-11-25 이벗 확인)** — 이벗 주문 등록은 **우리 상품코드**(`myr_products.code`)를 그대로 받고, **재고 조회는 이벗 쪽 상품코드**가 필요하다.
    - 지금 0077 발주 함수는 `ebut_goods_code` 가 있으면 그 값을 주문 등록에 보낸다(`coalesce(ebut_goods_code, code)`) — 이 칸에 재고용 이벗 코드를 넣으면 주문 등록이 실패할 수 있다. **주문 등록은 항상 `code` · `ebut_goods_code` 는 재고 조회 전용**으로 바꾸는 마이그레이션이 필요하다(백엔드 · 결정 필요).
    - 운영 입력: 승인 창에서 이벗 상품코드(선택)를 넣으면 처음 재고 없이 승인 — 재고는 이벗에서 · 비우면 재고를 임의로 직접 넣고, 상품 관리 상세페이지 "이벗 상품코드" 줄에서 등록하면 이벗 연동 재고로 바뀐다(UI 2026-11-25 · screens §4-2 · §4-4). 서버: 지금 승인 함수 · `myr-products.mjs review` 는 재고를 꼭 받는다 — 이벗 코드 또는 재고 중 하나를 받게 바꾼다.
    - 상품코드는 샵 주소(`/p/<code>`)이자 이벗 주문 코드라 **승인 뒤에는 바꾸지 못하게** 한다.
    - 이벗 발주 실패 원인 판정 · 기록(§4) — 콘솔은 실패한 주문의 줄마다 상품코드를 보여 주고 이벗 관리자에서 그 코드로 찾게 한다. 홈 처리할 일 칩 "이벗 발주 실패"(빨강 → 결제 완료 탭) · 주문 목록 줄 빨간 칩 · 상세 머리 칩과 안내 · 주문 메뉴 배지(실패 수)가 같은 실패 판정 하나를 쓴다(시안 2026-11-26 — "이벗 발주 실패" 탭은 없앰)(UI 2026-11-26 · screens §3 · §6-1).
    - 운영 송장 입력: 송장은 평소 18시 이벗 수집으로 들어오고, 주문 상세(전체 화면 · 시안 2026-11-26) [송장 입력]은 운영이 직접 등록하는 예외 경로다(창 버튼 [송장 저장] · 처리 이력 "송장 입력" · screens §6-2). 서버는 지금 운송장 함수(0069 재정의 · 0077)를 그대로 쓴다.
    - 옵션(맛 · 용량)마다 이벗 상품이 따로면 옵션별 코드가 필요하다(지금은 상품코드 하나 + 옵션 이름을 상품명 뒤에 붙여 보냄) — 이벗에 확인.
    - **재고 연동 방식(2026-11-25 방향 · 바인허브 기준)** — 판매 재고를 이벗 재고에서 계산한다.
        - 공식: **판매 가능 재고 = 이벗 재고 − (결제 완료 수량 + 배송준비중 수량)**. 바인허브 "물류보관 재고"(`EbutStockService` · `.kiro/steering/stock-inventory.md`) = 이벗 `stockstatus` 의 `boptcodeQty` − 진행 중 출고 수량(`requested` · `preparing`)과 같은 기준이다.
            - 결제 완료(`PAID` · 아직 이벗에 안 넘김) = 바인허브 `requested` · 배송준비중(`PREPARING` · 이벗에 넘김 · 출고 전) = 바인허브 `preparing` — 둘 다 뺀다.
            - 배송중 · 배송 완료는 빼지 않는다(출고 때 이벗 재고에서 이미 빠짐).
            - 줄 수량은 환불 · 취소를 뺀 남은 수량(`myr_line_left`)으로 센다. 입금 대기(가상계좌)는 빼지 않는다.
        - **캐시는 이벗 재고 숫자만** — 이벗 `stockstatus` 를 5분 캐시로 가져온다(바인허브 `ebut_stock_data` 와 같음). **빼는 수량은 판정하는 그 순간 DB 에서 바로 센다**. 계산 결과 전체를 5분 캐시하면 그 사이 결제가 안 빠져 재고 0 인데 계속 팔린다 — 금지.
        - 왜 안전한가: 우리 주문 때문에 이벗 재고가 바뀌는 건 출고 때뿐이고, 그 사이 새 결제는 DB 에서 실시간으로 빠진다. 11시 발주로 결제 완료 → 배송준비중이 돼도 둘 다 빼는 대상이라 값이 그대로다(11시 공백 없음).
        - **품절**: 지금처럼 재고가 0 이하면 자동 품절(`myr_product_sold_out` 자리) + 운영이 직접 켜고 끄는 품절도 둔다. 자동 품절 판정 · 샵 표시 · 결제 거절(`SOLD_OUT`)이 **같은 서버 함수 하나**(판매 가능 재고)를 쓴다(백엔드 원칙 1).
        - 어긋나는 경우(대부분 안전한 쪽):
            - 물류센터가 낮에 출고했는데 18시 송장 수집 전 — 이벗 재고는 줄었고 우리 줄은 아직 배송준비중이라 두 번 빠진다 → 실제보다 **적게** 보인다(남은 게 적으면 품절이 일찍 걸릴 수 있음 · 18시 수집 뒤 맞춰짐).
            - 이벗 쪽에서만 줄어든 경우(파손 · 다른 판매처 출고) — 다음 갱신(최대 5분)까지 실제보다 **많게** 보인다 · 유일한 초과 판매 가능 구간이라 드물고 짧다.
            - 이벗 조회 실패 — **마지막으로 성공한 값**을 쓴다. 0 · 빈 값으로 두면 전부 자동 품절이 된다.
            - 이벗 상품코드가 없는 상품 — 이벗 재고를 못 가져오니 운영이 넣은 재고를 쓴다(지금 방식).
        - **이벗에 확인할 것**: 이벗 재고가 **출고(송장) 때** 줄어드는지, **발주 등록 때** 줄어드는지. 등록 때 줄어든다면 배송준비중을 빼면 두 번 빠지므로(11시 뒤 하루 종일 적게 보임) 결제 완료만 뺀다.
        - 재고 부족 알림(바인허브 월 · 수 · 금 10:30 슬랙 · 알림톡)은 두지 않는다.
        - 바뀌는 것(기능 단계): 지금 판매 재고 = 운영 입력 재고 − 팔린 수량(`myr_product_left` · 0096/0099). 이벗 재고 조회 · 5분 캐시(샵 서버 · 결정 12) · 판매 가능 재고 함수 · 운영 콘솔 재고 수정의 역할(이벗 코드가 없는 상품만)을 함께 정한다. pgTAP `_rules` · check-boundaries (h)에 새 식과 주인 함수를 적는다.

## 12. 운영 전 체크(콘솔과 별개)

- 마이그레이션은 병합 전에 `npx supabase db push --linked`.
- 운영 DB 의 테스트 계정 `*@myr.test` 삭제 또는 비밀번호 교체.
- 승인된 상품 재고 확인(재고 0 이면 샵에서 품절).
- 0101~0103 적용 뒤 `myr-settle.mjs report <최근 달>` 로 지급 건 상태 확인 — 사업자 정보 확인 전인 크리에이터는 지급 보류로 바뀐다(0102).
