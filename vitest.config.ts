// 루트 `npm test` = `vitest run` — packages/db · packages/payments 의 순수 규칙 테스트 + apps/*/src/test 의 순수 모듈 테스트
// (docs/monorepo-migration.md 결정 13 · §8.1 · docs/testing.md). 앱 테스트는 `$env`·`$app` 을 import 하지 않는 모듈만(lib/cart.ts · lib/product-row.ts 처럼 떼어 둔다).
// .svelte·브라우저·결제 시나리오는 vitest 대상이 아니다 — 사람이 §8.2 로 확인한다. SQL(RPC·권한)은 `npm run test:db`(pgTAP).
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["packages/*/src/**/*.test.ts", "apps/*/src/test/**/*.test.ts"],
		environment: "node",
		passWithNoTests: false
	}
});
