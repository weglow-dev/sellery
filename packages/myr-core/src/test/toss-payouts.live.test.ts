// 토스 지급대행 실제 연결 확인 — 로컬에서만 `MYR_TOSS_LIVE=1 npx vitest run packages/myr-core/src/test/toss-payouts.live.test.ts`.
// 저장소 루트 .env.local 의 TOSS_PAYOUT_SECRET_KEY · TOSS_PAYOUT_SECURITY_KEY(시범운영 = tpeerkeamf5 테스트 키)를 쓴다. 조회만 한다(돈 · 셀러를 만들지 않는다).
// CI 에서는 건너뛴다(키 없음). 키 값은 출력하지 않는다.
import { describe, expect, it } from 'vitest';
import { createTossPayouts } from '../toss-payouts-client';

// myr-core 는 node 타입을 쓰지 않는다(브라우저 · 서버 공용) — 이 파일에 필요한 만큼만 적는다
declare const process: { env: Record<string, string | undefined>; cwd(): string; loadEnvFile(path?: string): void };

const LIVE = process.env.MYR_TOSS_LIVE === '1';
if (LIVE) {
	// 저장소 루트에서 돌리든(npm test) 패키지에서 돌리든 루트 .env.local 을 찾는다
	for (const p of [`${process.cwd()}/.env.local`, `${process.cwd()}/../../.env.local`]) {
		try {
			process.loadEnvFile(p);
			break;
		} catch {
			/* 없으면 다음 후보 */
		}
	}
}

describe.skipIf(!LIVE)('토스 지급대행 실제 연결(테스트 키 · 조회만)', () => {
	const api = createTossPayouts({ secretKey: process.env.TOSS_PAYOUT_SECRET_KEY, securityKey: process.env.TOSS_PAYOUT_SECURITY_KEY });
	it('테스트 키다(test_sk_) — 라이브 키로는 돌리지 않는다', () => {
		expect(process.env.TOSS_PAYOUT_SECRET_KEY?.startsWith('test_sk_')).toBe(true);
	});
	it('잔액 조회 — 200 · 금액이 숫자', async () => {
		const r = await api.getBalance();
		expect(r.ok, r.ok ? '' : `${r.body.code} ${r.body.message} ${r.body.traceId ?? ''}`).toBe(true);
		if (r.ok) expect([typeof r.body.availableAmount, typeof r.body.pendingAmount]).toEqual(['number', 'number']);
	});
	it('셀러 목록 — 200 · items 모양으로 읽힌다', async () => {
		const r = await api.listSellers({ limit: 1 });
		expect(r.ok, r.ok ? '' : `${r.body.code} ${r.body.message} ${r.body.traceId ?? ''}`).toBe(true);
		if (r.ok) expect(Array.isArray(r.body.items)).toBe(true);
	});
});
