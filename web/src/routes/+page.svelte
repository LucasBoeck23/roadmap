<script>
	// ─────────────────────────────────────────────────────────────────────────
	//  Home — vitrine do roadmap (visual "premium" / liquid glass)
	//  Resume as stacks e tópicos; abre cada tópico num painel com README +
	//  código real. Dados vêm de topics.json (gerado a partir de /src).
	// ─────────────────────────────────────────────────────────────────────────
	import { onMount } from 'svelte';
	import { base }    from '$app/paths';
	import { getTrackList, getTopicsByTrack, flattenFiles } from '$lib/topicService.js';
	import TopicModal  from '$lib/components/TopicModal.svelte';

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
	let selected      = $state(null);        // tópico aberto no modal

	// Nº de arquivos reais (via árvore quando houver, senão lista plana).
	function topicFileCount(topic) {
		if (topic?.tree) return flattenFiles(topic.tree).length;
		return topic?.arquivos?.length ?? 0;
	}

	// Abre o modal do tópico — toda a lógica de árvore/código/README vive no
	// componente TopicModal (reutilizado também pelo planetário).
	function openTopic(topic) { selected = topic; }
	function closePanel()     { selected = null; }

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

	<!-- Modal do tópico — componente compartilhado (árvore + código/README) -->
	<TopicModal topic={selected} onClose={closePanel} />
</div>

<style>
	:global(body) { margin: 0; }

	.stage {
		position: relative;
		min-height: 100vh;
		overflow-x: hidden;
		background: #06070e;
		color: var(--g-text);
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
		background: radial-gradient(circle, var(--g-violet-strong), transparent 70%); }
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
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		box-shadow: 0 8px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08);
	}

	.shell {
		position: relative;
		z-index: 2;
		max-width: 1120px;
		margin: 0 auto;
		/* padding-bottom generoso garante respiro sob o rodapé em qualquer tela */
		padding: clamp(48px, 9vh, 120px) 24px clamp(32px, 5vh, 56px);
		/* 100svh (small viewport height) respeita as barras do navegador mobile,
		   evitando que o rodapé seja empurrado para fora da área visível. */
		min-height: 100svh;
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
		color: var(--g-violet); opacity: .9;
	}
	.hero h1 {
		font-size: clamp(2.4rem, 6vw, 4.2rem);
		line-height: 1.04; font-weight: 700; letter-spacing: -.02em;
		margin: 18px 0 0;
	}
	.grad {
		background: linear-gradient(100deg, var(--g-violet), var(--g-sky) 60%, #f0abfc);
		-webkit-background-clip: text; background-clip: text; color: transparent;
	}
	.lead {
		margin: 22px 0 0; max-width: 560px;
		font-size: 1.08rem; line-height: 1.6; color: var(--g-text-dim);
	}

	.progress-card { padding: 20px 22px; border-radius: 20px; flex: 0 1 360px; min-width: 300px; }
	.progress-head { display: flex; justify-content: space-between; align-items: baseline;
		font-size: .9rem; color: #c3c9db; }
	.progress-pct { font-size: 1.5rem; font-weight: 700;
		background: linear-gradient(90deg,var(--g-violet),var(--g-sky)); -webkit-background-clip: text; background-clip: text; color: transparent; }
	.progress-track { height: 8px; border-radius: var(--radius-pill); background: rgba(255,255,255,.08);
		margin: 14px 0 12px; overflow: hidden; }
	.progress-fill { height: 100%; border-radius: var(--radius-pill);
		background: linear-gradient(90deg,var(--g-violet-strong),var(--g-sky));
		box-shadow: 0 0 16px rgba(99,102,241,.6); transition: width .1s linear; }
	.progress-meta { display: flex; gap: 18px; font-size: .82rem; color: var(--g-text-muted); }
	.progress-meta b { color: var(--g-text); }

	/* ── TRACKS NAV ───────────────────────────────── */
	.tracks-nav { display: flex; gap: 12px; margin: 54px 0 28px; flex-wrap: wrap; }
	.track-pill {
		display: inline-flex; align-items: center; gap: 10px;
		padding: 11px 20px; border-radius: var(--radius-pill); cursor: pointer;
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
	.status { display: inline-flex; align-items: center; gap: 6px; font-size: .74rem; color: var(--sc); }
	.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sc); box-shadow: 0 0 8px var(--sc); }
	.card h3 { margin: 0; font-size: 1.18rem; font-weight: 600; letter-spacing: -.01em; }
	.card-foot { display: flex; justify-content: space-between; align-items: center;
		margin-top: 20px; font-size: .82rem; color: var(--g-text-muted); }
	.card-foot .muted { opacity: .6; }
	.card .arrow { font-size: 1.1rem; transition: transform .3s; color: color-mix(in srgb, var(--tc) 80%, #fff); }
	.card:hover .arrow { transform: translateX(5px); }

	/* ── FOOTER ───────────────────────────────────── */
	/* CTA do planetário — fica ACIMA da linha divisória.
	   margin-top:auto empurra CTA+rodapé para o fim do shell; o padding-bottom
	   do .shell garante que fiquem sempre visíveis, com respiro embaixo. */
	.explore-cta { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 56px; }
	.foot { margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.07);
		font-size: .84rem; color: #70778c; text-align: right; }
	.planet-link { color: var(--g-violet); text-decoration: none; font-weight: 500;
		padding: 10px 20px; border-radius: var(--radius-pill); border: 1px solid rgba(167,139,250,.3);
		transition: background .25s, transform .25s; }
	.planet-link:hover { background: rgba(167,139,250,.12); transform: translateY(-2px); }

	/* ── Tablet / telas médias ───────────────────────────────────────────── */
	@media (max-width: 900px) {
		.hero { flex-direction: column; align-items: stretch; gap: 24px; }
		/* zera o flex-basis vertical dos filhos: em coluna, o `flex:1 1 420px`
		   do hero-text reservava 420px de ALTURA, criando um vão enorme entre o
		   texto e o card de progresso. */
		.hero-text { flex: 0 0 auto; max-width: none; }
		.progress-card { flex: 0 0 auto; min-width: 0; }
	}

	/* ── Mobile / telas estreitas ────────────────────────────────────────── */
	@media (max-width: 760px) {
		/* No mobile o conteúdo deve FLUIR e rolar naturalmente. O min-height
		   100svh + margin-top:auto (que empurram CTA/rodapé pro fundo no desktop)
		   faziam o hero esticar e "engolir" os cards sem habilitar o scroll. */
		.shell {
			min-height: auto;
			display: block;
			padding: clamp(32px, 7vh, 72px) 16px clamp(28px, 4vh, 44px);
		}
		.explore-cta { margin-top: 40px; }

		/* hero compacto */
		.hero h1 { font-size: clamp(2rem, 9vw, 2.8rem); }
		.lead { font-size: 1rem; }

		/* cards: 1 por linha, sem overflow horizontal */
		.cards { grid-template-columns: 1fr; gap: 14px; }
		.card { padding: 18px; }

		/* nav de tracks rolável na horizontal se não couber */
		.tracks-nav { margin: 36px 0 22px; flex-wrap: nowrap; overflow-x: auto;
			-webkit-overflow-scrolling: touch; padding-bottom: 4px; }
		.track-pill { flex: 0 0 auto; }

		/* CTA e rodapé centralizados no mobile */
		.explore-cta { justify-content: center; padding-top: 40px; }
		.planet-link { width: 100%; text-align: center; box-sizing: border-box; }
		.foot { text-align: center; }
	}
</style>
