import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5273,
		allowedHosts: ['zali.stackplus.sg', 'localhost']
	}
});
