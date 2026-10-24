<script>
	// ─────────────────────────────────────────────────────────────────────────
	//  FileTree — árvore de pastas/arquivos recursiva (profundidade ilimitada).
	//  Consome um nó do schema `tree` do topics.json (FEAT-002):
	//    { nome, caminho, temReadme, readme, arquivos:[{nome,caminho}], subpastas:[] }
	//  Renderiza uma pasta (botão que expande/colapsa) e, quando aberta, seu
	//  README (se houver), seus arquivos e suas subpastas (recursivamente,
	//  importando a si mesmo).
	// ─────────────────────────────────────────────────────────────────────────
	import Self from './FileTree.svelte';

	let {
		node,              // nó atual da árvore
		label = null,      // rótulo da pasta (usado na raiz p/ o nome do estudo)
		depth = 0,         // profundidade — controla indentação
		activeFile = null, // caminho do arquivo selecionado (p/ highlight)
		activeReadme = null, // caminho do README selecionado (p/ highlight)
		onSelectFile,      // (fileNode) => void
		onSelectReadme     // (readmePath) => void
	} = $props();

	// raiz começa aberta; demais pastas também abertas por padrão (fácil explorar)
	let open = $state(true);

	const name = $derived(label ?? node?.nome ?? 'raiz');
	const isEmpty = $derived(
		!(node?.arquivos?.length) && !(node?.subpastas?.length) && !node?.readme
	);
</script>

<div class="tree-node" style="--depth:{depth}">
	<button
		type="button"
		class="row folder"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span class="chevron" class:open>▸</span>
		<span class="glyph">{open ? '📂' : '📁'}</span>
		<span class="label">{name}</span>
	</button>

	{#if open}
		<div class="children">
			{#if node?.readme}
				<button
					type="button"
					class="row file readme-row"
					class:active={activeReadme === node.readme && !activeFile}
					onclick={() => onSelectReadme?.(node.readme)}
				>
					<span class="glyph">📖</span>
					<span class="label">README.md</span>
				</button>
			{/if}

			{#each node?.arquivos ?? [] as file}
				<button
					type="button"
					class="row file"
					class:active={activeFile === file.caminho}
					onclick={() => onSelectFile?.(file)}
				>
					<span class="glyph">{file.nome.endsWith('.dart') ? '🎯' : '📄'}</span>
					<span class="label">{file.nome}</span>
				</button>
			{/each}

			{#each node?.subpastas ?? [] as child}
				<Self
					node={child}
					depth={depth + 1}
					{activeFile}
					{activeReadme}
					{onSelectFile}
					{onSelectReadme}
				/>
			{/each}

			{#if isEmpty}
				<span class="row empty-node">— vazio —</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tree-node { display: flex; flex-direction: column; }

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		color: #c3c9db;
		cursor: pointer;
		font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
		font-size: .82rem;
		line-height: 1.4;
		padding: 6px 10px 6px calc(10px + var(--depth) * 16px);
		border-radius: 8px;
		transition: background .18s, color .18s;
	}
	.row:hover { background: rgba(255,255,255,.06); color: var(--g-text); }

	.folder { font-weight: 600; color: #cbd2e6; }

	.file.active {
		background: color-mix(in srgb, var(--g-violet-strong) 24%, transparent);
		color: #fff;
		box-shadow: inset 2px 0 0 var(--g-violet);
	}

	.readme-row { color: #9fb6e6; }

	.chevron {
		display: inline-block;
		font-size: .7rem;
		opacity: .7;
		transition: transform .2s ease;
	}
	.chevron.open { transform: rotate(90deg); }

	.glyph { font-size: .9rem; line-height: 1; }
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.children { display: flex; flex-direction: column; }

	.empty-node {
		padding: 6px 10px 6px calc(10px + (var(--depth) + 1) * 16px);
		font-size: .78rem;
		font-style: italic;
		opacity: .5;
		font-family: 'SF Mono', ui-monospace, monospace;
	}
</style>
