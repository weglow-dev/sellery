<!--
   PR 작성 가이드 — 모든 항목 채울 필요는 없어요. 본인 변경 유형에 맞는 부분만.
   자세한 가이드: /CONTRIBUTING.md
-->

## 변경 유형
<!-- 해당하는 것에 [x] 표시 -->
- [ ] 📝 카피·문구·데모 데이터 수정
- [ ] 🎨 디자인·시각 변경
- [ ] ⚖️ 정책 변경 (수수료·정산 / 등급 / 기간제·링크 보호 / 샘플 / 포인트·추천)
- [ ] ✨ 새 기능
- [ ] 🐛 버그 수정
- [ ] 📚 문서·README·docs 수정
- [ ] 🔧 빌드·CI·설정

## 무엇을 / 왜
<!-- 한 문장으로: 이 PR이 어느 화면·규칙을 어떻게 바꾸고, 왜 필요한지 -->



## 관련 이슈
<!-- `Closes #12` 처럼 적으면 머지 시 이슈가 자동으로 닫혀요 -->
Closes #

## 바뀐 파일·영역
- [ ] `index.html` (앱 셸 — 정적 마크업 · css/js 링크 태그)
- [ ] `login.html`
- [ ] `css/base.css` (토큰·기본 스타일) / `css/skin.css` (픽셀 스킨)
- [ ] `js/00-core.js` / `js/02-state.js` (상수·정책·상태·라우팅)
- [ ] `js/01-seed.js` (데모 데이터)
- [ ] 화면 렌더 — `js/10-render.js` (render() 루트 · 공통 컴포넌트) / `js/20-seller.js` / `js/30-shared.js` / `js/40-brand.js` / `js/50-admin.js` / `js/60-customer.js` / `js/70-campaign.js`
- [ ] `js/80-actions.js` / `js/90-boot.js`
- [ ] `docs/*.md`
- [ ] `assets/`
- [ ] `.github/` · `scripts/` · 설정
- [ ] 기타:

## 확인한 화면
<!-- 로컬 미리보기(README 참고)에서 직접 열어본 것에 체크. main 머지 후에는 Vercel 배포(1분 내)에서 한 번 더 확인해요. -->
- [ ] 인플루언서 센터 (`#influencer`)
- [ ] 브랜드 센터 (`#brand`)
- [ ] 관리자 창구 (`#admin`)
- [ ] 고객 판매센터 (`#customer` · 판매 링크 `#s/c1`)
- [ ] 로그인 `login.html` (로그인 → 센터 진입까지)
- [ ] 모바일 폭(~400px) (디자인 변경이면)

## 스크린샷
<!-- 디자인·화면 변경이면 Before / After 캡처 첨부 -->

**Before:**


**After:**


## 체크리스트
<!-- 머지 전에 확인할 것들 — 해당 없는 항목은 비워둬도 OK -->
- [ ] 개발자도구 Console 에 빨간 에러 없음 (센터마다 한 번씩 돌아봄)
- [ ] 시드 구조(필드 추가·삭제·이름 변경)를 바꿨다면 `js/02-state.js` 의 `LS` 키 버전을 올렸다 (`sellery-proto-vN` → `vN+1`)
- [ ] 정책 숫자를 바꿨다면 `docs/*.md` 와 `js/00-core.js` · `js/02-state.js` 상수, 화면 문구가 서로 일치한다
- [ ] 새 js/css 파일을 추가했다면 `index.html` 에 link/script 태그를 넣었고 script 순서(00→90)를 지켰다
- [ ] `node scripts/check-refs.mjs` 통과 (CI "ci" 가 자동으로 돌지만, 로컬에서도 한 번)
- [ ] 카피 변경이면 오타·존댓말 일관성 확인
- [ ] 데이터 초기화(관리자 창구 [데이터 초기화] 또는 localStorage 삭제) 후 새로고침해도 정상

## 검토 부탁드릴 사람
<!-- @username 으로 멘션 -->



## 참고 / 비고
<!-- 추가 컨텍스트, 디자인 시안 링크, 제안서(PDF) 페이지 등 -->


<!--
   ✅ 머지 조건:
   - 최소 1명 리뷰 승인
   - CI "ci" 통과 (scripts/check-refs.mjs — 참조 무결성 + js 문법)
   - main 머지 → Vercel 자동 배포(1분 내) 후 https://sellery-swart.vercel.app/ 에서 확인
   - `main` 직접 푸시 금지
-->
