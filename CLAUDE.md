# 셀러리 (Sellery)

브랜드사와 인플루언서(셀러)를 잇는 **건강·웰니스 전용** 브랜드사 협업판매 중개 플랫폼.
태그라인: **"좋은 브랜드를 만나는 공간, 셀러리"**

이 저장소는 클릭 가능한 UI/UX 프로토타입입니다. 백엔드·결제·인증은 없고, 데이터는 브라우저 localStorage에 있습니다.
브랜드 입점제안서·인플루언서 제안서(PDF, 2026.09)가 따로 있고, 거기 인쇄된 데모 주소는 옛 저장소(`junho763-dotcom/sellery-prototype`)이므로 지우지 않습니다.

## 저장소 · 배포

- GitHub: `weglow-dev/sellery` (glo와 같은 조직 · 2026-09-15 에 `weglow-glo` → `weglow-dev` 로 이름 변경, 옛 이름은 리다이렉트되지 않음). `main`은 보호됨 — PR 필수, CI `프로토타입 점검` 통과, 리뷰 코멘트 해결, 관리자도 예외 없음.
- 배포: **Vercel** (team `weglow-team` / project `sellery`) → https://sellery-swart.vercel.app/ . 빌드 없이 루트를 그대로 서빙(`vercel.json` framework null, `.vercelignore`로 docs/scripts/supabase/*.md 제외). GitHub 앱 연동 여부는 저장소만 봐서는 알 수 없습니다(`.vercel/project.json`은 link 정보뿐) — Vercel 대시보드 Settings → Git 에서 확인하세요. 연동돼 있으면 `main` 푸시 = 프로덕션, PR = 미리보기 URL 댓글. 안 돼 있으면 `vercel deploy --prod --scope weglow-team`. 전환기 동안 GitHub Pages https://weglow-dev.github.io/sellery/ 도 같은 `main`을 병행 서빙합니다(정식 주소는 Vercel).
- CI: `.github/workflows/ci.yml` → `node scripts/check.mjs` (Node 20+ · js 문법 · css/js 참조와 순서 · 자산 경로 대소문자 · 시드 키 · 주요 화면 함수 · 충돌 흔적). 로컬에서도 같은 명령.
- Claude 봇: `.github/workflows/claude.yml` (glo와 같은 구성 + 셀러리용 안내문). Secrets `ANTHROPIC_API_KEY` + 조직 Claude GitHub 앱에 저장소 추가 필요.
- 이 파일(CLAUDE.md)은 **커밋되는 팀 공용 메모**입니다. 개인 메모는 `CLAUDE.local.md`(gitignore). 줄바꿈은 `.gitattributes`가 모든 텍스트 파일을 LF로 강제합니다(Windows 포함).
- 로컬 미리보기: `python -m http.server 8080`. (`.claude/launch.json`의 `sellery-static`은 같은 명령의 로컬 전용 설정 — `.claude/`가 gitignore라 클론에는 없습니다.)

## 기여

브랜치 → `node scripts/check.mjs` → PR(템플릿 체크리스트: check.mjs · 브라우저 확인 · LS 버전 · docs 동기화 · script 순서) → CI 초록 + 리뷰 코멘트 해결 → squash 병합(`gh pr merge --squash --delete-branch`).
브랜치 접두사 `fix/` `feat/` `copy/` `design/` `docs/` `policy/`. 커밋 메시지는 한글 한 줄, 파일명이 아니라 화면·기능 이름으로.
이슈 템플릿 5종 bug · copy-change · design-change · policy-change · task (`.github/ISSUE_TEMPLATE/`) — 수수료·등급 등 정책 숫자 변경은 policy-change. 상세는 CONTRIBUTING.md · docs/editing-guide.md(비개발자용).

## 파일

```
index.html          앱 셸만 — <head> + css 링크 2개 + <script src> 12개 (사전순 00→90, 순서 고정)
login.html          로그인 · 가입 · 구글 로그인 (단일 파일, 인라인 css/js)
css/base.css        기본 스타일 + :root 토큰 (원본 <style> 앞부분)
css/skin.css        light-pixel-celery 스킨 (원본 SKIN~/SKIN 블록 · 이 링크와 galmuri 폰트 링크를 빼면 네오브루탈로 복귀)
js/00-core.js       $ fmt today ymd P esc · ST/FLOW/FLOW_L · PG_RATE PLAT_RATE WHT CLEAR_DAYS
js/01-seed.js       seedData() (brands · sellers · products · campaigns …) · 로고/아바타 data URI
js/02-state.js      LS 키 · BREF_* CELERY_PER OPEX_DEF DATA_PRICE BG_DISC CATMAP SAMPLE_CEL_WON GRADES · S/load/save · 해시 라우팅 IIFE · 링크 컨텍스트 · helpers(정산 calc, gname, celBal, sample* …)
js/10-render.js     render() · SCREENS/ROLES · 공통 컴포넌트
js/20-seller.js     인플루언서 센터 (홈 · 랭킹 · 마이페이지 · 채널 · 추천 · 상품 상세)
js/30-shared.js     셀러리 샵 · 실시간 매출
js/40-brand.js      브랜드 센터 · 브랜드 마이페이지 · 고객 문의(CS)
js/50-admin.js      관리자 (검수 · 매칭/자동 제안 · 매출/순수익)
js/60-customer.js   고객 판매센터 · 셀러리 소개
js/70-campaign.js   캠페인 상세(스레드 · 정산 미리보기) · openModal/closeModal 등 모달
js/80-actions.js    ACT (data-act / data-k 디스패치 대상 전부)
js/90-boot.js       부트 화면 · 3D 틸트 · 전역 click/input/change/keydown · render()
assets/             av-s1~8.svg · *.webp (원본·누끼 소스는 assets/_src/, gitignore)
docs/               settlement · grade · period · sample · points 정책 문서, editing-guide(비개발자용)
scripts/check.mjs   배포 전 자가 점검 (CI 동일)
```

- 12개 `<script>`는 모듈이 아니라 **하나의 전역 스코프**를 공유합니다. 뒤 파일이 앞 파일의 `const`/함수를 쓰므로 순서를 바꾸면 깨집니다. 로드 시점에 실행되는 코드는 `02-state.js`(`load()`, 라우팅 IIFE, hashchange)와 `90-boot.js`뿐이고 나머지는 선언만 합니다.
- 파일을 고칠 때는 파이썬 패치 스크립트를 스크래치패드에 쓰고 `rep(old, new, count=1)`로 정확히 한 곳만 치환하는 방식이 안전합니다. 앵커 문자열이 여러 번 매치되면 엉뚱한 함수에 들어갑니다(과거에 실제로 발생). 파일이 나뉜 뒤로는 해당 화면 파일만 열면 되니 앵커 충돌이 훨씬 줄었습니다.

## 구조

- 상태 `S` (`view:{role,screen,cid}`, `actingSeller`, `actingBrand`, `data`), 데이터 접근자 `D_()`(=`S.data`), 시드 `seedData()`(`js/01-seed.js`), `render()` 전체 재렌더, 액션 디스패처 `ACT` (`data-act` / `data-k`), `openModal/closeModal`, `decorate()`
- 해시 라우트: `#influencer`(=`#seller`) `#brand` `#admin` `#customer`(=`#shop`, 고객 판매센터) `#s/<cid>` (`#link/<cid>`). 셀러리 샵은 해시가 아니라 화면 키 `shop`입니다(`data-act="screen" data-k="shop"`).
- 시드 키 `const LS='sellery-proto-v30'` (`js/02-state.js`) — **데이터 구조를 바꾸면 번호를 올려야** 기존 방문자 화면이 안 깨집니다
- 로그인 세션은 `localStorage['sellery-session']`, 링크 유입 컨텍스트는 `localStorage['slry-linkctx']`
- 초기화: `#admin` 대시보드의 [데이터 초기화] 버튼(`ACT.reset` — LS 삭제 + `clearLinkCtx()` + `seedData()`). 앱바에는 없습니다.

## 핵심 정책 (숫자는 코드 상수가 정답 · 사람용 설명은 docs/)

**정산** `PG_RATE 1.9%` · `PLAT_RATE 10%` · `WHT 3.3%` · `CLEAR_DAYS 21` (`js/00-core.js`)
확정 매출 − PG − 인플루언서 수수료 − 플랫폼 수수료, 판매 종료 D+21 지급. 등급 추가분과 브랜드 등급 할인은 상대 몫을 깎지 않고 플랫폼이 부담. → docs/settlement-policy.md

**등급** 인플루언서 스타터~블랙 7단계, 최근 3개월 확정 매출 기준 (`GRADES`, `js/02-state.js`). 등급 보너스는 **브랜드사가 제안한 수수료율에 더해지는 값**입니다.
(제안 20% → 골드 21%, 블랙 23%) "3%를 받는다"가 아니라 "수수료율 +3%p". → docs/grade-policy.md

**판매 기간** 같은 상품이라도 기간은 기본 공유 — 누구나 오픈 가능.
단 **플래티넘 이상**(`PRIORITY_TIER`)이 확정한 기간에는 플래티넘 이상만 진입할 수 있습니다 (`periodBlock()`).
과거의 "기간 완전 독점"은 폐기됐습니다. 상품 독점권은 별개 기능 — 상품별 기준 등급(`exGradeOf`, 브랜드가 등록 폼에서 골드~블랙 중 선택, 자격 판정은 `exEligible`). 다이아 전용이 아니며 시드에도 플래티넘 기준 상품(p4)이 있습니다. → docs/period-policy.md

**샘플** 상품별 무상 기준 등급 이상 · 상품당 무상 1회(`hadFreeSample`) · 월 한도 등급별 1/2/5회(`sampleQuota`). 셋 중 하나라도 미달이면 유상 구매 — 현금, 또는 🥬 우선 + 잔액 현금(`sampleSplit`, 1🥬=₩20,000 `SAMPLE_CEL_WON`; 현금/🥬 택일이 아님). 브랜드 직접 제안은 한도 미차감. → docs/sample-policy.md

**셀러리 포인트** 확정 매출 ₩500만당 1🥬 (`CELERY_PER`), 1🥬 ≈ ₩20,000 상당. 데이터 열람 가격은 `DATA_PRICE`. → docs/points-policy.md

**링크 유입 보호** 인플루언서 판매링크로 들어온 고객에게는 같은 카테고리 상품을 노출하지 않습니다.
홈으로 이동하거나 새로고침해도 유지됩니다 (`custVisible()`, `S.linkCtx`, 캠페인 종료 +7일에 해제).

**고객 CS** 고객 문의는 관리자를 거치지 않고 **브랜드사로 바로** 갑니다 (브랜드 센터 "고객 문의" 탭). 관리자는 주문·발주 화면에서 열람만 합니다.

## 타이포그래피 — 건드릴 때 주의

- 본문 `IBM Plex Sans KR`은 **700이 최대**. `font-weight:800`을 쓰면 가짜 굵기가 적용돼 글자가 뭉갭니다.
- `font-synthesis:none` 유지 (합성 굵기 차단 · `css/base.css`)
- **login.html은 css 파일을 안 쓰므로** 위 규칙이 자동 적용되지 않습니다 — 인라인 `<style>`에서 font-synthesis:none · keep-all · 본문 800 금지를 따로 지켜야 합니다(현재 login.html에는 font-synthesis · keep-all 둘 다 없음. 제목의 Archivo 800/900은 실제 웨이트가 로드되므로 괜찮음).
- `-webkit-font-smoothing:antialiased` **넣지 마세요** — 윈도우 서브픽셀 렌더링이 꺼져서 흐려집니다
- 한글은 `word-break:keep-all` — 없으면 표에서 "바인허/브"처럼 어절 중간에서 잘립니다

## 로고

셀러리 마크는 **위치 로고일 때만 왼쪽으로 -14° 기울입니다** (앱바, 부트 화면, 로그인 워드마크).
본문 안에 포인트로 들어가는 마크는 똑바로 세웁니다.

## 데모 계정 (login.html)

인플루언서 8명: 지유 jiyu@ · 혜린 hyerin@ · 민지 minji@ · 서아 seoa@ · 로라 lola@ · 하늘 haneul@ · 소민 somin@ · 유나 yuna@ (`@sellery.demo`) · 브랜드: 바인허브 `partner@vyneherb.co` · 글로헬스 `official@weglow.biz` · 관리자 `admin@sellery.co.kr`.
비밀번호는 **8자 이상이면 아무거나**(데모 버튼은 `sellery2026` 자동 입력). 로그인 탭(인플루언서/브랜드)과 계정 역할이 맞아야 하고, 관리자는 어느 탭에서든 됩니다. 구글 로그인은 데모 계정 선택 팝업(`GOOGLE_CLIENT_ID` 자리표시자).

## 아직 안 붙은 것

실결제(PG) · 실인증 · 서버 · 앱↔DB 연동. 고객 카카오 로그인·장바구니·내 주문은 PR #2 로 데모 구현됨(localStorage `sellery-cust`/`sellery-cart`, `KAKAO_JS_KEY` 비어 있으면 데모 계정 선택). Supabase 스키마는 **설계 완료**: `supabase/migrations/0001~0006` + `seed.sql`(glo 관례 · RLS · 파서 검증), 사람용 문서 `docs/data-model.md`, 설계 노트/분석 `docs/data-model-design-notes.md` · `docs/analysis/`. **클라우드 적용 완료(2026-09-15)**: Supabase 프로젝트 `sellery`(ref `ocxppeuoiysnkwwujvko`, Seoul, Pro/Micro) — 0001~0006 + 시드 적용, anon 접근 검증 완료. 이후 스키마 변경은 새 번호 마이그레이션 추가 → 병합 → 로그인·링크된 PC에서 `npx supabase db push --linked`(시드는 `--include-seed`). `db query --linked "…"` 로 원격 SQL 조회 가능(Management API). 자세한 절차는 data-model.md §8.
외부 판매 예상 매출(`estExternal`)은 가계산입니다. 제안서의 "테스트 기한 14일"은 리터럴 14 두 곳(`addD(today(),14)`)이고 기한 경과 처리는 없습니다.
