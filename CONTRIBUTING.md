# 수정하고 올리는 법

glo(`weglow-dev/glo-us`)와 같은 방식입니다. **main에 직접 올리지 않고, 브랜치 → PR → 병합** 순서로 갑니다.

## 0. 처음 한 번만

```bash
git clone https://github.com/weglow-dev/sellery.git sellery
cd sellery
npm install
```

필요한 것: Git · **Node 20 이상** · (선택) `gh` CLI. 앱은 SvelteKit 이라 `npm install` 한 번이 필요합니다.

```bash
npm run dev:shop        # 고객      http://localhost:5176/shop
npm run dev:influencer  # 인플루언서 http://localhost:5173/influencer
npm run dev:brand       # 브랜드    http://localhost:5174/brand
npm run dev:admin       # 관리자    http://localhost:5175/admin
```

앱마다 포트가 달라 동시에 띄워도 됩니다. 로그인 데모는 `/influencer/login` · `/brand/login` (계정 목록이 화면에 있고 비밀번호는 8자 이상 아무거나). 배포된 것과 같은 모양으로 한 번에 보려면 `npm run build && npm run serve` → http://localhost:4173 .

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

화면은 `apps/<앱>/src/routes/` 아래 폴더 하나가 URL 하나입니다. 로직과 데이터는 `packages/core`, 여러 앱이 같이 쓰는 컴포넌트는 `packages/ui` 에 있습니다.

| 고치려는 것 | 파일 |
|---|---|
| 문구 · 데모 브랜드/인플루언서/상품/캠페인 | `packages/core/src/seed.ts` (화면 안내 문구는 해당 화면 파일) |
| 인플루언서 센터 화면 | `apps/influencer/src/routes/<화면>/+page.svelte` (탭·앱바는 `+layout.svelte`) |
| 브랜드 센터 화면 · 고객 문의 | `apps/brand/src/routes/…` |
| 관리자 화면 | `apps/admin/src/routes/…` |
| 고객 판매 페이지 · 장바구니 · 셀러리 소개 | `apps/shop/src/routes/…` |
| 캠페인 상세 · 스레드 / 판매 상세페이지 / 셀러리 샵 / 실시간 매출 / DM (앱 공용) | `packages/ui/src/views/` |
| 모달 (일정 제안 · 샘플 구매 · 상품 등록 · CS · 카카오 …) | `packages/ui/src/modals/` |
| 버튼이 하는 일 (상태 변경 전부) | `packages/core/src/actions.ts` |
| 앱바 · 탭 · 공통 컴포넌트 | `packages/ui/src/components/` (`AppShell.svelte` 등) |
| 색 · 여백 · 타이포 (디자인 토큰) | `packages/ui/src/css/theme.css` (`@theme` · `:root`) — 원본 스킨은 `css/legacy/` |
| 수수료 · 정산 · 등급 · 샘플 · 포인트 상수 | `packages/core/src/constants.ts` (`PG_RATE` `PLAT_RATE` `WHT` `CLEAR_DAYS` `GRADES` `DATA_PRICE` …) + `docs/*.md` |
| 정산 계산 · 등급 판정 · 샘플 자격 (읽기 전용 helper) | `packages/core/src/helpers.ts` (`calc` `sellerWht` `settleDue` `sample*`) |
| 로그인 / 가입 / 구글 로그인 데모 | `packages/ui/src/views/LoginPage.svelte` |
| 첫 화면(센터 선택) | `hub/index.html` |
| 아바타 · 상품 이미지 · 파비콘 | `assets/` (원본·누끼 소스는 `assets/_src/` — git에 안 올라감) |

- **상태를 바꾸는 코드는 `actions.ts` 에만.** 화면(`.svelte`)이나 helper 안에서 `S`·`D_()` 를 고치면 Svelte 가 `state_unsafe_mutation` 으로 멈춰 빈 화면이 됩니다. 화면은 `act.xxx()` 를 부르기만 합니다.
- **데이터 구조(상품·캠페인·주문 필드)를 바꿨다면** `packages/core/src/constants.ts` 의 `LS = 'sellery-proto-vNN'` 숫자를 하나 올려주세요. 안 올리면 기존 방문자의 localStorage에 옛 데이터가 남아 화면이 깨집니다.
- **정책 숫자**(수수료율·등급 기준·샘플 한도 …)를 바꿀 때는 상수와 `docs/`의 해당 문서를 **같은 PR**에서 고칩니다. (`policy-change` 이슈 템플릿 사용)
- 화면 안의 링크는 `/camps` 처럼 앱 기준 경로로 쓰고, `AppShell`·`go.screen()` 이 `/brand` 같은 base 를 붙입니다. `<a href>` 를 직접 쓸 때는 `$app/paths` 의 `base` 를 앞에 붙이세요.
- 비개발자용 상세 가이드: [docs/editing-guide.md](docs/editing-guide.md) (상단 경로표부터)

## 2. 올리기 전에

```bash
npm run check
npm run build
```

`check` 는 앱 4개의 타입·템플릿 검사(svelte-check), `build` 는 Vercel 과 같은 빌드입니다. 둘 다 CI 가 같이 돕니다.

## 3. PR 올리기

```bash
git add -A
git commit -m "고객 문의를 브랜드사로 바로 연결"
git push -u origin fix/brand-cs-routing
gh pr create --fill
```

- CI(**프로토타입 점검** = `npm run check` + `npm run build`)가 자동으로 돕니다. 초록불이어야 병합할 수 있습니다.
- Vercel GitHub 앱이 PR마다 **미리보기 URL**을 댓글로 답니다 — 병합 전에 거기서 눌러보세요.
- 리뷰 코멘트는 전부 해결(resolve)해야 병합됩니다.

```bash
gh pr merge --squash --delete-branch
```

## 4. 배포

main에 병합되면 Vercel 이 `npm run build` 를 돌려 https://sellery-swart.vercel.app/ 에 자동 배포합니다 (2~3분). 반영이 안 보이면 강력 새로고침(`Ctrl+Shift+R`).

> GitHub Pages(https://weglow-dev.github.io/sellery/)는 빌드 없는 정적 서빙이라 이 구조에서는 쓰지 않습니다. 정식 주소는 Vercel 하나입니다.

## Claude에게 시키기

이슈 본문, 또는 PR·이슈의 댓글/리뷰 코멘트에 `@claude` 를 쓰면 Claude가 읽고 답하거나 직접 고쳐서 PR을 올립니다. (저장소 Secrets 에 `ANTHROPIC_API_KEY` + 조직 Claude GitHub 앱에 저장소 추가가 돼 있어야 동작)

```
@claude 브랜드 센터 정산 탭에서 원천징수 계산이 주문 취소분을 빼지 않는 것 같아. 확인해줘.
```

## 커밋 메시지

한글로, 무엇이 달라졌는지 한 줄. 파일명이 아니라 화면·기능 이름으로 씁니다.

- 좋음: `플래티넘이 잡은 기간은 상위 등급만 진입하도록 변경`
- 나쁨: `+page.svelte 수정`

## 절대 하면 안 되는 것

- `main`에 직접 커밋 (PR로만)
- 실제 개인정보·실제 계좌번호를 시드에 넣기 (마스킹된 더미만)
- `LS` 키 버전을 안 올리고 시드 구조 바꾸기
- `docs/` 정책 숫자와 코드 상수를 따로 고치기
- 화면·helper 안에서 상태 직접 변경 (`actions.ts` 로)
- `dist/` · `.svelte-kit/` 커밋 (빌드 산출물 · gitignore 되어 있음)
- 제안서 PDF에 인쇄된 옛 데모 저장소(`junho763-dotcom/sellery-prototype`) 지우기
