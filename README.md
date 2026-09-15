# 셀러리 (Sellery)

> 좋은 브랜드를 만나는 공간, 셀러리

브랜드사와 인플루언서(셀러)를 잇는 **건강·웰니스 전용** 브랜드사 협업판매 중개 플랫폼의 클릭 가능한 UI/UX 프로토타입입니다. (주)위글로우 · 오픈 준비 중.

**데모** → https://sellery-swart.vercel.app/ (Vercel · `main` 자동 배포 — 전환기 동안 GitHub Pages https://weglow-glo.github.io/sellery/ 도 같은 `main`을 서빙)
**로그인** → https://sellery-swart.vercel.app/login.html (데모 계정은 왼쪽 안내 패널 하단 목록(모바일에선 폼 아래)에서 **채우기** · 비밀번호 아무거나 · `login.html?role=brand` 로 브랜드 탭)
**제안서에 인쇄된 옛 데모** → https://junho763-dotcom.github.io/sellery-prototype/ (PDF 링크용으로 유지)
**로컬 미리보기** → 저장소 폴더에서 `python -m http.server 8080` → http://localhost:8080 (`index.html` 더블클릭도 되지만, 로그인·링크 흐름까지 보려면 로컬 서버 권장)

의존성 없는 정적 사이트 (npm/빌드 없음 · 폰트만 CDN). 상단에서 **인플루언서 센터 / 브랜드 센터 / 관리자 창구 / 고객 화면**을 오가며 전체 흐름을 눌러볼 수 있습니다.

## 구현된 흐름

상품 등록 → 검수 → 샘플 요청·승인·배송·테스트 → 판매 일정 제안·승인 → 기간 한정 판매링크 → 판매(실시간 매출) → 종료 → D+21 교환·환불 기간 → 브랜드·셀러 정산 → 재판매

## 주요 기능

- 캠페인 스레드 — 채팅 + 시스템 이벤트 타임라인, 연락처 유출 감지
- 인플루언서 갤러리 + 브랜드의 직접 제안(역제안), 수락·거절 처리
- 익명 셀러 스카우트 — 유료 레퍼런스 열람 → 수락 시 신원 공개 + DM
- 셀러 등급·랭킹 — 등급별 **수수료율 추가분**, 익명 리더보드
- 판매센터 — 팔로워가 아닌 고객도 진행 중인 판매를 발견하고 오픈 알림 신청·구매
- 링크 유입 보호 — 인플루언서 링크로 들어온 고객에게 같은 카테고리 상품 미노출 (홈 이동·새로고침에도 유지)
- 고객 문의(CS) — 관리자를 거치지 않고 브랜드사로 직행
- 실시간 매출 대시보드, 발주서 CSV·이메일 발주(시뮬)
- 정산 시뮬레이션 — PG 1.9% / 인플루언서 수수료 / 플랫폼 10% / 원천징수 3.3% / D+21 지급

## 판매 기간 정책

같은 상품이라도 기간은 **기본 공유** — 누구나 판매를 열 수 있습니다.
다만 **플래티넘 이상** 인플루언서가 확정한 기간에는 플래티넘 이상만 함께 진입할 수 있습니다.

## 파일 구조

여러 명이 동시에 고칠 수 있도록 한 파일이던 `index.html`을 화면 단위로 나눴습니다. `index.html`은 껍데기이고, 실제 내용은 `css/`와 `js/`에 있습니다.

```
index.html          앱 셸 — <head> + 로컬 css 링크 2개 (+ 외부 폰트 css 2개: Google Fonts · galmuri) + <script src> 12개 (순서 고정 00→90, 바꾸지 말 것)
login.html          로그인 · 가입 · 구글 로그인 (단일 파일)
css/base.css        기본 스타일 · :root 디자인 토큰                     ← 디자인
css/skin.css        "light-pixel-celery" 픽셀 스킨 오버라이드              ← 디자인
js/00-core.js       유틸 · 상태 머신(ST/FLOW) · 수수료 상수 PG_RATE / PLAT_RATE / WHT / CLEAR_DAYS
js/01-seed.js       시드 데이터 — 데모 브랜드 · 인플루언서 · 상품 · 캠페인     ← 카피 · 데모 데이터
js/02-state.js      상태 S · localStorage(LS 키) · 해시 라우팅 · 등급/샘플/포인트 상수 · 정산 계산
js/10-render.js     render() 루트 · 공통 컴포넌트
js/20-seller.js     인플루언서 센터 (홈 · 랭킹 · 마이페이지 · 채널 · 추천 · 상품 상세)
js/30-shared.js     셀러리 샵 · 실시간 매출 (인플루언서/브랜드 공용)
js/40-brand.js      브랜드 센터 (홈 · 마이페이지 · 고객 문의)
js/50-admin.js      관리자 창구 (검수 · 매칭 · 매출/순수익)
js/60-customer.js   고객 판매센터 · 셀러리 소개
js/70-campaign.js   캠페인 상세 (스레드 · 정산 미리보기) · 모달
js/80-actions.js    ACT 액션 맵 (data-act 버튼 핸들러 전부)
js/90-boot.js       부트 화면 · 전역 이벤트 · render() 최초 호출
assets/             아바타 SVG(av-s1~8), 상품 이미지(.webp) — 원본은 assets/_src/ (git 제외)
docs/               운영 정책 문서 · 수정 가이드 · 데이터 모델 (아래)
supabase/           Supabase 스키마 — migrations/0001~0006 + seed.sql (앱 미연동 · 적용 방법은 docs/data-model.md §8)
scripts/check.mjs   배포 전 자가 점검 (CI에서도 동일 실행)
.github/            CI(프로토타입 점검 = node scripts/check.mjs) · @claude 봇 · 이슈 템플릿 5종 · PR 템플릿
CONTRIBUTING.md     수정하고 올리는 절차 (브랜치 → 점검 → PR → 병합)
CLAUDE.md           팀 공용 에이전트 지침 (CLAUDE.local.md는 개인용 · git 제외)
.vercelignore       Vercel 배포 제외 목록 — docs/ · scripts/ · *.md 는 배포되지 않음 (문서 링크는 GitHub에서만 열림)
vercel.json         빌드 없이 루트 그대로 서빙 (framework null)
.gitattributes      줄바꿈 LF 통일 (Windows 포함)
```

## 센터 바로가기

| 링크 | 화면 |
|---|---|
| `/#influencer` | 인플루언서 센터만 |
| `/#brand` | 브랜드 센터만 |
| `/#admin` | 관리자 창구(탭 이름: 관리자)만 |
| `/#customer` | 고객 화면(진행 중인 판매)만 |
| `/#s/c1` | 판매 링크 진입 (링크 유입 보호 모드) |

## 정책 문서

숫자의 정답은 코드 상수이고, 사람이 읽는 판은 `docs/`에 있습니다. 상수를 바꾸면 같은 PR에서 문서도 고칩니다.

- [docs/settlement-policy.md](docs/settlement-policy.md) — 수수료 · 정산 (PG / 플랫폼 / 등급 추가분 / 원천징수 / D+21)
- [docs/grade-policy.md](docs/grade-policy.md) — 인플루언서 · 브랜드 등급
- [docs/period-policy.md](docs/period-policy.md) — 판매 기간 · 링크 유입 보호
- [docs/sample-policy.md](docs/sample-policy.md) — 샘플 (무상 · 구매 · 환급)
- [docs/points-policy.md](docs/points-policy.md) — 셀러리(🥬) 포인트 · 추천
- [docs/editing-guide.md](docs/editing-guide.md) — 데모 데이터 · 화면 · 디자인 수정 가이드 (비개발자용 상세판)
- [docs/data-model.md](docs/data-model.md) — Supabase 데이터 모델 (ERD · 테이블 · RLS · 적용 방법) — `supabase/migrations/` + `seed.sql`, 설계 노트·분석은 `docs/data-model-design-notes.md`, `docs/analysis/`

## 수정하고 올리기

[CONTRIBUTING.md](CONTRIBUTING.md) 참고. 요약하면 브랜치 → `node scripts/check.mjs` (Node 20+) → PR → 병합 → Vercel 자동 배포. `main`에는 직접 올리지 않습니다.

---

데이터는 브라우저 localStorage에 저장됩니다. 관리자 창구(#admin) 대시보드 상단의 **데이터 초기화** 버튼으로 시드 상태로 되돌립니다.

> 프로토타입 전용 — 실제 결제·인증·서버는 붙어 있지 않습니다. 문의: official@weglow.biz
