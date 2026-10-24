<script>
	// ─────────────────────────────────────────────────────────────────────────
	//  TopicCard — card de um tópico na grade da home. Mostra status, título e
	//  a contagem de arquivos; clicar abre o modal do tópico (via onOpen).
	//  Extraído da home (+page.svelte) para evitar markup/CSS duplicado.
	// ─────────────────────────────────────────────────────────────────────────
	import { flattenFiles } from '$lib/topicService.js';
	import { STATUS } from '$lib/tracks.js';

	let { topic, cor = '#7fb0e6', index = 0, onOpen } = $props();

	// Nº de arquivos reais (via árvore quando houver, senão lista plana).
	const fileCount = $derived(
		topic?.tree ? flattenFiles(topic.tree).length : (topic?.arquivos?.length ?? 0)
	);
</script>

<button
	class="card glass"
	style="--tc:{cor}; --d:{index * 70}ms"
	onclick={() => onOpen?.(topic)}
>
	<div class="card-sheen"></div>
	<div class="card-top">
		<span class="status" style="--sc:{STATUS[topic.status]?.cor ?? '#64748b'}">
			<span class="status-dot"></span>{STATUS[topic.status]?.label ?? topic.status}
		</span>
	</div>
	<h3>{topic.nome}</h3>
	<div class="card-foot">
		{#if fileCount}
			<span>{fileCount} arquivo{fileCount !== 1 ? 's' : ''}</span>
		{:else}
			<span class="muted">em breve</span>
		{/if}
		<span class="arrow">→</span>
	</div>
</button>

<style>
	/* vidro base (mesmo efeito das demais telas; só o blur é token global) */
	.glass {
		background: rgba(255,255,255,.045);
		border: 1px solid rgba(255,255,255,.09);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		box-shadow: 0 8px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08);
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
	.status { display: inline-flex; align-items: center; gap: 6px; font-size: .74rem; color: var(--sc); }
	.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sc); box-shadow: 0 0 8px var(--sc); }
	.card h3 { margin: 0; font-size: 1.18rem; font-weight: 600; letter-spacing: -.01em; }
	.card-foot { display: flex; justify-content: space-between; align-items: center;
		margin-top: 20px; font-size: .82rem; color: var(--g-text-muted); }
	.card-foot .muted { opacity: .6; }
	.card .arrow { font-size: 1.1rem; transition: transform .3s; color: color-mix(in srgb, var(--tc) 80%, #fff); }
	.card:hover .arrow { transform: translateX(5px); }

	/* mobile: padding menor (espelha o que a home fazia em @media) */
	@media (max-width: 760px) {
		.card { padding: 18px; }
	}
</style>
