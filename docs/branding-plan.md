# 셀러리 브랜딩 (apps/branding) — 인플루언서 PB 제조의뢰 랜딩

> 2026-10-13 시작 · PR #153 · 2026-10-14 다크 테마 개편 · 제조의뢰 폼 · **2026-10-15 전면 재작성 — 랜딩(가로 7슬라이드)과 제조의뢰 퍼널을 한 화면으로 합침**(Claude Design "Sellery Landing Funnel" mobile · PC 두 안을 같은 컴포넌트의 `lg:` 분기로 구현).

**서비스 이름은 "Make Your Recipe"**(2026-10-22 개발팀 결정 — 화면·제목·og:site_name·슬랙 접수 태그·OG 이미지에서 "셀러리/셀러리 브랜딩" 대신 씀 · `lib/site.ts` `BRAND_NAME`). 저장소 폴더·Vercel 프로젝트·공개 주소(`sellery.life/influencer/oem`)는 그대로.

인플루언서가 **나만의 웰니스 제품**(다이어트·피부·건강)을 만들 수 있게 안내하고 **제조의뢰를 받는** 페이지.
핵심 메시지(2026-10-22 개발팀 요청으로 "브랜드를 만들어 준다" 프레임을 빼고): **성분부터 맛까지 내가 고른 레시피로, 나만 팔 수 있는 제품**(말투는 "당신" 대신 랜딩의 1인칭 "나/내" — 강조 자리는 "나만", 설명 줄은 주어 생략) — 재고 부담 · 제조 비용 · 행정 리스크는 Make Your Recipe 가 부담하고, 인플루언서에게는 자기 샵을 열어준다. 화면의 "브랜드"는 전부 "제품/레시피"로 바꿨다(히어로 · 3~7장 · 퍼널 첫 질문 · 메모 placeholder · 완료 요약 제목 · 제목/설명/OG).

## 1. 다른 앱과 다른 점 (중요)

기존 4개 앱(shop · influencer · brand · admin)과 **의도적으로 분리된 독립 UI** 입니다.

| 항목 | 기존 4개 앱 | apps/branding |
| --- | --- | --- |
| 디자인 | packages/ui (theme.css · legacy skin) | **자체 테마만** — 다크 베이스 + 웜 앰버(#ff7a3d) 포인트의 프리미엄 무드 |
| 폰트 | IBM Plex Sans KR (700 최대) | **Pretendard Variable** (실제 100~900 · jsdelivr CDN, `src/app.html`) |
| 패키지 의존 | @sellery/core·db·ui·payments | **워크스페이스 의존성 0** — 단독 `npm install` 로도 빌드됨. 슬랙 알림도 `packages/db` 재사용 없이 `/apply` 라우트 안에서 자체 구현 |
| 렌더링 | SPA(ssr=false) 또는 Supabase SSR | **라우트 둘(`/` `/apply`) 다 폼 액션이 있는 SSR**(아래 §5) — 프리렌더 없음, 환경변수는 `SLACK_WEBHOOK_URL` 하나(없으면 접수가 "전송 실패"로 막히므로 사실상 필수) |
| base 경로 | '' 또는 /influencer /brand /admin | **''** — 자체 오리진(독립 배포, sellery.life 리라이트에 안 물림) |
| 셀러리 로고 규칙(-14° 등) | 적용 | **적용 안 함** — 기존 아이덴티티와 무관하게 감 |

유지하는 공통 규칙: `font-synthesis: none` · `word-break: keep-all` · `prefers-reduced-motion` 존중 (전부 `src/app.css`).

## 2. 파일 맵

```
apps/branding/
  src/app.html                 문서 셸 — Pretendard 로드 · 파비콘 · theme-color
  src/app.css                  @theme 디자인 토큰 + body 기본 + pop/step 애니메이션 + no-scrollbar 유틸리티 (공유분만)
  src/routes/+layout.svelte    app.css 임포트만
  src/routes/+page.svelte      홈 = <Funnel> 한 줄 + <svelte:head> 메타 (랜딩 슬라이드부터 시작)
  src/routes/+page.server.ts   prerender=false · lib/server/apply-action.ts 의 액션 re-export
  src/routes/apply/+page.svelte / +page.server.ts   같은 <Funnel> 을 startStep="category" 로 — 랜딩을 건너뛰는 바로 가기(noindex) · 액션도 같은 것
  src/lib/
    utils/apply-options.ts      퍼널 선택지의 단일 출처 — 카테고리·제형·세부 종류(알약/캔디)·패키지·맛·미팅 시간대·랜딩 카테고리 4종 · 타일 설명 · 맛 색 견본 · 성분 제안 · 폼 액션 결과 타입(ApplyValues/ApplyErrors/ApplyResult)
    components/
      Funnel.svelte               퍼널의 상태 머신 + 셸 — 답 상태 · 단계 순서(제형에 따라 세부/패키지/맛 단계 유무) · 이동/자동 다음 · 레일 항목 · 연락처 검증과 use:enhance 결과 처리 · 완료 요약. 화면은 funnel/ 컴포넌트가 그린다
      funnel/
        shared.ts                 Step · RailItem 타입 + 단계 화면 공통 클래스(eyebrow/h1/helper/label/input/err · ctaOn/ctaOff · scrollCls/footCls/bodyCls)
        StepHead.svelte           질문 머리(눈썹 · 두 줄 제목 · 도움말)
        TileStep.svelte           타일 질문 한 벌(카테고리 · 제형 · 세부 종류 · 패키지 · 맛) — TileGroup + 오류 + "아직 모르겠어요" + [다음] 푸터, children 으로 덧붙임(최소 수량 카드)
        IngredientStep.svelte     메인 성분 + 메모(선택) — 성분 제안 칩 토글, [다음]/[건너뛰기]
        ContactStep.svelte        연락처 <form> — hidden 답 · 활동명 · 연락처(자동 하이픈) · 미팅 시간대 · 동의 · 오류/배너 · 제출 버튼 (use:enhance 는 Funnel 이 넘김)
        DoneStep.svelte           접수 완료 — 요약 · 타임라인 · [홈으로]
        UnsureButton.svelte · NextFoot.svelte   점선 "아직 모르겠어요" · [다음 →] 푸터
        MobileHeader.svelte       모바일 고정 헤더(뒤로 · 진행 세그먼트 · n/N · 경로)
        Rail.svelte               데스크톱 사이드 레일(로고 · 진행 · 질문 목록 · 안내)
        DesktopBar.svelte         데스크톱 상단 바([이전] · 경로)
      Landing.svelte              intro 단계 = 랜딩의 틀 — 현재 슬라이드 번호 · 스크롤 스냅/키보드/점/◀▶ 이동 · 상단 바 · 하단 바([제조의뢰 시작하기]). 슬라이드 7장은 landing/ 컴포넌트에 `active`(지금 보이는 장인지)만 넘긴다
      landing/
        shared.ts                 슬라이드 공통 클래스(slideCls · twoCol · rightCol · eyebrowCls · h2Cls) + 진입 연출 헬퍼 rise()/d()
        ArrowIcon.svelte          → 화살표 아이콘 (히어로 힌트 · 2장 표 · 하단 CTA)
        HeroSlide.svelte          1장 헤드라인 + (데스크톱) 둥실 떠 있는 제형 카드 6장
        ZeroSlide.svelte          2장 START WITH ZERO — 취소선 표
        BurdenSlide.svelte        3장 내가 할 일 / 셀러리가 할 일 — 칩이 건너가는 표 (desktop 판정 포함)
        ProcessSlide.svelte       4장 진행 과정 — 자동 재생 타이머 · 게이지(PROC_MS 2.2초 · 되감기 없이 01번부터)
        StorySlide.svelte         5장 "나만의 제품이 되는 과정" 3줄 + 서비스 칩
        CategorySlide.svelte      6장 카테고리 타일 4장 — 반짝임 · 탭하면 onpick(category)
        FinalSlide.svelte         7장 통계 4칸 + 마지막 헤드라인
      TileGroup.svelte            타일형 단일 선택 버튼 — grid(카테고리 2열→lg 4열) · grid-lg(제형 2→3열) · row(세부 종류 · 패키지: 가로 카드→lg 3열 세로 카드) · swatch(맛 3→6열)
      TileIcon.svelte             48px 투톤 아이콘 표 (퍼널 타일 + 랜딩 카테고리 아이콘 이너뷰티/멘탈/맨즈)
    utils/phone.ts              연락처 자동 하이픈 + 완성 여부 정규식 (폼·서버 공용)
    server/
      apply-action.ts             폼 액션 — 검증 → notifySlack · 실패면 fail(400/502) 로 입력값 반환
      slack.ts                    SLACK_WEBHOOK_URL 로 접수 한 줄 전송 — 실패/미설정이면 false 를 돌려 접수를 막는다 · 서버 전용
  static/favicon.svg            (이미지는 더 쓰지 않아 전부 삭제됨)
  svelte.config.js              adapter-vercel(nodejs22.x) · base 없음 · Supabase hooks 없음
  vite.config.ts                포트 5177 · tailwindcss 플러그인
  vercel.json                   리전 icn1
```

`lib/components/`(컴포넌트) · `lib/server/`(서버 전용)는 다른 4개 앱과 같은 자리입니다. 화면을 고치려면 `landing/<N장>Slide.svelte`(랜딩 슬라이드 한 장) 또는 `funnel/<단계>Step.svelte`(질문 화면 하나) · 흐름을 바꾸려면 `Funnel.svelte` 만 보면 되고, 컴포넌트 `<style>` 블록은 쓰지 않습니다(Tailwind 유틸리티 인라인 원칙 — 슬라이드 연출의 지연값처럼 계산되는 값만 `style=` 속성).

## 3. 디자인 토큰 (`src/app.css` `@theme`)

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--color-bg` / `-panel` | #0a0b0e / #15161a | 페이지 배경 / 카드·칩 배경 |
| `--color-line` | rgba(255,255,255,.08) | 테두리 |
| `--color-fg` / `-soft` / `-faint` | #fff / rgba(255,255,255,.65) / rgba(255,255,255,.45) | 제목 / 본문 / 보조 텍스트 |
| `--color-accent` / `-deep` / `-soft` | #ff7a3d / #ff5a1f / rgba(255,122,61,.16) | 포인트(CTA·강조) / 호버 / 연한 배경·뱃지 |

Tailwind v4 라서 토큰이 곧 유틸리티가 됩니다 (`bg-accent` `text-fg-soft` `border-line` …). 포인트 컬러는 앰버 하나 유지가 이 페이지의 톤입니다.

**인터랙션 패턴**: 화면 전환 `motion-safe:animate-step`(단계 화면 · 진행 과정 카드)과 선택 체크 `motion-safe:animate-pop` 은 `app.css` 공유 토큰. 랜딩 슬라이드의 연출(취소선 그리기 · "당신" 칸의 짐이 "셀러리" 칸으로 건너가기 · 진행 과정 3.2초 자동 재생 · 타일/통계 순차 등장)은 각 슬라이드 컴포넌트가 `active`(Landing.svelte 가 넘기는 "지금 보이는 장인지")로만 켜고, 지연값은 `style=` 의 transition-delay 로 계산합니다. 옛 `[data-reveal]` 스크롤 리빌과 `float` 애니메이션은 2026-10-15 에 삭제됐습니다.

## 4. CTA 연결

랜딩의 [제조의뢰 시작하기](하단 고정)와 카테고리 슬라이드의 타일 4장이 같은 컴포넌트 안에서 단계만 바꿉니다(라우트 이동 없음). 타일을 탭하면 매핑된 카테고리(이너뷰티 → 피부, 멘탈·맨즈 → 건강)가 골라진 채 첫 질문으로 들어갑니다. `/apply` 는 제안서·외부 링크용 바로 가기로, 랜딩을 건너뛰고 첫 질문(카테고리)부터 보여줍니다.

## 5. 제조의뢰 퍼널 (`/` · `/apply`)

**화면 (2026-10-15 · Claude Design "Sellery Landing Funnel" mobile · PC 안을 그대로 구현 — 원본 디자인 파일은 저장소에 두지 않음)**: 화면 높이(`h-dvh`) 고정 컨테이너 안에서 단계가 바뀌는 **한 화면 한 질문 퍼널**이고, 첫 단계(intro)가 랜딩입니다. 1024px 미만(`lg` 미만)은 430px 모바일 컬럼(태블릿은 가운데 정렬), `lg` 부터는 데스크톱 레이아웃 — 랜딩은 1120px 두 열(왼쪽 글 · 오른쪽 카드/타일)에 하단 바가 [◀ 점 ▶ … 안내 · 280px CTA] 한 줄, 좌우 화살표 키로도 넘어가며, 퍼널은 360px 사이드 레일(질문 목록 · 고른 값 · 지난 질문 클릭으로 되돌아가기, 앞 질문은 잠금 · 완료 뒤엔 "완료" 표시 · 로고는 랜딩으로만 가고 답은 유지, 접수 완료 뒤에만 [홈으로]처럼 초기화 — 2026-10-22) + 본문 900px(카테고리 4열 · 제형 3열 · 세부/패키지 3열 카드 · 맛 6열 · 성분/연락처/완료는 두 열 · 버튼 오른쪽 정렬)입니다 — 가로로 넘기는 7장(히어로 "팔로워가 있다면, 나만의 제품을 만들 수 있어요" → START WITH ZERO 취소선 표 → 부담은 Make Your Recipe가(짐이 그 칸으로 건너감) → 진행 과정 4단계 자동 재생 → "나만의 제품이 되는 과정" 3줄(나만의 레시피 · 패키지/라벨 · 팔로워와의 연결) + 서비스 칩 → 제품 카테고리 타일 4장(2×2) → 통계 4칸 + "나만의 제품, 주인공은 나예요") + 점 인디케이터 + [제조의뢰 시작하기] + "약 1분 · 전부 선택형 · 무료 상담".

질문 순서: 카테고리(다이어트/피부/건강/기타, 탭하면 0.28초 뒤 자동 다음) → 메인 성분(선택 · 카테고리별 자주 쓰는 성분 칩 + **"더 전달하고 싶은 내용" 메모를 여기서 같이 받음** · [다음]/[건너뛰기]) → 제형(알약/젤리/분말/액상/필름/캔디) → 세부 종류(**알약이면 타정/분말 캡슐/연질캡슐 · 캔디면 구미/카라멜** — 구미·카라멜은 더 이상 패키지가 아님) → 패키지(제형별 `PACKAGING_BY_FORM`, 캔디는 PTP/병 · 선택지가 하나뿐이면 자동 채움(젤리 → 스틱) · 필름은 없음) → 맛(포도/딸기/복숭아/레몬/플레인(무맛)/기타 — 분말 캡슐·연질캡슐이면 건너뜀) → 연락처(활동명 또는 채널 · 연락처 자동 하이픈 · **미팅 선호 시간대 오전/오후/저녁(선택)** · 동의 필수) → 접수 완료("접수됐어요" · "내가 만든 레시피" 요약 6줄(빈 항목 "미팅 때 결정", 해당 없음, 시간대 "상관없음") · 진행 3단계 타임라인 · [홈으로] = 답을 비우고 랜딩 첫 장으로). 제형·세부 종류·패키지·맛에는 "아직 모르겠어요 · 미팅 때 정할게요" 점선 버튼(저장값 `UNSURE = '미정'`). 상단 고정 헤더: 뒤로 가기 · 진행 세그먼트 · `n / 전체` · 고른 경로("다이어트 · 캔디 · 구미 · 병"). 카테고리·맛의 "기타" 직접 입력칸과 완료 후 8초 자동 홈 이동은 디자인에 없어 **삭제**했습니다. 아이콘은 직전 커밋에서 다듬은 모양(젤리 병 · 멀티팩 제품 · 앉은 곰 구미)을 유지했고, 랜딩 카테고리용 이너뷰티/멘탈/맨즈를 추가했습니다.

**제출 처리** (`lib/server/apply-action.ts` · 두 라우트가 re-export): 답은 컴포넌트 상태에 모았다가 연락처 화면의 한 `<form>` 에서 hidden input(`category` `ingredient` `dosageForm` `subType` `packaging` `flavor` `note` `slot`)으로 한 번에 POST 합니다(퍼널 특성상 JS 전제). 서버 검증(`fail(400)`) 뒤 **슬랙 웹훅이 유일한 접수 경로** — 메시지 형식은 이전과 같고 `• 미팅 선호 시간대: 오후(13–17시)` 한 줄이 추가됐습니다(`subType` 은 제형 뒤 괄호, 최소수량 1,000개 고정 표기). `notifySlack` 이 false 면 `fail(502)` 로 입력값과 함께 "접수 전송에 실패했어요 — 다시 시도" 배너를 연락처 화면 제출 버튼 위에 띄우고, 네트워크 단절·서버 예외(`result.type === 'error'`)도 `use:enhance` 콜백에서 잡아 폼을 유지합니다. 서버가 필드 오류를 돌려주면 그 질문이 있는 단계로 되돌아갑니다. **스팸 방어(2026-10-22)**: 메타 광고로 공개 트래픽이 들어오는 폼이라 (1) 허니팟 칸(`HONEYPOT_FIELD = 'website'` · 화면 밖 · 탭 순서 제외)이 채워져 있으면 슬랙·메타 전환 없이 성공 화면만 돌려주고 (2) IP 기준 레이트리밋 30분 5회(`lib/server/rate-limit.ts` · shop 의 `/orders/lookup` 과 같은 값, 프로세스 메모리 기준)를 넘으면 `fail(429)` 로 연락처 화면에 배너 — 세는 것은 **슬랙까지 간 접수**뿐(2026-10-26 · `isRateLimited` 는 검증 통과 뒤 확인, `countHit` 은 슬랙 전송 성공 뒤 기록). 연락처 오타(400)·슬랙 장애(502)로 돌려받은 시도는 세지 않는다 — 오타 5번에 30분 차단되거나, 통신사 CGNAT(한 IP 를 수십 명이 공유)에서 남의 오타로 내가 막히는 것을 피하려고 (3) 활동명 60 · 성분 120 · 메모 1,000자(`MAX_LEN` — input `maxlength` 와 서버 검증이 같은 값)를 넘거나 카테고리가 목록에 없으면 거부, 세부 종류·패키지·맛은 목록에 없는 값을 빈 값으로 (4) 슬랙 텍스트의 입력값은 `escapeSlack` 으로 `& < >` 를 치환해 `<!channel>` 같은 호출을 막습니다. 막힌 제출은 success 가 아니라 픽셀 Lead 도 나가지 않고, 서버 전환 API 도 호출하지 않습니다 — 봇 접수가 메타 Lead 전환으로 집계되지 않습니다. 레이트리밋 키는 전환 API 와 같은 `x-forwarded-for` 첫 값(리라이트 뒤 방문자 IP)입니다. 결과 처리는 `use:enhance` 콜백에서 직접 하고(`form` prop 은 JS 없이 제출된 경우의 초기 복원에만 사용), 슬랙 전송 코드는 `lib/server/slack.ts` 그대로입니다.

**환경변수**: `SLACK_WEBHOOK_URL` 은 2026-10-14 에 Vercel 프로젝트 `sellery-branding` 의 Production·Preview 에 Sensitive 로 넣었습니다(값은 Vercel 에만 — 저장소·문서에 적지 않음). **이 변수가 비거나 웹훅이 죽으면 접수가 "전송 실패" 로 막힙니다**(조용히 유실되지 않도록 의도한 동작). 웹훅을 교체·회전할 때는 반드시 같이 갱신할 것. 다른 4개 앱에는 이 변수가 없어서 거기의 가입·채널 인증 슬랙 알림은 아직 휴면 상태입니다.

**둘 다 서버 렌더링**: 폼 액션이 있는 라우트는 프리렌더할 수 없어서 `/` 와 `/apply` 모두 `prerender = false` 이고, `vercel build` 결과물은 `.vercel/output/functions/{index,apply}.func` 두 함수입니다(옛 `+layout.ts` 의 `prerender = true` 는 삭제).

## 6. 남은 일

1. 도메인 결정 — 예: `branding.sellery.life` (Vercel 프로젝트 Domains 에 추가 + DNS).
2. OG 이미지 교체 — 2026-10-22 에 `static/og.png`(1200×630 · 다크 배경 + 히어로 문구, 임시 제작)와 `canonical` · `og:url` · `og:image` · twitter 카드를 두 라우트에 넣었음(`lib/site.ts` 의 공개 주소 기준 — vercel.app 호스트가 중복 색인되지 않게). 디자이너 이미지가 나오면 같은 경로·크기로 바꿔 끼우면 됨 · 카피 다듬기.
3. (선택) 제조의뢰 접수 건을 Slack 알림 말고 어딘가에도 durable 하게 남기고 싶다면 — Resend 메일 발송 또는 Supabase 테이블 적재 추가 검토.

## 7. 개발 · 배포

- 로컬: 루트에서 `npm run dev:branding` → http://localhost:5177 (접수는 `apps/branding/.env.local` 에 `SLACK_WEBHOOK_URL=...` 이 있어야 통과함 — 없으면 "전송 실패" 배너. 값이 있으면 **로컬 제출도 실제 슬랙 채널로 나가니** 주의. 실패 경로만 보려면 `SLACK_WEBHOOK_URL=http://127.0.0.1:9/ npm run dev:branding`)
- 검사: `npm run check -w apps/branding` · 빌드: `npm run build -w apps/branding` — CI(`프로토타입 점검`)에 자동 포함됨
- **Vercel**: team `weglow-team` · 프로젝트 `sellery-branding` · Root Directory `apps/branding` · **GitHub 연동 완료(2026-10-14)** — `main` 병합마다 자동 프로덕션 배포, PR 마다 프리뷰 배포. 공개 주소 **https://sellery-branding.vercel.app**
  - 고유 배포 URL(`…-weglow-team.vercel.app`)은 팀 SSO 보호가 걸려 302 — 정상입니다. 공개 확인은 위 주소로.
  - **트러블슈팅 기록**: 프로젝트를 CLI(`vercel link`/`vercel deploy`)로 먼저 만든 뒤 나중에 대시보드에서 GitHub 저장소를 연결하면, Root Directory 가 `.`(저장소 루트)로 남아 있을 수 있다 — 이 경우 push 때마다 `apps/branding` 만이 아니라 루트의 `npm run build --workspaces`(모노레포 4개 앱 전체)가 돌다가 다른 앱(`apps/shop` 등)의 환경변수가 없어서 빌드가 실패한다. 대시보드에서 안 고쳐지면 `vercel project update sellery-branding --root-directory apps/branding --scope weglow-team` 로 직접 설정.
- sellery.life 아래로 넣으려면(`sellery.life/branding`): base 경로 `/branding` 설정 + `apps/shop/vercel.json` 리라이트 추가가 필요 — 현재는 독립 오리진 방침이라 안 함.
