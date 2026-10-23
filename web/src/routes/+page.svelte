<script>
	// ─────────────────────────────────────────────────────────────────────────
	//  Home — vitrine do roadmap (visual "premium" / liquid glass)
	//  Resume as stacks e tópicos; abre cada tópico num painel com README +
	//  código real. Dados vêm de topics.json (gerado a partir de /src).
	// ─────────────────────────────────────────────────────────────────────────
	import { onMount } from 'svelte';
	import { marked }  from 'marked';
	import Prism       from 'prismjs';
	import 'prismjs/components/prism-csharp';
	import 'prismjs/components/prism-dart';
	import { base }    from '$app/paths';
	import { getTrackList, getTopicsByTrack, getReadme, getFile, flattenFiles, findFirstFile } from '$lib/topicService.js';
	import FileTree    from '$lib/components/FileTree.svelte';

	// Metadados visuais extras por track (blurb + cores do visual premium)
	const TRACK_SKIN = {
		csharp:  { cor: '#8b5cf6', blurb: 'Backend robusto, APIs e os fundamentos da linguagem.' },
		flutter: { cor: '#38bdf8', blurb: 'Apps multiplataforma bonitos e performáticos.' }
	};
	function skin(id) { return TRACK_SKIN[id] ?? { cor: '#7fb0e6', blurb: '' }; }

	const STATUS = {
		'nao-iniciado': { label: 'Não iniciado', cor: '#64748b' },
		'em-progresso': { label: 'Estudando',    cor: '#38bdf8' },
		'concluido':    { label: 'Concluído',    cor: '#4ade80' }
	};

	// ── Dados reais ────────────────────────────────────────────────────────────
	let tracks = $state([]);              // [{ id, nome, cor, blurb, topics:[...] }]
	let loaded = $state(false);

	// ── Progresso global (derivado dos dados reais) ─────────────────────────────
	let allTopics   = $derived(tracks.flatMap(t => t.topics));
	let total       = $derived(allTopics.length);
	let concluidos  = $derived(allTopics.filter(t => t.status === 'concluido').length);
	let emProgresso = $derived(allTopics.filter(t => t.status === 'em-progresso').length);
	let pct         = $derived(total ? Math.round(((concluidos + emProgresso * 0.5) / total) * 100) : 0);

	// ── Estado de navegação ──────────────────────────────────────────────────
	let activeTrackId = $state(null);
	let activeTrack   = $derived(tracks.find(t => t.id === activeTrackId) ?? null);
	let selected      = $state(null);        // tópico aberto no painel

	// ── Painel: árvore de pastas + viewer de código + README da parte ───────────
	let readmeHtml   = $state('');
	let activeFile   = $state(null);   // caminho do arquivo selecionado
	let activeReadme = $state(null);   // caminho do README exibido à direita
	let fileContent  = $state('');
	let copied       = $state(false);
	const readmeCache  = new Map();    // id::caminho-do-readme -> markdown cru
	const contentCache = new Map();    // id::caminho -> conteúdo do arquivo

	// Árvore raiz do tópico aberto (defensivo: cai p/ arquivos planos se faltar).
	let tree = $derived.by(() => {
		if (!selected) return null;
		if (selected.tree) return selected.tree;
		// fallback: monta um nó raiz a partir da lista plana `arquivos`
		const arquivos = (selected.arquivos ?? []).map((caminho) => ({
			nome: caminho.split('/').pop() ?? caminho,
			caminho
		}));
		return {
			nome: '', caminho: '', temReadme: !!selected.temReadme,
			readme: selected.temReadme ? 'README.md' : null,
			arquivos, subpastas: []
		};
	});

	// Nº de arquivos reais (via árvore quando houver, senão lista plana).
	function topicFileCount(topic) {
		if (topic?.tree) return flattenFiles(topic.tree).length;
		return topic?.arquivos?.length ?? 0;
	}

	let codeHtml = $derived.by(() => {
		if (!activeFile) return '';
		const lang = activeFile.endsWith('.dart') ? 'dart' : 'csharp';
		const grammar = Prism.languages[lang] ?? Prism.languages.clike;
		return Prism.highlight(fileContent, grammar, lang);
	});

	function fileName(path) { return path.split('/').pop() ?? path; }

	// Encontra o README "da parte": o da pasta que contém `filePath`, se existir;
	// caso contrário cai para o README raiz do tópico.
	function readmeForFile(node, filePath, inherited) {
		const own = node?.readme ?? inherited;
		// o arquivo está diretamente nesta pasta?
		if ((node?.arquivos ?? []).some((f) => f.caminho === filePath)) return own;
		for (const child of node?.subpastas ?? []) {
			const found = readmeForFile(child, filePath, own);
			if (found !== undefined && found !== null) return found;
			// se o arquivo pertence a essa subárvore mas sem README próprio,
			// `found` pode ser o herdado — devolvemos assim que o localizarmos.
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
		// Chave com escopo no tópico: dois estudos cujo README-raiz vive em
		// "README.md" não podem compartilhar o mesmo slot de cache.
		const cacheKey = `${selected?.id}::${readmePath}`;
		const md = readmeCache.has(cacheKey)
			? readmeCache.get(cacheKey)
			: await getFile(selected.pasta, readmePath);
		readmeCache.set(cacheKey, md);
		readmeHtml = md
			? marked.parse(md)
			: '<p style="opacity:.6;font-style:italic">Sem conteúdo ainda para esta parte.</p>';
	}

	async function openTopic(topic) {
		selected = topic;
		readmeHtml = '';
		activeFile = null;
		activeReadme = null;
		fileContent = '';

		const root = topic.tree ?? null;
		const rootReadme = root?.readme ?? (topic.temReadme ? 'README.md' : null);
		activeReadme = rootReadme;

		// auto-seleciona o primeiro arquivo (depth-first) e mostra o README raiz
		const first = root ? findFirstFile(root) : (topic.arquivos?.[0]
			? { nome: fileName(topic.arquivos[0]), caminho: topic.arquivos[0] }
			: null);
		if (first) {
			await selectFile(first);
		} else {
			await loadReadme(rootReadme);
		}
	}

	// Seleciona um ARQUIVO (objeto {nome, caminho}) a partir da árvore.
	async function selectFile(file) {
		const filePath = file.caminho;
		activeFile = filePath;
		const key = `${selected?.id}::${filePath}`;
		if (contentCache.has(key)) {
			fileContent = contentCache.get(key);
		} else {
			const raw = await getFile(selected.pasta, filePath);
			const content = raw ?? '// Arquivo não encontrado';
			contentCache.set(key, content);
			fileContent = content;
		}

		// README "da parte": o da pasta do arquivo, senão o raiz do tópico
		const rootReadme = tree?.readme ?? (selected.temReadme ? 'README.md' : null);
		const part = tree ? readmeForFile(tree, filePath, rootReadme) : rootReadme;
		activeReadme = (part ?? rootReadme) ?? null;
		await loadReadme(activeReadme);
	}

	// Seleciona explicitamente o README de uma pasta (clique no 📖 da árvore).
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

	function closePanel() {
		selected = null;
		activeFile = null;
		activeReadme = null;
		fileContent = '';
		readmeHtml = '';
	}

	// ── Spotlight que segue o mouse (efeito premium) ───────────────────────────
	let mx = $state(50), my = $state(30);
	function onMove(e) {
		mx = (e.clientX / window.innerWidth) * 100;
		my = (e.clientY / window.innerHeight) * 100;
	}

	// animação de contagem do número de progresso
	let shownPct = $state(0);
	function animatePct() {
		const t0 = performance.now();
		const dur = 1100;
		const target = pct;
		function tick(now) {
			const k = Math.min(1, (now - t0) / dur);
			const ease = 1 - Math.pow(1 - k, 3);
			shownPct = Math.round(target * ease);
			if (k < 1) requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	}

	onMount(async () => {
		const list = await getTrackList();
		const enriched = await Promise.all(
			list.map(async t => {
				const topics = await getTopicsByTrack(t.id);
				return { ...t, ...skin(t.id), topics };
			})
		);
		tracks = enriched;
		activeTrackId = enriched[0]?.id ?? null;
		loaded = true;
		animatePct();
	});
</script>

<svelte:window onmousemove={onMove} />

<div class="stage" style="--mx:{mx}%; --my:{my}%;">
	<!-- camadas de fundo -->
	<div class="aurora a1"></div>
	<div class="aurora a2"></div>
	<div class="aurora a3"></div>
	<div class="grain"></div>

	<main class="shell">
		<!-- ── HERO ───────────────────────────────────────────────── -->
		<header class="hero">
			<div class="hero-text">
				<span class="eyebrow">PORTFÓLIO · ROADMAP VIVO</span>
				<h1>
					Roadmap de estudos<br />
					do <span class="grad">Lucas Boeck</span>
				</h1>
				<p class="lead">
					Cada tópico é um projeto real — código comentado, README e download.
					Explore as stacks e acompanhe a evolução.
				</p>
			</div>

			<div class="progress-card glass">
				<div class="progress-head">
					<span>Progresso geral</span>
					<span class="progress-pct">{shownPct}%</span>
				</div>
				<div class="progress-track">
					<div class="progress-fill" style="width:{shownPct}%"></div>
				</div>
				<div class="progress-meta">
					<span><b>{concluidos}</b> concluídos</span>
					<span><b>{emProgresso}</b> estudando</span>
					<span><b>{total}</b> no total</span>
				</div>
			</div>
		</header>

		<!-- ── SELETOR DE STACK ───────────────────────────────────── -->
		<nav class="tracks-nav">
			{#each tracks as t}
				<button
					class="track-pill glass"
					class:active={t.id === activeTrackId}
					style="--tc:{t.cor};"
					onclick={() => (activeTrackId = t.id)}
				>
					<span class="dot"></span>
					{t.nome}
				</button>
			{/each}
		</nav>

		<!-- ── GRID DE TÓPICOS ────────────────────────────────────── -->
		{#if activeTrack}
		{#key activeTrackId}
		<section class="grid">
			<div class="track-blurb">
				<h2 style="--tc:{activeTrack.cor}">{activeTrack.nome}</h2>
				<p>{activeTrack.blurb}</p>
			</div>

			<div class="cards">
				{#each activeTrack.topics as topic, i}
					<button
						class="card glass"
						style="--tc:{activeTrack.cor}; --d:{i * 70}ms"
						onclick={() => openTopic(topic)}
					>
						<div class="card-sheen"></div>
						<div class="card-top">
							<span class="status" style="--sc:{STATUS[topic.status]?.cor ?? '#64748b'}">
								<span class="status-dot"></span>{STATUS[topic.status]?.label ?? topic.status}
							</span>
						</div>
						<h3>{topic.nome}</h3>
						<div class="card-foot">
							{#if topicFileCount(topic)}
								{@const n = topicFileCount(topic)}
								<span>{n} arquivo{n !== 1 ? 's' : ''}</span>
							{:else}
								<span class="muted">em breve</span>
							{/if}
							<span class="arrow">→</span>
						</div>
					</button>
				{/each}
			</div>
		</section>
		{/key}
		{/if}

		<div class="explore-cta">
			<a class="planet-link" href="{base}/planetario">Explorar o planetário 🪐</a>
		</div>

		<footer class="foot">
			<span>Desenvolvido por Lucas Boeck</span>
		</footer>
	</main>

	<!-- ── MODAL DE TÓPICO (quase tela cheia: árvore à esquerda, conteúdo à direita) ── -->
	{#if selected}
		<div class="overlay" onclick={closePanel}
			onkeydown={(e) => e.key === 'Escape' && closePanel()}
			role="button" tabindex="-1" aria-label="Fechar modal">
			<div class="panel glass" onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog" aria-modal="true" tabindex="-1">
				<header class="panel-head">
					<div>
						<span class="badge" style="--bc:{STATUS[selected.status]?.cor ?? '#64748b'}">{STATUS[selected.status]?.label ?? selected.status}</span>
						<h2>{selected.nome}</h2>
					</div>
					<button class="close" onclick={closePanel} aria-label="Fechar">✕</button>
				</header>

				<div class="panel-body">
					<!-- ESQUERDA: árvore de pastas/arquivos do estudo -->
					<aside class="tree-pane">
						<div class="tree-header">Estrutura</div>
						<div class="tree-scroll">
							<FileTree
								node={tree}
								label={selected.nome}
								activeFile={activeFile}
								activeReadme={activeReadme}
								onSelectFile={selectFile}
								onSelectReadme={selectReadme}
							/>
						</div>
					</aside>

					<!-- DIREITA: código do arquivo + README da parte -->
					<section class="content-pane">
						{#if topicFileCount(selected) || tree?.readme}
							{#if activeFile}
								<div class="code-block">
									<div class="file-tabs">
										<span class="file-tab active">{fileName(activeFile)}</span>
									</div>
									<pre class="code"><code>{@html codeHtml}</code></pre>
									<div class="code-actions">
										<button class="ghost-btn" onclick={copyCode}>{copied ? '✓ Copiado' : 'Copiar código'}</button>
										{#if selected.download}
											<a class="ghost-btn" href="{base}/{selected.download}" download>⬇ Baixar projeto (.zip)</a>
										{/if}
									</div>
								</div>
							{/if}

							<article class="readme markdown-body">
								{@html readmeHtml}
							</article>
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
</div>

<style>
	:global(body) { margin: 0; }

	.stage {
		position: relative;
		min-height: 100vh;
		overflow-x: hidden;
		background: #06070e;
		color: #e8ebf5;
		font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	/* spotlight que segue o mouse */
	.stage::before {
		content: '';
		position: fixed;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(600px circle at var(--mx) var(--my),
			rgba(139,92,246,.10), transparent 45%);
		z-index: 1;
		transition: background .2s ease;
	}

	/* auroras de fundo */
	.aurora {
		position: fixed;
		border-radius: 50%;
		filter: blur(120px);
		opacity: .5;
		pointer-events: none;
		z-index: 0;
		animation: float 18s ease-in-out infinite;
	}
	.a1 { width: 560px; height: 560px; top: -140px; left: -120px;
		background: radial-gradient(circle, #7c3aed, transparent 70%); }
	.a2 { width: 620px; height: 620px; top: 10%; right: -180px;
		background: radial-gradient(circle, #0ea5e9, transparent 70%); animation-delay: -6s; }
	.a3 { width: 520px; height: 520px; bottom: -160px; left: 30%;
		background: radial-gradient(circle, #db2777, transparent 70%); opacity: .32; animation-delay: -11s; }
	@keyframes float {
		0%,100% { transform: translate(0,0) scale(1); }
		50%     { transform: translate(30px,-40px) scale(1.08); }
	}

	.grain {
		position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: .04;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	/* vidro base */
	.glass {
		background: rgba(255,255,255,.045);
		border: 1px solid rgba(255,255,255,.09);
		backdrop-filter: blur(22px) saturate(140%);
		-webkit-backdrop-filter: blur(22px) saturate(140%);
		box-shadow: 0 8px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08);
	}

	.shell {
		position: relative;
		z-index: 2;
		max-width: 1120px;
		margin: 0 auto;
		padding: clamp(48px, 9vh, 120px) 24px 40px;
		/* ocupa ao menos a tela toda e empurra CTA+rodapé pro fundo */
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* ── HERO ─────────────────────────────────────── */
	.hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 40px;
		flex-wrap: wrap;
	}
	.hero-text { max-width: 640px; flex: 1 1 420px; }
	.eyebrow {
		font-size: .72rem; letter-spacing: .22em; font-weight: 600;
		color: #a78bfa; opacity: .9;
	}
	.hero h1 {
		font-size: clamp(2.4rem, 6vw, 4.2rem);
		line-height: 1.04; font-weight: 700; letter-spacing: -.02em;
		margin: 18px 0 0;
	}
	.grad {
		background: linear-gradient(100deg, #a78bfa, #38bdf8 60%, #f0abfc);
		-webkit-background-clip: text; background-clip: text; color: transparent;
	}
	.lead {
		margin: 22px 0 0; max-width: 560px;
		font-size: 1.08rem; line-height: 1.6; color: #aab2c8;
	}

	.progress-card { padding: 20px 22px; border-radius: 20px; flex: 0 1 360px; min-width: 300px; }
	.progress-head { display: flex; justify-content: space-between; align-items: baseline;
		font-size: .9rem; color: #c3c9db; }
	.progress-pct { font-size: 1.5rem; font-weight: 700;
		background: linear-gradient(90deg,#a78bfa,#38bdf8); -webkit-background-clip: text; background-clip: text; color: transparent; }
	.progress-track { height: 8px; border-radius: 99px; background: rgba(255,255,255,.08);
		margin: 14px 0 12px; overflow: hidden; }
	.progress-fill { height: 100%; border-radius: 99px;
		background: linear-gradient(90deg,#7c3aed,#38bdf8);
		box-shadow: 0 0 16px rgba(99,102,241,.6); transition: width .1s linear; }
	.progress-meta { display: flex; gap: 18px; font-size: .82rem; color: #8b93a9; }
	.progress-meta b { color: #e8ebf5; }

	/* ── TRACKS NAV ───────────────────────────────── */
	.tracks-nav { display: flex; gap: 12px; margin: 54px 0 28px; flex-wrap: wrap; }
	.track-pill {
		display: inline-flex; align-items: center; gap: 10px;
		padding: 11px 20px; border-radius: 99px; cursor: pointer;
		color: #cbd2e6; font-size: .95rem; font-weight: 500;
		transition: transform .25s cubic-bezier(.2,.8,.2,1), border-color .25s, color .25s;
	}
	.track-pill .dot { width: 9px; height: 9px; border-radius: 50%;
		background: var(--tc); box-shadow: 0 0 10px var(--tc); }
	.track-pill:hover { transform: translateY(-2px); }
	.track-pill.active {
		color: #fff;
		border-color: color-mix(in srgb, var(--tc) 55%, transparent);
		background: linear-gradient(180deg, color-mix(in srgb, var(--tc) 22%, transparent), rgba(255,255,255,.04));
		box-shadow: 0 8px 30px color-mix(in srgb, var(--tc) 28%, transparent);
	}

	/* ── GRID ─────────────────────────────────────── */
	.track-blurb { margin-bottom: 24px; }
	.track-blurb h2 { font-size: 1.6rem; font-weight: 650; margin: 0;
		color: color-mix(in srgb, var(--tc) 75%, #fff); }
	.track-blurb p { margin: 6px 0 0; color: #9aa2b8; }

	.cards {
		display: grid; gap: 18px;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	}
	.card {
		position: relative; overflow: hidden; text-align: left;
		padding: 22px; border-radius: 22px; cursor: pointer; color: inherit;
		opacity: 0; transform: translateY(16px);
		animation: rise .6s cubic-bezier(.2,.8,.2,1) forwards; animation-delay: var(--d);
		transition: transform .3s cubic-bezier(.2,.8,.2,1), border-color .3s, box-shadow .3s;
	}
	@keyframes rise { to { opacity: 1; transform: translateY(0); } }
	.card:hover {
		transform: translateY(-6px);
		border-color: color-mix(in srgb, var(--tc) 50%, transparent);
		box-shadow: 0 20px 50px rgba(0,0,0,.45), 0 0 0 1px color-mix(in srgb, var(--tc) 30%, transparent);
	}
	.card-sheen {
		position: absolute; inset: 0; pointer-events: none; opacity: 0;
		background: radial-gradient(400px circle at 50% 0%, color-mix(in srgb, var(--tc) 18%, transparent), transparent 60%);
		transition: opacity .3s;
	}
	.card:hover .card-sheen { opacity: 1; }
	.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
	.badge {
		font-size: .7rem; font-weight: 600; padding: 4px 10px; border-radius: 99px;
		color: var(--bc); background: color-mix(in srgb, var(--bc) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--bc) 35%, transparent);
	}
	.status { display: inline-flex; align-items: center; gap: 6px; font-size: .74rem; color: var(--sc); }
	.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sc); box-shadow: 0 0 8px var(--sc); }
	.card h3 { margin: 0; font-size: 1.18rem; font-weight: 600; letter-spacing: -.01em; }
	.card-foot { display: flex; justify-content: space-between; align-items: center;
		margin-top: 20px; font-size: .82rem; color: #8b93a9; }
	.card-foot .muted { opacity: .6; }
	.card .arrow { font-size: 1.1rem; transition: transform .3s; color: color-mix(in srgb, var(--tc) 80%, #fff); }
	.card:hover .arrow { transform: translateX(5px); }

	/* ── FOOTER ───────────────────────────────────── */
	/* CTA do planetário — fica ACIMA da linha divisória */
	.explore-cta { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 56px; }
	.foot { margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.07);
		font-size: .84rem; color: #70778c; text-align: right; }
	.planet-link { color: #a78bfa; text-decoration: none; font-weight: 500;
		padding: 10px 20px; border-radius: 99px; border: 1px solid rgba(167,139,250,.3);
		transition: background .25s, transform .25s; }
	.planet-link:hover { background: rgba(167,139,250,.12); transform: translateY(-2px); }

	/* ── OVERLAY / MODAL ──────────────────────────── */
	.overlay {
		position: fixed; inset: 0; z-index: 50;
		display: flex; align-items: center; justify-content: center;
		padding: clamp(16px, 4vh, 48px);
		background: rgba(4,5,12,.62);
		backdrop-filter: blur(6px);
		animation: fade .3s ease;
	}
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	/* Modal grande, quase do tamanho da tela, centralizado. */
	.panel {
		width: min(1500px, 96vw); height: min(900px, 92vh);
		border-radius: 24px; padding: 0;
		display: flex; flex-direction: column;
		animation: pop .4s cubic-bezier(.2,.8,.2,1);
		background: rgba(14,16,26,.78);
		overflow: hidden;
	}
	@keyframes pop {
		from { transform: scale(.96) translateY(12px); opacity: 0; }
		to   { transform: scale(1) translateY(0);      opacity: 1; }
	}
	.panel-head { display: flex; justify-content: space-between; align-items: flex-start;
		padding: 26px 28px 18px; border-bottom: 1px solid rgba(255,255,255,.07); }
	.panel-head h2 { margin: 12px 0 0; font-size: 1.5rem; font-weight: 650; }
	.close { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
		color: #cbd2e6; width: 34px; height: 34px; border-radius: 10px; cursor: pointer;
		font-size: .9rem; transition: background .2s; }
	.close:hover { background: rgba(255,255,255,.14); }
	/* corpo em duas colunas: árvore à esquerda, conteúdo à direita */
	.panel-body {
		flex: 1;
		min-height: 0;
		display: grid;
		/* árvore sempre à esquerda (start), conteúdo ocupa o resto */
		grid-template-columns: minmax(240px, 320px) 1fr;
		gap: 0;
	}

	.tree-pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid rgba(255,255,255,.07);
		background: rgba(0,0,0,.18);
	}
	.tree-header {
		padding: 16px 16px 10px;
		font-size: .72rem;
		letter-spacing: .16em;
		text-transform: uppercase;
		font-weight: 600;
		color: #8b93a9;
	}
	.tree-scroll {
		overflow-y: auto;
		padding: 0 8px 20px;
		flex: 1;
		min-height: 0;
	}

	.content-pane {
		overflow-y: auto;
		padding: 24px 28px 36px;
		min-height: 0;
	}

	/* README vem de marked → precisa de :global para alcançar o HTML injetado */
	.readme :global(h1) { font-size: 1.4rem; margin: 0 0 12px; color: #e8ebf5; }
	.readme :global(h2) { font-size: 1.1rem; margin: 22px 0 8px; color: #c7cde0; }
	.readme :global(h3) { font-size: 1rem; margin: 18px 0 6px; color: #c7cde0; }
	.readme :global(p) { color: #aab2c8; line-height: 1.6; margin: 10px 0; }
	.readme :global(ul),
	.readme :global(ol) { color: #aab2c8; line-height: 1.6; padding-left: 22px; margin: 10px 0; }
	.readme :global(li) { margin: 4px 0; }
	.readme :global(a) { color: #7fb0e6; text-decoration: none; }
	.readme :global(a:hover) { text-decoration: underline; }
	.readme :global(strong) { color: #e8ebf5; font-weight: 650; }
	.readme :global(code) { font-family: 'SF Mono', ui-monospace, monospace; font-size: .85em;
		background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 6px; color: #d6dcea; }
	.readme :global(pre) { background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.08);
		border-radius: 12px; padding: 14px 16px; overflow-x: auto; margin: 14px 0; }
	.readme :global(pre code) { background: none; padding: 0; }
	.readme :global(blockquote) { border-left: 3px solid #7c3aed; margin: 14px 0; padding: 4px 14px;
		color: #c3c9db; background: rgba(124,58,237,.08); border-radius: 0 8px 8px 0; }

	.code-block { margin: 0 0 26px; border-radius: 16px; overflow: hidden;
		border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.35); }
	.file-tabs { display: flex; gap: 2px; padding: 8px 8px 0; background: rgba(255,255,255,.03);
		overflow-x: auto; }
	.file-tab { background: transparent; border: none; color: #8b93a9; cursor: pointer;
		padding: 8px 14px; border-radius: 8px 8px 0 0; font-size: .82rem; white-space: nowrap;
		font-family: 'SF Mono', ui-monospace, monospace; }
	.file-tab.active { color: #fff; background: rgba(0,0,0,.4); }
	.code { margin: 0; padding: 18px 20px; overflow-x: auto;
		font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
		font-size: .84rem; line-height: 1.6; color: #d6dcea; }
	.code-actions { display: flex; gap: 10px; padding: 12px 16px;
		border-top: 1px solid rgba(255,255,255,.06); }
	.ghost-btn { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
		color: #d6dcea; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-size: .82rem;
		transition: background .2s, transform .2s; }
	.ghost-btn:hover { background: rgba(255,255,255,.14); transform: translateY(-1px); }

	.empty { text-align: center; padding: 48px 20px; color: #8b93a9; }
	.empty span { font-size: 2.4rem; display: block; margin-bottom: 12px; }

	/* Em telas estreitas o modal vira tela cheia e as colunas empilham:
	   árvore em cima (rolável) e conteúdo embaixo. */
	@media (max-width: 760px) {
		.overlay { padding: 0; }
		.panel { border-radius: 0; width: 100vw; height: 100vh; max-height: 100vh; }
		.panel-body {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
			overflow: hidden;
		}
		.tree-pane {
			border-right: none;
			border-bottom: 1px solid rgba(255,255,255,.07);
			max-height: 34vh;
		}
	}
</style>
