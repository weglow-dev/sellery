/** 크리에이터 초대 보내기(§5-1) 서버 흉내 — 메모리 · 새로고침하면 시드로.
 *  기능 단계에서 0070 `myr_invites` · 콘솔 운영 API `/api/ops/invites`(지금은 `packages/db/scripts/myr-invites.mjs`)로 바뀐다.
 *  가입은 초대 링크로만(결정 14). 초대 목록(대기 · 가입 완료 · 만료 · 취소 · 요청됨)은 필요해지면 붙인다 */
import { ME } from './seed';

interface InviteRaw {
	email: string;
	/** 초대한 운영자(invited_by) — 입력받지 않고 로그인 세션에서 */
	by: string;
	/** 아직 쓰지도 · 취소하지도 · 만료되지도 않은 초대 */
	pending: boolean;
}

/** 링크 유효 기간(7일) — 서버 판정 자리(0070 expires_at) · 목의 오늘은 11월 17일 */
const EXPIRES = '11월 24일';

class InvitesServer {
	raw = $state<InviteRaw[]>([
		{ email: 'bora.kim@example.com', by: '김지수', pending: true },
		{ email: 'dana.fit@example.com', by: '박서연', pending: true }
	]);

	/** 보내기 — 이메일 형식은 화면도 보지만 최종 판정은 서버 · 같은 이메일에 대기 중인 초대가 있으면 거절(0070 pending 이메일 유일).
	 *  메일 보낸 사람은 "MYR 파트너팀" 고정(myr-influencer INVITER) · 초대한 운영자는 세션에서 남긴다 */
	send(emailIn: string): { ok: true; link: string; msg: string } | { ok: false; msg: string } {
		const email = emailIn.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: '이메일 주소를 확인해 주세요' };
		if (this.raw.some((i) => i.pending && i.email === email)) return { ok: false, msg: '이 이메일로 보낸 초대가 아직 가입을 기다리고 있어요' };
		this.raw = [{ email, by: ME.name, pending: true }, ...this.raw];
		// 링크 원문은 만들 때 한 번만 돌려준다(저장은 해시만 · 0070) — 목은 임의 토큰
		return { ok: true, link: `https://myr.kr/invite/${Math.random().toString(36).slice(2, 10)}`, msg: `링크는 ${EXPIRES}까지 쓸 수 있어요 · 받는 사람 메일로도 보냈어요` };
	}
}

export const invites = new InvitesServer();
