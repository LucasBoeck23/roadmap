<script>
	// ─────────────────────────────────────────────────────────────────────────
	//  TopicModal — modal grande (quase tela cheia) de um tópico de estudo.
	//  Árvore de pastas/arquivos à esquerda; OU o código do arquivo, OU o
	//  README da parte à direita (nunca os dois juntos).
	//
	//  Autossuficiente: recebe só o `topic` e cuida de carregar README/arquivos
	//  (via topicService). Reutilizado pela home e pelo planetário.
	// ─────────────────────────────────────────────────────────────────────────
	import { marked } from 'marked';
	import Prism      from 'prismjs';
	import 'prismjs/components/prism-csharp';
	import 'prismjs/components/prism-dart';
	import { base }   from '$app/paths';
	import { getFile, flattenFiles, findFirstFile } from '$lib/topicService.js';
	import { statusLabel } from '$lib/tracks.js';
	import FileTree   from '$lib/components/FileTree.svelte';

	let { topic = null, onClose } = $props();

	const STATUS = {
		'nao-iniciado': { label: 'Não iniciado', cor: '#64748b' },
		'em-progresso': { label: 'Estudando',    cor: '#38bdf8' },
		'concluido':    { label: 'Concluído',    cor: '#4ade80' }
	};

	let readmeHtml   = $state('');
	let activeFile   = $state(null);
	let activeReadme = $state(null);
	let fileContent  = $state('');
	let copied       = $state(false);
	const readmeCache  = new Map();
	const contentCache = new Map();

	// Árvore raiz do tópico (fallback para lista plana `arquivos`).
	let tree = $derived.by(() => {
		if (!topic) return null;
		if (topic.tree) return topic.tree;
		const arquivos = (topic.arquivos ?? []).map((caminho) => ({
			nome: caminho.split('/').pop() ?? caminho,
			caminho
		}));
		return {
			nome: '', caminho: '', temReadme: !!topic.temReadme,
			readme: topic.temReadme ? 'README.md' : null,
			arquivos, subpastas: []
		};
	});

	function topicFileCount(t) {
		if (t?.tree) return flattenFiles(t.tree).length;
		return t?.arquivos?.length ?? 0;
	}

	let codeHtml = $derived.by(() => {
		if (!activeFile) return '';
		const lang = activeFile.endsWith('.dart') ? 'dart' : 'csharp';
		const grammar = Prism.languages[lang] ?? Prism.languages.clike;
		return Prism.highlight(fileContent, grammar, lang);
	});

	function fileName(path) { return path.split('/').pop() ?? path; }

	// README "da parte": o da pasta que contém `filePath`, senão o raiz.
	function readmeForFile(node, filePath, inherited) {
		const own = node?.readme ?? inherited;
		if ((node?.arquivos ?? []).some((f) => f.caminho === filePath)) return own;
		for (const child of node?.subpastas ?? []) {
			const found = readmeForFile(child, filePath, own);
			if (found !== undefined && found !== null) return found;
			if (childContainsFile(child, filePath)) return found ?? own;
		}
		return undefined;
	}
	function childContainsFile(node, filePath) {
		if ((node?.arquivos ?? []).some((f) => f.caminho === filePath)) return true;
		return (node?.subpastas ?? []).some((c) => childContainsFile(c, filePath));
	}

	async function loadReadme(readmePath) {
		if (!readmePath) {
			readmeHtml = '<p style="opacity:.6;font-style:italic">Sem README para esta parte.</p>';
			return;
		}
		const cacheKey = `${topic?.id}::${readmePath}`;
		const md = readmeCache.has(cacheKey)
			? readmeCache.get(cacheKey)
			: await getFile(topic.pasta, readmePath);
		readmeCache.set(cacheKey, md);
		readmeHtml = md
			? marked.parse(md)
			: '<p style="opacity:.6;font-style:italic">Sem conteúdo ainda para esta parte.</p>';
	}

	// Carrega o tópico quando ele muda (opcionalmente pré-seleciona um arquivo).
	export async function open(preselect = null) {
		readmeHtml = ''; activeFile = null; activeReadme = null; fileContent = '';
		if (!topic) return;

		const root = topic.tree ?? null;
		const rootReadme = root?.readme ?? (topic.temReadme ? 'README.md' : null);
		activeReadme = rootReadme;

		const files = root ? flattenFiles(root) : (topic.arquivos ?? []).map(c => ({
			nome: fileName(c), caminho: c
		}));
		let alvo = null;
		if (preselect && files.some(f => f.caminho === preselect)) {
			alvo = { nome: fileName(preselect), caminho: preselect };
		} else {
			alvo = root ? findFirstFile(root) : (files[0] ?? null);
		}

		if (alvo) await selectFile(alvo);
		else await loadReadme(rootReadme);
	}

	// Reage à troca de `topic` (abre automaticamente).
	let lastId = null;
	$effect(() => {
		if (topic && topic.id !== lastId) {
			lastId = topic.id;
			open();
		}
	});

	async function selectFile(file) {
		const filePath = file.caminho;
		activeFile = filePath;
		const key = `${topic?.id}::${filePath}`;
		if (contentCache.has(key)) {
			fileContent = contentCache.get(key);
		} else {
			const raw = await getFile(topic.pasta, filePath);
			const content = raw ?? '// Arquivo não encontrado';
			contentCache.set(key, content);
			fileContent = content;
		}
		const rootReadme = tree?.readme ?? (topic.temReadme ? 'README.md' : null);
		const part = tree ? readmeForFile(tree, filePath, rootReadme) : rootReadme;
		activeReadme = (part ?? rootReadme) ?? null;
		await loadReadme(activeReadme);
	}

	async function selectReadme(readmePath) {
		activeFile = null;
		fileContent = '';
		activeReadme = readmePath;
		await loadReadme(readmePath);
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(fileContent);
			copied = true;
			setTimeout(() => { copied = false; }, 1600);
		} catch {}
	}
</script>

{#if topic}
	<div class="overlay" onclick={() => onClose?.()}
		onkeydown={(e) => e.key === 'Escape' && onClose?.()}
		role="button" tabindex="-1" aria-label="Fechar modal">
		<div class="panel glass" onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog" aria-modal="true" tabindex="-1">
			<header class="panel-head">
				<div>
					<span class="badge" style="--bc:{STATUS[topic.status]?.cor ?? '#64748b'}">{STATUS[topic.status]?.label ?? statusLabel?.(topic.status) ?? topic.status}</span>
					<h2>{topic.nome}</h2>
				</div>
				<button class="close" onclick={() => onClose?.()} aria-label="Fechar">✕</button>
			</header>

			<div class="panel-body">
				<!-- ESQUERDA: árvore de pastas/arquivos -->
				<aside class="tree-pane">
					<div class="tree-header">Estrutura</div>
					<div class="tree-scroll">
						<FileTree
							node={tree}
							label={topic.nome}
							activeFile={activeFile}
							activeReadme={activeReadme}
							onSelectFile={selectFile}
							onSelectReadme={selectReadme}
						/>
					</div>
					{#if topic.download}
						<div class="tree-foot">
							<a class="download-btn" href="{base}/{topic.download}" download>
								<span class="dl-ico">⬇</span>
								Baixar projeto (.zip)
							</a>
						</div>
					{/if}
				</aside>

				<!-- DIREITA: OU o código, OU o README — nunca os dois -->
				<section class="content-pane">
					{#if topicFileCount(topic) || tree?.readme}
						{#if activeFile}
							<div class="code-block">
								<div class="file-tabs">
									<span class="file-tab active">{fileName(activeFile)}</span>
									<button
										class="copy-ico-btn"
										class:copied
										onclick={copyCode}
										aria-label={copied ? 'Copiado' : 'Copiar código'}
										title={copied ? 'Copiado!' : 'Copiar código'}
									>
										{#if copied}
											<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
										{:else}
											<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
										{/if}
									</button>
								</div>
								<pre class="code"><code>{@html codeHtml}</code></pre>
							</div>
						{:else}
							<article class="readme markdown-body">
								{@html readmeHtml}
							</article>
						{/if}
					{:else}
						<div class="empty">
							<span>🚧</span>
							<p>Conteúdo em breve. Este tópico ainda está no forno.</p>
						</div>
					{/if}
				</section>
			</div>
		</div>
	</div>
{/if}

<style>
	.glass {
		background: rgba(14,16,26,.78);
		border: 1px solid rgba(255,255,255,.09);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		box-shadow: 0 8px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08);
	}

	.overlay {
		position: fixed; inset: 0; z-index: 80;
		display: flex; align-items: center; justify-content: center;
		padding: clamp(16px, 4vh, 48px);
		background: rgba(4,5,12,.62);
		backdrop-filter: blur(6px);
		animation: fade .3s ease;
	}
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }

	.panel {
		width: min(1500px, 96vw); height: min(900px, 92vh);
		border-radius: 24px; padding: 0;
		display: flex; flex-direction: column;
		animation: pop .4s cubic-bezier(.2,.8,.2,1);
		overflow: hidden;
	}
	@keyframes pop {
		from { transform: scale(.96) translateY(12px); opacity: 0; }
		to   { transform: scale(1) translateY(0);      opacity: 1; }
	}

	.panel-head { display: flex; justify-content: space-between; align-items: flex-start;
		padding: 26px 28px 18px; border-bottom: 1px solid rgba(255,255,255,.07); }
	.panel-head h2 { margin: 12px 0 0; font-size: 1.5rem; font-weight: 650; color: var(--g-text); }
	.badge {
		font-size: .7rem; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill);
		color: var(--bc); background: color-mix(in srgb, var(--bc) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--bc) 35%, transparent);
	}
	.close { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
		color: #cbd2e6; width: 34px; height: 34px; border-radius: 10px; cursor: pointer;
		font-size: .9rem; transition: background .2s; }
	.close:hover { background: rgba(255,255,255,.14); }

	.panel-body {
		flex: 1; min-height: 0;
		display: grid;
		grid-template-columns: minmax(240px, 320px) 1fr;
		gap: 0;
	}

	.tree-pane {
		display: flex; flex-direction: column; min-height: 0;
		border-right: 1px solid rgba(255,255,255,.07);
		background: rgba(0,0,0,.18);
	}
	.tree-header {
		padding: 16px 16px 10px; font-size: .72rem; letter-spacing: .16em;
		text-transform: uppercase; font-weight: 600; color: var(--g-text-muted);
	}
	.tree-scroll { overflow-y: auto; padding: 0 8px 20px; flex: 1; min-height: 0; }

	.tree-foot {
		padding: 12px; border-top: 1px solid rgba(255,255,255,.07);
		background: rgba(0,0,0,.22);
	}
	.download-btn {
		display: flex; align-items: center; justify-content: center; gap: 8px;
		width: 100%; box-sizing: border-box;
		padding: 10px 14px; border-radius: 10px;
		background: color-mix(in srgb, var(--g-violet-strong) 22%, transparent);
		border: 1px solid color-mix(in srgb, var(--g-violet) 40%, transparent);
		color: var(--g-text); text-decoration: none; font-size: .84rem; font-weight: 500;
		transition: background .2s, transform .2s;
	}
	.download-btn:hover { background: color-mix(in srgb, var(--g-violet-strong) 34%, transparent); transform: translateY(-1px); }
	.dl-ico { font-size: .95rem; }

	.content-pane { overflow-y: auto; padding: 24px 28px 36px; min-height: 0; }

	.readme :global(h1) { font-size: 1.4rem; margin: 0 0 12px; color: var(--g-text); }
	.readme :global(h2) { font-size: 1.1rem; margin: 22px 0 8px; color: #c7cde0; }
	.readme :global(h3) { font-size: 1rem; margin: 18px 0 6px; color: #c7cde0; }
	.readme :global(p) { color: var(--g-text-dim); line-height: 1.6; margin: 10px 0; }
	.readme :global(ul),
	.readme :global(ol) { color: var(--g-text-dim); line-height: 1.6; padding-left: 22px; margin: 10px 0; }
	.readme :global(li) { margin: 4px 0; }
	.readme :global(a) { color: #7fb0e6; text-decoration: none; }
	.readme :global(a:hover) { text-decoration: underline; }
	.readme :global(strong) { color: var(--g-text); font-weight: 650; }
	.readme :global(code) { font-family: 'SF Mono', ui-monospace, monospace; font-size: .85em;
		background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 6px; color: #d6dcea; }
	.readme :global(pre) { background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.08);
		border-radius: 12px; padding: 14px 16px; overflow-x: auto; margin: 14px 0; }
	.readme :global(pre code) { background: none; padding: 0; }
	.readme :global(blockquote) { border-left: 3px solid var(--g-violet-strong); margin: 14px 0; padding: 4px 14px;
		color: #c3c9db; background: rgba(124,58,237,.08); border-radius: 0 8px 8px 0; }

	.code-block { margin: 0; border-radius: 16px; overflow: hidden;
		border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.35); }
	.file-tabs { display: flex; align-items: center; justify-content: space-between;
		gap: 2px; padding: 8px 8px 0; background: rgba(255,255,255,.03); }
	.file-tab { background: transparent; border: none; color: var(--g-text-muted);
		padding: 8px 14px; border-radius: 8px 8px 0 0; font-size: .82rem; white-space: nowrap;
		font-family: 'SF Mono', ui-monospace, monospace; }
	.file-tab.active { color: #fff; background: rgba(0,0,0,.4); }
	.code { margin: 0; padding: 18px 20px; overflow-x: auto;
		font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
		font-size: .84rem; line-height: 1.6; color: #d6dcea; }

	.copy-ico-btn {
		display: inline-flex; align-items: center; justify-content: center;
		width: 30px; height: 30px; margin: 0 2px 2px 0; flex-shrink: 0;
		background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
		color: #c3c9db; border-radius: 8px; cursor: pointer;
		transition: background .18s, color .18s, transform .18s;
	}
	.copy-ico-btn:hover { background: rgba(255,255,255,.14); color: #fff; transform: translateY(-1px); }
	.copy-ico-btn.copied { color: #4ade80; border-color: color-mix(in srgb, #4ade80 45%, transparent); }

	.empty { text-align: center; padding: 48px 20px; color: var(--g-text-muted); }
	.empty span { font-size: 2.4rem; display: block; margin-bottom: 12px; }

	@media (max-width: 760px) {
		.overlay { padding: 0; }
		.panel { border-radius: 0; width: 100vw; height: 100dvh; max-height: 100dvh; }
		.panel-head { padding: 18px 18px 14px; }
		.panel-head h2 { font-size: 1.25rem; }
		.panel-body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; overflow: hidden; }
		.tree-pane { border-right: none; border-bottom: 1px solid rgba(255,255,255,.07); max-height: 32vh; }
		.content-pane { padding: 18px 18px 28px; }
	}
</style>
