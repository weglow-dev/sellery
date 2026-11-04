# @sellery/myr-core

MYR 세 앱(`apps/myr-shop` · `apps/myr-influencer` · `apps/myr-admin`)이 같이 쓰는 코드. 환불 · 문의 · 발송 · 메일 · 토스 호출을 **한 곳에** 두어,
고객 셀프 환불 · 인플루언서 승인 환불 · 운영 예외 환불이 같은 함수와 같은 SQL 을 탄다(docs/myr.md 결정 12 · §4.2.1 1번).

빌드 없음 — `.ts` 소스를 그대로 export 하고 앱의 Vite 가 컴파일한다(`packages/payments` 와 같은 관례).

## 구성

| 경로 | 내용 | 서버 전용 |
|---|---|---|
| `constants` · `site` · `text` · `company` | 공용 상수(`MAX_QTY` · `won`) · 샵 주소(`siteOrigin`) · 문자열 정리 · 사업자 정보 | |
| `auth` · `creator` · `seller` | 표시명 · 프로필 사진 · 안전한 `next`(오픈 리다이렉트 방지) / 크리에이터 아바타 이니셜·색 · 핸들 정규화 / 콘솔 게이트 타입 | |
| `checkout-rules` · `order-view` · `refund-rules` · `cs-rules` · `ship-rules` | 순수 규칙 — 입력 검증 · RPC 응답 파서 · 화면 판정 · 문구 | |
| `mail/{resend,layout,templates}` | Resend 전송기 · 메일 레이아웃 · 템플릿(순수) | |
| `server/config` | `configureMyrCore` — 키·주소 주입 | ✓ |
| `server/admin` | service role Supabase 클라이언트 | ✓ |
| `server/toss` | 토스 승인 · 취소 · 조회 | ✓ |
| `server/payment-events` | 결제 감사 로그 `payment_events` | ✓ |
| `server/refund` · `server/refund-photos` | 줄 단위 환불(precheck → 토스 부분 취소 → record) · 환불 사진 | ✓ |
| `server/cs` · `server/ship` · `server/mail` · `server/mail-events` | 문의 · 발송 · 메일 발송 · 메일 훅 | ✓ |
| `server/seller` | 크리에이터 콘솔 게이트 `sellerContext(user)` — `sellers.user_id = 계정 and active` | ✓ |

샵에만 있는 것(결제 세션 · 웹훅 · 크론 · 장바구니 · 상품 공개 RPC · 주문 조회)은 `apps/myr-shop/src/lib/server` 에 남아 있다.

## 쓰는 법

1. 앱 `package.json` 의 `dependencies` 에 `"@sellery/myr-core": "*"`.
2. 앱 `src/lib/server/env.ts` 가 `$env` 를 읽어 **한 번** 주입한다(패키지는 `$env` 를 모른다).

   ```ts
   import { configureMyrCore } from '@sellery/myr-core/server/config';
   configureMyrCore({ supabaseUrl, serviceKey, tossSecretKey, resendApiKey, resendApiUrl, mailFrom, shopUrl });
   ```

   `shopUrl` 은 메일 링크가 가리키는 **샵** 주소 — 샵은 자기 `PUBLIC_SITE_URL`, 콘솔은 샵 주소를 담은 환경변수.
   값이 비어도 실패하지 않는다 — `admin()` 은 호출 시점에 throw, 토스는 `CONFIG_ERROR`, 메일은 비활성.
3. 서버 코드는 `$lib/server/<모듈>.ts` 를 거쳐 쓴다 — `import './env'; export * from '@sellery/myr-core/server/<모듈>';`
   (`$lib/server` 경로라 브라우저 코드가 import 하면 SvelteKit 이 빌드를 막는다 · 주입이 먼저 끝난다). 순수 모듈은 `@sellery/myr-core/<모듈>` 을 바로 import.

## 규칙 (`scripts/check-boundaries.mjs` 가 CI 에서 검사)

- 셀러리 패키지(`@sellery/db` · `@sellery/payments` · `@sellery/core` · `@sellery/ui`)를 import 하지 않는다 — 셀러리를 걷어낼 때 MYR 이 같이 깨지지 않게(결정 11). 필요한 코드는 복사한다.
- SvelteKit 별칭(`$env` · `$app` · `$lib`)을 쓰지 않는다 — 설정은 `configureMyrCore` 로.
- 순수 파일(`.server.ts` 가 아닌 것 · 테스트 포함)은 `server/` 를 import 하지 않는다.
- 브라우저 코드는 `@sellery/myr-core/server/*` 를 import 하지 않는다.

테스트: `src/test/*.test.ts`(vitest · 루트 `npm test`). SQL 은 `supabase/tests/myr_*.test.sql`(pgTAP).
