// 공휴일 API 실제 연결 확인 — 로컬에서만 `MYR_HOLIDAY_LIVE=1 npx vitest run packages/myr-core/src/test/holiday-api.live.test.ts`.
// 저장소 루트 .env.local 의 DATA_GO_KR_SERVICE_KEY(공공데이터포털 공용 계정 · Decoding 키)를 쓴다. 조회만 한다 · 키 값은 출력하지 않는다.
// CI 에서는 건너뛴다(키 없음).
import { describe, expect, it } from 'vitest';
import { createHolidayApi } from '../holiday-api-client';

// myr-core 는 node 타입을 쓰지 않는다(브라우저 · 서버 공용) — 이 파일에 필요한 만큼만 적는다
declare const process: { env: Record<string, string | undefined>; cwd(): string; loadEnvFile(path?: string): void };

const LIVE = process.env.MYR_HOLIDAY_LIVE === '1';
if (LIVE) {
	for (const p of [`${process.cwd()}/.env.local`, `${process.cwd()}/../../.env.local`]) {
		try {
			process.loadEnvFile(p);
			break;
		} catch {
			/* 없으면 다음 후보 */
		}
	}
}

describe.skipIf(!LIVE)('공휴일 API 실제 연결(조회만)', () => {
	const api = createHolidayApi({ serviceKey: process.env.DATA_GO_KR_SERVICE_KEY });
	it('2027년 — 설 연휴 · 대체공휴일 · 노동절 · 제헌절이 있다(0122 시작 값과 같은 출처)', async () => {
		const r = await api.fetchYear(2027);
		expect(r.ok, r.ok ? '' : `${r.code} ${r.message}`).toBe(true);
		if (!r.ok) return;
		const days = r.days.map((d) => d.day);
		expect(days).toEqual(expect.arrayContaining(['2027-01-01', '2027-02-06', '2027-02-09', '2027-05-01', '2027-07-17', '2027-12-27']));
		expect(days.every((d) => d.startsWith('2027-'))).toBe(true);
	});
});
