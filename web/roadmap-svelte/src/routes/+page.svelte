<script>
	import { onMount }    from 'svelte';
	import { gsap }       from 'gsap';
	import { marked }     from 'marked';
	import Prism          from 'prismjs';
	import 'prismjs/components/prism-csharp';
	import 'prismjs/components/prism-dart';
	import { initResizer }     from '$lib/resizer.js';
	import { getTrackList, getTopicsByTrack, getReadme, getFile } from '$lib/topicService.js';
	import { nivelLabel }      from '$lib/tracks.js';
	import { PLANET_COLORS }   from '$lib/planetarium/constants.js';
	import PlanetarySystem     from '$lib/components/PlanetarySystem.svelte';

	// Cores dos planetas em CSS (mesma paleta do 3D) para o HUD
	const PLANET_HUD_COLORS = PLANET_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));

	// ── View mode ─────────────────────────────────────────────────────────────
	// 'ide' | 'planet'
	let viewMode = $state('ide');

	// ── Estado compartilhado ──────────────────────────────────────────────────
	let tracks        = $state([]);
	let activeTrackId = $state(null);
	let activeTopics  = $state([]);

	const readmeCache  = new Map();
	const contentCache = new Map();

	// ── Estado — IDE ──────────────────────────────────────────────────────────
	let openTabs       = $state([]);
	let activeTabId    = $state(null);
	let activeTab      = $derived(openTabs.find(t => t.id === activeTabId) ?? null);
	let readmeHtml     = $state('');
	let rightTabs      = $state([]);
	let activeRightTab = $state(null);
	let rightContent   = $state('');
	let rightLineCount = $state(0);

	// ── Estado — Planetário ───────────────────────────────────────────────────
	let planetaryRef     = $state(null);
	let planetTracks     = $state([]); // tracks enriquecidas com _topics
	let selectedTopic    = $state(null);
	let topicReadmeHtml  = $state('');
	let topicPanelEl     = $state(null);
	let topicPanelOpen   = $state(false);

	// ── Init ──────────────────────────────────────────────────────────────────
	onMount(async () => {
		const cleanup = initResizer();
		tracks = await getTrackList();
		if (tracks.length > 0) {
			activeTrackId = tracks[0].id;
			activeTopics  = await getTopicsByTrack(tracks[0].id);
		}
		// Pré-carrega tópicos de todas as tracks pro planetário
		loadPlanetTopics();
		return cleanup;
	});

	async function loadPlanetTopics() {
		const enriched = await Promise.all(
			tracks.map(async t => {
				const topics = await getTopicsByTrack(t.id);
				return { ...t, _topics: topics };
			})
		);
		planetTracks = enriched;
	}

	// ── Alternância de view ───────────────────────────────────────────────────
	function toggleView() {
		viewMode = viewMode === 'ide' ? 'planet' : 'ide';
		if (viewMode === 'planet') closeTopicPanel();
	}

	// ── IDE — Track ───────────────────────────────────────────────────────────
	async function switchTrack(trackId) {
		if (activeTrackId === trackId) return;
		activeTrackId = trackId;
		openTabs = []; activeTabId = null; readmeHtml = '';
		rightTabs = []; activeRightTab = null; rightContent = '';
		activeTopics = await getTopicsByTrack(trackId);
	}

	// ── IDE — Tabs ────────────────────────────────────────────────────────────
	async function openTopic(topic) {
		if (!openTabs.find(t => t.id === topic.id)) openTabs = [...openTabs, topic];
		await activateTab(topic.id);
	}

	async function activateTab(id) {
		activeTabId = id;
		rightTabs = []; activeRightTab = null; rightContent = '';
		const topic = openTabs.find(t => t.id === id);
		if (!topic) return;
		if (readmeCache.has(id)) {
			readmeHtml = readmeCache.get(id);
		} else {
			const md   = await getReadme(topic.pasta);
			const html = md ? marked.parse(md) : '<p style="color:var(--text-muted)">Sem README ainda.</p>';
			readmeCache.set(id, html);
			readmeHtml = html;
		}
	}

	function closeTab(id, e) {
		e.stopPropagation();
		openTabs = openTabs.filter(t => t.id !== id);
		if (activeTabId === id) {
			const last = openTabs.at(-1);
			activeTabId = last?.id ?? null;
			readmeHtml = '';
			if (last) activateTab(last.id);
		}
	}

	// ── IDE — Painel direito ──────────────────────────────────────────────────
	async function openFileInRight(filePath) {
		if (!activeTab) return;
		if (!rightTabs.includes(filePath)) rightTabs = [...rightTabs, filePath];
		await activateRightTab(filePath);
	}

	async function activateRightTab(filePath) {
		activeRightTab = filePath;
		const key = `${activeTab?.id}::${filePath}`;
		if (contentCache.has(key)) { applyRightContent(contentCache.get(key)); return; }
		const raw = await getFile(activeTab.pasta, filePath);
		const content = raw ?? '// Arquivo não encontrado';
		contentCache.set(key, content);
		applyRightContent(content);
	}

	function applyRightContent(content) {
		rightContent = content;
		rightLineCount = content.split('\n').length;
		setTimeout(highlightCode, 0);
	}

	function closeRightTab(filePath, e) {
		e.stopPropagation();
		rightTabs = rightTabs.filter(f => f !== filePath);
		if (activeRightTab === filePath) {
			const last = rightTabs.at(-1) ?? null;
			activeRightTab = last;
			if (last) activateRightTab(last);
			else { rightContent = ''; rightLineCount = 0; }
		}
	}

	function clearRightPanel() {
		rightTabs = []; activeRightTab = null; rightContent = ''; rightLineCount = 0;
	}

	function highlightCode() {
		document.querySelectorAll('code[class*="language-"]:not([data-highlighted])').forEach(el => {
			Prism.highlightElement(el);
			el.dataset.highlighted = 'yes';
		});
	}

	// ── Planetário — painel de tópico ─────────────────────────────────────────
	async function handleTopicSelect(topic) {
		selectedTopic = topic;
		topicReadmeHtml = '';

		const md = readmeCache.has(topic.id)
			? readmeCache.get(topic.id)
			: await getReadme(topic.pasta);
		readmeCache.set(topic.id, md);

		topicReadmeHtml = md
			? marked.parse(md)
			: '<p style="opacity:0.6; font-style:italic;">Sem conteúdo ainda para este tópico.</p>';

		openTopicPanel();
	}

	function openTopicPanel() {
		topicPanelOpen = true;
		setTimeout(() => {
			if (!topicPanelEl) return;
			gsap.fromTo(topicPanelEl,
				{ x: 420, opacity: 0 },
				{ x: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }
			);
		}, 10);
	}

	function closeTopicPanel() {
		if (!topicPanelEl) { topicPanelOpen = false; selectedTopic = null; return; }
		gsap.to(topicPanelEl, {
			x: 420, opacity: 0, duration: 0.3, ease: 'power2.in',
			onComplete: () => { topicPanelOpen = false; selectedTopic = null; }
		});
	}

	// ── Helpers IDE ───────────────────────────────────────────────────────────
	function fileName(path) { return path.split('/').pop() ?? path; }
	function langClass(path) {
		if (!path) return 'language-plaintext';
		if (path.endsWith('.cs'))   return 'language-csharp';
		if (path.endsWith('.dart')) return 'language-dart';
		return 'language-plaintext';
	}
	function topicIcon(status) {
		if (status === 'concluido')    return '✅';
		if (status === 'em-progresso') return '🔄';
		return '📁';
	}

	let activeTrack = $derived(tracks.find(t => t.id === activeTrackId) ?? null);
</script>

<!-- ═══════════════════════════════════════════════
     BOTÃO TOGGLE (fixo, sempre visível)
═══════════════════════════════════════════════ -->
<button
	class="view-toggle"
	class:planet-active={viewMode === 'planet'}
	onclick={toggleView}
	title={viewMode === 'ide' ? 'Ver como Planetário' : 'Ver como IDE'}
	aria-label="Alternar visualização"
>
	{viewMode === 'ide' ? '🪐' : '💻'}
</button>

<!-- ═══════════════════════════════════════════════
     VIEW: IDE
═══════════════════════════════════════════════ -->
{#if viewMode === 'ide'}
<div class="ide-layout">

	<div class="activity-bar">
		{#each tracks as track}
			<div
				class="activity-icon"
				class:activity-active={activeTrackId === track.id}
				title={track.nome}
				role="button" tabindex="0"
				onclick={() => switchTrack(track.id)}
				onkeydown={e => e.key === 'Enter' && switchTrack(track.id)}
			>
				<img src={track.icone} alt={track.nome} />
			</div>
		{/each}
	</div>

	<div class="sidebar">
		<div class="sidebar-header">EXPLORER</div>
		<div class="tree-view">
			{#if activeTrack}
				<div class="tree-section-title">{activeTrack.nome}</div>
				{#each activeTopics as topic}
					<div
						class="tree-item"
						class:tree-selected={activeTabId === topic.id}
						role="button" tabindex="0"
						onclick={() => openTopic(topic)}
						onkeydown={e => e.key === 'Enter' && openTopic(topic)}
					>
						<span class="tree-icon">{topicIcon(topic.status)}</span>
						<span class="tree-label" title={topic.nome}>{topic.nome}</span>
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<div class="editor-main">
		{#if openTabs.length > 0}
			<div class="editor-tabs">
				{#each openTabs as tab}
					<div
						class="editor-tab"
						class:editor-tab-active={activeTabId === tab.id}
						role="button" tabindex="0"
						onclick={() => activateTab(tab.id)}
						onkeydown={e => e.key === 'Enter' && activateTab(tab.id)}
					>
						<span class="editor-tab-icon">📄</span>
						<span class="editor-tab-name" title={tab.nome}>{tab.nome}</span>
						<span
							class="editor-tab-close" role="button" tabindex="0"
							onclick={e => closeTab(tab.id, e)}
							onkeydown={e => e.key === 'Enter' && closeTab(tab.id, e)}
						>✕</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="editor-content">
			{#if activeTab}
				<div class="split-view">
					<div class="split-left">
						<div class="doc-view">
							<div class="doc-readme markdown-body">{@html readmeHtml}</div>
							{#if activeTab.arquivos.length > 0}
								<div class="doc-tree">
									<div class="doc-tree-title">📂 Arquivos</div>
									<div class="doc-tree-content">
										{#each activeTab.arquivos as file}
											<div
												class="tree-file-link" role="button" tabindex="0"
												onclick={() => openFileInRight(file)}
												onkeydown={e => e.key === 'Enter' && openFileInRight(file)}
											>📄 {file}</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
					{#if rightTabs.length > 0}
						<div class="split-resizer" id="split-resizer"></div>
						<div class="split-right">
							<div class="right-tabs">
								{#each rightTabs as file}
									<div
										class="right-tab"
										class:right-tab-active={activeRightTab === file}
										role="button" tabindex="0"
										onclick={() => activateRightTab(file)}
										onkeydown={e => e.key === 'Enter' && activateRightTab(file)}
									>
										<span>📄 {fileName(file)}</span>
										<span
											class="right-tab-close" role="button" tabindex="0"
											onclick={e => closeRightTab(file, e)}
											onkeydown={e => e.key === 'Enter' && closeRightTab(file, e)}
										>✕</span>
									</div>
								{/each}
							</div>
							{#if activeRightTab}
								<div class="breadcrumb">
									<span
										class="breadcrumb-back" role="button" tabindex="0"
										onclick={clearRightPanel}
										onkeydown={e => e.key === 'Enter' && clearRightPanel()}
									>← fechar</span>
									<span class="breadcrumb-sep">/</span>
									<span class="breadcrumb-file">{activeRightTab}</span>
								</div>
							{/if}
							<div class="code-area">
								<div class="line-numbers" aria-hidden="true">
									{#each { length: rightLineCount } as _, i}<span>{i + 1}</span>{/each}
								</div>
								<pre class="code-text"><code class={langClass(activeRightTab)}>{rightContent}</code></pre>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="welcome">
					<div class="welcome-title">Roadmap</div>
					<div class="welcome-sub">Selecione um tópico na sidebar para começar</div>
					<div class="welcome-shortcuts">
						<div class="shortcut-item">
							<span class="shortcut-key">click</span>
							<span>Abrir tópico</span>
						</div>
						<div class="shortcut-item">
							<span class="shortcut-key">🪐</span>
							<span>Ver como planetário</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="status-bar">
		<span>🌿 {activeTrack?.nome ?? '...'}</span>
		<span>{activeTopics.length} tópicos</span>
		{#if openTabs.length > 0}
			<span>{openTabs.length} aberto{openTabs.length !== 1 ? 's' : ''}</span>
		{/if}
		<span class="status-right">Roadmap</span>
	</div>

</div>
{/if}

<!-- ═══════════════════════════════════════════════
     VIEW: PLANETÁRIO
═══════════════════════════════════════════════ -->
{#if viewMode === 'planet'}
<div class="planet-view">
	<PlanetarySystem
		tracks={planetTracks}
		onTopicSelect={handleTopicSelect}
		bind:this={planetaryRef}
	/>

	<!-- Vinheta cinematográfica -->
	<div class="planet-vignette"></div>

	<!-- HUD: título no canto superior esquerdo -->
	<div class="hud-title">
		<div class="hud-title-main">ROADMAP</div>
		<div class="hud-title-sub">sistema de estudos · {planetTracks.length} trilhas</div>
	</div>

	<!-- HUD: legenda das tracks no canto superior direito -->
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
		scroll para zoom · arrastar para navegar · clique num planeta
	</div>

	<!-- Painel lateral do tópico selecionado -->
	{#if topicPanelOpen}
		<div class="topic-panel" bind:this={topicPanelEl}>
			<div class="topic-panel-header">
				<div>
					<div class="topic-panel-title">{selectedTopic?.nome ?? ''}</div>
					{#if selectedTopic?.nivel}
						<div class="topic-panel-level">{nivelLabel(selectedTopic.nivel)}</div>
					{/if}
				</div>
				<button class="topic-panel-close" onclick={closeTopicPanel} aria-label="Fechar">✕</button>
			</div>
			<div class="topic-panel-content">
				<div class="markdown-body">
					{@html topicReadmeHtml}
				</div>
			</div>
		</div>
	{/if}
</div>
{/if}

<style>
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
	.topic-panel {
		position: absolute;
		top: 50%;
		right: 20px;
		transform: translateY(-50%);
		z-index: 20;
		width: 400px;
		max-height: 80vh;
		background: rgba(14, 18, 32, 0.95);
		border: 1px solid rgba(74, 136, 199, 0.3);
		border-radius: 8px;
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.7), 0 0 30px rgba(74, 136, 199, 0.05);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		backdrop-filter: blur(12px);
	}

	.topic-panel-header {
		padding: 14px 16px;
		border-bottom: 1px solid rgba(74, 136, 199, 0.2);
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-shrink: 0;
	}

	.topic-panel-title {
		font-size: 15px;
		font-weight: 600;
		color: #e0e8f0;
		font-family: 'JetBrains Mono', monospace;
	}

	.topic-panel-level {
		font-size: 10px;
		color: rgba(150, 170, 200, 0.5);
		margin-top: 3px;
		letter-spacing: 0.5px;
	}

	.topic-panel-close {
		background: none;
		border: 1px solid rgba(74, 136, 199, 0.3);
		border-radius: 50%;
		width: 26px;
		height: 26px;
		color: rgba(150, 170, 200, 0.7);
		cursor: pointer;
		font-size: 11px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.15s, color 0.15s;
	}

	.topic-panel-close:hover {
		background: rgba(74, 136, 199, 0.15);
		color: #e0e8f0;
	}

	.topic-panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px 20px;
		scrollbar-width: thin;
		scrollbar-color: rgba(74, 136, 199, 0.3) transparent;
	}

	/* ── Botão toggle ────────────────────────────────────────────────────── */
	.view-toggle {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 200;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(30, 30, 46, 0.85);
		backdrop-filter: blur(8px);
		font-size: 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		transition: transform 0.15s, box-shadow 0.15s;
		line-height: 1;
	}

	.view-toggle:hover {
		transform: scale(1.1);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
	}

	.view-toggle.planet-active {
		background: rgba(30, 50, 80, 0.9);
		border-color: rgba(74, 136, 199, 0.5);
	}
</style>
