# 셀러리 브랜딩 (apps/branding) — 인플루언서 PB 제조의뢰 랜딩

> 2026-10-13 시작 · PR #153 · 작성 시점 상태: **랜딩 페이지 + CTA 버튼까지만 완료, 제조의뢰 폼은 미구현**

인플루언서가 자기 이름을 건 웰니스 브랜드(다이어트·피부·건강)를 만들 수 있게 안내하고 **제조의뢰를 받는** 페이지.
핵심 메시지: 재고 부담 · 제조 비용 · 행정 리스크는 셀러리가 부담하고, 인플루언서에게는 자기 샵을 열어준다.

## 1. 다른 앱과 다른 점 (중요)

기존 4개 앱(shop · influencer · brand · admin)과 **의도적으로 분리된 독립 UI** 입니다.

| 항목 | 기존 4개 앱 | apps/branding |
| --- | --- | --- |
| 디자인 | packages/ui (theme.css · legacy skin) | **자체 테마만** — 토스 톤(흰 배경 · 블루 포인트) |
| 폰트 | IBM Plex Sans KR (700 최대) | **Pretendard Variable** (실제 100~900 · jsdelivr CDN, `src/app.html`) |
| 패키지 의존 | @sellery/core·db·ui·payments | **워크스페이스 의존성 0** — 단독 `npm install` 로도 빌드됨 |
| 렌더링 | SPA(ssr=false) 또는 Supabase SSR | **정적 프리렌더** (`+layout.ts` `prerender = true`) — 서버 로직·환경변수 없음 |
| base 경로 | '' 또는 /influencer /brand /admin | **''** — 자체 오리진(독립 배포, sellery.life 리라이트에 안 물림 |
| 셀러리 로고 규칙(-14° 등) | 적용 | **적용 안 함** — 기존 아이덴티티와 무관하게 감 |

유지하는 공통 규칙: `font-synthesis: none` · `word-break: keep-all` · `prefers-reduced-motion` 존중 (전부 `src/app.css`).

## 2. 파일 맵

```
apps/branding/
  src/app.html              문서 셸 — Pretendard 로드 · 파비콘 (수정할 일 거의 없음)
  src/app.css               @theme 디자인 토큰 + body 기본 + [data-reveal] 스크롤 리빌 CSS
  src/routes/+layout.ts     prerender = true (정적 빌드 스위치)
  src/routes/+layout.svelte app.css 임포트만
  src/routes/+page.svelte   ★ 랜딩 전체 — 헤더 · 히어로(샵 목업) · 0·0·0 · 진행 과정 · 운영 · CTA 밴드 · 푸터 · 토스트
  static/favicon.svg
  svelte.config.js          adapter-vercel(nodejs22.x) · base 없음 · Supabase hooks 없음
  vite.config.ts            포트 5177 · tailwindcss 플러그인 (vite-root-assets 안 씀)
  vercel.json               리전 icn1
```

화면 수정은 사실상 `+page.svelte` 하나 + `app.css` 의 `@theme` 토큰만 보면 됩니다.

## 3. 디자인 토큰 (`src/app.css` `@theme`)

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--color-ink` / `-soft` / `-faint` | #191f28 / #4e5968 / #8b95a1 | 제목 / 본문 / 보조 텍스트 |
| `--color-fill` / `-deep` | #f7f8fa / #eef0f3 | 섹션 교차 배경 / 목업 속 면 |
| `--color-line` | #e5e8eb | 테두리 |
| `--color-blue` / `-deep` / `-soft` | #3182f6 / #1b64da / #e8f3ff | 포인트(CTA·강조) / 호버 / 연한 배경·뱃지 |

Tailwind v4 라서 토큰이 곧 유틸리티가 됩니다 (`bg-blue` `text-ink-soft` `border-line` …). 색을 늘리기보다 블루 포인트 하나를 유지하는 게 이 페이지의 톤입니다.

**인터랙션 패턴**: 스크롤 리빌은 요소에 `data-reveal` (지연은 `style="--reveal-delay: 0.08s"`)만 붙이면 `+page.svelte` 의 `reveal` 액션(IntersectionObserver)이 처리합니다. CSS 는 `app.css` 쪽. 그 외 헤더 스크롤 블러(`scrollY` 바인딩) · 카드 호버 리프트 · 목업 플로팅은 전부 `+page.svelte` 안에 있습니다.

## 4. CTA 연결 지점 (다음 작업자가 손댈 곳)

모든 CTA(헤더 · 히어로 · 마지막 밴드)는 `+page.svelte` 의 **`startApply()` 하나**로 모입니다.
지금은 "폼을 준비하고 있어요" 토스트만 띄움 → **제조의뢰 폼(`/apply` 라우트)이 생기면 이 함수에서 `goto('/apply')` 로 교체**하고 토스트 코드를 지우면 됩니다.

## 5. 남은 일 (우선순위순)

1. **제조의뢰 폼** — `src/routes/apply/+page.svelte` 신설. 필드 초안: 활동명 · 연락처 · 이메일 · 주 채널+링크 · 팔로워 규모 · 제품 카테고리(다이어트/이너뷰티/건기식 등 멀티 선택) · 희망 출시 시기 · 제품 아이디어(서술) · 개인정보 동의. **접수 데이터를 어디로 받을지 미정** — 후보: Resend 메일(브랜드 콘솔처럼) / Supabase 테이블 / 구글 폼 임베드. 폼을 붙이면 prerender 유지 가능 여부 확인(서버 액션을 쓰면 프리렌더 해제 필요).
2. **Vercel–GitHub 연동** — 아래 §6. 지금은 CLI 수동 배포라 main 병합해도 자동 반영 안 됨.
3. 도메인 결정 — 예: `branding.sellery.life` (Vercel 프로젝트 Domains 에 추가 + DNS).
4. OG 이미지 · 실제 샵 목업 이미지 교체(지금은 CSS 가짜 목업) · 카피 다듬기.

## 6. 개발 · 배포

- 로컬: 루트에서 `npm run dev:branding` → http://localhost:5177 (환경변수 불필요)
- 검사: `npm run check -w apps/branding` · 빌드: `npm run build -w apps/branding` — CI(`프로토타입 점검`)에 자동 포함됨
- **Vercel**: team `weglow-team` · 프로젝트 `sellery-branding` (2026-10-13 CLI 로 생성, **GitHub 미연동**) · 공개 주소 **https://sellery-branding.vercel.app**
  - 수동 배포: `apps/branding` 에서 `vercel link --project sellery-branding --scope weglow-team` 후 `vercel deploy` (프로덕션은 `--prod`)
  - 고유 배포 URL(`…-weglow-team.vercel.app`)은 팀 SSO 보호가 걸려 302 — 정상입니다. 공개 확인은 위 주소로.
  - GitHub 연동 시(대시보드 → Settings → Git): Root Directory `apps/branding` 로 지정. 워크스페이스 의존성이 없어서 "Include source files outside of the Root Directory" 는 꺼도 됩니다.
- sellery.life 아래로 넣으려면(`sellery.life/branding`): base 경로 `/branding` 설정 + `apps/shop/vercel.json` 리라이트 추가가 필요 — 현재는 독립 오리진 방침이라 안 함.
