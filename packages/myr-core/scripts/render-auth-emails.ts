// docs/emails/*.html 을 다시 만든다 — node_modules/.bin/jiti packages/myr-core/scripts/render-auth-emails.ts (저장소 루트에서)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authEmailTemplates } from '../src/mail/auth-templates';

for (const t of authEmailTemplates()) {
	writeFileSync(join('docs', 'emails', t.file), t.html);
	console.log(`docs/emails/${t.file} · ${t.name} · 제목 "${t.subject}"`);
}
