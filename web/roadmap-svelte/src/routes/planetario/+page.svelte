<script>
	// ─────────────────────────────────────────────────────────────────────────
	//  Planetário — o mapa imersivo do roadmap.
	//  Cada track vira um planeta; cada tópico, uma lua. Clicar numa lua abre
	//  o painel liquid glass com README + código real. Rota própria, acessada
	//  pelo botão "Explorar" da home.
	// ─────────────────────────────────────────────────────────────────────────
	import { onMount }    from 'svelte';
	import { marked }     from 'marked';
	import Prism          from 'prismjs';
	import 'prismjs/components/prism-csharp';
	import 'prismjs/components/prism-dart';
	import { base }            from '$app/paths';
	import { getTrackList, getTopicsByTrack, getReadme, getFile, flattenFiles } from '$lib/topicService.js';
	import { statusLabel } from '$lib/tracks.js';
	import { PLANET_PROFILES } from '$lib/planetarium/constants.js';
	import PlanetarySystem     from '$lib/components/PlanetarySystem.svelte';

	// Cores dos planetas em CSS (cor base de cada perfil) para o HUD
	const PLANET_HUD_COLORS = PLANET_PROFILES.map(p => '#' + p.base.toString(16).padStart(6, '0'));

	// Cor do indicador de status mostrado abaixo do nome do tópico
	const STATUS_DOT = {
		'nao-iniciado': '#64748b',
		'em-progresso': '#38bdf8',
		'concluido':    '#4ade80'
	};

	// ── Estado ──────────────────────────────────────────────────────────────
	let tracks        = $state([]);
	let planetTracks  = $state([]);  // tracks enriquecidas com _topics
	let planetaryRef  = $state(null);
	// Aviso inicial: deixa claro que o planetário é um modo opcional/experimental.
	const INTRO_KEY = 'roadmap.planetIntroHidden';
	let showIntro   = $state(true);
	let dontShow    = $state(false); // checkbox "não mostrar novamente"

	function dismissIntro() {
		if (dontShow) {
			try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
		}
		showIntro = false;
	}
	// Monta o canvas só depois que o container .planet-view já tem layout real,
	// senão o Three inicializa com tamanho 0 e a cena fica preta.
	let ready         = $state(false);
	// Esconde o "← início" quando um planeta está em foco (evita confusão com
	// o gesto de voltar ao sistema completo).
	let planetFocused = $state(false);
	// Estado de navegação do drill-down (profundidade + breadcrumb) vindo do
	// componente, para montar o controle "subir um nível" no HUD.
	let navDepth      = $state(0);
	let navCrumbs     = $state([]);

	function handleNavChange(nav) {
		planetFocused = nav.focused;
		navDepth  = nav.depth ?? 0;
		navCrumbs = nav.breadcrumb ?? [];
	}

	function subirUmNivel() {
		planetaryRef?.drillUp();
	}

	const readmeCache  = new Map();
	const contentCache = new Map();

	// ── Painel do tópico (liquid glass) ─────────────────────────────────────
	let selectedTopic    = $state(null);
	let topicReadmeHtml  = $state('');
	let topicPanelEl     = $state(null);
	let topicPanelOpen   = $state(false);
	let topicActiveFile  = $state(null);
	let topicFileContent = $state('');
	let topicCopied      = $state(false);
	let topicFileHtml    = $derived.by(() => {
		if (!topicActiveFile) return '';
		const lang = topicActiveFile.endsWith('.dart') ? 'dart' : 'csharp';
		const grammar = Prism.languages[lang] ?? Prism.languages.clike;
		return Prism.highlight(topicFileContent, grammar, lang);
	});

	// ── Init ────────────────────────────────────────────────────────────────
	onMount(async () => {
		// Se o usuário já pediu para não ver o aviso, pula direto.
		try { if (localStorage.getItem(INTRO_KEY) === '1') showIntro = false; } catch {}

		// Carrega os dados primeiro, depois libera o canvas num próximo frame,
		// quando o .planet-view já foi pintado com dimensões reais.
		tracks = await getTrackList();
		const enriched = await Promise.all(
			tracks.map(async t => {
				const topics = await getTopicsByTrack(t.id);
				return { ...t, _topics: topics };
			})
		);
		planetTracks = enriched;
		requestAnimationFrame(() => requestAnimationFrame(() => { ready = true; }));
	});

	// Lista de arquivos (caminhos) do tópico. Prefere a árvore (FEAT-002),
	// caindo para o `arquivos` plano quando a árvore não existe.
	function topicFilePaths(topic) {
		if (topic?.tree) return flattenFiles(topic.tree).map(f => f.caminho);
		return topic?.arquivos ?? [];
	}

	// ── Seleção de tópico ─────────────────────────────────────────────────────
	// `preselect` (opcional) = caminho de um arquivo-folha clicado na galáxia
	// aninhada; abre o painel já naquele arquivo e mostra o README da parte.
	async function handleTopicSelect(topic, preselect = null) {
		selectedTopic = topic;
		topicReadmeHtml = '';

		topicActiveFile = null;
		topicFileContent = '';

		const files = topicFilePaths(topic);
		const alvo = (preselect && files.includes(preselect)) ? preselect : (files[0] ?? null);
		if (alvo) await selectTopicFile(alvo);
		else await loadReadmeFor(null); // tópico vazio: só README-raiz (ou nada)

		topicPanelOpen = true;
	}

	async function selectTopicFile(filePath) {
		topicActiveFile = filePath;
		const key = `${selectedTopic?.id}::${filePath}`;
		if (contentCache.has(key)) topicFileContent = contentCache.get(key);
		else {
			const raw = await getFile(selectedTopic.pasta, filePath);
			const content = raw ?? '// Arquivo não encontrado';
			contentCache.set(key, content);
			topicFileContent = content;
		}
		// README "da parte": README da pasta que contém o arquivo, se houver;
		// senão, o README-raiz do tópico.
		await loadReadmeFor(filePath);
	}

	/**
	 * Carrega o README relevante para um arquivo: procura no `tree` a pasta que
	 * contém o arquivo (ou um ancestral com README), caindo para o README-raiz.
	 */
	async function loadReadmeFor(filePath) {
		const readmePath = readmePathForFile(selectedTopic?.tree, filePath);
		const cacheKey = `${selectedTopic?.id}::readme::${readmePath ?? 'root'}`;
		let md;
		if (readmeCache.has(cacheKey)) {
			md = readmeCache.get(cacheKey);
		} else {
			md = readmePath
				? await getFile(selectedTopic.pasta, readmePath)
				: await getReadme(selectedTopic.pasta);
			readmeCache.set(cacheKey, md);
		}
		topicReadmeHtml = md
			? marked.parse(md)
			: '<p style="opacity:0.6; font-style:italic;">Sem conteúdo ainda para este tópico.</p>';
	}

	/**
	 * Caminho do README "da parte" para um arquivo: README da pasta mais
	 * próxima (contendo o arquivo) que tenha README; senão o README-raiz do
	 * tree (readme do nó raiz); senão null (usa getReadme padrão).
	 */
	function readmePathForFile(root, filePath) {
		if (!root) return null;
		let best = root.readme ? root.readme : null; // README-raiz como fallback
		if (filePath) {
			const walk = (node) => {
				const containsHere = (node.arquivos ?? []).some(a => a.caminho === filePath);
				if (containsHere && node.readme) best = node.readme;
				for (const sub of node.subpastas ?? []) {
					// Só desce em subpastas cujo caminho é prefixo do arquivo.
					if (filePath.startsWith(sub.caminho + '/') || filePath === sub.caminho) {
						if (sub.readme) best = sub.readme;
						walk(sub);
					}
				}
			};
			walk(root);
		}
		return best;
	}

	async function copyTopicCode() {
		try {
			await navigator.clipboard.writeText(topicFileContent);
			topicCopied = true;
			setTimeout(() => { topicCopied = false; }, 1600);
		} catch {}
	}

	function closeTopicPanel() {
		topicPanelOpen = false;
		selectedTopic = null;
		topicActiveFile = null;
		topicFileContent = '';
	}

	// ── Helpers ─────────────────────────────────────────────────────────────
	function fileName(path) { return path.split('/').pop() ?? path; }
	function langClass(path) {
		if (!path) return 'language-plaintext';
		if (path.endsWith('.cs'))   return 'language-csharp';
		if (path.endsWith('.dart')) return 'language-dart';
		return 'language-plaintext';
	}
</script>

<svelte:head><title>Planetário · Roadmap</title></svelte:head>

<div class="planet-view">
	{#if ready}
		<PlanetarySystem
			tracks={planetTracks}
			onTopicSelect={handleTopicSelect}
			onFocusChange={(focused) => (planetFocused = focused)}
			onNavChange={handleNavChange}
			bind:this={planetaryRef}
		/>
	{/if}

	<!-- Aviso inicial: modo opcional / experimental -->
	{#if showIntro}
		<div class="intro-overlay">
			<div class="intro-card glass">
				<div class="intro-badge">✦ modo experimental</div>
				<h2>Planetário</h2>
				<p>
					Este é um modo <strong>opcional e meramente decorativo</strong>. Tudo o que
					há para ver — stacks, tópicos, códigos e READMEs — já está disponível na
					tela inicial, de forma completa.
				</p>
				<p class="intro-note">
					Aqui eu brinco com renderização de objetos 3D e testes de WebGL no
					navegador. <strong>Não é um design final</strong> — é um experimento pessoal.
				</p>
				<label class="intro-dontshow">
					<input type="checkbox" bind:checked={dontShow} />
					<span>Não mostrar novamente</span>
				</label>

				<div class="intro-actions">
					<a class="intro-back" href="{base}/">← voltar à tela inicial</a>
					<button class="intro-enter" onclick={dismissIntro}>Explorar mesmo assim →</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Vinheta cinematográfica -->
	<div class="planet-vignette"></div>

	<!-- Voltar pra home (escondido ao focar um planeta) -->
	{#if !planetFocused}
		<a class="back-home" href="{base}/">← início</a>
	{/if}

	<!-- Breadcrumb / "subir um nível" — aparece ao focar/drillar -->
	{#if planetFocused}
		<div class="nav-stack">
			<button class="nav-up" onclick={subirUmNivel} aria-label="Subir um nível">
				↑ subir um nível
			</button>
			{#if navCrumbs.length}
				<div class="nav-crumbs">
					<span class="nav-crumb-root">●</span>
					{#each navCrumbs as crumb, i}
						<span class="nav-sep">/</span>
						<span class="nav-crumb" class:current={i === navCrumbs.length - 1}>{crumb}</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- HUD: título -->
	<div class="hud-title">
		<div class="hud-title-main">ROADMAP</div>
		<div class="hud-title-sub">sistema de estudos · {planetTracks.length} trilhas</div>
	</div>

	<!-- HUD: legenda das tracks -->
	<div class="hud-legend">
		{#each planetTracks as track, i}
			{@const total = track._topics?.length ?? 0}
			{@const done = track._topics?.filter(t => t.status === 'concluido').length ?? 0}
			<div class="hud-legend-row">
				<span class="hud-dot" style="background:{PLANET_HUD_COLORS[i % PLANET_HUD_COLORS.length]}"></span>
				<span class="hud-legend-name">{track.nome}</span>
				<span class="hud-legend-count">{done}/{total}</span>
			</div>
		{/each}
	</div>

	<!-- Hint de controles -->
	<div class="planet-hint">
		scroll para zoom · arrastar para navegar · clique p/ abrir uma galáxia · pastas abrem outra galáxia
	</div>

	<!-- Painel lateral do tópico (liquid glass) -->
	{#if topicPanelOpen}
		<div class="topic-overlay" onclick={closeTopicPanel}
			onkeydown={(e) => e.key === 'Escape' && closeTopicPanel()}
			role="button" tabindex="-1" aria-label="Fechar painel">
			<div class="topic-panel glass" bind:this={topicPanelEl}
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog" aria-modal="true" tabindex="-1">
				<header class="topic-panel-header">
					<div>
						<h2 class="topic-panel-title">{selectedTopic?.nome ?? ''}</h2>
						{#if selectedTopic?.status}
							<span class="topic-panel-status" style="--sc:{STATUS_DOT[selectedTopic.status] ?? '#64748b'}">
								{statusLabel(selectedTopic.status)}
							</span>
						{/if}
					</div>
					<button class="topic-panel-close" onclick={closeTopicPanel} aria-label="Fechar">✕</button>
				</header>
				<div class="topic-panel-content">
					<div class="markdown-body">
						{@html topicReadmeHtml}
					</div>

					{#if topicFilePaths(selectedTopic).length}
						<div class="topic-code-block">
							<div class="topic-file-tabs">
								{#each topicFilePaths(selectedTopic) as f}
									<button class="topic-file-tab" class:active={f === topicActiveFile}
										onclick={() => selectTopicFile(f)}>{fileName(f)}</button>
								{/each}
							</div>
							<pre class="topic-code"><code class={langClass(topicActiveFile)}>{@html topicFileHtml}</code></pre>
							<div class="topic-code-actions">
								<button class="topic-ghost-btn" onclick={copyTopicCode}>
									{topicCopied ? '✓ Copiado' : 'Copiar código'}
								</button>
								{#if selectedTopic?.download}
									<a class="topic-ghost-btn" href="{base}/{selectedTopic.download}" download>
										⬇ Baixar projeto (.zip)
									</a>
								{/if}
							</div>
						</div>
					{:else}
						<div class="topic-empty">
							<span>🚧</span>
							<p>Conteúdo em breve. Este tópico ainda está no forno.</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* ── Intro / aviso de modo experimental ──────────────────────────────── */
	.intro-overlay {
		position: absolute;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: rgba(2, 4, 10, 0.55);
		backdrop-filter: blur(6px);
		animation: intro-fade 0.4s ease;
	}
	@keyframes intro-fade { from { opacity: 0; } to { opacity: 1; } }

	.intro-card {
		max-width: 520px;
		padding: 34px 34px 28px;
		border-radius: 24px;
		text-align: left;
		animation: intro-rise 0.5s cubic-bezier(.2, .8, .2, 1);
	}
	@keyframes intro-rise {
		from { transform: translateY(16px); opacity: 0; }
		to   { transform: translateY(0); opacity: 1; }
	}

	.intro-badge {
		display: inline-block;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #7fb0e6;
		border: 1px solid rgba(120, 160, 220, 0.3);
		background: rgba(120, 160, 220, 0.1);
		padding: 4px 12px;
		border-radius: 99px;
		margin-bottom: 16px;
	}
	.intro-card h2 {
		margin: 0 0 12px;
		font-size: 1.8rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: #eaf0f8;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
	}
	.intro-card p {
		margin: 0 0 12px;
		font-size: 0.95rem;
		line-height: 1.6;
		color: #aeb8c8;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
	}
	.intro-card strong { color: #e2e8f2; font-weight: 600; }
	.intro-note { font-size: 0.88rem; color: #8a94a6; }

	.intro-dontshow {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-top: 20px;
		font-size: 0.86rem;
		color: #9fb0c6;
		cursor: pointer;
		user-select: none;
		font-family: -apple-system, system-ui, sans-serif;
	}
	.intro-dontshow input {
		width: 16px; height: 16px;
		accent-color: #4a88c7;
		cursor: pointer;
	}

	.intro-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		margin-top: 18px;
		flex-wrap: wrap;
	}
	.intro-back {
		color: #9fb0c6;
		text-decoration: none;
		font-size: 0.86rem;
		font-family: -apple-system, system-ui, sans-serif;
		transition: color 0.2s;
	}
	.intro-back:hover { color: #e2e8f2; }
	.intro-enter {
		background: rgba(74, 136, 199, 0.2);
		border: 1px solid rgba(120, 180, 255, 0.5);
		color: #eaf0f8;
		padding: 10px 20px;
		border-radius: 99px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
		font-family: -apple-system, system-ui, sans-serif;
		transition: background 0.2s, transform 0.2s;
	}
	.intro-enter:hover { background: rgba(74, 136, 199, 0.35); transform: translateY(-1px); }

	/* ── Planetário ──────────────────────────────────────────────────────── */
	.planet-view {
		width: 100vw;
		height: 100vh;
		background: #000008;
		position: relative;
		overflow: hidden;
	}

	/* Vinheta cinematográfica — escurece as bordas */
	.planet-vignette {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(ellipse at center,
			transparent 55%,
			rgba(0, 0, 8, 0.35) 85%,
			rgba(0, 0, 8, 0.7) 100%);
		z-index: 5;
	}

	/* Voltar pra home */
	.back-home {
		position: absolute;
		bottom: 16px;
		left: 26px;
		z-index: 15;
		padding: 8px 18px;
		border-radius: 99px;
		border: 1px solid rgba(120, 160, 220, 0.25);
		background: rgba(10, 16, 30, 0.5);
		backdrop-filter: blur(8px);
		color: #c3d2e6;
		font-size: 12px;
		letter-spacing: 0.5px;
		text-decoration: none;
		transition: background 0.2s, transform 0.2s, border-color 0.2s;
	}
	.back-home:hover {
		background: rgba(74, 136, 199, 0.2);
		border-color: rgba(74, 136, 199, 0.6);
		transform: translateY(-1px);
	}

	/* Breadcrumb / subir um nível (drill-down) */
	.nav-stack {
		position: absolute;
		bottom: 16px;
		left: 26px;
		z-index: 16;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		max-width: min(70vw, 680px);
	}
	.nav-up {
		padding: 8px 18px;
		border-radius: 99px;
		border: 1px solid rgba(120, 160, 220, 0.3);
		background: rgba(74, 136, 199, 0.18);
		backdrop-filter: blur(8px);
		color: #dce8f6;
		font-size: 12px;
		letter-spacing: 0.5px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: background 0.2s, transform 0.2s, border-color 0.2s;
	}
	.nav-up:hover {
		background: rgba(74, 136, 199, 0.32);
		border-color: rgba(74, 136, 199, 0.7);
		transform: translateY(-1px);
	}
	.nav-crumbs {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid rgba(90, 120, 170, 0.2);
		border-radius: 8px;
		background: rgba(10, 16, 30, 0.5);
		backdrop-filter: blur(6px);
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
	}
	.nav-crumb-root { color: rgba(120, 170, 255, 0.7); }
	.nav-sep { color: rgba(150, 170, 210, 0.35); }
	.nav-crumb { color: rgba(190, 206, 230, 0.7); }
	.nav-crumb.current { color: #eaf0f8; font-weight: 600; }

	/* HUD — título */
	.hud-title {
		position: absolute;
		top: 22px;
		left: 26px;
		pointer-events: none;
		z-index: 10;
		font-family: 'JetBrains Mono', monospace;
	}
	.hud-title-main {
		font-size: 20px;
		font-weight: 700;
		letter-spacing: 6px;
		color: rgba(220, 232, 245, 0.92);
		text-shadow: 0 0 20px rgba(120, 170, 255, 0.4);
	}
	.hud-title-sub {
		margin-top: 4px;
		font-size: 10px;
		letter-spacing: 1.5px;
		color: rgba(150, 170, 210, 0.5);
		text-transform: uppercase;
	}

	/* HUD — legenda das tracks */
	.hud-legend {
		position: absolute;
		top: 22px;
		right: 26px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid rgba(90, 120, 170, 0.2);
		border-radius: 8px;
		background: rgba(10, 16, 30, 0.5);
		backdrop-filter: blur(6px);
		font-family: 'JetBrains Mono', monospace;
		pointer-events: none;
	}
	.hud-legend-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
	}
	.hud-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
		box-shadow: 0 0 8px currentColor;
	}
	.hud-legend-name {
		color: rgba(210, 222, 238, 0.85);
		flex: 1;
	}
	.hud-legend-count {
		color: rgba(150, 170, 210, 0.55);
		font-size: 10px;
	}

	.planet-hint {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		color: rgba(150, 170, 200, 0.5);
		letter-spacing: 0.5px;
		pointer-events: none;
		font-family: 'JetBrains Mono', monospace;
	}

	/* ── Painel lateral tópico ───────────────────────────────────────────── */
	.topic-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		display: flex;
		justify-content: flex-end;
		background: rgba(4, 8, 18, 0.4);
		backdrop-filter: blur(4px);
		animation: topic-fade 0.3s ease;
	}
	@keyframes topic-fade { from { opacity: 0; } to { opacity: 1; } }

	.glass {
		background: rgba(10, 16, 30, 0.72);
		border: 1px solid rgba(120, 160, 220, 0.14);
		backdrop-filter: blur(22px) saturate(140%);
		-webkit-backdrop-filter: blur(22px) saturate(140%);
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45),
			0 0 60px rgba(74, 136, 199, 0.08),
			inset 0 1px 0 rgba(160, 190, 240, 0.1);
	}

	.topic-panel {
		width: min(900px, 96vw);
		height: 100%;
		border-radius: 28px 0 0 28px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: topic-slide 0.4s cubic-bezier(.2, .8, .2, 1);
	}
	@keyframes topic-slide {
		from { transform: translateX(40px); opacity: 0; }
		to   { transform: translateX(0); opacity: 1; }
	}

	.topic-panel-header {
		padding: 26px 28px 18px;
		border-bottom: 1px solid rgba(120, 160, 220, 0.1);
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-shrink: 0;
	}

	.topic-panel-title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: #e8eef7;
	}

	.topic-panel-status {
		display: inline-block;
		margin-top: 8px;
		padding: 3px 12px;
		border-radius: 99px;
		font-size: 0.76rem;
		font-weight: 500;
		color: var(--sc);
		background: color-mix(in srgb, var(--sc) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--sc) 35%, transparent);
	}

	.topic-panel-close {
		background: rgba(120, 160, 220, 0.08);
		border: 1px solid rgba(120, 160, 220, 0.18);
		border-radius: 10px;
		width: 34px;
		height: 34px;
		color: #c3d2e6;
		cursor: pointer;
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.2s;
	}
	.topic-panel-close:hover { background: rgba(120, 160, 220, 0.18); }

	.topic-panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 24px 28px 36px;
		scrollbar-width: thin;
		scrollbar-color: rgba(120, 160, 220, 0.2) transparent;
	}

	/* Bloco de código dentro do painel */
	.topic-code-block {
		margin-top: 26px;
		border-radius: 16px;
		overflow: hidden;
		border: 1px solid rgba(120, 160, 220, 0.14);
		background: rgba(0, 0, 0, 0.35);
	}
	.topic-file-tabs {
		display: flex;
		gap: 2px;
		padding: 8px 8px 0;
		background: rgba(120, 160, 220, 0.05);
		overflow-x: auto;
	}
	.topic-file-tab {
		background: transparent;
		border: none;
		color: #8ea3c0;
		cursor: pointer;
		padding: 8px 14px;
		border-radius: 8px 8px 0 0;
		font-size: 0.78rem;
		white-space: nowrap;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		transition: color 0.2s, background 0.2s;
	}
	.topic-file-tab.active { color: #fff; background: rgba(0, 0, 0, 0.4); }
	.topic-code {
		margin: 0;
		padding: 18px 20px;
		overflow-x: auto;
		font-family: 'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace;
		font-size: 0.82rem;
		line-height: 1.6;
		color: #d6dcea;
		scrollbar-width: thin;
		scrollbar-color: rgba(120, 160, 220, 0.2) transparent;
	}
	.topic-code-actions {
		display: flex;
		gap: 10px;
		padding: 12px 16px;
		border-top: 1px solid rgba(120, 160, 220, 0.1);
	}
	.topic-ghost-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: rgba(74, 136, 199, 0.14);
		border: 1px solid rgba(74, 136, 199, 0.4);
		color: #e8eef7;
		padding: 8px 16px;
		border-radius: 10px;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 500;
		text-decoration: none;
		transition: background 0.2s, transform 0.2s, border-color 0.2s;
	}
	.topic-ghost-btn:hover {
		background: rgba(74, 136, 199, 0.26);
		border-color: rgba(74, 136, 199, 0.7);
		transform: translateY(-1px);
	}

	.topic-empty {
		text-align: center;
		padding: 48px 20px;
		color: #8ea3c0;
	}
	.topic-empty span { font-size: 2.4rem; display: block; margin-bottom: 12px; }

	@media (max-width: 560px) {
		.topic-panel { border-radius: 0; width: 100vw; }
	}
</style>
