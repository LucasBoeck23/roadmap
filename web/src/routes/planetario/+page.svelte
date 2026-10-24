<script>
	// ─────────────────────────────────────────────────────────────────────────
	//  Planetário — o mapa imersivo do roadmap.
	//  Cada track vira um planeta; cada tópico, uma lua. Clicar numa lua abre
	//  o painel liquid glass com README + código real. Rota própria, acessada
	//  pelo botão "Explorar" da home.
	// ─────────────────────────────────────────────────────────────────────────
	import { onMount, onDestroy } from 'svelte';
	import { base }            from '$app/paths';
	import { getTrackList, getTopicsByTrack } from '$lib/topicService.js';
	import { PLANET_PROFILES } from '$lib/planetarium/constants.js';
	import PlanetarySystem     from '$lib/components/PlanetarySystem.svelte';
	import TopicModal          from '$lib/components/TopicModal.svelte';

	// Cores dos planetas em CSS (cor base de cada perfil) para o HUD
	const PLANET_HUD_COLORS = PLANET_PROFILES.map(p => '#' + p.base.toString(16).padStart(6, '0'));

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
	// Esconde o "← início" quando um planeta está em foco (mostra "voltar ao
	// sistema" no lugar).
	let planetFocused = $state(false);

	function handleNavChange(nav) {
		planetFocused = nav.focused;
	}

	// Sai do foco do planeta, voltando ao sistema solar completo.
	function voltarAoSistema() {
		planetaryRef?.drillUp();
	}

	// ── Painel do tópico ────────────────────────────────────────────────────
	// Reutiliza o MESMO modal da home (TopicModal): árvore de pastas à esquerda,
	// código/README à direita. Clicar numa lua abre este modal — NÃO drilla mais
	// (não constrói outra galáxia de planetas para os arquivos).
	let selectedTopic   = $state(null);
	let preselectFile   = $state(null);
	let modalRef        = $state(null);

	// ── Init ────────────────────────────────────────────────────────────────
	onMount(async () => {
		// Trava o scroll da página enquanto o planetário (canvas 3D tela cheia)
		// está montado. A home volta a rolar normalmente ao sair daqui.
		document.body.style.overflow = 'hidden';

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

	// Restaura o scroll da página ao sair do planetário.
	onDestroy(() => {
		if (typeof document !== 'undefined') document.body.style.overflow = '';
	});

	// ── Seleção de tópico (clique numa lua) ──────────────────────────────────
	// `preselect` (opcional) = caminho de um arquivo para abrir já selecionado.
	// Apenas abre o modal compartilhado — sem drill-down.
	function handleTopicSelect(topic, preselect = null) {
		selectedTopic = topic;
		preselectFile = preselect;
		// Se o modal já estava aberto em outro tópico, reabre no novo arquivo.
		if (preselect) modalRef?.open?.(preselect);
	}

	function closeTopicPanel() {
		selectedTopic = null;
		preselectFile = null;
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

	<!-- Voltar ao sistema — aparece quando um planeta está em foco -->
	{#if planetFocused}
		<div class="nav-stack">
			<button class="nav-up" onclick={voltarAoSistema} aria-label="Voltar ao sistema">
				↑ voltar ao sistema
			</button>
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

	<!-- Hint de controles (texto adapta para touch no mobile via CSS) -->
	<div class="planet-hint">
		<span class="hint-desktop">scroll para zoom · arrastar para navegar · clique num planeta p/ focar · clique numa lua p/ abrir o tópico</span>
		<span class="hint-touch">1 dedo: girar · 2 dedos: zoom · toque: abrir</span>
	</div>

	<!-- Modal do tópico — MESMO componente da home (árvore + código/README) -->
	<TopicModal bind:this={modalRef} topic={selectedTopic} onClose={closeTopicPanel} />
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
		-webkit-backdrop-filter: blur(6px);
		animation: intro-fade 0.4s ease;
	}
	@keyframes intro-fade { from { opacity: 0; } to { opacity: 1; } }

	.intro-card {
		max-width: 520px;
		padding: 34px 34px 28px;
		border-radius: 24px;
		text-align: left;
		animation: intro-rise 0.5s cubic-bezier(.2, .8, .2, 1);
		/* a fonte do cartão de intro é herdada por h2/p/label/links/botão */
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
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
		border-radius: var(--radius-pill);
		margin-bottom: 16px;
	}
	.intro-card h2 {
		margin: 0 0 12px;
		font-size: 1.8rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: #eaf0f8;
	}
	.intro-card p {
		margin: 0 0 12px;
		font-size: 0.95rem;
		line-height: 1.6;
		color: #aeb8c8;
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
		transition: color 0.2s;
	}
	.intro-back:hover { color: #e2e8f2; }
	.intro-enter {
		background: rgba(74, 136, 199, 0.2);
		border: 1px solid rgba(120, 180, 255, 0.5);
		color: #eaf0f8;
		padding: 10px 20px;
		border-radius: var(--radius-pill);
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
		/* fonte do HUD (título, legenda, hint) herdada deste container.
		   O .intro-card sobrescreve para a fonte system-ui; o botão .nav-up
		   redeclara porque <button> não herda font-family de forma confiável. */
		font-family: 'JetBrains Mono', monospace;
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
		border-radius: var(--radius-pill);
		border: 1px solid rgba(120, 160, 220, 0.25);
		background: rgba(10, 16, 30, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
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
		border-radius: var(--radius-pill);
		border: 1px solid rgba(120, 160, 220, 0.3);
		background: rgba(74, 136, 199, 0.18);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
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
	/* HUD — título */
	.hud-title {
		position: absolute;
		top: 22px;
		left: 26px;
		pointer-events: none;
		z-index: 10;
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
		-webkit-backdrop-filter: blur(6px);
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
		text-align: center;
		max-width: 92vw;
	}
	/* por padrão (desktop) mostra o hint de mouse; o de touch fica oculto */
	.hint-touch { display: none; }

	.glass {
		background: rgba(10, 16, 30, 0.72);
		border: 1px solid rgba(120, 160, 220, 0.14);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45),
			0 0 60px rgba(74, 136, 199, 0.08),
			inset 0 1px 0 rgba(160, 190, 240, 0.1);
	}

	/* ── Mobile / telas estreitas ────────────────────────────────────────── */
	@media (max-width: 640px) {
		/* alterna os hints de controle */
		.hint-desktop { display: none; }
		.hint-touch   { display: inline; }

		/* título menor e mais discreto */
		.hud-title { top: 14px; left: 16px; }
		.hud-title-main { font-size: 15px; letter-spacing: 3px; }
		.hud-title-sub  { font-size: 9px; letter-spacing: 1px; }

		/* legenda compacta no canto superior direito */
		.hud-legend { top: 12px; right: 12px; padding: 8px 10px; gap: 4px; }
		.hud-legend-row { font-size: 10px; gap: 6px; }
		.hud-dot { width: 7px; height: 7px; }

		/* hint um pouco acima para não colar nos botões de baixo */
		.planet-hint { bottom: 60px; font-size: 10px; }

		/* botões inferiores menores e com alvo de toque confortável */
		.back-home { bottom: 14px; left: 14px; padding: 9px 16px; font-size: 12px; }
		.nav-stack { bottom: 14px; left: 14px; right: 14px; max-width: none; gap: 8px; }
		.nav-up { padding: 9px 16px; }

		/* intro em tela cheia e rolável */
		.intro-overlay { padding: 16px; }
		.intro-card { padding: 24px 22px 20px; max-height: 88vh; overflow-y: auto; }
		.intro-card h2 { font-size: 1.5rem; }
		.intro-actions { flex-direction: column-reverse; align-items: stretch; }
		.intro-enter { width: 100%; }
		.intro-back { text-align: center; }
	}
</style>
