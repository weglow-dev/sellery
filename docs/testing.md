# 테스트 — 백엔드를 바꾸면 같이 쓰고 돌린다

CLAUDE.md "백엔드 변경 원칙" 7(2026-10-29). 두 층이 있고 둘 다 CI(`.github/workflows/ci.yml`)가 돌린다.

| 층 | 대상 | 명령 | 위치 | CI |
|---|---|---|---|---|
| **vitest** (순수 모듈) | 규칙 · 계산 · 매핑 · 검증 — `packages/db` `packages/payments` 의 순수 함수, 운영 스크립트의 순수 부분(`scripts/lib/*.mjs`), 앱의 `$env`·`$app`·DB 를 import 하지 않는 모듈 | `npm test` (`vitest run` · 1~2초) | `packages/*/src/test/*.test.ts` · `apps/*/src/test/*.test.ts` | job "프로토타입 점검" |
| **pgTAP** (SQL) | 마이그레이션이 만든 RPC 의 동작 · 권한(anon/authenticated EXECUTE 없음 · 표 직접 권한 없음 · RLS on) · 상태 전이 · 거부 코드 | `npm run test:db` (`supabase test db --local` · 로컬 Supabase 가 떠 있어야 한다 `npx supabase start`) | `supabase/tests/*.test.sql` | job "DB 테스트 (pgTAP)" — 빈 DB 에 마이그레이션 전부 적용 뒤 실행 |

`.svelte` 화면 · 브라우저 · 토스 결제 시나리오는 자동 테스트 대상이 아니다 — docs/monorepo-migration.md §8.2 대로 사람이 미리보기에서 확인한다.

## 1. vitest — 순수 모듈을 떼어 낸다

앱 코드는 `$env/static/public` · `$app/environment` · Supabase 클라이언트를 import 하는 순간 vitest 에서 못 돌린다. 그래서 **계산은 import 가 없는 모듈로 떼고, 화면·서버 모듈은 그 함수를 부르기만** 한다.

| 떼어 낸 순수 모듈 | 쓰는 쪽 | 테스트 |
|---|---|---|
| `apps/myr-shop/src/lib/cart.ts` — 수량 상한 · 합산 · 배송비 · localStorage 복원 검증 | `lib/state.svelte.ts` (`$derived` 가 `cartTotals()` 결과를 읽기만) | `apps/myr-shop/src/test/cart.test.ts` |
| `apps/myr-shop/src/lib/product-row.ts` — 0056 RPC 행 → `Product` (기본 템플릿 · tag 화이트리스트 · 타입 방어) | `lib/server/db.ts` | `src/test/product-row.test.ts` |
| `apps/myr-shop/src/lib/auth.ts` — `safeNext` 오픈 리다이렉트 · 카카오 `user_metadata` 이름/아바타 | `/login` `/auth/callback` `+layout.server.ts` | `src/test/auth.test.ts` |
| `apps/myr-shop/src/lib/data.ts` — 크리에이터 색 · related · 포맷 | 화면 전부 | `src/test/data.test.ts` |
| `packages/db/scripts/lib/myr-products-plan.mjs` — 시드 JSON 검증 · 핸들 정규화 · 상세 템플릿 · upsert 행 조립 | `scripts/myr-products.mjs` (DB 호출만 남김) | `packages/db/src/test/myr-products-plan.test.ts` (시드 파일 8개가 전부 검증을 통과하는지도) |
| `packages/db/scripts/lib/purge-plan.mjs` 등 셀러리 쪽 ~30개 | 각 스크립트 · 서버 모듈 | `packages/db/src/test/*.test.ts` |

규칙:
- 테스트 파일은 `src/test/` 아래 `*.test.ts`. 루트 `vitest.config.ts` 의 `include` 가 `packages/*/src/**/*.test.ts` 와 `apps/*/src/test/**/*.test.ts` — 새 앱이면 자동으로 잡힌다.
- 상대 경로로 import 한다(`../lib/cart`). `$lib` 별칭은 vitest 에 없다.
- 무엇을 고정하나: **경계값**(0 · 상한 · 무료배송 기준 금액 그대로) · **거부 경로**(잘못된 입력이 어떤 메시지로 막히나) · **기본값**(비어 있을 때 무엇이 채워지나). 정상 1건만 쓰고 끝내지 않는다.
- 숫자 상수(`FREE_SHIPPING` 등)는 테스트에서 상수를 import 해 쓴다 — 정책이 바뀌면 상수만 바꾸고 테스트는 그대로 통과해야 한다. 단 경계가 바뀌는 변경(policy-change)은 테스트도 같이 고친다.

## 2. pgTAP — 마이그레이션의 RPC · 권한

`supabase/tests/<주제>.test.sql`. 한 파일 = `begin; select plan(N); … select * from finish(); rollback;` — **전부 롤백**되므로 로컬 DB 에 흔적이 남지 않고, 운영 DB 는 건드리지 않는다(`--local` 고정).

한 RPC 당 고정할 것(0056 `myr_products.test.sql` 이 본보기 · 28개):
1. **권한** — 표: `table_privs_are(... 'anon', '{}')` · RLS: `relrowsecurity` · 함수: 공개 RPC 는 `function_privs_are(... 'anon', '{EXECUTE}')`, 운영 RPC 는 anon·authenticated 모두 `'{}'`.
2. **픽스처** — 고정 uuid(`00000000-0000-4000-8000-0000000000xx`) 와 `pgtap-` 접두 code 로 넣는다. 로컬 DB 에 시드 데이터가 같이 있으므로 **집계·목록 검사는 `like 'pgtap-%'` 로 좁혀서** 본다.
3. **공개 응답에 없어야 할 필드** — `(e ? 'stock') = false` 처럼 재고·마진·검수 정보가 안 실리는지.
4. **필터** — pending · paused · 삭제(`deleted_at`) · 셀러 비활성이 목록/카드에서 빠지는지.
5. **상태 전이와 거부 코드 전부** — `{ ok:false, code }` 의 모든 코드(`NOT_FOUND` `BAD_DECISION` `REASON_REQUIRED` `WRONG_STATUS`)를 한 번씩, 성공 전이는 전후 행 값까지.

pgTAP 함수 목록은 https://pgtap.org/documentation.html (`is` `ok` `has_table` `table_privs_are` `function_privs_are` `throws_ok` 정도면 충분).

## 3. 어떤 변경에 무엇을 쓰나

| 바꾼 것 | 쓰는 테스트 |
|---|---|
| `supabase/migrations/00xx` 에 표·RPC 추가/수정 | pgTAP 새 파일 또는 기존 파일에 추가 (+ 순수 계산이 있으면 vitest 도) |
| `packages/db` `packages/payments` 의 규칙 함수 | vitest (`packages/*/src/test`) |
| `apps/*/src/lib/server/*.ts` · `routes/api` | 계산·매핑은 순수 모듈로 떼어 vitest · DB 호출 자체는 pgTAP 이 RPC 를 보장 |
| 운영 스크립트 `packages/db/scripts/*.mjs` | 검증·계획 부분을 `scripts/lib/*-plan.mjs` 로 떼어 vitest (purge-plan · myr-products-plan 방식) |
| 화면만(.svelte · 문구 · 스타일) | 없음 — 미리보기 확인 |

PR 본문 "백엔드를 건드렸다면" 칸에 두 명령의 결과(통과 수)를 적는다.
