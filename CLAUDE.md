# 셀러리 (Sellery)

브랜드사와 인플루언서(셀러)를 잇는 **건강·웰니스 전용** 브랜드사 협업판매 중개 플랫폼.
태그라인: **"좋은 브랜드를 만나는 공간, 셀러리"**

이 저장소는 클릭 가능한 UI/UX 프로토타입입니다. 백엔드·결제·인증은 없고, 데이터는 브라우저 localStorage에 있습니다.
브랜드 입점제안서·인플루언서 제안서(PDF, 2026.09)가 따로 있고, 거기 인쇄된 데모 주소는 옛 저장소(`junho763-dotcom/sellery-prototype`)이므로 지우지 않습니다.

## 저장소 · 배포

- GitHub: `weglow-glo/sellery` (glo와 같은 조직). `main`은 보호됨 — PR 필수, CI `프로토타입 점검` 통과, 리뷰 코멘트 해결, 관리자도 예외 없음.
- 배포: **Vercel** (team `weglow-team` / project `sellery`) → https://sellery-swart.vercel.app/ . 빌드 없이 루트를 그대로 서빙(`vercel.json` framework null, `.vercelignore`로 docs/scripts/supabase/*.md 제외). GitHub 앱 연동 후 `main` 푸시 = 프로덕션, PR = 미리보기 URL. 연동 전엔 `vercel deploy --prod --scope weglow-team`.
- CI: `.github/workflows/ci.yml` → `node scripts/check.mjs` (js 문법 · css/js 참조와 순서 · 자산 경로 대소문자 · 시드 키 · 주요 화면 함수 · 충돌 흔적). 로컬에서도 같은 명령.
- Claude 봇: `.github/workflows/claude.yml` (glo와 같은 구성 + 셀러리용 안내문). Secrets `ANTHROPIC_API_KEY` + 조직 Claude GitHub 앱에 저장소 추가 필요.
- 로컬 미리보기: `python -m http.server 8080` (또는 `.claude/launch.json`의 `sellery-static`).

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

- 상태 `S` (`view:{role,screen,cid}`, `actingSeller`, `actingBrand`, `data`), 시드 `D_()`, `render()` 전체 재렌더, 액션 디스패처 `ACT` (`data-act` / `data-k`), `openModal/closeModal`, `decorate()`
- 해시 라우트: `#influencer` `#brand` `#admin` `#customer` `#shop` `#s/<cid>` (`#link/<cid>`)
- 시드 키 `const LS='sellery-proto-v29'` (`js/02-state.js`) — **데이터 구조를 바꾸면 번호를 올려야** 기존 방문자 화면이 안 깨집니다
- 로그인 세션은 `localStorage['sellery-session']`, 링크 유입 컨텍스트는 `localStorage['slry-linkctx']`

## 핵심 정책 (숫자는 코드 상수가 정답 · 사람용 설명은 docs/)

**정산** `PG_RATE 1.9%` · `PLAT_RATE 10%` · `WHT 3.3%` · `CLEAR_DAYS 21` (`js/00-core.js`)
확정 매출 − PG − 인플루언서 수수료 − 플랫폼 수수료, 판매 종료 D+21 지급. 등급 추가분과 브랜드 등급 할인은 상대 몫을 깎지 않고 플랫폼이 부담. → docs/settlement-policy.md

**등급** 인플루언서 스타터~블랙 7단계, 최근 3개월 확정 매출 기준 (`GRADES`, `js/02-state.js`). 등급 보너스는 **브랜드사가 제안한 수수료율에 더해지는 값**입니다.
(제안 20% → 골드 21%, 블랙 23%) "3%를 받는다"가 아니라 "수수료율 +3%p". → docs/grade-policy.md

**판매 기간** 같은 상품이라도 기간은 기본 공유 — 누구나 오픈 가능.
단 **플래티넘 이상**이 확정한 기간에는 플래티넘 이상만 진입할 수 있습니다 (`periodBlock()`).
과거의 "기간 완전 독점"은 폐기됐습니다. 상품 독점권(다이아 이상)은 별개 기능. → docs/period-policy.md

**샘플** 상품별 무상 기준 등급 + 월 한도(등급별 1/2/5회), 미달 시 유상 구매(현금 또는 🥬, 1🥬=₩20,000 `SAMPLE_CEL_WON`), 브랜드 직접 제안은 한도 미차감. → docs/sample-policy.md

**셀러리 포인트** 확정 매출 ₩500만당 1🥬 (`CELERY_PER`), 1🥬 ≈ ₩20,000 상당. 데이터 열람 가격은 `DATA_PRICE`. → docs/points-policy.md

**링크 유입 보호** 인플루언서 판매링크로 들어온 고객에게는 같은 카테고리 상품을 노출하지 않습니다.
홈으로 이동하거나 새로고침해도 유지됩니다 (`custVisible()`, `S.linkCtx`, 캠페인 종료 +7일에 해제).

**고객 CS** 고객 문의는 관리자를 거치지 않고 **브랜드사로 바로** 갑니다 (브랜드 센터 "고객 문의" 탭). 관리자는 주문·발주 화면에서 열람만 합니다.

## 타이포그래피 — 건드릴 때 주의

- 본문 `IBM Plex Sans KR`은 **700이 최대**. `font-weight:800`을 쓰면 가짜 굵기가 적용돼 글자가 뭉갭니다.
- `font-synthesis:none` 유지 (합성 굵기 차단)
- `-webkit-font-smoothing:antialiased` **넣지 마세요** — 윈도우 서브픽셀 렌더링이 꺼져서 흐려집니다
- 한글은 `word-break:keep-all` — 없으면 표에서 "바인허/브"처럼 어절 중간에서 잘립니다

## 로고

셀러리 마크는 **위치 로고일 때만 왼쪽으로 -14° 기울입니다** (앱바, 부트 화면, 로그인 워드마크).
본문 안에 포인트로 들어가는 마크는 똑바로 세웁니다.

## 데모 계정 (login.html · 비밀번호 아무거나)

지유 jiyu@ · 혜린 hyerin@ · 민지 minji@ · 서아 seoa@ · 로라 lola@ · 하늘 haneul@ · 소민 somin@ · 유나 yuna@ (`@sellery.demo`) · 관리자 `admin@sellery.co.kr`. 구글 로그인은 데모 계정 선택 팝업(`GOOGLE_CLIENT_ID` 자리표시자).

## 아직 안 붙은 것

고객 로그인 · 장바구니 · 실결제(PG) · 실인증 · 서버. Supabase 스키마는 설계 중(`supabase/` 마이그레이션 예정, 앱 미연동).
외부 판매 예상 매출(`estExternal`)은 가계산입니다. 제안서의 "테스트 기한 14일"은 리터럴 14 두 곳(`addD(today(),14)`)이고 기한 경과 처리는 없습니다.
