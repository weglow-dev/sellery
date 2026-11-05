/**
 * Supabase Auth 메일 템플릿(대시보드 Authentication → Emails → Templates 에 붙여넣는 HTML) — MYR 거래 메일과 같은 레이아웃(./layout)으로 만든다(2026-11-05).
 * 프로젝트당 템플릿 1벌이라 예전엔 셀러리 문구였다 — 셀러리 운영 중단으로 MYR 문구로 바꿨다. 정본 파일은 docs/emails/*.html(이 함수의 출력 그대로 ·
 * `node_modules/.bin/jiti packages/myr-core/scripts/render-auth-emails.ts` 로 다시 만든다 · 테스트가 파일과 출력이 같은지 본다).
 * 링크는 token_hash 방식 — `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=…`(앱이 준 redirectTo 그대로 · 콘솔 /auth/confirm 이 verifyOtp).
 * 비밀번호 재설정은 앱이 MYR 메일을 직접 보내므로(server/password-reset) 이 템플릿은 키가 없을 때 등 Supabase 가 직접 보낼 때만 쓰인다.
 */
import { renderMailHtml, type MailDoc } from './layout';

const link = (type: 'signup' | 'recovery' | 'invite'): string => `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=${type}`;

export type AuthEmailTemplate = { name: string; file: string; subject: string; type: string; html: string };

const DOCS: { name: string; file: string; subject: string; type: 'signup' | 'recovery' | 'invite'; doc: MailDoc }[] = [
	{
		name: 'Confirm signup',
		file: 'confirm-signup.html',
		subject: '[MYR] 이메일 주소를 확인해주세요',
		type: 'signup',
		doc: {
			title: '이메일 주소를 확인해주세요',
			preheader: '버튼을 누르면 인증이 끝나요',
			intro: 'MYR 계정에 쓸 이메일 주소가 맞는지 확인할게요. 아래 버튼을 눌러 인증을 마쳐주세요.',
			button: { label: '이메일 인증하기', url: link('signup') },
			notes: ['링크는 한 번만 쓸 수 있어요.', '가입한 적이 없다면 이 메일은 무시해도 괜찮아요.']
		}
	},
	{
		name: 'Reset password',
		file: 'reset-password.html',
		subject: '[MYR] 비밀번호 재설정',
		type: 'recovery',
		doc: {
			title: '비밀번호를 새로 정해주세요',
			preheader: 'MYR 비밀번호 재설정 링크예요',
			intro: 'MYR 비밀번호 재설정을 요청하셨어요. 아래 버튼을 눌러 새 비밀번호를 정해주세요.',
			button: { label: '새 비밀번호 정하기', url: link('recovery') },
			notes: ['링크는 한 번만 쓸 수 있고, 1시간이 지나면 열리지 않아요.', '요청하지 않았다면 이 메일은 무시해도 괜찮아요. 비밀번호는 바뀌지 않아요.']
		}
	},
	{
		name: 'Invite user',
		file: 'invite.html',
		subject: '[MYR] 크리에이터 스튜디오에 초대합니다',
		type: 'invite',
		doc: {
			title: 'MYR 크리에이터 스튜디오에 초대합니다',
			preheader: '버튼을 눌러 비밀번호를 정하면 바로 시작할 수 있어요',
			intro: 'MYR 파트너팀이 크리에이터 스튜디오 계정을 만들어 두었어요. 아래 버튼을 눌러 비밀번호를 정하면 바로 로그인할 수 있어요.',
			button: { label: '비밀번호 정하고 시작하기', url: link('invite') },
			notes: ['링크는 한 번만 쓸 수 있어요.', '초대받을 일이 없었다면 이 메일은 무시해도 괜찮아요.']
		}
	}
];

export function authEmailTemplates(): AuthEmailTemplate[] {
	return DOCS.map((d) => ({ name: d.name, file: d.file, subject: d.subject, type: d.type, html: renderMailHtml(d.doc) }));
}
