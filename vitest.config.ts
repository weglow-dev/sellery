// 루트 `npm test` = `vitest run` — packages/db · packages/payments 의 순수 규칙 테스트만 (docs/monorepo-migration.md 결정 13 · §8.1).
// 앱(.svelte)·브라우저·결제 시나리오는 vitest 대상이 아니다 — 사람이 §8.2 로 확인한다.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["packages/*/src/**/*.test.ts"],
		environment: "node",
		passWithNoTests: false
	}
});
