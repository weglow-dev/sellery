# 셀러리 기여 가이드

이 문서는 **개발자가 아닌 팀원**(마케팅 · 디자인 · 기획)도 프로토타입에 직접 기여할 수 있도록 만든 가이드입니다. 개발자용 규칙(파일 분리 · 액션 맵 · 정책 상수)도 함께 담았습니다.

> 셀러리 프로토타입은 **빌드가 없는 정적 사이트**입니다. `index.html` 하나가 `css/` 2개와 `js/` 12개를 불러오고, 데이터는 방문자 **브라우저의 localStorage**에만 저장됩니다(서버 없음). `main`에 머지되면 **Vercel 이 자동 배포**합니다 (1분 내). PR 을 올리면 Vercel 이 **미리보기 URL** 을 PR 에 달아줍니다.
>
> - 배포 주소: https://sellery-swart.vercel.app/
> - 저장소: https://github.com/weglow-glo/sellery

---

## 0. 한 번만 셋업

### 필요한 도구

| 도구 | 용도 | 다운로드 |
|---|---|---|
| **GitHub 계정** | 저장소 접근 · PR | https://github.com/signup |
| **GitHub Desktop** (선택) | 비개발자용 Git GUI — 브랜치 받아서 로컬로 보기 | https://desktop.github.com |
| **VS Code** (선택) | 텍스트 에디터 (js/css 편집에 편함) | https://code.visualstudio.com |
| **Python 3** 또는 **Node 20** (선택) | 로컬 미리보기용 간이 서버 · CI 검사 로컬 실행(`node scripts/check-refs.mjs`는 Node 필요) | https://www.python.org/downloads · https://nodejs.org |

> 💡 카피 한두 줄만 바꾼다면 **GitHub.com 웹 편집기**로 `js/01-seed.js`(또는 해당 센터 js 파일)만 고치면 됩니다. 빌드 단계가 없으니 머지하면 **Pages가 알아서 1~2분 안에 배포**해요.

### 저장소 접근 권한

`shinwook-k`에게 GitHub username을 알려주고 collaborator로 추가받으세요.

> 이 저장소는 GitHub 조직 **`weglow-glo`** 안에 있습니다(`glo-us`와 같은 조직). 조직 이름이 바뀌면(예: `weglow-team`) 저장소 URL이 함께 바뀌고 GitHub는 옛 조직 이름을 리다이렉트하지 않으므로, 로컬에서 `git remote set-url origin https://github.com/<새조직>/sellery.git` 을 한 번 실행해 주세요. 배포 URL(Vercel)은 그대로입니다.

---

## 1. 큰 그림 — 파일 어디에 뭐가 있나

```
Sellery/
├── index.html          ← 앱 셸: <head> 메타·폰트 + css 링크 2개, 정적 마크업, <script src> 12개 (순서 고정 00→90)
├── login.html          ← 파트너(인플루언서·브랜드) 로그인 데모 — 단일 파일(인라인 css/js) 유지
│
├── css/
│   ├── base.css        ← 기본 스타일 (네오브루탈 원본, :root 디자인 토큰)   ← 디자인: 여기를 편집!
│   └── skin.css        ← "light-pixel-celery" 픽셀 스킨 오버라이드          ← 디자인: 여기를 편집!
│
├── js/
│   ├── 00-core.js      ← utils · 상태머신(ST/FLOW/FLOW_L) · 수수료 상수 PG_RATE/PLAT_RATE/WHT/CLEAR_DAYS
│   ├── 01-seed.js      ← seedData() 데모 데이터 (브랜드·인플루언서·상품·캠페인)   ← 카피·데모 데이터: 여기를 편집!
│   ├── 02-state.js     ← 상태 S · localStorage 키 LS · 해시 라우팅 · 정책 상수(GRADES, DATA_PRICE, BG_DISC, CELERY_PER, SAMPLE_CEL_WON, BREF_*, OPEX_DEF, CATMAP)
│   ├── 10-render.js    ← render() 루트 · 공통 컴포넌트
│   ├── 20-seller.js    ← 인플루언서 센터 (홈·랭킹·마이페이지·채널·추천·상품 상세)   ← 화면 문구: 해당 센터 파일
│   ├── 30-shared.js    ← 셀러리 샵 · 실시간 매출 (인플루언서/브랜드 공용)
│   ├── 40-brand.js     ← 브랜드 센터 (홈·마이페이지·고객 CS)
│   ├── 50-admin.js     ← 관리자 창구 (검수·매칭·매출/순수익)
│   ├── 60-customer.js  ← 고객 판매센터 · 셀러리 소개
│   ├── 70-campaign.js  ← 캠페인 상세 (스레드·정산 미리보기) · 모달
│   ├── 80-actions.js   ← ACT 액션 맵 — data-act="…" 버튼 핸들러 전부 (개발자)
│   └── 90-boot.js      ← 부트 스크린 · 전역 이벤트 바인딩 · render() 최초 호출
│
├── assets/             ← 상품 누끼(webp) · 아바타(svg)                     ← 이미지: 여기에 추가!
│   └── _src/           ← 원본 소스(psd/png 등) — git에 안 올라감(gitignore)
├── docs/               ← 정책 문서 5개 (settlement · grade · period · sample · points)   ← 정책: 코드와 같은 PR에서!
├── scripts/check-refs.mjs   ← CI 검사: 참조 무결성 + JS 문법
├── .github/            ← 이슈 템플릿 · PR 템플릿 · workflows (ci · claude)
├── CONTRIBUTING.md     ← 이 문서
└── README.md
```

**핵심 1 — 어디를 고치나:** 데모 상품·인플루언서·브랜드의 이름/설명/가격은 **`js/01-seed.js`**, 화면에 박힌 안내 문구·제목은 **해당 센터의 js 파일**, 색·여백·폰트는 **`css/base.css`**(픽셀 스킨은 `css/skin.css`), 정책 숫자는 **`js/00-core.js` · `js/02-state.js`** + `docs/`.

**핵심 2 — localStorage 키 버전 규칙:** 방문자 브라우저에는 데이터가 `js/02-state.js`의 `const LS='sellery-proto-v29'` 키로 저장돼 있습니다.

- 시드 데이터의 **구조**를 바꾸면(필드 추가 · 필드 이름 변경 · 새 배열 추가) → **반드시 `LS` 키 버전을 올리세요** (`v29` → `v30`). 그래야 기존 방문자의 옛 저장 데이터가 버려지고 새 구조로 리셋됩니다. 안 올리면 옛 데이터에 새 필드가 없어서 화면이 깨집니다.
- 시드의 **값만** 바꾸면(문구 · 가격 · 팔로워 수) → 버전 올림 **불필요**. 단, 이미 방문했던 브라우저는 옛 값을 계속 보여주므로 **관리자 창구 홈의 "데이터 초기화"** 버튼을 눌러야 새 시드가 보입니다 (→ §6-7).

---

## 2. 변경 유형별 가이드

### 🅐 카피 한 줄 바꾸기 (마케팅 · 기획)

**예시:** 버닝온 상품 설명 `'다이어트 부스터 · 6,000mg × 30포'`를 바꾸고 싶음.

1. https://github.com/weglow-glo/sellery 접속 → `js/` → `01-seed.js` (화면 안내 문구라면 해당 센터 파일, 예: 고객 소개 페이지는 `60-customer.js`)
2. 우상단 **연필(✏️)** 클릭 → `Ctrl+F`로 문구 검색 → 따옴표 **안쪽**만 수정
3. **Commit changes…** → 메시지(`mkt: 버닝온 상품 설명 문구 수정`) → **"Create a new branch for this commit and start a pull request"** → 브랜치명 `mkt/burningon-desc`
4. **"Propose changes"** → PR 생성 → CI(`ci`) 초록 확인 → 리뷰 → 머지 → 1분 내 Vercel 반영
5. 배포된 사이트에서 옛 데이터가 보이면 **관리자 창구 → "데이터 초기화"** 한 번 (값만 바꿨으니 버전 올림은 불필요)

> ⚠ js 파일이라 **따옴표 짝**(`'…'`)과 **줄 끝 쉼표**를 깨뜨리면 화면 전체가 하얗게 됩니다. CI가 문법 오류를 잡아주니 PR이 빨갛게 되면 §8을 보세요. 백틱 문자열 안의 `${…}`는 코드이므로 건드리지 마세요.

### 🅑 디자인 토큰 · 픽셀 스킨 (디자인)

- **토큰**은 `css/base.css` 맨 위 `:root`에 있습니다. 예: `--yellow:#f7df3e`(활성 탭·형광펜 강조), `--red:#457c28`(이름은 red지만 **셀러리 잎 그린 브랜드 액센트**), `--hs:4px 4px 0 var(--ink)`(하드 섀도). 전체 목록은 §7.
- **픽셀 스킨**(`css/skin.css`)은 같은 이름의 토큰을 **덮어씁니다** (`--bg`, `--ink`, `--red`, `--yellow` 등). `base.css`만 고쳤는데 화면이 안 바뀌면 `skin.css`에 같은 토큰이 있는지 확인하세요. 픽셀 폰트 스택은 `--px14` / `--px11`, 윈도우 타이틀바 색은 `--bar` / `--bar-fg`.
- 스킨을 통째로 끄고 네오브루탈 원본으로 돌아가려면 `index.html`에서 **`css/skin.css` 링크와 galmuri 폰트 링크**만 빼면 됩니다.
- 브랜치는 `design/…`, 커밋은 `design: …`. PR에 Before/After 스크린샷을 꼭 붙여 주세요 (PR 미리보기 URL이 아직 없어서 리뷰어가 스크린샷으로 봅니다).

### 🅒 새 화면 · 기능 (개발자)

1. 화면은 **해당 센터 js 파일**에 render 함수를 추가하고(`20-seller.js` / `40-brand.js` / `50-admin.js` / `60-customer.js` / `70-campaign.js`), 버튼은 `data-act="이름"` 속성으로 만든 뒤 **`js/80-actions.js`의 `ACT` 맵**에 핸들러를 등록합니다. 이벤트 바인딩은 `90-boot.js`가 전역으로 처리하므로 개별 `addEventListener`는 필요 없습니다.
2. 새 상태 필드가 필요하면 `js/02-state.js`(런타임 상태 `S`)에, 시드에 새 필드를 넣으면 `js/01-seed.js` + **`LS` 버전 올림**(§1 핵심 2).
3. 파일을 새로 만들면 `index.html`의 `<script src>` 순서에 끼워 넣습니다 (§6-6).
4. 로컬에서 `node scripts/check-refs.mjs`로 CI와 같은 검사를 돌린 뒤 PR. 브랜치 `feat/…`, 커밋 `feat: …`.

### 🅓 정책 변경 (수수료 · 등급 · 기간 · 샘플 · 포인트)

정책은 **문서(`docs/*.md`)와 코드 상수가 항상 같아야** 합니다. 순서:

1. **`policy-change` 이슈**를 먼저 열어 무엇을 왜 바꾸는지 합의
2. 합의되면 **같은 PR**에서 `docs/*.md`와 상수를 함께 수정 (브랜치 `policy/…`, 커밋 `policy: …`)

| 정책 | 문서 | 코드에서 고칠 곳 |
|---|---|---|
| 정산 (PG 1.9% · 플랫폼 10% · 원천징수 3.3% · D+21) | `docs/settlement-policy.md` | `js/00-core.js` — `PG_RATE=0.019`, `PLAT_RATE=0.10`, `WHT=0.033`, `CLEAR_DAYS=21` · 브랜드 추천 보상은 `js/02-state.js` — `BREF_RATE`, `BREF_DISC`, `BREF_TIMES` |
| 등급 (인플루언서 7등급 · 브랜드 7등급 · 등급 보너스/할인) | `docs/grade-policy.md` | `js/02-state.js` — `GRADES`(min · bonus · perk), `BGRADES`, `BG_DISC`, `DATA_PRICE` |
| 판매 기간 (기간 우선권 · 겹침 판정) | `docs/period-policy.md` | `js/02-state.js` — `GRADES[].perk` 문구 + `periodBlock()` 판정 로직 |
| 샘플 (등급별 월 한도 · 무상 기준 · 구매가 · 🥬 결제) | `docs/sample-policy.md` | `js/02-state.js` — `sampleQuota()`, `spOf()`, `samplePrice()`, `SAMPLE_CEL_WON=20000` |
| 셀러리 포인트 🥬 (적립 · 샵 · 데이터 열람가) | `docs/points-policy.md` | `js/02-state.js` — `CELERY_PER=5000000`, `DATA_PRICE`, 샵 상품 목록 |

> 화면 문구는 대부분 상수를 참조해 자동으로 바뀝니다(예: `${(PLAT_RATE*100).toFixed(0)}%`). 그래도 PR 전에 브랜드 정산 화면·고객 FAQ·캠페인 정산 미리보기에서 숫자가 맞는지 눈으로 확인하세요.

---

## 3. 브랜치 네이밍 규칙

| Prefix | 용도 | 예시 |
|---|---|---|
| `mkt/` | 카피 · 데모 데이터 수정 | `mkt/burningon-desc`, `mkt/faq-refund-copy` |
| `design/` | 시각적 변경 (색 · 여백 · 타이포 · 스킨) | `design/yellow-tone`, `design/mobile-subnav` |
| `feat/` | 새 화면 · 기능 (개발자) | `feat/brand-cs-filter` |
| `fix/` | 버그 수정 | `fix/settle-preview-wht` |
| `docs/` | 문서만 수정 (README · CONTRIBUTING · docs/) | `docs/contributing-update` |
| `policy/` | 정책 변경 — docs + 상수를 함께 | `policy/sample-quota-gold` |

---

## 4. 커밋 메시지 규칙

**형식:** `[prefix]: 짧은 설명` (한국어 OK)

✅ `mkt: 버닝온 상품 설명 문구 수정` · `design: --yellow 톤 조정 (base.css + skin.css)` · `policy: 골드 샘플 월 한도 변경 (docs/sample-policy.md + sampleQuota)`
❌ `수정함` · `update` · `asdf`

---

## 5. PR 리뷰 + 머지

- **PR 필수** — `main` 직접 푸시는 막혀 있습니다.
- **CI `ci` 통과 필수** — `scripts/check-refs.mjs`가 (1) `index.html`이 가리키는 css/js/assets 파일이 실제로 있는지(참조 무결성), (2) js 파일 문법을 검사합니다.
- **리뷰 코멘트는 모두 해결(resolve)** 해야 머지 버튼이 열립니다 (Conversation resolution).
- 승인 수를 강제하진 않지만 **1명 리뷰를 권장**합니다. 카피 변경은 마케팅, 디자인 변경은 디자인, 정책 변경은 기획 + 개발자에게 리뷰를 요청하세요.
- 머지 → **Vercel 자동 배포 1분 내** (https://sellery-swart.vercel.app/). PR 을 열면 Vercel 이 **미리보기 URL** 을 PR 댓글로 달아주니 머지 전에 거기서 확인하세요. 반영이 안 보이면 강력 새로고침(`Ctrl+Shift+R`).
- **PR별 미리보기 URL은 아직 없습니다.** 시각 변경은 브랜치를 받아 로컬에서 `index.html`을 열어 확인하고(§6-8), PR에 스크린샷을 첨부하세요.

---

## 6. 자주 하는 작업 — 빠른 레퍼런스

시드는 `js/01-seed.js`의 `seedData()` 안에 있습니다. 날짜는 `D(n)`(오늘 기준 ±n일)으로 써서 데모가 언제 열어도 "지금 진행 중"처럼 보입니다. 모든 `id`는 **중복 금지**입니다.

### 6-1. 데모 상품 추가 · 수정 — `products` 배열

| 필드 | 의미 | 예시 |
|---|---|---|
| `id` | 상품 ID `'p'+숫자` (현재 p1~p10) | `'p11'` |
| `brandId` | 소속 브랜드 `id` | `'b1'` |
| `name` | 상품명 | `'버닝온'` |
| `desc` | 한 줄 설명 (성분 · 규격) | `'다이어트 부스터 · 6,000mg × 30포'` |
| `em` | 이모지 — 누끼 이미지가 없을 때 썸네일 대신 표시 | `'🔥'` |
| `thumb` | (선택) 누끼 이미지 경로 — `assets/*.webp` | `'assets/burningon.webp'` |
| `cat` | 세부 카테고리 — `CATMAP` 값 중 하나: 다이어트·체형 / 비타민·영양 / 눈·뇌 건강 / 장·소화 / 활력·수면 / 웰니스 푸드 / 이너뷰티·피부 | `'다이어트·체형'` |
| `cp` | 소비자가 (정가, 원) | `39000` |
| `gp` | 판매가 (공동구매가, 원) | `29900` |
| `rate` | 인플루언서 수수료율 (소수) — 플랫폼 10%는 별도로 더해짐 | `.20` |
| `sample` | 무상 샘플 구성 문구 | `'무상 1박스'` |
| `stock` | 재고 수량 | `2000` |
| `status` | `'listed'`(노출) / `'pending'`(검수 대기 — 관리자 창구에서 승인) | `'listed'` |
| `t` | (선택) 트렌드 뱃지 | `{g:'+240%',note:'분기 매출 급등'}` |
| `exclusive` | (선택) 독점권 안내 | `{grade:'다이아',label:'인스타그램 판매 독점권 · 3개월'}` |
| `samplePolicy` | (선택) 무상 기준 등급 · 구매 방식 | `{freeGrade:'실버',buyMode:'auto',fixedPrice:0,refund:false}` — `buyMode:'fixed'`면 `fixedPrice`가 샘플 구매가. 없으면 `spOf()`가 판매가 기준으로 기본값 생성 |
| `options` | (선택) 구매 옵션 | `[{n:'1박스 (30포)',price:29900},…]` — 없으면 `optsOf()`가 1/2/3개 묶음을 자동 생성 |

기존 상품 한 줄을 복사해 `id`만 바꾸는 게 가장 안전합니다. 배열 마지막 항목 뒤에는 쉼표를 붙이지 마세요.

### 6-2. 인플루언서 추가 — `sellers` 배열

| 필드 | 의미 | 예시 |
|---|---|---|
| `id` | `'s'+숫자` (현재 s1~s8) | `'s9'` |
| `name` · `handle` | 표시 이름 · 핸들 | `'지유'` · `'@jiyu_beauty'` |
| `email` | 더미 주소 (`@sellery.demo`) | `'jiyu@sellery.demo'` |
| `platform` | `'instagram'` / `'youtube'` / `'naver'` / `'tiktok'` | `'instagram'` |
| `settleInfo` | (선택) 정산 정보 — **마스킹 더미만** | `{type:'personal',bank:'카카오뱅크',account:'3333012345678',holder:'김지유'}` — `type:'biz'`면 사업자(원천징수 없음, `bizNo` 추가) |
| `img` | 아바타 경로 | `'assets/av-s2.svg'` |
| `followers` | 팔로워 수 | `84300` |
| `cat` | 전문 카테고리 (`CATMAP` 세부값) — 상품 추천 매칭 기준 | `'이너뷰티·피부'` |
| `likesAvg` · `recentLikes` | 평균 좋아요 · 최근 좋아요 배열(5~6개) — 후반/전반 비교로 "요즘 뜨는" 성장세 계산 | `3100` · `[2900,3400,2800,3600,3100,3500]` |
| `m3Sales` | 최근 3개월 확정 매출(원) — **등급**(`GRADES.min`)과 🥬 적립(`CELERY_PER`) 기준 | `15600000` |
| `refCode` · `referredBy` | 추천 코드 · (선택) 추천인 seller id | `'JIYU10'` · `'s1'` |
| `hidden` | (선택) `true`면 비공개 프로필 (브랜드가 레퍼런스 열람권으로만 열람) | `true` |
| `intro` | 소개 문구 | `'스킨케어·이너뷰티 리뷰 전문.'` |
| `channels` | 채널 배열 — `id`는 `'ch'+숫자` 중복 금지 | `[{id:'ch10',platform:'instagram',handle:'@…',url:'instagram.com/…',followers:84300,verified:true,primary:true}]` |

### 6-3. 브랜드 추가 — `brands` 배열

| 필드 | 의미 | 예시 |
|---|---|---|
| `id` | `'b'+숫자` (현재 b1, b2) | `'b3'` |
| `name` | 브랜드명 | `'바인허브'` |
| `cat` | 대표 카테고리 | `'건강기능식품'` |
| `manager` · `email` | 담당자 이름 · 이메일 (더미) | `'김바인'` · `'partner@vyneherb.co'` |
| `settleInfo` | 정산 정보 — **마스킹 더미만** | `{bank:'기업',account:'12345678901234',holder:'(주)바인허브',bizNo:'214-88-01234',mailOrder:'제2024-서울강남-01234호'}` |
| `gmvBase` | 누적 확정 매출 시작값(원) — **브랜드 등급**(`BGRADES.min`) 기준, 이후 캠페인 매출이 더해짐 | `52000000` |
| `logo` | 로고 — data URI 상수(`BLOGO1`처럼 `svgURI()`로 생성) 또는 `assets/` 경로 | `BLOGO1` |
| `refCode` · `referredBy` | 브랜드 추천 코드 · (선택) 추천 브랜드 id | `'VYNE-01'` · `'b1'` |
| `autoPropose` | (선택) `true`면 카테고리 적합 인플루언서에게 자동 제안 후보 생성 | `true` |

### 6-4. 데모 캠페인(진행 상황) 추가 — `campaigns` 배열

`{id:'c14', sellerId:'s1', productId:'p1', status:'LIVE', start:D(-2), end:D(2), qty:800, createdAt:D(-14)}` 형태. `status`는 `js/00-core.js`의 `ST` 키 중 하나이며 기본 흐름(`FLOW`)은 `SAMPLE_REQUESTED → SAMPLE_APPROVED → SAMPLE_SHIPPED → TESTING → SCHEDULE_PROPOSED → SCHEDULE_CONFIRMED → LIVE → CLEARING → SETTLED` (그 외 `INVITED` · `SAMPLE_PURCHASED` · `PASSED` · `DECLINED` · `REJECTED`). 상태별로 필요한 필드가 다릅니다 — `SCHEDULE_PROPOSED`는 `propStart/propEnd/propQty`, `TESTING`은 `testDue`, `SAMPLE_PURCHASED`는 `purchased:true` + `samplePaid`, `SETTLED`는 `settledAt`, `INVITED`는 `invited:true`. 기존 항목을 복사해 쓰세요. 주문은 `mkOrders(cid, gp, 건수, 환불건수, 시작일, 기간)`로 자동 생성됩니다.

### 6-5. 이미지 교체 · 추가

1. **누끼 상품 이미지는 `webp`** 로 `assets/`에 올립니다 (예: `assets/burningon.webp`). 아바타는 `assets/av-s1.svg` 식의 svg.
2. 원본 파일(psd · 고해상 png 등)은 **`assets/_src/`** 에 두세요 — gitignore라 저장소에 올라가지 않으며, 로컬 보관용입니다. **화면 코드에서 `assets/_src/`를 참조하면 안 됩니다** (배포에 없음).
3. `js/01-seed.js`에서 `thumb:'assets/새파일.webp'`로 경로만 바꿉니다. 경로 오타는 CI(참조 무결성)가 잡아줍니다.
4. 값만 바뀐 것이므로 버전 올림은 불필요 — 배포 후 "데이터 초기화"로 확인.

### 6-6. 새 js 파일 추가 (개발자)

1. 번호 규칙에 맞게 파일을 만듭니다 (`00` core → `01` seed → `02` state → `10` render → `20~70` 화면 → `80` actions → `90` boot). 사이에 끼우려면 `25-…js`처럼 중간 번호.
2. `index.html`의 `<script src="js/…">` 목록에 **같은 순서로** 태그를 추가합니다 — 파일은 전역 스코프를 공유하므로 **정의가 사용보다 먼저** 로드돼야 합니다 (예: 화면 파일은 `10-render.js` 뒤, `80-actions.js` 앞).
3. `node scripts/check-refs.mjs`로 참조 · 문법 검사 통과 확인 후 PR.

### 6-7. 데이터 초기화

- 화면에서: **관리자 창구 홈 상단**의 **"데이터 초기화"** 버튼 (`data-act="reset"`) → 확인 → localStorage의 `sellery-proto-v29`가 지워지고 `seedData()`로 다시 생성됩니다.
- 개발자 도구에서: 콘솔에 `localStorage.removeItem('sellery-proto-v29')` 후 새로고침.
- 로그인 데모 세션(`sellery-session`)은 별도 키라 초기화에 영향을 받지 않습니다.
- **모든 방문자를 한 번에 리셋**하려면 `js/02-state.js`의 `LS` 버전을 올리세요 (시드 구조를 바꿨을 때는 필수).

### 6-8. 로컬에서 미리보기 · CI 검사 돌리기

1. GitHub Desktop(또는 `git`)으로 PR 브랜치를 받습니다.
2. 저장소 폴더에서 간이 서버 실행 후 브라우저로 엽니다:
   - Python: `python -m http.server 8000` → http://localhost:8000/
   - Node: `npx serve .`
   - `index.html`을 더블클릭해도 대부분 열리지만, 저장 데이터가 꼬이지 않게 서버 방식을 권장합니다.
3. 폰트(Google Fonts · jsdelivr의 Galmuri)는 인터넷에서 받아오므로 오프라인이면 글꼴이 달라 보입니다.
4. CI와 같은 검사: `node scripts/check-refs.mjs` (Node 20).

---

## 7. 디자인 토큰 (핵심만)

`css/base.css` 맨 위 `:root` — 네오브루탈 원본 팔레트:

| 토큰 | 값 | 의미 |
|---|---|---|
| `--bg` | `#efede2` | 페이지 바탕 (크림) |
| `--surface` | `#fdfcf6` | 카드 · 버튼 · 입력창 바탕 |
| `--surface-2` | `#e6e3d4` | 보조 바탕 |
| `--ink` | `#141414` | 본문 글자 · 테두리 · 하드 섀도 |
| `--mute` | `#6d6a5c` | 보조 글자 |
| `--line` / `--soft-line` | `#141414` / `#d6d3c2` | 굵은 테두리 / 연한 구분선 |
| `--red` | `#457c28` | ⚠ 이름은 red지만 **셀러리 잎 그린 브랜드 액센트** — 포커스 링 · `pri` 버튼 그림자 · 강조 텍스트 (주석: "brand accent — warm celery-leaf green") |
| `--red-soft` | `#e8efda` | 액센트 연한 배경 |
| `--yellow` / `--yellow-soft` | `#f7df3e` / `#faf3c4` | 활성 탭 · 형광펜 하이라이트 · 호버 |
| `--money` / `--money-soft` | `#8f6400` / `#f5ecc9` | 금액 · 정산액 강조 |
| `--danger` / `--danger-soft` | `#e03131` / `#fbe3e0` | 경고 · 알림 뱃지 |
| `--info` / `--info-soft` | `#2757a8` / `#e2ebf9` | 안내 |
| `--brand-c` / `--brand-bg` | `#2757a8` / `#e2ebf9` | 브랜드 역할 색 |
| `--seller-c` / `--seller-bg` | `#c02467` / `#fbe0ec` | 인플루언서 역할 색 |
| `--plat-c` / `--plat-bg` | `#2f7d32` / `#e2f0dd` | 플랫폼(관리자) 역할 색 |
| `--hs` · `--hs-sm` · `--hs-red` | `4px 4px 0 var(--ink)` · `3px 3px 0 var(--ink)` · `4px 4px 0 var(--red)` | 하드 섀도 (기본 · 작은 · 액센트) |

`css/skin.css` `:root` — **light-pixel-celery 스킨이 덮어쓰는 값** (현재 화면에 보이는 색은 이쪽):

- `--bg` `#eef3dc` · `--surface` `#f8faee` · `--surface-2` `#e2ead0` · `--ink` `#1c2a14` · `--mute` `#5b6b4a`
- `--red` `#4f8a2c` · `--yellow` `#b7e34a` · `--money` `#8a6a12`
- `--px14` / `--px11` — Galmuri14 / Galmuri11 픽셀 폰트 스택 (워드마크 · 뱃지 · KPI 숫자 등 **강조 포인트에만**, 본문은 원래 폰트)
- `--bar` `#2f5a1a` / `--bar-fg` `#d8ee9a` — 윈도우 타이틀바 · 인증 띠 (딥 그린 + 라임 글자)

**폰트:**
- **IBM Plex Sans KR** — 한글 · 영문 본문 (300~700). 800은 없으니 지정하지 마세요 — `font-synthesis:none`으로 가짜 볼드를 막아 두었습니다.
- **IBM Plex Mono** — 버튼 · 입력창 · 라벨 · 작은 메타 텍스트
- **Archivo** — 제목 `h2.pg` · 워드마크 (uppercase, 800)
- **Galmuri** — 픽셀 스킨 강조 포인트 전용 (jsdelivr CSS 링크)

---

## 8. 막힐 때

| 상황 | 어떻게 |
|---|---|
| Git/GitHub UI 헷갈림 | 개발자에게 화면 캡처 + 무엇을 바꾸려는지 설명 |
| PR이 빨갛게 (CI `ci` 실패) | PR의 **Checks** 탭에서 로그 확인. "참조 무결성" 실패 → `index.html`이 가리키는 css/js/assets 경로 오타 또는 파일 누락. "JS 문법" 실패 → 따옴표 짝 · 괄호 · 줄 끝 쉼표 누락(시드 편집 시 가장 흔함). 모르겠으면 개발자 호출 |
| 머지했는데 사이트가 그대로 | Actions 배포 1~2분 대기 → 강력 새로고침(`Ctrl+Shift+R`) |
| 시드를 바꿨는데 화면에 안 보임 | 브라우저에 옛 데이터가 저장돼 있음 → 관리자 창구 "데이터 초기화". 구조를 바꿨다면 `LS` 버전 올림 (§1 핵심 2) |
| 화면이 하얗게 · 아무것도 안 뜸 | `F12` → Console의 빨간 에러 확인 → 대개 js 문법 오류. 에러 문구 캡처해서 개발자에게 |
| 로컬에서 열었더니 글꼴이 다름 | 폰트는 인터넷에서 받아옴 — 온라인 상태 확인 |
| 색을 바꿨는데 안 바뀜 | `css/skin.css`가 같은 토큰을 덮어쓰는지 확인 (§2-🅑) |
| 브랜치가 오래돼 충돌 | PR 화면의 **Update branch** 버튼 → 그래도 안 되면 개발자 |

---

## 9. 절대 하면 안 되는 것

- ❌ `main` 브랜치에 직접 커밋 (PR로만)
- ❌ 실제 개인정보 · 실제 계좌번호 · 실제 사업자번호를 시드에 넣기 (마스킹된 더미만 — 이름은 `김*은` 식, 이메일은 `@sellery.demo`)
- ❌ `LS` 키 버전을 안 올리고 시드 **구조**(필드 추가/이름 변경) 바꾸기 → 기존 방문자 화면이 깨짐
- ❌ `docs/` 정책 문서와 코드 상수(`js/00-core.js` · `js/02-state.js`)를 따로따로 바꾸기 (같은 PR에서 함께)
- ❌ `CLAUDE.md` 수정 (개발자용 로컬 메모 · gitignore)
- ❌ `assets/_src/`를 화면 코드에서 참조 (git에 없어서 배포에서 깨짐 — `assets/`의 webp/svg만)
- ❌ css/js를 `index.html`에 다시 인라인으로 넣기 (파일 분리가 동시 작업의 전제)
- ❌ 제안서(PDF)에 인쇄된 레거시 데모 저장소(`junho763-dotcom/sellery-prototype` · https://junho763-dotcom.github.io/sellery-prototype/) 삭제 — 인쇄물이 가리키므로 유지

---

## 10. 추가 자료

- [README.md](./README.md) — 프로젝트 개요 · 구조 · 데모 URL
- 정책 문서: [정산](./docs/settlement-policy.md) · [등급](./docs/grade-policy.md) · [판매 기간](./docs/period-policy.md) · [샘플](./docs/sample-policy.md) · [셀러리 포인트](./docs/points-policy.md)
- [PR 템플릿](./.github/pull_request_template.md) · 이슈 템플릿: bug · feature · copy-change · design-change · policy-change (`.github/ISSUE_TEMPLATE/`)
- [GitHub.com 웹 편집기 사용법](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files)
- 레거시 데모(제안서 인쇄 주소, 유지): https://junho763-dotcom.github.io/sellery-prototype/

---

질문은 GitHub Issues 또는 직접 개발자에게 연락하세요.
