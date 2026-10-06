<script>
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import Prism from 'prismjs';
	import 'prismjs/components/prism-csharp';
	import 'prismjs/components/prism-dart';
	import { initResizer } from '$lib/resizer.js';
	import { getTrackList, getTopicsByTrack, getReadme, getFile } from '$lib/topicService.js';
	import { nivelLabel, statusLabel } from '$lib/tracks.js';

	// ── Estado ────────────────────────────────────────────────────────────────
	let tracks       = $state([]);
	let activeTrack  = $state(null);
	let activeTopics = $state([]);

	let openTabs    = $state([]);
	let activeTabId = $state(null);
	let activeTab   = $derived(openTabs.find(t => t.id === activeTabId) ?? null);

	let readmeHtml  = $state('');
	const readmeCache  = new Map();
	const contentCache = new Map();

	let rightTabs      = $state([]);
	let activeRightTab = $state(null);
	let rightContent   = $state('');
	let rightLineCount = $state(0);

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(async () => {
		const cleanup = initResizer();

		tracks = await getTrackList();
		if (tracks.length > 0) await switchTrack(tracks[0]);

		return cleanup;
	});

	// ── Track ─────────────────────────────────────────────────────────────────
	async function switchTrack(track) {
		activeTrack  = track;
		activeTopics = await getTopicsByTrack(track.id);
	}

	// ── Tabs esquerda ─────────────────────────────────────────────────────────
	async function openTopic(topic) {
		if (!openTabs.find(t => t.id === topic.id)) {
			openTabs = [...openTabs, topic];
		}
		await activateTab(topic.id);
	}

	async function activateTab(id) {
		activeTabId    = id;
		rightTabs      = [];
		activeRightTab = null;
		rightContent   = '';

		const topic = openTabs.find(t => t.id === id);
		if (!topic) return;

		if (readmeCache.has(id)) {
			readmeHtml = readmeCache.get(id);
		} else {
			const md  = await getReadme(topic.pasta);
			const html = md
				? marked.parse(md)
				: '<p style="color:var(--text-muted)">Sem README ainda.</p>';
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
			readmeHtml  = '';
			if (last) activateTab(last.id);
		}
	}

	// ── Painel direito ────────────────────────────────────────────────────────
	async function openFileInRight(filePath) {
		if (!activeTab) return;
		if (!rightTabs.includes(filePath)) rightTabs = [...rightTabs, filePath];
		await activateRightTab(filePath);
	}

	async function activateRightTab(filePath) {
		activeRightTab = filePath;

		const key = `${activeTab?.id}::${filePath}`;
		if (contentCache.has(key)) {
			applyRightContent(contentCache.get(key));
			return;
		}

		const raw = await getFile(activeTab.pasta, filePath);
		const content = raw ?? '// Arquivo não encontrado';
		contentCache.set(key, content);
		applyRightContent(content);
	}

	function applyRightContent(content) {
		rightContent   = content;
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
		rightTabs      = [];
		activeRightTab = null;
		rightContent   = '';
		rightLineCount = 0;
	}

	// ── Prism ─────────────────────────────────────────────────────────────────
	function highlightCode() {
		document.querySelectorAll('code[class*="language-"]:not([data-highlighted])').forEach(el => {
			Prism.highlightElement(el);
			el.dataset.highlighted = 'yes';
		});
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	function fileName(path) {
		return path.split('/').pop() ?? path;
	}

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
</script>

<div class="ide-layout">

	<!-- Activity Bar -->
	<div class="activity-bar">
		{#each tracks as track}
			<div
				class="activity-icon"
				class:activity-active={activeTrack?.id === track.id}
				title={track.nome}
				role="button"
				tabindex="0"
				onclick={() => switchTrack(track)}
				onkeydown={e => e.key === 'Enter' && switchTrack(track)}
			>
				<img src={track.icone} alt={track.nome} />
			</div>
		{/each}
	</div>

	<!-- Sidebar -->
	<div class="sidebar">
		<div class="sidebar-header">EXPLORER</div>
		<div class="tree-view">
			{#if activeTrack}
				<div class="tree-section-title">{activeTrack.nome}</div>
				{#each activeTopics as topic}
					<div
						class="tree-item"
						class:tree-selected={activeTabId === topic.id}
						role="button"
						tabindex="0"
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

	<!-- Editor Principal -->
	<div class="editor-main">

		<!-- Editor Tabs -->
		{#if openTabs.length > 0}
			<div class="editor-tabs">
				{#each openTabs as tab}
					<div
						class="editor-tab"
						class:editor-tab-active={activeTabId === tab.id}
						role="button"
						tabindex="0"
						onclick={() => activateTab(tab.id)}
						onkeydown={e => e.key === 'Enter' && activateTab(tab.id)}
					>
						<span class="editor-tab-icon">📄</span>
						<span class="editor-tab-name" title={tab.nome}>{tab.nome}</span>
						<span
							class="editor-tab-close"
							role="button"
							tabindex="0"
							onclick={e => closeTab(tab.id, e)}
							onkeydown={e => e.key === 'Enter' && closeTab(tab.id, e)}
						>✕</span>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Conteúdo -->
		<div class="editor-content">
			{#if activeTab}
				<div class="split-view">

					<!-- Painel Esquerdo: README + arquivos -->
					<div class="split-left">
						<div class="doc-view">
							<div class="doc-readme markdown-body">
								{@html readmeHtml}
							</div>

							{#if activeTab.arquivos.length > 0}
								<div class="doc-tree">
									<div class="doc-tree-title">📂 Arquivos</div>
									<div class="doc-tree-content">
										{#each activeTab.arquivos as file}
											<div
												class="tree-file-link"
												role="button"
												tabindex="0"
												onclick={() => openFileInRight(file)}
												onkeydown={e => e.key === 'Enter' && openFileInRight(file)}
											>
												📄 {file}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Resizer + Painel Direito -->
					{#if rightTabs.length > 0}
						<div class="split-resizer" id="split-resizer"></div>

						<div class="split-right">
							<div class="right-tabs">
								{#each rightTabs as file}
									<div
										class="right-tab"
										class:right-tab-active={activeRightTab === file}
										role="button"
										tabindex="0"
										onclick={() => activateRightTab(file)}
										onkeydown={e => e.key === 'Enter' && activateRightTab(file)}
									>
										<span>📄 {fileName(file)}</span>
										<span
											class="right-tab-close"
											role="button"
											tabindex="0"
											onclick={e => closeRightTab(file, e)}
											onkeydown={e => e.key === 'Enter' && closeRightTab(file, e)}
										>✕</span>
									</div>
								{/each}
							</div>

							{#if activeRightTab}
								<div class="breadcrumb">
									<span
										class="breadcrumb-back"
										role="button"
										tabindex="0"
										onclick={clearRightPanel}
										onkeydown={e => e.key === 'Enter' && clearRightPanel()}
									>← fechar</span>
									<span class="breadcrumb-sep">/</span>
									<span class="breadcrumb-file">{activeRightTab}</span>
								</div>
							{/if}

							<div class="code-area">
								<div class="line-numbers" aria-hidden="true">
									{#each { length: rightLineCount } as _, i}
										<span>{i + 1}</span>
									{/each}
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
							<span class="shortcut-key">📄</span>
							<span>Ver arquivo de código</span>
						</div>
					</div>
				</div>
			{/if}
		</div>

	</div>

	<!-- Status Bar -->
	<div class="status-bar">
		<span>🌿 {activeTrack?.nome ?? '...'}</span>
		<span>{activeTopics.length} tópicos</span>
		{#if openTabs.length > 0}
			<span>{openTabs.length} aberto{openTabs.length !== 1 ? 's' : ''}</span>
		{/if}
		<span class="status-right">Roadmap</span>
	</div>

</div>
