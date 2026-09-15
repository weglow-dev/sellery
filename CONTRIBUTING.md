# 수정하고 올리는 법

glo(`weglow-dev/glo-us`)와 같은 방식입니다. **main에 직접 올리지 않고, 브랜치 → PR → 병합** 순서로 갑니다. (main은 보호돼 있어 직접 push가 막힙니다.)

## 0. 처음 한 번만

```bash
git clone https://github.com/weglow-dev/sellery.git sellery
cd sellery
```

필요한 것: Git · Node 20 이상(`node scripts/check.mjs` 용, CI 와 동일) · (선택) Python 3 또는 아무 정적 서버 · (선택) `gh` CLI.
앱 자체는 빌드도 설치도 없습니다. `index.html`을 브라우저로 열면 그대로 돕니다.
(파일을 더블클릭해도 되지만, 로그인·링크 흐름까지 보려면 로컬 서버로 여는 게 정확합니다.)

```bash
python -m http.server 8080
```

→ http://localhost:8080
로그인 화면(`login.html`)에 데모 계정 목록이 떠 있습니다 — 비밀번호는 8자 이상 아무거나.

> 저장소 권한은 `shinwook-k`에게 GitHub username을 알려주고 collaborator로 추가받으세요.
> 이 저장소는 GitHub 조직 `weglow-dev` 안에 있습니다. 조직 이름이 바뀌면 저장소 URL도 바뀌고 GitHub는 옛 조직 이름을 리다이렉트하지 않으므로, 그때 `git remote set-url origin https://github.com/<새조직>/sellery.git` 을 한 번 실행해 주세요.

## 1. 수정할 때

```bash
git switch main
git pull
git switch -c fix/brand-cs-routing
```

브랜치 이름: `fix/…`(고치기) · `feat/…`(새 기능) · `copy/…`(문구·데모 데이터) · `design/…`(색·여백·타이포) · `docs/…`(문서) · `policy/…`(수수료·등급 등 정책 숫자).

### 어느 파일을 고치나

`index.html`은 껍데기입니다. 내용은 `css/`와 `js/`에 화면 단위로 나뉘어 있어서, 서로 다른 화면을 고치면 충돌이 나지 않습니다.

| 고치려는 것 | 파일 |
|---|---|
| 문구 · 데모 브랜드/인플루언서/상품/캠페인 | `js/01-seed.js` (화면 안내 문구는 해당 센터 파일) |
| 인플루언서 센터 | `js/20-seller.js` |
| 셀러리 샵 · 실시간 매출 | `js/30-shared.js` |
| 브랜드 센터 · 고객 문의 | `js/40-brand.js` |
| 관리자 창구 | `js/50-admin.js` |
| 고객 판매센터 · 셀러리 소개 | `js/60-customer.js` |
| 캠페인 상세 · 스레드 · 모달 | `js/70-campaign.js` |
| 버튼이 하는 일 (`data-act`) | `js/80-actions.js` |
| 앱바 · 역할 탭 · 서브내비 등 공통 컴포넌트 · `render()` 루트 | `js/10-render.js` |
| 부트 화면 · 전역 이벤트(click/키보드) | `js/90-boot.js` |
| 색 · 여백 · 타이포 (디자인 토큰) | `css/base.css` (`:root`) · 픽셀 스킨은 `css/skin.css` |
| 수수료 · 정산 상수 | `js/00-core.js` (`PG_RATE` `PLAT_RATE` `WHT` `CLEAR_DAYS`) + `docs/settlement-policy.md` |
| 등급 · 샘플 · 포인트 상수와 정산 계산 helper | `js/02-state.js` (`GRADES` `DATA_PRICE` `BG_DISC` `CELERY_PER` … · `calc` `sellerWht` `settleDue` `sample*`) + `docs/*.md` |
| 로그인 / 가입 / 구글 로그인 | `login.html` (단일 파일) |
| 아바타 · 상품 이미지 | `assets/` (원본·누끼 소스는 `assets/_src/` — git에 안 올라감) |

- `index.html`의 `<script src>` **순서를 바꾸거나 빼지 마세요.** 뒤 파일이 앞 파일의 전역을 씁니다. 새 js 파일을 추가하면 사전순 자리에 태그를 넣어야 하고, 점검 스크립트가 순서를 검사합니다.
- **데이터 구조(상품·캠페인·주문 필드)를 바꿨다면** `js/02-state.js`의 `const LS='sellery-proto-vNN'` 숫자를 하나 올려주세요. 안 올리면 기존 방문자의 localStorage에 옛 데이터가 남아 화면이 깨집니다.
- **정책 숫자**(수수료율·등급 기준·샘플 한도 …)를 바꿀 때는 상수와 `docs/`의 해당 문서를 **같은 PR**에서 고칩니다. 파트너에게 보여주는 문서라 코드와 어긋나면 안 됩니다. (`policy-change` 이슈 템플릿 사용)
- 비개발자용 상세 가이드(데모 상품 추가 필드 설명, 디자인 토큰 목록 등): [docs/editing-guide.md](docs/editing-guide.md)

## 2. 올리기 전에

```bash
node scripts/check.mjs
```

js 문법, `index.html`의 css/js 참조와 순서, 자산 경로(대소문자까지), 시드 키, 주요 화면 함수, 병합 충돌 흔적을 확인합니다. 여기서 걸리면 배포해도 화면이 깨집니다. CI가 같은 걸 돌립니다.

## 3. PR 올리기

```bash
git add -A
git commit -m "고객 문의를 브랜드사로 바로 연결"
git push -u origin fix/brand-cs-routing
gh pr create --fill
```

`gh`가 없으면 push 후 GitHub이 띄워주는 "Compare & pull request" 버튼을 누르면 됩니다.

- CI(**프로토타입 점검** = `node scripts/check.mjs`)가 자동으로 돕니다. 초록불이어야 병합할 수 있습니다.
- Vercel GitHub 앱이 연동되면 PR마다 **미리보기 URL**이 댓글로 달립니다 — 병합 전에 거기서 눌러보세요. (**현재 연동 전** — 브랜치를 받아 로컬에서 확인)
- 리뷰 코멘트는 전부 해결(resolve)해야 병합됩니다. 승인 수는 강제하지 않지만 1명 리뷰를 권합니다.

```bash
gh pr merge --squash --delete-branch
```

## 4. 배포

main에 병합되면 GitHub Pages는 자동으로 갱신됩니다 (1~2분).
→ https://weglow-dev.github.io/sellery/

정식 주소인 Vercel → https://sellery-swart.vercel.app/ 은 **GitHub 앱 연동 전**이라 병합만으로는 바뀌지 않습니다. 관리자(`shinwook-k`)가 병합 후 직접 올립니다:

```bash
vercel deploy --prod --scope weglow-team
```

연동되면 main 병합 = 프로덕션 자동 배포, PR = 미리보기 자동입니다. (연동 절차: 조직 설정 → GitHub Apps → Vercel → Repository access 에 `sellery` 추가 → `vercel git connect`. 연동을 마치면 이 절과 §3의 미리보기 줄을 자동 배포 기준으로 되돌립니다.)
(전환기 동안 GitHub Pages 도 같은 `main`을 그대로 서빙합니다. 정식 주소는 Vercel 쪽이며, 팀 합의 후 하나로 정리합니다.)

반영이 안 보이면 강력 새로고침(`Ctrl+Shift+R`). Vercel 쪽은 관리자가 아직 안 올렸을 수 있으니 Pages 주소로 먼저 확인하세요.

## Claude에게 시키기

이슈 본문, 또는 PR·이슈의 댓글/리뷰 코멘트에 `@claude` 를 쓰면 Claude가 읽고 답하거나 직접 고쳐서 PR을 올립니다. (PR 본문에는 반응하지 않음 · collaborator 로 추가된 계정만 트리거됨)

**현재는 동작하지 않습니다** — 저장소 Settings → Secrets and variables → Actions 에 `ANTHROPIC_API_KEY` 가 아직 없고, 조직의 Claude GitHub 앱에도 이 저장소가 추가돼 있지 않습니다. 관리자(`shinwook-k`)가 둘을 설정하면 이 문단대로 쓸 수 있습니다.

```
@claude 브랜드 센터 정산 탭에서 원천징수 계산이 주문 취소분을 빼지 않는 것 같아. 확인해줘.
```

## 커밋 메시지

한글로, 무엇이 달라졌는지 한 줄. 파일명이 아니라 화면·기능 이름으로 씁니다.

- 좋음: `플래티넘이 잡은 기간은 상위 등급만 진입하도록 변경`
- 나쁨: `index.html 수정`

## 절대 하면 안 되는 것

- `main`에 직접 커밋 (PR로만)
- 실제 개인정보·실제 계좌번호를 시드에 넣기 (마스킹된 더미만)
- `LS` 키 버전을 안 올리고 시드 구조 바꾸기
- `docs/` 정책 숫자와 코드 상수를 따로 고치기
- `css/`·`js/`를 `index.html`에 다시 인라인하기
- 제안서 PDF에 인쇄된 옛 데모 저장소(`junho763-dotcom/sellery-prototype`) 지우기
