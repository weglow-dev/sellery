import { sveltekit } from '@sveltejs/kit/vite';
import { rootAssets } from '../../scripts/vite-root-assets.mjs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: { port: 5175, strictPort: true, fs: { allow: ['..', '../..'] } },
	plugins: [rootAssets(), tailwindcss(), sveltekit()]
});
