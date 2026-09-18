# 셀러리 앱 배포 (Vercel `sellery-app`)

`web/` 의 Next.js 앱은 서버 기능(토스 결제 승인 · Supabase SSR · 웹훅)이 있어 정적 호스팅이 불가하다. **프로토타입과 Vercel 프로젝트를 분리**한다(`docs/app-plan.md §0-2`):

| Vercel 프로젝트 | 내용 | Root Directory | 주소 |
|---|---|---|---|
| `sellery-app` | 이 앱 — Vercel 에는 이 프로젝트 **하나** (프로토타입 프로젝트 `sellery` 는 2026-09-18 삭제, 프로토타입 데모는 GitHub Pages) | `web` | https://sellery.life (고객) · https://www.sellery.life → apex · https://inf.sellery.life (인플루언서 콘솔) · https://sellery-app.vercel.app (임시 확인·Preview) — §6 |

같은 GitHub 저장소(`weglow-dev/sellery`)에 두 프로젝트를 연결한다. `main` 병합 = 두 프로젝트 모두 Production 배포, PR = Preview. 값(키)은 이 문서·코드·PR 어디에도 쓰지 않는다 — `web/.env.local`(gitignored) 과 Vercel 환경변수에만.

---

## 1. Vercel 프로젝트 `sellery-app` 설정 (대시보드)

Vercel → team `weglow-team` → Add New Project → 저장소 `weglow-dev/sellery` import.

| 항목 | 값 | 이유 |
|---|---|---|
| Project Name | `sellery-app` | |
| **Root Directory** | `web` | 모노레포 형태 — 루트에는 `vercel.json` 이 없다(CLI 배포는 `--cwd web`) |
| **Include source files outside of the Root Directory** | **off** | 앱은 루트 파일(`js/`, `css/`, `supabase/`)을 import 하지 않는다. 켜면 업로드 범위만 커진다 |
| Framework Preset | Next.js (자동 감지) | |
| Build / Install Command | 기본값 (`next build` / `npm install`) | `web/package.json` 에 `prebuild` 훅 없음 |
| Node.js Version | Vercel 기본값 그대로(20.x 이상) | Next 16.2.9 는 `>=20.9.0`. CI(`web-ci`)는 20 으로 고정 — Vercel 이 더 높은 버전을 기본으로 잡아도 무방 |
| Region | `icn1` — `web/vercel.json` 이 지정 | Supabase `sellery`(Seoul)와 같은 리전. 대시보드에서 따로 고르지 않아도 된다 |
| Cron Jobs | 없음 | 슬라이스 1 은 크론 없음. reconcile · 만료 · PII 파기는 수동 호출(§4.3). 슬라이스 4 에서 `vercel.json` `crons` 로 |
| **Deployment Protection** | Preview: **Off** 또는 "Protection Bypass for Automation" 토큰 발급 | 기본값(Vercel Authentication 켜짐)이면 토스 `successUrl` 복귀 · 웹훅 · 카카오 콜백이 인증 페이지에 막혀 **Preview 에서 결제 테스트가 안 된다**. Production 은 켜지 않는다(공개 서비스) |
| Git → Production Branch | `main` | |
| **Domains** | `sellery.life` — 고객(apex 이전 §6) · `inf.sellery.life` — 인플루언서 콘솔(`docs/inf-console-plan.md §3.1`) · 프로토타입은 `sellery` 프로젝트의 `demo.sellery.life` 예정(§6) | 콘솔은 같은 프로젝트의 두 번째 도메인 — `src/proxy.ts` 가 Host 를 보고 `/influencer/*` 로 리라이트(`NEXT_PUBLIC_INF_HOST` 필요, §2). 브랜드 콘솔은 나중에 `brand.sellery.life` |

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
| `NEXT_PUBLIC_SITE_URL` | 공개 | `https://sellery.life` (이전 전에는 `https://sellery-app.vercel.app`) | `https://sellery-app.vercel.app` | `metadataBase` · 절대 URL. OAuth `redirectTo`·토스 `successUrl` 은 `window.location.origin` 을 써서 Preview 마다 바꿀 필요 없다 |
| `CRON_SECRET` | 비밀 | 임의 생성 (`openssl rand -hex 32`) | 별도 값 | `/api/cron/reconcile` 수동 호출용 `Authorization: Bearer …`. 슬라이스 1 은 크론 없음(§4.3) |
| `ADMIN_PASSWORD` | 비밀 | (다음 슬라이스) | — | 관리자 Basic Auth 이중 잠금 — 단독 인증이 아니다(§3 표 주석). 지금은 넣지 않는다 |
| `NEXT_PUBLIC_INF_HOST` | 공개 | `inf.sellery.life` | **넣지 않음** (경로 모드 — Preview 는 `/influencer/...` 로 직접 연다) | 콘솔 호스트 리라이트 표(`src/lib/hosts.ts`, `docs/inf-console-plan.md §2.3`). 값은 host 만(스킴 없이). 비우면 경로 모드. 로컬 호스트 모드는 `.env.local` `inf.localhost:3000`. **Production 에 넣은 뒤 Redeploy**(`NEXT_PUBLIC_*` 는 빌드 시 인라인 — Redeploy 전에는 proxy·layout 이 경로 모드로 남아 확인이 실패한다, `docs/inf-console-plan.md §3.1` 4행) → `/api/health` 의 `hosts.mode` 가 `host` 인지 확인 |
| `NEXT_PUBLIC_BRAND_HOST` | 공개 | (브랜드 콘솔 때) `brand.sellery.life` | 넣지 않음 | 같은 표의 두 번째 행 — 지금은 넣지 않는다 |

앱 환경변수가 **아닌** 것(대시보드에만 입력): 카카오 REST API 키 · Client Secret → Supabase Authentication → Providers → Kakao (§3.2).

CI 는 이 값들 없이 더미(`.github/workflows/web-ci.yml` 의 `env`)로 빌드한다 — `force-dynamic` 페이지는 프리렌더되지 않고 `admin.ts`·`toss.ts` 는 호출 시점에만 throw 하기 때문. 빌드가 실제 키를 요구하게 되면 설계 위반이다(§11.1).

## 3. 외부 서비스 설정 (코드 밖 · 대시보드)

### 3.1 Supabase (`sellery`, ref `ocxppeuoiysnkwwujvko`)

- **Authentication → Providers → Kakao**: Enabled, Client ID = 카카오 REST API 키, Client Secret = 카카오 Client Secret(§3.2). 콜백 URL 은 Supabase 가 보여 주는 `https://ocxppeuoiysnkwwujvko.supabase.co/auth/v1/callback`.
- **Authentication → URL Configuration**:
  - Site URL: `https://sellery.life` (이전 전에는 `https://sellery-app.vercel.app`)
  - Redirect URLs (전부 추가): `https://sellery.life/**` · `https://sellery-app.vercel.app/**` · `https://*-<vercel-team>.vercel.app/**`(Preview) · `http://localhost:3000/**`
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
  | 도메인 이전 후 | `https://sellery.life/api/payments/webhook` |
  | 로컬 테스트 | 터널 URL + `/api/payments/webhook` (`docs/app-plan.md §11.4`) |

  이벤트 `PAYMENT_STATUS_CHANGED` (+ `DEPOSIT_CALLBACK` 은 무관하나 켜 두어도 무해). 웹훅은 **서명이 없는 공개 엔드포인트**다 — 앱은 본문을 믿지 않고 `paymentKey` 재조회로만 상태를 바꾸며(§7.3), 그 위에 **Vercel Firewall(Custom Rules → Rate Limit) 로 `/api/payments/webhook` 에 IP 기준 레이트리밋(예: 분당 60)** 을 건다(플랜에 없으면 upstash ratelimit 을 라우트 앞에 — 다음 슬라이스). 콘솔의 "웹훅 테스트 전송" 으로 등록을 확인한다.
- **운영 규칙**: 토스 콘솔에서 **부분취소를 하지 않는다**(슬라이스 1 은 전액 취소만 정식 지원 — 부분취소는 `payment_events handled=false` 큐로 남아 수동 정산 조정). 정산 완료 캠페인 · 샘플 주문의 콘솔 취소도 같은 큐(`orders.status='CANCELED'`)로 간다.

### 3.4 다음 우편번호 API

외부 스크립트 `t1.daumcdn.net` — 체크아웃 배송지 입력에 쓴다. CSP 를 두면 허용 목록에 추가.

### 3.5 파트너 이메일 인증 (Supabase Auth — 인플루언서 콘솔 2단계, `docs/inf-console-plan.md §4.1 · §4.8`)

인플루언서(나중에 브랜드) 계정은 **이메일/비밀번호 + 인증 메일**이다(고객 카카오 계정과 별개). 인증 메일 링크를 누르는 요청(`/auth/confirm`)이 `sellers` 행을 만들고 바로 콘솔에 들여보낸다 — 수동 심사 없음. 아래 값은 저장소로는 확인할 수 없으므로 **대시보드에서 설정한 뒤 "현재값" 열에 기록**한다.

| 항목 | 설정할 값 | 현재값(기록) |
|---|---|---|
| Authentication → Providers → **Email** | Enable **ON** · **Confirm email ON** · Minimum password length **8** (앱 규칙은 영문+숫자 8자 이상 — 클라이언트·서버가 따로 검사) · Secure email change ON(기본) | ☐ 미기록 |
| Authentication → URL Configuration → **Redirect URLs** | 기존 4종(§3.1) + **`https://inf.sellery.life/**`** — 없으면 `emailRedirectTo`/`redirectTo` 가 Site URL 로 떨어져 `next` 를 잃고 콘솔이 아니라 고객 사이트에 착지한다 | ☐ |
| Authentication → Emails → **SMTP Settings (Custom SMTP)** | **Resend**: Host `smtp.resend.com` · Port `465` · Username `resend` · Password = **Resend API key**(비밀 — 이 문서·코드·PR 어디에도 쓰지 않는다) · Sender email `no-reply@sellery.life` · Sender name `셀러리`. 기본 Supabase SMTP 는 시간당 소량·팀원 주소 위주라 외부 인플루언서에게 가지 않는다 | ☐ |
| Resend 대시보드 → **Domains** | `sellery.life` 추가 → 호스팅케이알 "DNS 레코드 관리" 에 Resend 가 보여 주는 **DKIM(TXT 또는 CNAME) · SPF(TXT) · (권장) DMARC(TXT)** 를 그대로 추가 → Verified. 호스팅케이알은 반영에 20~40분(§6) | ☐ |
| Authentication → **Rate Limits** | 이메일 발송 한도(시간당) 확인 — Custom SMTP 를 켜야 상향할 수 있다. 앱의 [메일 다시 보내기] 는 60초 쿨다운 | ☐ |
| Authentication → Emails → **Templates** | 아래 3종의 링크를 **token_hash 방식**으로 바꾼다. 문구는 역할 중립('셀러리 파트너') — 템플릿은 프로젝트당 1벌이라 브랜드 가입 메일과 공유한다 | ☐ |

**템플릿 3종.** 기본 `{{ .ConfirmationURL }}` 은 PKCE(`?code=`) 링크라 **가입한 브라우저에서만** 열리고, 데스크톱에서 가입하고 휴대폰 메일 앱에서 열면 실패한다. `{{ .RedirectTo }}` 는 앱이 넘긴 `emailRedirectTo`(예 `https://inf.sellery.life/auth/confirm?next=%2Fhome`) 그대로이므로 거기에 `&token_hash=…&type=…` 만 붙인다(`web/src/app/auth/confirm/route.ts` 가 `verifyOtp({ type, token_hash })` 로 세션을 만든다).

Confirm signup — Subject `[셀러리] 이메일 인증을 완료해주세요`:

```html
<h2>셀러리 파트너 가입을 환영합니다</h2>
<p>아래 버튼을 누르면 이메일 인증이 완료되고 바로 콘솔에 들어갈 수 있어요. 링크는 24시간 동안 유효하며 다른 기기에서 열어도 됩니다.</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup">이메일 인증하고 시작하기</a></p>
<p>본인이 가입한 것이 아니라면 이 메일은 무시하셔도 됩니다.</p>
```

Reset password — Subject `[셀러리] 비밀번호 재설정`:

```html
<h2>비밀번호 재설정</h2>
<p>아래 버튼을 누르면 새 비밀번호를 정할 수 있어요. 링크는 1시간 동안 유효합니다.</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">새 비밀번호 설정</a></p>
<p>요청한 적이 없다면 이 메일은 무시하셔도 됩니다 — 비밀번호는 바뀌지 않습니다.</p>
```

Invite user — Subject `[셀러리] 파트너 콘솔 초대`:

```html
<h2>셀러리 파트너 콘솔에 초대합니다</h2>
<p>셀러리 운영팀이 이 이메일을 파트너 계정으로 초대했어요. 아래 버튼을 누르면 계정이 연결되고 비밀번호를 정할 수 있습니다.</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">초대 수락하고 비밀번호 정하기</a></p>
<p>본인이 요청한 것이 아니라면 이 메일은 무시하셔도 됩니다.</p>
```

- 로컬·Preview 확인(실제 메일 없이): `auth.admin.generateLink({ type:'signup'|'magiclink'|'recovery', email })` 의 `hashed_token` 으로 `GET /auth/confirm?token_hash=…&type=…&next=/influencer/home` 을 열면 같은 경로를 탄다. 시드 연결은 `cd web && node scripts/dev-seller.mjs --email … --seller s1`(production 거부), 실제 계약자 초대는 `node scripts/partner-admin.mjs invite <email> --link s2`.
- 운영 절차(관리자 화면 없음): 가입 완료·채널 [인증 확인] 은 Slack 한 줄(`SLACK_WEBHOOK_URL`, 선택 — 이메일·핸들 없이) → `node scripts/partner-admin.mjs channels --pending` → 인플루언서 프로필 bio 또는 `@sellery.official` DM 수신함에서 코드 `SLRY-XXXX` 확인 → `verify-channel <ch>`. 정지·복귀는 `suspend`/`reactivate`, 목록은 `list`. **`@sellery.official` DM 수신함 확인 담당자**를 정한다(`docs/inf-console-plan.md §7` 2단계).

## 4. 데이터베이스

### 4.1 마이그레이션 (저장소 루트에서)

`supabase/` 는 **저장소 루트**에 있고 CLI 도 루트에서 실행한다. 클라우드 `sellery` 에 `0001~0010` 적용 완료(`0001~0008` 2026-09-15 · `0010_partner_signup` 2026-09-18, `supabase_migrations.schema_migrations` 로 확인). 이후 변경은 이미 적용된 파일을 고치지 말고 **새 번호(`0011_…`)** 로 추가 → PR → 병합 → 로그인 · 링크된 PC 에서:

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
- Vercel GitHub 연동이 되면 PR 마다 `sellery-app` Preview 댓글이 달린다(프로토타입은 GitHub Pages 라 미리보기 없음).

## 6. 도메인 (`sellery.life` — 2026-09-18 상태)

Vercel 프로젝트는 `sellery-app` 하나이고 도메인 세 개가 전부 여기에 붙어 있다(프로토타입 프로젝트는 삭제 — 옮길 대상이 없다). 등록기관 호스팅케이알, 네임서버 `ns1~4.hosting.co.kr`. DNS 레코드는 호스팅케이알 → 도메인 → "DNS 레코드 관리" 에서. **호스팅케이알 주의**: 레코드 목록에 보여도 네임서버 4대에 실리기까지 20~40분, 서버마다 시차가 있다(`nslookup -type=A <host> ns1.hosting.co.kr` 로 서버별 확인). 로컬 KT 리졸버는 더 늦으니 `8.8.8.8`/`1.1.1.1` 로 본다. Vercel 인증서가 "being generated" 에서 멈추면 `vercel certs issue <domain> --scope weglow-team`.

| 호스트 | 레코드 | 용도 | 상태 |
|---|---|---|---|
| `inf` | `A 76.76.21.21` | 인플루언서 콘솔 — Production `NEXT_PUBLIC_INF_HOST=inf.sellery.life` | 연결 완료 · 호스트 모드 확인(`/api/health` hosts.mode=host) |
| `@` | `A 76.76.21.21` | 고객 사이트 — Production `NEXT_PUBLIC_SITE_URL=https://sellery.life`(2026-09-18 반영) | 연결 완료 · 인증서 발급(`vercel certs issue sellery.life` 로 수동 촉발) · `/influencer/*` → inf 308 확인 |
| `www` | `A 76.76.21.21` 권장 (CNAME `cname.vercel-dns.com` 은 호스팅케이알이 1시간 넘게 존에 싣지 않았다 — 2026-09-18) | apex 로 리다이렉트(Vercel Domains 에서 설정) | DNS 대기 |
| `brand` | (브랜드 콘솔 때) `A 76.76.21.21` | `NEXT_PUBLIC_BRAND_HOST` | 미정 |

apex 가 붙은 뒤(1 은 완료):
1. ~~Production 환경변수 `NEXT_PUBLIC_SITE_URL=https://sellery.life` → 재배포~~ 완료 2026-09-18 (Preview 는 그대로).
2. Supabase → Authentication → URL Configuration: Site URL `https://sellery.life`, Redirect URLs 에 `https://sellery.life/**` · `https://inf.sellery.life/**`(§3.1).
3. 토스 웹훅 URL `https://sellery.life/api/payments/webhook`(테스트·라이브 상점 각각).
4. 확인: `curl -sI https://sellery.life/` 200 · `/c/<code>` 308 · `/robots.txt` 에 `/influencer` disallow · `https://sellery.life/influencer/home` → `https://inf.sellery.life/home` 308 · `/api/health` 200.
5. 롤백: 앱 문제는 Vercel Deployments → 이전 배포 "Promote to Production"(Instant Rollback). DB 마이그레이션은 되돌리지 않고 앞으로만 고친다.

## 7. 배포 전 체크리스트 (`docs/app-plan.md §13` — 사용자가 해야 할 것)

- [ ] **토스페이먼츠 키**: 결제위젯 연동 키 테스트 짝 → `web/.env.local` + Vercel Preview. 라이브 짝 → 실판매 직전 Vercel Production. 코드에 넣지 않는다.
- [ ] **토스 위젯 설정**: 가상계좌 · 계좌이체 비활성화. UI 변형 이름 2개(결제수단 · 약관) 확인 → `NEXT_PUBLIC_TOSS_WIDGET_VARIANT`.
- [ ] **토스 웹훅 URL 등록**(테스트 · 라이브 각각, §3.3 표) + Vercel WAF 레이트리밋.
- [ ] **토스 운영 규칙** 공유: 콘솔 부분취소 금지 · 정산 완료 · 샘플 주문 취소는 조정 큐.
- [ ] **Supabase CLI 링크**: `npx supabase login` + `link --project-ref ocxppeuoiysnkwwujvko`(DB 비밀번호) — `db push` · `gen:types` 전제.
- [ ] **카카오 개발자 앱**: 로그인 활성화 · Redirect URI(Supabase 콜백) · 동의 항목 · REST API 키 · Client Secret · 비즈 앱 전환 여부 결정.
- [ ] **Supabase Auth**: Kakao provider 키 입력 · Site URL · Redirect URLs 4종(§3.1).
- [ ] **Supabase Email 인증(파트너 콘솔)**: Email provider ON · Confirm email ON · 최소 8 · Custom SMTP(Resend) + `sellery.life` DKIM/SPF · 템플릿 3종 token_hash 링크 · Redirect URLs 에 `https://inf.sellery.life/**` — §3.5 표에 현재값 기록. (선택) Vercel env `SLACK_WEBHOOK_URL`.
- [ ] **Supabase 키**: URL · anon · service_role → `.env.local` + Vercel(Production + Preview).
- [ ] **Vercel `sellery-app` 생성**: Root Directory `web` · outside-root off · 환경변수 표 · Deployment Protection(Preview off 또는 bypass 토큰) · `icn1`(vercel.json).
- [ ] **브랜치 보호**: `main` required status check 에 `web-ci` 추가(`프로토타입 점검` 유지).
- [ ] **0008 적용 확인**: 클라우드에 0001~0008 적용됨(2026-09-15). `docs/data-model.md §10` 검토 — `orders.status='CANCELED'` 를 조정 큐로 쓰는 결정 · hidden 인플루언서 채널 비노출.
- [x] **사업자 정보 확정** — 2026-09-17 반영(`web/src/lib/company.ts`): 대표 강신욱 · 사업자등록번호 517-86-00666 · 통신판매업신고번호 제2022-서울강남-00726호 · 주소 서울시 성동구 왕십리로 38(홍성빌딩), 3층 · 고객센터 = 이메일 `official@weglow.biz`(채널톡 등 별도 채널은 두지 않기로 — 사용자 결정). 전자상거래법상 모든 페이지 푸터에 필요.
- [ ] **이용약관 · 개인정보처리방침** 문서 유무 결정 — 없으면 체크아웃은 토스 위젯 내장 약관 + 통신판매중개자 확인 체크만. 개인정보처리방침에 `docs/app-plan.md §5.1` 보존 · 파기표(미결제 세션 30일 · 거래기록 5년 · 결제 이벤트 로그 1년) 반영.
- [ ] **다음 우편번호 API** 외부 스크립트 승인(CSP 허용 목록).
- [ ] **도메인 이전 시점 결정** + 프로토타입 서브도메인(`demo.sellery.life`) 여부 → §6.
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
8. 콘솔(`https://inf.sellery.life`): `/login` 200(이메일 폼) · `/signup` 200 · 미로그인 `/home` → `/login?next=/home` 302 · 실제 외부 이메일로 가입 → 인증 메일(발신 `no-reply@sellery.life`) → 링크를 다른 기기에서 열어도 `/home` 에 활동명·스타터·🥬 3 · `db query` 로 `sellers`·`seller_channels`·`celery_ledger signup_bonus`·`profiles.role='seller'` 확인 · 같은 링크 재클릭 → `/login?error=expired`(행 1개 유지).
