# @sellery/db

옛 `web/src/lib/**`(Next · S5 PR-11 에서 삭제) 의 데이터 계층을 SvelteKit 앱 4개가 쓰도록 옮긴 패키지 — Supabase 클라이언트 · 인증 · 캠페인 · 주문 · 고객 · 링크 유입 · 법적 문서 · 사업자 정보 · 파트너(인플루언서) 가입/게이트. 이동 표와 근거는 [docs/monorepo-migration.md §3](../../docs/monorepo-migration.md) 이 원본이다. 빌드 없음 — 소스를 그대로 export 하고 앱의 Vite 가 컴파일한다.

## 경계 규칙

| import | 어디서 |
|---|---|
| `@sellery/db` · `@sellery/db/{auth,campaign,linkctx,order-status,dates,text,carriers,types,legal,company,console-paths}` · `@sellery/db/partner/{signup-rules,sample-rules}` · `@sellery/db/legal/{terms,privacy}` | **순수** — 브라우저·서버·vitest 어디서나. Supabase 클라이언트를 만들지 않는다 |
| `@sellery/db/browser` (`createBrowserSupabase(url, anonKey)`) | 브라우저 도달 코드(로그인·인증 확인)만. `+*.server.ts` 금지 |
| `@sellery/db/server/{config,admin,auth,linkctx,customers,campaign,orders}` · `@sellery/db/server/partner/{seller,signup,slack,products,campaigns,home,my}` | **서버 전용** — 앱의 `src/lib/server/*.ts` 배럴을 통해서만 (`$lib/server/` 는 SvelteKit 이 브라우저 번들에서 막는다). `.svelte` · `+page.ts` · `+layout.ts` 에서 import 하면 `scripts/check-boundaries.mjs` 가 CI 를 실패시킨다 |

서버 함수의 관례(§2.4 · §3.4):

- 요청이 필요한 함수는 **`event`(SvelteKit `RequestEvent` 의 부분집합 `DbEvent`) 를 첫 인자**로 받는다 — `event.locals.supabase`(hooks 가 만든 SSR 클라이언트, 키가 없으면 `null` → 함수는 "없음" 으로 응답) · `event.locals.safeGetSession()` · `event.locals.memo`(요청당 메모, React `cache()` 대체).
- **비밀은 앱의 `hooks.server.ts` 가 `$env/dynamic/private` 에서 읽어 모듈 로드 시 1회 주입**한다: `configureDb({ url, anonKey, serviceKey, slackWebhookUrl })`. 패키지는 `$env` 도 `process.env` 도 읽지 않는다. `createAdminClient()` 는 키가 없으면 **호출 시점에만** throw(빌드는 통과). service role 이 필요한 함수는 `admin` 을 마지막 인자로 주입할 수도 있다.
- **redirect 를 던지지 않는다** — `requireSeller(event, { next })` 는 `{ ok:false, state, location }` 을 돌려주고 앱이 `redirect(303, location)` 한다.
- 호스트 모드(`inf.sellery.life`)는 폐기 — `console-paths.ts` 는 경로 모드(`/influencer/*`)만 안다.

## 파일

```
src/index.ts             순수 모듈만 re-export (append-only)
src/database.types.ts    Supabase 생성 타입 — 직접 고치지 않는다 (gen:types)
src/browser.ts           createBrowserSupabase(url, anonKey)
src/auth.ts linkctx.ts campaign.ts console-paths.ts order-status.ts carriers.ts dates.ts text.ts types.ts legal.ts company.ts
src/partner/signup-rules.ts   가입 폼·서버 공용 규칙 (순수)
src/partner/sample-rules.ts   샘플 견적(app_sample_quote jsonb) → 버튼·안내 문구 · 배송지 폼 검증 · 캠페인 상태 칩/스테퍼 (순수)
                              · 샘플 결제(0012 partner_payments): PartnerPaymentView · isPayable · payLine · partnerPaymentStatusLabel · RPC 결과 파서 · PARTNER_PAY_FAIL_MESSAGES
src/legal/{terms,privacy}.ts  약관·처리방침 본문 — 비개발자 편집 대상
src/server/*.server.ts        event.server(DbEvent · memoized) · config · admin · auth · linkctx · customers · campaign · orders
src/server/partner/*.server.ts  seller(getSellerContext · requireSeller · rateLimit) · signup(createSellerFromSignup) · slack
                                · products(listProductsForSeller · getProductForSeller · requestFreeSample) · campaigns(listSellerCampaigns · getSellerCampaign · receiveSample)
                                · home(getHomeWidgets) · my(saveSampleAddress) — 콘솔 3단계, 0011 RPC(app_sample_quote(s) · app_request_free_sample · app_receive_sample)
                                · 샘플 결제(0012 app_partner_payment_*) 의 서버 함수는 토스 호출과 묶여야 하므로 @sellery/payments/server/partner-sample 에 있다
src/test/*.test.ts       vitest — 순수 규칙만 (루트 `npm test`)
scripts/*.mjs            gen-types · partner-admin(list/suspend/…/channels · 4단계 payments · refund-sample = 토스 취소 + app_partner_payment_refund) · dev-seller · dev-user (Node · 루트 .env.local)
```

## gen:types

```
npx supabase db push --linked      # 새 마이그레이션 적용 (docs/data-model.md §8)
npm run gen:types                  # 루트에서 — packages/db/src/database.types.ts 갱신 (실패하면 파일을 건드리지 않는다)
npm run check                      # 타입 깨짐 확인 — 같은 PR 에 넣는다
```

사전 조건 `supabase login` + `supabase link --project-ref …`. 절차 원문은 `docs/deploy.md §6.1`.
