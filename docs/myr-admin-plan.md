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
| 2 | 문의(§7) | 없음(크리에이터만 답변) | 크리에이터 미응답 대비 |
| 2 | 크리에이터 관리 · 사업자 정보(§5-2 · §5-3) | `myr-creators.mjs list` · `account` · `settle-info` · `settle-verify` · `settle-reject` | 계정 연결 · 정지 · 정산에 필요한 사업자 정보 확인 |
| 2 | 교환 · 환불 운영(§8) | `myr-ops.mjs claims` · `collected` · `reship-claim` · `claim-refund` · 샵 `/api/ops/claims` | 회수 확인이 있어야 환불이 나간다 |
| 2 | 판매 상태(§4-4) | `myr-products.mjs review <code> pause\|approve\|end` | 판매 상태는 운영만 바꾼다 |
| 2 | 제조 원장(§10-1) | `myr-settle.mjs pending` · `mfg` · `mfg-add` · `mfg-deposit` · `mfg-fix` · `mfg-void` · `confirm-held` | 원장 없는 상품은 정산이 보류된다 — 매월 1일 전에 채워야 한다 |
| 2 | 지급(§11) | `myr-settle.mjs to-pay` · `paid` · `unpaid` · `hold` · `release` | 운영이 이체하고 기록해야 크리에이터 화면에 "지급 완료"가 뜬다 · 터미널에 계좌 원문이 보인다 |
| 2 | 세금계산서 수취 확인(§12) | 없음 — 운영이 직접 확인하고 `paid` | 세무 답변 대기(작업 순서 7-4) |
| 3 | 월 정산(§10-2 · §10-3) | `myr-settle.mjs report` · `run`(크론 실패 때) | 매월 1일 13:00 크론이 계산 · 확정 |
| 3 | 공구 링크(§9) | 없음 | 운영 확인 |
| 4 | 발주 · 배송 · 반품 · 재고 · 설정 | — | 이벗 확정(§9-14) 뒤 |

## 1. 홈(screens §3) — 숫자 출처

| 카드 | 출처 |
|---|---|
| 신규 · 수정 심사 대기 · 가장 오래 기다린 것 | 상품 목록 RPC(새 · §4) 카운트 |
| 재고 0 판매 중 · 품절 | 같은 RPC |
| 발송 대기 주문 | `myr_app_admin_ship_pending`(0069) |
| 배송 완료 기록 없는 출고 줄 | 배송 완료 예외 목록(0088) |
| 답변 없는 문의(24시간) | 새 RPC |
| 새 초대 요청 | `myr_app_admin_invite_list('requested')`(0070) |
| 교환 · 환불 단계별 | `myr_app_admin_claims`(0078) |
| 정산 정보 확인 대기 | `myr_app_admin_settle_infos('pending')`(0085) |
| 제조금액 미입력 판매 중 상품 · 보류된 정산 | `myr_mfg_pending` |
| 지급 가능 N · 금액 합 | `myr_payout_to_pay`(0103 — 계좌 원문이 실리니 홈은 카운트 전용 RPC 를 새로) |
| 지급 보류 N(이유별) · 지급일 지난 지급 대기 | 지급 목록 읽기 RPC(새 · §11) |
| 세금계산서 확인 대기 | 7-4 뒤 |

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
| (선택) 반려 · 승인 알림 메일 | 지금은 크리에이터가 콘솔을 열어야 안다 |
| ~~운영 판매 종료~~ — 0082 `end` | 판매 종료는 운영만 |

- 없어지는 것: `myr-products.mjs` 의 `review` · `revisions` · `review-revision` · `list`(`import` · `creators` 는 시드용으로 남길지 그때).

## 3. 크리에이터(screens §5)

- 초대: `myr_app_admin_invite_create` · `myr_app_admin_invite_list(state, limit)` · `myr_app_admin_invite_revoke`(0070) · 메일은 크리에이터 콘솔 `/api/ops/invites` 와 같은 템플릿.
- 사업자 · 정산 정보: `myr_app_admin_settle_infos` · `myr_app_admin_settle_info_check`(0085) — 화면에 띄운 값의 제출 시각을 같이 보낸다(그사이 바뀌면 `STALE`). 확인 · 반려하면 트리거(`sellers_myr_payout_refresh` · 0102)가 그 크리에이터 지급 건을 다시 정한다.
- 지급 이력: 지급 목록 읽기 RPC(§11 새) 를 크리에이터로 거른 것 + `myr_payout_logs`.
- 새로 만들 것: 크리에이터 목록 · 상세 · 정지 RPC(셀러리 0022~ 파트너 관리 패턴) · 계정 연결(`myr-creators.mjs account` 대체).
- 없어지는 것: `myr-invites.mjs` · 크리에이터 콘솔 `/api/ops/invites`(콘솔 간 `CRON_SECRET` 호출이 필요 없어진다) · `myr-creators.mjs` 의 `settle-*`.

## 4. 주문 · 송장(screens §6)

- 송장: `myr_app_admin_ship`(0069) + 배송 시작 메일(`ship.ts` 를 콘솔로 복사) · CSV 형식은 스크립트 `ship-csv` 와 같다(`주문번호,택배사,운송장`).
- 배송 완료 예외: 0088 목록 · `myr_app_admin_deliver`(실제 배송일 · 그 주문의 배송중 줄 전부) — 자동으로 찍지 않는다(분실 · 반송도 완료가 되므로 · 2026-11-10 결정).
- 수취인 · 결제 열람은 기록.
- 없어지는 것: `myr-ops.mjs`(+ `lib/myr-ops-plan.mjs` · 테스트) · 샵 `/api/ops/ship` · `/api/ops/deliver` · `.env.example` 의 `MYR_SHOP_URL`.

## 5. 문의(screens §7)

- 대행 답변: `sender='seller'` · `actor_role='admin'` — 고객에게는 크리에이터 이름으로.
- 새로 만들 것: 전체 문의 목록 · 미답변 필터 RPC.

## 6. 교환 · 환불(screens §8)

- 목록: `myr_app_admin_claims(open_only)`(0078) · 단계는 `myr_refund_request_step`.
- 회수 확인 `myr_app_admin_claim_collected` → 샵이 바로 환불 · 재발송 `myr_app_admin_claim_reship` + 고객 메일 · 환불 다시(크론 10분과 같은 것).
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
| 지급할 차례 · 금액 | `myr_payout_payable` · `myr_payout_amount` · (스크립트) `myr_payout_to_pay` |
| 상태 문구 · 보류 이유 | `myr_payout_status_label` · `myr_payout_hold_label` · `myr_payout_auto_state` |
| 지급 완료 기록 | `myr_payout_mark_paid(month, handle, amount, paid_on, note, actor)` — 거절 `NOT_FOUND` · `ALREADY_PAID`(paid_on) · `NOT_PAYABLE`(status · hold_label) · `AMOUNT_MISMATCH`(amount) · `BAD_DATE` · `FUTURE_DATE` · `BEFORE_RUN`(run_on) |
| 지급 완료 취소 | `myr_payout_unmark_paid` — `REASON_REQUIRED` · `NOT_PAID` |
| 운영 보류 · 해제 | `myr_payout_hold` · `myr_payout_release` — `NOTE_REQUIRED` · `ALREADY_PAID` · `ALREADY_HELD` · `NOTHING_TO_PAY` · `NOT_MANUAL` |
| 지급 때 계좌 · 이력 | `paid_bank`(가린 값 · `myr_payout_bank_snapshot`) · `myr_payout_logs` |

| 새로 만들 것 | 이유 |
|---|---|
| 화면용 지급 목록 읽기 RPC(가린 계좌 · 탭 카운트 · 크리에이터 필터) | `myr_payout_to_pay` 는 계좌 원문을 돌려준다(스크립트용) |
| 계좌 원문 열람 RPC(열람 기록) · 이체용 내려받기(열람 기록) | 원문은 `sellers.bank_info` 에만 |
| 일괄 지급 완료 RPC(같은 이체일 · 줄별 결과 · 일부 실패해도 나머지 기록) | 여러 줄 선택 기록 |
| 지급 건 상세 읽기 RPC(담긴 줄 · 이력) | 지급 건 상세 |
| 홈 카운트 RPC(지급 가능 · 보류 이유별 · 지급일 지난 지급 대기) | 홈 카드 |
| 월/핸들 대신 id 로 부르는 래퍼(지금 RPC 는 정산월 · 핸들) | 화면은 지급 건 id 를 가진다 |

- 없어지는 것: `myr-settle.mjs` 의 `to-pay` · `paid` · `unpaid` · `hold` · `release`(`report` 는 회차 상세로).

## 10. 세금계산서(screens §12) — 작업 순서 7-4 · 세무 답변 대기

- 지급과 연결: 보류 이유 `tax_invoice` 를 `myr_seller_hold_reason` 에 더하고 표 제약(`myr_payouts_hold_reason_check`)에 추가 → 확인하면 트리거로 지급 대기(0102 와 같은 방식) · 지급 가능 판정이 자동으로 막는다.
- 새로 만들 것: 세금계산서 표(지급 건 · 승인번호 · 제출 · 확인 · 반려 사유) · 크리에이터 제출 RPC · 운영 확인/반려 RPC · 발행 금액을 서버가 계산해 실어 주기(화면 계산 금지).
- 역발행이면 표 · 흐름이 바뀐다(MYR 발행 · 크리에이터 승인).

## 11. 열린 결정

1. **디자인 시안** — Claude Design 요청서는 docs/myr-admin-screens.md(시안에서 열어 둘 것은 그 문서 §13).
2. **자주 쓰는 반려 의견 문구** — 운영팀 표준 문구(표시 · 광고 기준). 설정 화면 또는 코드 상수.
3. **재고 입력 위치** — 승인 RPC 에 묶을지, 따로 둘지(나중에 이벗 재고 연동).
4. ~~운영자 강제 판매 종료~~ — 결정(2026-11-09 · 0082): 판매 종료는 운영만.
5. **심사 결과 알림** — 반려 · 승인을 크리에이터에게 메일로 알릴지.
6. **수정본 이력 보관** — 반영 · 반려된 수정본을 언제까지 둘지.
7. ~~정산 확정 방식~~ — 결정(2026-11-10): 매월 1일 13:00 크론 자동 확정 · 원장 없는 상품만 보류.
8. ~~재생산~~ — 결정(2026-11-09): 원장에 차수로 쌓는다.
9. **지급 방식** — 토스 지급대행 vs 이체 파일(대표 결정 대기). 지금은 운영이 직접 이체하고 `paid` 로 기록(0103). 정해지면 이체용 내려받기 양식 · 지급대행이면 자동 기록.
10. **교환 · 환불 대행 처리** — 크리에이터 기한(2일) 초과 때 운영 대신 승인 · 반려 · 운영 콘솔의 환불 실행(토스 키 위치).
11. ~~공구가 한도~~ — 결정(2026-11-10): 1~70%(0086).
12. **세금계산서** — 역발행 가능 여부 · 발행 금액(정산금 전체 vs 상계 뒤) · 작성일자(세무 확인 중 · 2026-11-12).
13. **지급 완료 알림** — 기록하면 크리에이터에게 메일을 보낼지(지금은 정산 탭 칩만).
14. **지급 완료 취소 권한** — 아무 운영자나 · 기록한 사람 · 관리자만. 잘못 보낸 송금의 회수 절차.
15. **지급 지연 기준** — 지급일에서 며칠 지나면 홈 경고 · 오래된 보류(예: 사업자 정보 3개월 미입력) 안내.

## 12. 운영 전 체크(콘솔과 별개)

- 마이그레이션은 병합 전에 `npx supabase db push --linked`.
- 운영 DB 의 테스트 계정 `*@myr.test` 삭제 또는 비밀번호 교체.
- 승인된 상품 재고 확인(재고 0 이면 샵에서 품절).
- 0101~0103 적용 뒤 `myr-settle.mjs report <최근 달>` 로 지급 건 상태 확인 — 사업자 정보 확인 전인 크리에이터는 지급 보류로 바뀐다(0102).
