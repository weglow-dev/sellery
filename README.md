# Sellery — 인플루언서 협업판매 플랫폼 프로토타입

**셀러리(Sellery) = Seller × Gallery.** 건강·웰니스 브랜드와 인플루언서를 잇는 협업판매 플랫폼으로, **(주)위글로우**가 오픈을 준비 중입니다. 이 저장소는 그 서비스의 **클릭 가능한 UI/UX 프로토타입**입니다.

🌐 **라이브 데모:** https://sellery-swart.vercel.app/ (`main` 머지 시 자동 배포)
📄 **제안서 데모(레거시):** https://junho763-dotcom.github.io/sellery-prototype/ (제안서 PDF에 인쇄된 주소 · 옛 저장소, 유지)

---

## What this repo is

의존성 없는 **정적 사이트**(HTML/CSS/Vanilla JS)입니다. 빌드도 서버도 없고, 모든 데이터는 브라우저 **localStorage**에 저장됩니다.

- **마스터 모드** — 상단 탭으로 **인플루언서 센터 / 브랜드 센터 / 관리자 / 고객 화면**을 오가며 전체 플로우를 한 브라우저에서 시연합니다.
- **`login.html`** — 이메일 기반 파트너(인플루언서·브랜드) 로그인 데모. 로그인하면 해당 센터로 고정 진입합니다.
- 결제·인증·서버는 없습니다. 주문과 매출은 시뮬레이션입니다.

---

## Tech stack

| 레이어 | 도구 |
|---|---|
| 프론트 | HTML / CSS / Vanilla JS (빌드 없음, 번들러 없음) |
| 호스팅 | Vercel (팀 `weglow-team` · 프로젝트 `sellery` · `main` 푸시 시 자동 배포, PR 마다 미리보기 URL) |
| 데이터 | 브라우저 localStorage (`sellery-proto-v29`) — 시드 데이터로 언제든 초기화 |
| CI | `scripts/check-refs.mjs` — 참조 무결성 + JS 문법 검사 (`.github/workflows/ci.yml`) |
| 봇 | Claude Code Action — 이슈/PR에서 `@claude` 멘션 (`.github/workflows/claude.yml`) |
| 폰트 | IBM Plex Sans KR · IBM Plex Mono · Archivo (Google Fonts) · Galmuri (jsDelivr) |

---

## Repo structure

```
.
├── index.html          앱 셸 — <head> 메타/폰트 + css 2개, <body> 정적 마크업 + <script src> 12개 (순서 고정 00→90)
├── login.html          파트너 로그인 데모 (단일 파일 · 인라인 css/js)
├── css/
│   ├── base.css        기본 스타일 · :root 디자인 토큰                      ← 여기를 편집 (디자인)
│   └── skin.css        "light-pixel-celery" 스킨 오버라이드                  ← 여기를 편집 (디자인)
├── js/
│   ├── 00-core.js      utils · 상태 머신(ST/FLOW) · 수수료 상수 PG_RATE/PLAT_RATE/WHT/CLEAR_DAYS
│   ├── 01-seed.js      시드 데이터 — 데모 브랜드/인플루언서/상품/캠페인 · 로고/아바타   ← 여기를 편집 (카피·데모 데이터)
│   ├── 02-state.js     상태 S · localStorage · 해시 라우팅 · 정책 상수(GRADES, DATA_PRICE, BG_DISC …) · 정산 계산
│   ├── 10-render.js    render() 루트 · 공통 컴포넌트
│   ├── 20-seller.js    인플루언서 센터 (홈·랭킹·마이페이지·채널·추천·상품 상세)   ← 여기를 편집 (센터별 화면)
│   ├── 30-shared.js    셀러리 샵 · 실시간 매출 (인플루언서/브랜드 공용)
│   ├── 40-brand.js     브랜드 센터 (홈·마이페이지·고객 CS)                     ← 여기를 편집 (센터별 화면)
│   ├── 50-admin.js     관리자 창구 (검수·매칭·매출/순수익)                     ← 여기를 편집 (센터별 화면)
│   ├── 60-customer.js  고객 판매센터 · 셀러리 소개                            ← 여기를 편집 (센터별 화면)
│   ├── 70-campaign.js  캠페인 상세 (스레드·정산 미리보기) · 모달
│   ├── 80-actions.js   ACT 액션 맵 (data-act 핸들러 전부)
│   └── 90-boot.js      부트 스크린 · 전역 이벤트 바인딩 · render() 최초 호출
├── assets/             이미지 (webp 상품 누끼 · svg 아바타) — assets/_src/ 는 원본 소스(gitignore)
├── docs/               정책 문서 5개 (아래 "정책 문서")
├── scripts/check-refs.mjs   CI 검사 스크립트 (로컬에서도 실행 가능)
├── .github/            이슈/PR 템플릿 · workflows/{ci,claude}.yml
└── README.md · CONTRIBUTING.md
```

> **편집 규칙:** 화면은 센터별 `js/2x~6x`, 카피·데모 데이터는 `js/01-seed.js`, 색·여백·타이포는 `css/`. 수수료·등급 같은 **정책 숫자**는 `js/00-core.js`·`js/02-state.js`의 상수와 `docs/`를 함께 고칩니다. `index.html`의 `<script>` 순서는 바꾸지 마세요 (뒤 파일이 앞 파일의 전역을 씁니다).

---

## 구현된 플로우

상품 등록 → 검수 → 샘플 요청/승인/배송/테스트 → 공구 일정 제안/승인(등급 우선 기간제 캘린더) → 기간 한정 링크 → 판매(실시간 매출) → 종료 → D+21 교환·환불 기간 → 브랜드/인플루언서 정산 → 재공구

---

## 주요 기능

- **캠페인 스레드** — 채팅 + 시스템 이벤트 타임라인, 연락처/외부 메신저 공유 자동 감지, 고객 CS는 브랜드 직결
- **인플루언서 갤러리** + 브랜드의 공구 직접 제안(역제안, 수락/거절)
- **익명 인플루언서 스카우트** — 유료 레퍼런스 열람 → 제안 수락 시 신원 공개 + DM
- **인플루언서 등급/랭킹** — 3개월 확정 매출 기준 7등급(스타터→블랙), 등급 추가 수수료 최대 +3%p, 익명 리더보드
- **브랜드 등급** — 누적 확정 매출 기준 7등급, 플랫폼 수수료 최대 −2%p
- **등급 우선 기간제** — 기간은 누구나 열되, 플래티넘 이상이 확정한 기간엔 플래티넘 이상만 진입
- **링크 진입 보호** — 인플루언서 링크로 온 고객에게 경쟁 상품 미노출 (새로고침·재방문에도 유지)
- **실시간 매출 대시보드** — 최근 7일 차트, 주문 피드, 판매 시뮬레이션 시작/중지
- **발주·물류** — 발주서 CSV 다운로드 / 이메일 자동 발주(시뮬) / 송장 CSV 업로드
- **정산 시뮬레이션** — PG 1.9% / 플랫폼 10% / 인플루언서 수수료(브랜드 제안 요율 + 등급 추가분) / 개인 원천징수 3.3% · 판매 종료 D+21 에스크로 자동 정산 (단순 변심 7일 · 하자 21일 환불 보호)
- **셀러리(🥬) 포인트 경제** — 확정 매출 ₩500만당 1🥬 적립, 데이터 열람·상단 노출·샘플 결제(1🥬 = ₩20,000)에 사용

---

## 센터 고정 링크

해시로 진입하면 상단 역할 탭이 사라지고 해당 센터만 보입니다.

| 링크 | 화면 |
|---|---|
| `index.html#influencer` | 인플루언서 센터만 (`#seller` 동일) |
| `index.html#brand` | 브랜드 센터만 |
| `index.html#admin` | 관리자 창구만 |
| `index.html#customer` | 고객 판매센터만 (`#shop` 동일) |
| `index.html#s/c1` | 판매 링크 진입 — 링크 보호 모드 (`#link/c1` 동일) |
| `login.html` | 파트너 로그인 데모 → 로그인 후 `#influencer` / `#brand` 로 이동 |

---

## Local dev

```bash
# 방법 1 — 그냥 열기
#   index.html 더블클릭. 외부 css/js 는 file:// 에서도 동작합니다.

# 방법 2 — 로컬 서버 (해시 라우팅·폰트까지 실제 배포와 동일하게 확인)
python -m http.server 8080
# → http://localhost:8080

# CI 와 같은 검사 (PR 올리기 전에)
node scripts/check-refs.mjs
```

데이터를 시드로 되돌리려면 **관리자 창구 홈의 "데이터 초기화"** 버튼을 누르세요 (localStorage 초기화).

---

## Contributing

**비개발자(마케팅 · 디자인 · 기획)** → [`CONTRIBUTING.md`](./CONTRIBUTING.md)부터 읽어 주세요.

Quick version:
1. 브랜치 생성 — `mkt/` (카피) · `design/` (시각) · `feat/` (기능) · `fix/` (버그) · `docs/` (문서) · `policy/` (수수료·등급 등 정책 숫자)
2. 해당 파일 수정 → PR 생성 (PR 템플릿의 체크박스 채우기)
3. CI **`ci`** 통과 (참조 무결성 + JS 문법) → 리뷰 코멘트 해결
4. `main` 머지 → Vercel 자동 배포 (1분 내)

**Branch protection:** `main` 직접 푸시는 막혀 있습니다 (PR로만). 이슈/PR에서 `@claude`를 멘션하면 Claude Code Action이 변경 PR을 만들어 줍니다.

---

## 정책 문서

프로토타입에 들어 있는 규칙을 코드와 같은 숫자로 적어 둔 문서입니다. 정책을 바꿀 땐 코드 상수와 문서를 한 PR에서 같이 고칩니다.

| 문서 | 내용 |
|---|---|
| [`docs/settlement-policy.md`](./docs/settlement-policy.md) | 정산 — PG 1.9% · 플랫폼 10% · 인플루언서 수수료(제안 요율 + 등급 추가분) · 원천징수 3.3% · D+21 |
| [`docs/grade-policy.md`](./docs/grade-policy.md) | 등급 — 인플루언서 7등급(3개월 확정 매출) · 브랜드 7등급(누적 확정 매출) · 등급별 혜택 |
| [`docs/period-policy.md`](./docs/period-policy.md) | 판매 기간 — 등급 우선 기간제 (플래티넘 이상 확정 기간은 플래티넘 이상만 진입) |
| [`docs/sample-policy.md`](./docs/sample-policy.md) | 샘플 — 무상 제공 등급 · 구매 방식 · 셀러리 결제 · 환급 |
| [`docs/points-policy.md`](./docs/points-policy.md) | 셀러리(🥬) 포인트 — 적립(₩500만당 1🥬) · 사용처 · 샵 가격 |

---

## 프로토타입 한계

- 실제 결제·인증·서버가 없습니다. 로그인은 화면 데모이며, 매출/주문은 시뮬레이션입니다.
- 데이터는 각자의 브라우저 localStorage에만 있습니다 — 다른 기기·다른 사람과 공유되지 않습니다.
- 여기 적힌 수수료·등급 숫자는 프로토타입 설정값이며, 실서비스 정책은 변경될 수 있습니다.

---

## 회사 · 문의

- 운영: **(주)위글로우**
- 일반 문의 / 비즈니스: official@weglow.biz
- 버그·제안: GitHub Issues (이슈 템플릿: bug · feature · copy-change · design-change · policy-change)

---

## License

© 2026 **(주)위글로우**. All rights reserved.

이 저장소의 소스 코드는 팀 협업과 투명성을 위해 공개합니다. **셀러리 브랜드, 카피, 디자인, 상품 정보는 (주)위글로우의 자산**이며 허가 없이 재사용할 수 없습니다. 기술 골격을 비상업적 학습 목적으로 포크하는 것은 괜찮습니다 — 다만 브랜드를 사칭하지는 마세요.
