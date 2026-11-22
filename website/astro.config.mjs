// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	integrations: [
		starlight({
			title: 'agent-browser-ff',
			customCss: ['./src/styles/custom.css'],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/CatastrophistUser/agent-browser-ff' }],
			sidebar: [
				{ label: 'Getting started', items: [
					{ slug: 'getting-started/introduction' },
					{ slug: 'getting-started/installation' },
					{ slug: 'getting-started/quickstart' },
				] },
				{ label: 'Concepts', items: [
					{ slug: 'concepts/refs-and-snapshots' },
					{ slug: 'concepts/daemon-and-sessions' },
					{ slug: 'concepts/gui-mode' },
					{ slug: 'concepts/output-and-errors' },
				] },
				{ label: 'Commands', items: [
					{ slug: 'commands/launch' },
					{ slug: 'commands/navigation' },
					{ slug: 'commands/interaction' },
					{ slug: 'commands/inspection' },
					{ slug: 'commands/scraping-macros-auth' },
				] },
				{ label: 'Guides', items: [
					{ slug: 'guides/macros' },
					{ slug: 'guides/scraping' },
					{ slug: 'guides/auth' },
					{ slug: 'guides/testing' },
					{ slug: 'guides/agents' },
				] },
				{ label: 'Reference', items: [
					{ slug: 'reference/errors' },
					{ slug: 'reference/security' },
					{ slug: 'reference/troubleshooting' },
				] },
			],
		}),
	],
});
