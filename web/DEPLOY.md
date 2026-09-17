# 셀러리 앱 배포 (Vercel `sellery-app`)

`web/` 의 Next.js 앱은 서버 기능(토스 결제 승인 · Supabase SSR · 웹훅)이 있어 정적 호스팅이 불가하다. **프로토타입과 Vercel 프로젝트를 분리**한다(`docs/app-plan.md §0-2`):

| Vercel 프로젝트 | 내용 | Root Directory | 주소 |
|---|---|---|---|
| `sellery` (기존) | 프로토타입 — 저장소 루트를 빌드 없이 서빙(`vercel.json` framework null, `.vercelignore` 가 `web` 제외) | `/` | https://sellery-swart.vercel.app/ → 도메인 이전 후 `demo.sellery.co.kr`(§6) |
| `sellery-app` (신규) | 이 앱 | `web` | `https://sellery-app.vercel.app` → 준비되면 `https://sellery.co.kr`(§6) |

같은 GitHub 저장소(`weglow-dev/sellery`)에 두 프로젝트를 연결한다. `main` 병합 = 두 프로젝트 모두 Production 배포, PR = Preview. 값(키)은 이 문서·코드·PR 어디에도 쓰지 않는다 — `web/.env.local`(gitignored) 과 Vercel 환경변수에만.

---

## 1. Vercel 프로젝트 `sellery-app` 설정 (대시보드)

Vercel → team `weglow-team` → Add New Project → 저장소 `weglow-dev/sellery` import.

| 항목 | 값 | 이유 |
|---|---|---|
| Project Name | `sellery-app` | |
| **Root Directory** | `web` | 모노레포 형태. 지정하지 않으면 루트의 프로토타입 `vercel.json`(framework null) 을 읽어 Next 빌드를 하지 않는다 |
| **Include source files outside of the Root Directory** | **off** | 앱은 루트 파일(`js/`, `css/`, `supabase/`)을 import 하지 않는다. 켜면 업로드 범위만 커진다 |
| Framework Preset | Next.js (자동 감지) | |
| Build / Install Command | 기본값 (`next build` / `npm install`) | `web/package.json` 에 `prebuild` 훅 없음 |
| Node.js Version | Vercel 기본값 그대로(20.x 이상) | Next 16.2.9 는 `>=20.9.0`. CI(`web-ci`)는 20 으로 고정 — Vercel 이 더 높은 버전을 기본으로 잡아도 무방 |
| Region | `icn1` — `web/vercel.json` 이 지정 | Supabase `sellery`(Seoul)와 같은 리전. 대시보드에서 따로 고르지 않아도 된다 |
| Cron Jobs | 없음 | 슬라이스 1 은 크론 없음. reconcile · 만료 · PII 파기는 수동 호출(§4.3). 슬라이스 4 에서 `vercel.json` `crons` 로 |
| **Deployment Protection** | Preview: **Off** 또는 "Protection Bypass for Automation" 토큰 발급 | 기본값(Vercel Authentication 켜짐)이면 토스 `successUrl` 복귀 · 웹훅 · 카카오 콜백이 인증 페이지에 막혀 **Preview 에서 결제 테스트가 안 된다**. Production 은 켜지 않는다(공개 서비스) |
| Git → Production Branch | `main` | |

Preview 의 결제 테스트는 브랜치 고정 도메인(`sellery-app-git-<branch>-<team>.vercel.app`) 을 쓰면 Supabase Redirect URL(§3.1)·토스 웹훅 URL 을 매번 바꾸지 않아도 된다.

## 2. 환경변수 (Settings → Environment Variables)

`docs/app-plan.md §3` 표가 원본이다. **Production 과 Preview 둘 다** 입력한다(Development 는 로컬 `.env.local`). 비밀 항목은 "Sensitive" 로 표시한다.

| 이름 | 공개/비밀 | Production | Preview | 어디서 얻나 · 비고 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | `https://ocxppeuoiysnkwwujvko.supabase.co` | 같음 | Supabase → Project `sellery` → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 | anon key | 같음 | 같은 화면 |
| `SUPABASE_SERVICE_ROLE_KEY` | **비밀(서버)** | service_role key | 같음 | 같은 화면. RLS 우회 — `lib/supabase/admin.ts` 에서만 읽는다 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 공개 | `live_gck_…` (실판매 직전) | `test_gck_…` | 토스 개발자센터 → 내 개발정보 → 상점 → **결제위젯 연동 키** → 클라이언트 키 |
| `TOSS_SECRET_KEY` | **비밀(서버)** | `live_gsk_…` | `test_gsk_…` | 같은 화면 → 시크릿 키. **반드시 위 클라이언트 키와 짝**(gck ↔ gsk). API 개별연동 키(`ck_/sk_`)를 섞으면 위젯이 안 뜨거나 승인 실패 |
| `NEXT_PUBLIC_TOSS_WIDGET_VARIANT` | 공개 | 상점관리자에서 확인한 결제수단 UI 변형 이름 | 같음 | 비우면 `DEFAULT-2`. 약관은 코드에서 `AGREEMENT` 고정(§3.3) |
| `NEXT_PUBLIC_SITE_URL` | 공개 | `https://sellery.co.kr` (이전 전에는 `https://sellery-app.vercel.app`) | `https://sellery-app.vercel.app` | `metadataBase` · 절대 URL. OAuth `redirectTo`·토스 `successUrl` 은 `window.location.origin` 을 써서 Preview 마다 바꿀 필요 없다 |
| `CRON_SECRET` | 비밀 | 임의 생성 (`openssl rand -hex 32`) | 별도 값 | `/api/cron/reconcile` 수동 호출용 `Authorization: Bearer …`. 슬라이스 1 은 크론 없음(§4.3) |
| `ADMIN_PASSWORD` | 비밀 | (다음 슬라이스) | — | 관리자 Basic Auth 이중 잠금 — 단독 인증이 아니다(§3 표 주석). 지금은 넣지 않는다 |

앱 환경변수가 **아닌** 것(대시보드에만 입력): 카카오 REST API 키 · Client Secret → Supabase Authentication → Providers → Kakao (§3.2).

CI 는 이 값들 없이 더미(`.github/workflows/web-ci.yml` 의 `env`)로 빌드한다 — `force-dynamic` 페이지는 프리렌더되지 않고 `admin.ts`·`toss.ts` 는 호출 시점에만 throw 하기 때문. 빌드가 실제 키를 요구하게 되면 설계 위반이다(§11.1).

## 3. 외부 서비스 설정 (코드 밖 · 대시보드)

### 3.1 Supabase (`sellery`, ref `ocxppeuoiysnkwwujvko`)

- **Authentication → Providers → Kakao**: Enabled, Client ID = 카카오 REST API 키, Client Secret = 카카오 Client Secret(§3.2). 콜백 URL 은 Supabase 가 보여 주는 `https://ocxppeuoiysnkwwujvko.supabase.co/auth/v1/callback`.
- **Authentication → URL Configuration**:
  - Site URL: `https://sellery.co.kr` (이전 전에는 `https://sellery-app.vercel.app`)
  - Redirect URLs (전부 추가): `https://sellery.co.kr/**` · `https://sellery-app.vercel.app/**` · `https://*-<vercel-team>.vercel.app/**`(Preview) · `http://localhost:3000/**`
  - 여기 없는 `redirectTo` 는 Site URL 로 떨어져 `next` 를 잃는다 — Preview 브랜치 도메인도 와일드카드로 포함시킬 것.
- **키**: Settings → API 의 URL · anon · service_role 을 §2 표대로. service_role 은 서버 전용.
- 스키마·권한: §4.

### 3.2 카카오 개발자 앱

- 카카오 로그인 활성화, **Redirect URI** 에 `https://ocxppeuoiysnkwwujvko.supabase.co/auth/v1/callback` (앱 도메인이 아니라 Supabase 콜백 — 도메인 이전과 무관).
- 동의 항목: 닉네임 · 이메일. **이메일을 필수 동의로 받으려면 비즈 앱 전환**이 필요 — 미전환이면 선택 동의라 `user.email` 이 null 일 수 있고 앱은 이미 optional 로 다룬다(`docs/app-plan.md §4.1`).
- 앱은 `signInWithOAuth` 에 `scopes` 를 지정하지 않는다 — 동의 항목은 카카오 콘솔이 결정.

### 3.3 토스페이먼츠 (상점 `NHN_shingoonk`)

- **키**: 개발자센터 → 내 개발정보 → **결제위젯 연동 키**. 테스트 짝(`test_gck_`/`test_gsk_`)은 `.env.local` 과 Vercel Preview, 라이브 짝(`live_gck_`/`live_gsk_`)은 실판매 직전 Vercel Production. 라이브 전환은 **둘을 함께**.
- **위젯 설정**(상점관리자 → 결제위젯): 결제수단에서 **가상계좌 · 계좌이체 비활성화**(카드 · 간편결제만 — 승인 응답이 200 이어도 `WAITING_FOR_DEPOSIT` 이면 돈이 없는 상태, glo 실사고). UI 변형 이름 2개(결제수단 · 약관)를 확인해 결제수단 값을 `NEXT_PUBLIC_TOSS_WIDGET_VARIANT` 에, 약관은 `AGREEMENT` 인지 확인(다르면 D 파티션 코드 수정).
- **웹훅 URL** (개발자센터 → 웹훅, 테스트 상점 · 라이브 상점 각각):

  | 시점 | 웹훅 URL |
  |---|---|
  | 도메인 이전 전 | `https://sellery-app.vercel.app/api/payments/webhook` |
  | 도메인 이전 후 | `https://sellery.co.kr/api/payments/webhook` |
  | 로컬 테스트 | 터널 URL + `/api/payments/webhook` (`docs/app-plan.md §11.4`) |

  이벤트 `PAYMENT_STATUS_CHANGED` (+ `DEPOSIT_CALLBACK` 은 무관하나 켜 두어도 무해). 웹훅은 **서명이 없는 공개 엔드포인트**다 — 앱은 본문을 믿지 않고 `paymentKey` 재조회로만 상태를 바꾸며(§7.3), 그 위에 **Vercel Firewall(Custom Rules → Rate Limit) 로 `/api/payments/webhook` 에 IP 기준 레이트리밋(예: 분당 60)** 을 건다(플랜에 없으면 upstash ratelimit 을 라우트 앞에 — 다음 슬라이스). 콘솔의 "웹훅 테스트 전송" 으로 등록을 확인한다.
- **운영 규칙**: 토스 콘솔에서 **부분취소를 하지 않는다**(슬라이스 1 은 전액 취소만 정식 지원 — 부분취소는 `payment_events handled=false` 큐로 남아 수동 정산 조정). 정산 완료 캠페인 · 샘플 주문의 콘솔 취소도 같은 큐(`orders.status='CANCELED'`)로 간다.

### 3.4 다음 우편번호 API

외부 스크립트 `t1.daumcdn.net` — 체크아웃 배송지 입력에 쓴다. CSP 를 두면 허용 목록에 추가.

## 4. 데이터베이스

### 4.1 마이그레이션 (저장소 루트에서)

`supabase/` 는 **저장소 루트**에 있고 CLI 도 루트에서 실행한다. 2026-09-15 기준 클라우드 `sellery` 에 `0001~0008` 적용 완료(`supabase_migrations.schema_migrations` 로 확인). 이후 변경은 이미 적용된 파일을 고치지 말고 **새 번호(`0009_…`)** 로 추가 → PR → 병합 → 로그인 · 링크된 PC 에서:

```bash
npx supabase login
npx supabase link --project-ref ocxppeuoiysnkwwujvko     # DB 비밀번호 필요 (최초 1회)
npx supabase db push --linked --dry-run
npx supabase db push --linked
cd web && npm run gen:types                                 # src/lib/database.types.ts 갱신 → typecheck 재확인 → 같은 PR 에 포함
```

시드 재투입은 `npx supabase db query --linked --file supabase/seed.sql`(멱등). 원격 조회는 `npx supabase db query --linked "select …"`. 절차 · 주의(`--include-seed` 가 SQL 을 실행하지 않는 문제, `service_role` grant 0007)는 `docs/data-model.md §8 · §10`.

**DB 마이그레이션은 앱 배포보다 먼저**: 새 컬럼·함수를 쓰는 앱을 먼저 올리면 그 사이 요청이 실패한다. 반대로 컬럼을 지우는 마이그레이션은 앱이 더 이상 쓰지 않는 것을 배포한 **다음** 에.

### 4.2 적용 후 스모크

`docs/data-model.md §8.4`(anon 가시성) · `§10.4`(0008 함수 · grant) 의 쿼리를 `npx supabase db query --linked` 로 문장별 실행. 요지: anon 은 `campaign_card('c1')` 을 읽고 `checkout_sessions` · `app_*` 함수는 permission denied, service_role 은 전부 가능.

### 4.3 수동 운영 잡 (슬라이스 1 — 크론 없음)

| 잡 | 방법 | 주기(권장) |
|---|---|---|
| reconcile — CONFIRMING 고착 · `FAILED(CANCEL_PENDING)` 종결(§7.5) | `curl -X POST https://<앱>/api/cron/reconcile -H "Authorization: Bearer $CRON_SECRET"` | 결제 테스트 뒤 · 하루 1회 |
| 세션 만료 — PENDING · payment_key 없는 CONFIRMING → EXPIRED | `npx supabase db query --linked "select expire_checkout_sessions()"` | 하루 1회 |
| PII 파기 — FAILED/EXPIRED 30일 경과 세션의 실명 · 연락처 · 배송지 | `npx supabase db query --linked "select purge_checkout_pii()"` | 주 1회 |
| 운영 큐 확인 | `select id, source, result, received_at from payment_events where handled = false order by received_at desc` | 매일 |

슬라이스 4 에서 캠페인 스케줄러와 함께 Vercel Cron(`web/vercel.json` `crons`) 으로 옮긴다(`docs/app-plan.md §12`).

## 5. CI · 브랜치 보호

- `.github/workflows/web-ci.yml` — job `web-ci`: `web/` 에서 `npm ci → next typegen → typecheck → lint → build`(Node 20, 더미 env). 모든 PR 과 `main` push 에서 돈다(paths 필터 없음 — required check 는 항상 결과를 보고해야 한다).
- 기존 `.github/workflows/ci.yml`(job `프로토타입 점검` = `node scripts/check.mjs`)은 그대로.
- **브랜치 보호(`main`) → Require status checks** 에 `web-ci` 를 **추가**한다(`프로토타입 점검` 과 둘 다). job `name` 을 바꾸면 보호 규칙도 같이 바꿀 것.
- Vercel GitHub 연동이 되면 PR 마다 `sellery`(프로토타입) · `sellery-app`(앱) Preview 댓글이 각각 달린다.

## 6. 도메인 이전 절차 (`sellery.co.kr`: 프로토타입 → 앱)

앱이 준비되면(§7 체크리스트 완료 + Preview 에서 §11.2/§11.3 시나리오 통과) 정식 도메인을 `sellery` 프로젝트에서 `sellery-app` 으로 옮긴다. 프로토타입은 지우지 않고 서브도메인으로 유지한다(제안서 데모 · 이해관계자 시연용).

1. **결정**: 프로토타입 주소를 `demo.sellery.co.kr` 로 할지 확정(§13 열린 결정). 이전 시각은 트래픽이 적은 시간으로.
2. **사전 준비 (이전 전날까지)**
   - Vercel `sellery-app` Production 환경변수에 **라이브 토스 키 짝** · `NEXT_PUBLIC_SITE_URL=https://sellery.co.kr` 입력 → 재배포.
   - Supabase URL Configuration: Site URL 을 `https://sellery.co.kr` 로, Redirect URLs 에 `https://sellery.co.kr/**` 가 있는지(§3.1). 카카오 Redirect URI 는 Supabase 콜백이라 변경 없음.
   - 토스 라이브 상점 웹훅 URL 을 `https://sellery.co.kr/api/payments/webhook` 으로 **미리 추가**(테스트 상점은 그대로 둔다).
   - `web/next.config.ts` 의 `redirects()` 에 프로토타입 경로 리다이렉트 추가(A 파티션 파일): `/index.html` → `/`, `/login.html` → `/login`. 해시 라우트(`/#s/c1`, `/#customer`)는 서버가 볼 수 없어 리다이렉트 불가 — 제안서 · SNS 에 뿌린 `/#s/{code}` 링크가 있으면 홈에서 안내(다음 슬라이스).
   - 프로토타입 저장소 안내 링크(루트 `README.md` · `CONTRIBUTING.md` 의 데모 주소)를 `demo.sellery.co.kr` 기준으로 바꿀 PR 준비.
3. **이전 (Vercel 대시보드)**
   - `sellery` 프로젝트 → Settings → Domains 에서 `sellery.co.kr`(과 `www`) **제거** → `sellery-app` → Domains 에 **추가**. 같은 팀 안에서는 Vercel 이 DNS 검증 없이 넘겨 준다. DNS 가 Vercel 네임서버가 아니면(등록기관 관리) Vercel 이 안내하는 A/CNAME 레코드가 그대로인지 확인 — 보통 레코드는 바뀌지 않는다.
   - `sellery` 프로젝트에 `demo.sellery.co.kr` 추가 → DNS 에 CNAME `cname.vercel-dns.com` 추가.
   - `www.sellery.co.kr` → `sellery.co.kr` 리다이렉트는 Vercel Domains 설정에서.
4. **확인 (5분 안에)**: `curl -sI https://sellery.co.kr/` 200 · `https://sellery.co.kr/s/<handle>/<code>` 200 · `https://sellery.co.kr/c/<code>` 308 · `/login` 에서 카카오 로그인 왕복 · 토스 라이브 키로 **소액 실결제 1건 후 즉시 취소**(내 주문에서 환불 → 카드사 취소 확인) · 토스 콘솔 "웹훅 테스트 전송" 200 · `robots.txt` 에 `/api` `/checkout` `/account` disallow.
5. **사후**: 준비한 README/CONTRIBUTING PR 병합 · 제안서 · 카카오 채널 · 인플루언서에게 알린 링크 형식은 `https://sellery.co.kr/s/{handle}/{code}`(`@` 없는 핸들) · 토스 테스트 상점 웹훅은 그대로 Preview/로컬용.
6. **롤백**: 도메인을 다시 `sellery` 프로젝트로 옮기면 즉시 프로토타입으로 돌아간다(두 프로젝트 모두 살아 있다). 앱 자체 문제는 Vercel Deployments → 이전 배포 "Promote to Production"(Instant Rollback). DB 마이그레이션은 forward-only — 되돌리려면 새 마이그레이션.

## 7. 배포 전 체크리스트 (`docs/app-plan.md §13` — 사용자가 해야 할 것)

- [ ] **토스페이먼츠 키**: 결제위젯 연동 키 테스트 짝 → `web/.env.local` + Vercel Preview. 라이브 짝 → 실판매 직전 Vercel Production. 코드에 넣지 않는다.
- [ ] **토스 위젯 설정**: 가상계좌 · 계좌이체 비활성화. UI 변형 이름 2개(결제수단 · 약관) 확인 → `NEXT_PUBLIC_TOSS_WIDGET_VARIANT`.
- [ ] **토스 웹훅 URL 등록**(테스트 · 라이브 각각, §3.3 표) + Vercel WAF 레이트리밋.
- [ ] **토스 운영 규칙** 공유: 콘솔 부분취소 금지 · 정산 완료 · 샘플 주문 취소는 조정 큐.
- [ ] **Supabase CLI 링크**: `npx supabase login` + `link --project-ref ocxppeuoiysnkwwujvko`(DB 비밀번호) — `db push` · `gen:types` 전제.
- [ ] **카카오 개발자 앱**: 로그인 활성화 · Redirect URI(Supabase 콜백) · 동의 항목 · REST API 키 · Client Secret · 비즈 앱 전환 여부 결정.
- [ ] **Supabase Auth**: Kakao provider 키 입력 · Site URL · Redirect URLs 4종(§3.1).
- [ ] **Supabase 키**: URL · anon · service_role → `.env.local` + Vercel(Production + Preview).
- [ ] **Vercel `sellery-app` 생성**: Root Directory `web` · outside-root off · 환경변수 표 · Deployment Protection(Preview off 또는 bypass 토큰) · `icn1`(vercel.json).
- [ ] **브랜치 보호**: `main` required status check 에 `web-ci` 추가(`프로토타입 점검` 유지).
- [ ] **0008 적용 확인**: 클라우드에 0001~0008 적용됨(2026-09-15). `docs/data-model.md §10` 검토 — `orders.status='CANCELED'` 를 조정 큐로 쓰는 결정 · hidden 인플루언서 채널 비노출.
- [x] **사업자 정보 확정** — 2026-09-17 반영(`web/src/lib/company.ts`): 대표 강신욱 · 사업자등록번호 517-86-00666 · 통신판매업신고번호 제2022-서울강남-00726호 · 주소 서울시 성동구 왕십리로 38(홍성빌딩), 3층 · 고객센터 = 이메일 `official@weglow.biz`(채널톡 등 별도 채널은 두지 않기로 — 사용자 결정). 전자상거래법상 모든 페이지 푸터에 필요.
- [ ] **이용약관 · 개인정보처리방침** 문서 유무 결정 — 없으면 체크아웃은 토스 위젯 내장 약관 + 통신판매중개자 확인 체크만. 개인정보처리방침에 `docs/app-plan.md §5.1` 보존 · 파기표(미결제 세션 30일 · 거래기록 5년 · 결제 이벤트 로그 1년) 반영.
- [ ] **다음 우편번호 API** 외부 스크립트 승인(CSP 허용 목록).
- [ ] **도메인 이전 시점 결정** + 프로토타입 서브도메인(`demo.sellery.co.kr`) 여부 → §6.
- [ ] **열린 결정 확인**(기본값으로 진행 중): 발송 후 고객 셀프 환불 불가 · 홈 "보는 중" 의사난수 유지 · 홈 `최저가` 문구 유지 · 환불 사유 선택(단순 변심/상품 하자/오배송/기타).

## 8. 배포 후 확인 (Production · Preview 공통)

0. `/api/health` → 200 `{"ok":true,"checks":{"supabaseAdmin":"ok","toss":"ok"}}` — 로그인 없이 서버 비밀키 2개(`SUPABASE_SERVICE_ROLE_KEY` · `TOSS_SECRET_KEY`)가 맞는 값인지 확인한다(DB HEAD 조회 1회 + 토스 존재하지 않는 결제 조회 1회). 503 이면 Vercel → Logs 의 `[health]` 줄에 원인.
1. `/` 200 — 헤더 · 푸터 · 사업자 정보 · 배경 `#eef3dc`.
2. `/s/<handle>/<code>` 200 + 응답에 `set-cookie: slry_linkctx=<code>; HttpOnly; SameSite=Lax; Secure`. `/c/<code>` → 308 정식 URL. 없는 코드 → 404.
3. `/login` → 카카오 → `/auth/callback` → `next` 복귀. `/checkout` 미로그인 → `/login?next=`.
4. 테스트 키(Preview): 결제창 → 성공 페이지 → 내 주문 1건 → 환불 신청 → `환불 완료`. 성공 페이지 새로고침 → 주문 중복 없음.
5. 토스 콘솔 "웹훅 테스트 전송" → 200, `payment_events` 1행. 임의 본문 `curl -X POST …/api/payments/webhook -d '{}'` → 400 · 행 없음.
6. `/robots.txt` — `/api` `/checkout` `/account` `/login` `/auth` disallow, `/s` `/c` allow.
7. Vercel → Logs 에 `permission denied for table`(0007 미적용) · `server-only` · env 누락 오류가 없는지.
