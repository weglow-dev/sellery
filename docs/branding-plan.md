# 셀러리 브랜딩 (apps/branding) — 인플루언서 PB 제조의뢰 랜딩

> 2026-10-13 시작 · PR #153 · 2026-10-14 업데이트: 다크 테마 전면 개편 · 섹션 컴포넌트 분리 · **제조의뢰 폼(`/apply`) 완료**

인플루언서가 자기 이름을 건 웰니스 브랜드(다이어트·피부·건강)를 만들 수 있게 안내하고 **제조의뢰를 받는** 페이지.
핵심 메시지: 재고 부담 · 제조 비용 · 행정 리스크는 셀러리가 부담하고, 인플루언서에게는 자기 샵을 열어준다.

## 1. 다른 앱과 다른 점 (중요)

기존 4개 앱(shop · influencer · brand · admin)과 **의도적으로 분리된 독립 UI** 입니다.

| 항목 | 기존 4개 앱 | apps/branding |
| --- | --- | --- |
| 디자인 | packages/ui (theme.css · legacy skin) | **자체 테마만** — 다크 베이스 + 웜 앰버(#ff7a3d) 포인트의 프리미엄 무드 |
| 폰트 | IBM Plex Sans KR (700 최대) | **Pretendard Variable** (실제 100~900 · jsdelivr CDN, `src/app.html`) |
| 패키지 의존 | @sellery/core·db·ui·payments | **워크스페이스 의존성 0** — 단독 `npm install` 로도 빌드됨. 슬랙 알림도 `packages/db` 재사용 없이 `/apply` 라우트 안에서 자체 구현 |
| 렌더링 | SPA(ssr=false) 또는 Supabase SSR | **정적 프리렌더 + `/apply` 한 라우트만 서버 액션**(아래 §5) — 그 외 전부 prerender, 환경변수도 `/apply` 하나(`SLACK_WEBHOOK_URL`, 선택)뿐 |
| base 경로 | '' 또는 /influencer /brand /admin | **''** — 자체 오리진(독립 배포, sellery.life 리라이트에 안 물림) |
| 셀러리 로고 규칙(-14° 등) | 적용 | **적용 안 함** — 기존 아이덴티티와 무관하게 감 |

유지하는 공통 규칙: `font-synthesis: none` · `word-break: keep-all` · `prefers-reduced-motion` 존중 (전부 `src/app.css`).

## 2. 파일 맵

```
apps/branding/
  src/app.html                 문서 셸 — Pretendard 로드 · 파비콘 · theme-color
  src/app.css                  @theme 디자인 토큰 + body 기본 + [data-reveal] 스크롤 리빌 + float 애니메이션(공유분만)
  src/routes/+layout.ts        prerender = true (정적 빌드 기본값 — /apply 가 자기 라우트에서 override)
  src/routes/+layout.svelte    app.css 임포트만
  src/routes/+page.svelte      랜딩 조립부 — 섹션 컴포넌트 import 나열 + <svelte:head> 뿐
  src/routes/apply/
    +page.svelte                제조의뢰 폼 UI
    +page.server.ts             폼 액션 — 검증 후 notifySlack 호출 · prerender = false
    apply-options.ts            폼 선택지(카테고리·제형·패키지·맛) — 이 라우트의 +page.svelte·+page.server.ts 가 같이 쓰는 데이터
  src/lib/
    components/
      ChipGroup.svelte             라디오 칩 선택 UI (폼)
      section/                     페이지 섹션 — SiteHeader · Hero · ZeroStats · ValueGrid · Steps · BrandStory · Growth · Categories · FinalCta · SiteFooter
      constellation/
        Constellation.svelte       히어로 데코 — 커서 추적 점·선 캔버스
    utils/
      reveal.ts                   [data-reveal] 스크롤 리빌 액션 + 숫자 카운트 애니메이션 (모든 섹션이 import)
    server/
      slack.ts                    SLACK_WEBHOOK_URL 로 알림 한 줄(best-effort) — 서버 전용
  static/                       favicon.svg · 아이콘 SVG(inventory/cost/admin/manager/sample) · 에디토리얼 사진(story/identiti/conect/diet/inner/mental/mans.png)
  svelte.config.js              adapter-vercel(nodejs22.x) · base 없음 · Supabase hooks 없음
  vite.config.ts                포트 5177 · tailwindcss 플러그인
  vercel.json                   리전 icn1
```

`lib/components/`(컴포넌트) · `lib/server/`(서버 전용)는 다른 4개 앱과 같은 자리입니다. 홈 섹션을 고치려면 `src/lib/components/section/<섹션>.svelte` 하나만 보면 되고, 컴포넌트 `<style>` 블록은 쓰지 않습니다(Tailwind 유틸리티 인라인 원칙).

## 3. 디자인 토큰 (`src/app.css` `@theme`)

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--color-bg` / `-panel` | #0a0b0e / #121319 | 페이지 배경 / 섹션 교차 배경 |
| `--color-line` | rgba(255,255,255,.08) | 테두리 |
| `--color-fg` / `-soft` / `-faint` | #fff / rgba(255,255,255,.65) / rgba(255,255,255,.4) | 제목 / 본문 / 보조 텍스트 |
| `--color-accent` / `-deep` / `-soft` | #ff7a3d / #ff5a1f / rgba(255,122,61,.16) | 포인트(CTA·강조) / 호버 / 연한 배경·뱃지 |
| `--color-accent-2` | #7c3aed | 마지막 CTA 패널 그라디언트 보조색 |

Tailwind v4 라서 토큰이 곧 유틸리티가 됩니다 (`bg-accent` `text-fg-soft` `border-line` …). 포인트 컬러는 앰버 하나 유지가 이 페이지의 톤입니다.

**인터랙션 패턴**: 스크롤 리빌은 요소에 `data-reveal`(지연은 `style="--reveal-delay: 0.08s"`)만 붙이면 `src/lib/utils/reveal.ts` 의 `reveal` 액션(섹션 컴포넌트 루트에 `use:reveal`)이 처리합니다. `data-count-to`/`data-count-from` 을 붙이면 숫자 카운트 애니메이션도 같이 실행됩니다. `float`/`float-delay`/`float-delay-2` 애니메이션은 `app.css` 의 공유 토큰이고, 그 외 호버·카드 리프트 등은 각 섹션 컴포넌트 안에서 Tailwind 유틸리티로 인라인 작성합니다.

## 4. CTA 연결

헤더·히어로·마지막 CTA 밴드 세 버튼 전부 `<a href="/apply">` 로 제조의뢰 폼으로 바로 이동합니다(과거 토스트만 띄우던 `cta.svelte.ts`/`CtaToast.svelte` 는 폼이 생기면서 삭제).

## 5. 제조의뢰 폼 (`/apply`)

**필드**: 활동명/브랜드명 · 연락처(둘 다 필수) → ① 카테고리(다이어트/피부/건강, 단일 선택) + 메인 성분 주관식(선택) → ② 제형(알약/젤리/분말/액상/필름/캔디, 단일) — 알약이면 하위로 타정/분말캡슐/연질캡슐 추가 선택 → ③ 패키지(제형에 따라 선택지가 바뀜, `apply/apply-options.ts` `PACKAGING_BY_FORM` — 필름은 패키지 선택 단계 자체를 건너뜀) → ④ 맛(칩 선택 + 기타 직접입력) → ⑤ 마지막 자유 주관식(선택) → 개인정보 수집 동의 체크(필수). **최소 제작 수량 1,000개는 고정값으로 표시만** 하고 입력받지 않습니다(`MIN_QTY` 상수).

**제출 처리** (`apply/+page.server.ts`): SvelteKit 폼 액션으로 서버 검증(`fail()` 로 에러 반환, `use:enhance` 로 리로드 없이 에러 표시 — JS 없이도 동작). 검증 통과 시 **슬랙 웹훅으로 알림**만 보냅니다 — DB 저장·이메일은 없습니다. 패턴은 `packages/db/src/server/partner/slack.server.ts` 와 동일(선택·best-effort·3초 타임아웃)이지만, 이 앱은 워크스페이스 의존성이 없는 독립 앱이라 코드를 가져오지 않고 `src/lib/server/slack.ts` 에 그대로 다시 구현했습니다(다른 앱의 `lib/server/` 규칙과 동일).

**⚠️ 운영 전 필수 설정**: `SLACK_WEBHOOK_URL` 환경변수를 Vercel 프로젝트 `sellery-branding` 에 추가해야 합니다 — **없으면 폼은 "접수 완료"로 정상 동작하지만 접수 내용이 콘솔 로그 말고는 어디에도 남지 않습니다** (서버 로그에 경고만 찍힘). 다른 4개 앱이 이미 쓰는 것과 같은 웹훅 URL을 그대로 재사용해도 되고(`.env.example` 참고), 제조의뢰 알림만 따로 보고 싶으면 새 웹훅(새 슬랙 채널)을 만들어 거기 값을 넣어도 됩니다 — 어느 쪽이든 Vercel 대시보드 → `sellery-branding` → Settings → Environment Variables 에서 추가.

**이 라우트만 서버 렌더링**: 폼 액션이 있는 라우트는 프리렌더할 수 없어서 `apply/+page.server.ts` 에 `export const prerender = false` 를 선언했습니다. 루트 레이아웃의 `prerender = true` 는 그대로 유지되므로 홈(`/`)은 여전히 정적 HTML로 빌드되고, `/apply` 만 Vercel 서버리스 함수로 분리됩니다(`vercel build` 결과물의 `.vercel/output/functions/apply.func` 로 확인 가능).

## 6. 남은 일

1. 도메인 결정 — 예: `branding.sellery.life` (Vercel 프로젝트 Domains 에 추가 + DNS).
2. OG 이미지 교체(지금은 og:title/description 만 있고 og:image 없음) · 카피 다듬기.
3. (선택) 제조의뢰 접수 건을 Slack 알림 말고 어딘가에도 durable 하게 남기고 싶다면 — Resend 메일 발송 또는 Supabase 테이블 적재 추가 검토.

## 7. 개발 · 배포

- 로컬: 루트에서 `npm run dev:branding` → http://localhost:5177 (`/apply` 슬랙 알림 테스트하려면 `apps/branding/.env` 에 `SLACK_WEBHOOK_URL=...` 추가 — 없어도 폼 자체는 정상 동작, 콘솔에 경고만 찍힘)
- 검사: `npm run check -w apps/branding` · 빌드: `npm run build -w apps/branding` — CI(`프로토타입 점검`)에 자동 포함됨
- **Vercel**: team `weglow-team` · 프로젝트 `sellery-branding` · Root Directory `apps/branding` · **GitHub 연동 완료(2026-10-14)** — `main` 병합마다 자동 프로덕션 배포, PR 마다 프리뷰 배포. 공개 주소 **https://sellery-branding.vercel.app**
  - 고유 배포 URL(`…-weglow-team.vercel.app`)은 팀 SSO 보호가 걸려 302 — 정상입니다. 공개 확인은 위 주소로.
  - **트러블슈팅 기록**: 프로젝트를 CLI(`vercel link`/`vercel deploy`)로 먼저 만든 뒤 나중에 대시보드에서 GitHub 저장소를 연결하면, Root Directory 가 `.`(저장소 루트)로 남아 있을 수 있다 — 이 경우 push 때마다 `apps/branding` 만이 아니라 루트의 `npm run build --workspaces`(모노레포 4개 앱 전체)가 돌다가 다른 앱(`apps/shop` 등)의 환경변수가 없어서 빌드가 실패한다. 대시보드에서 안 고쳐지면 `vercel project update sellery-branding --root-directory apps/branding --scope weglow-team` 로 직접 설정.
- sellery.life 아래로 넣으려면(`sellery.life/branding`): base 경로 `/branding` 설정 + `apps/shop/vercel.json` 리라이트 추가가 필요 — 현재는 독립 오리진 방침이라 안 함.
