<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { EffectComposer }   from 'three/examples/jsm/postprocessing/EffectComposer.js';
	import { RenderPass }       from 'three/examples/jsm/postprocessing/RenderPass.js';
	import { UnrealBloomPass }  from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
	import { OutputPass }       from 'three/examples/jsm/postprocessing/OutputPass.js';
	import { OrbitalCamera } from '$lib/planetarium/camera.js';
	import { SolarSystem }   from '$lib/planetarium/scene.js';

	let { tracks = [], onTopicSelect, onFocusChange, onNavChange } = $props();

	/** Emite o estado de navegação (profundidade + breadcrumb) para o HUD. */
	function emitNav() {
		onNavChange?.({
			focused: !!solar?.selectedPlanetId,
			depth: solar?.depth?.() ?? 0,
			breadcrumb: solar?.breadcrumb?.() ?? []
		});
	}

	// ── DOM / Three core ───────────────────────────────────────────────────────
	let containerEl = $state(null);
	let canvasEl    = $state(null);
	let renderer, scene, orbitalCam, solar, animId;
	let composer, bloomPass;
	let builtKey = ''; // guard contra build duplicado (ver $effect)
	let clock = new THREE.Clock();
	let raycaster = new THREE.Raycaster();
	let mouseVec  = new THREE.Vector2();
	let resizeObserver;

	// ── Setup ────────────────────────────────────────────────────────────────
	function initThree() {
		const w = containerEl.clientWidth, h = containerEl.clientHeight;

		// antialias:false — com EffectComposer o AA do renderer é ignorado; o
		// serrilhado é tratado pelo MSAA do render target abaixo. Deixar true só
		// consumia memória/banda sem efeito.
		renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: 'high-performance' });
		renderer.setSize(w, h, false);
		// Teto de 1.5 no pixelRatio: em telas retina (dpr 2+) o custo de fill-rate
		// cresce com o quadrado do dpr. 1.5 mantém nitidez e corta ~44% de pixels
		// vs. dpr 2 — o maior ganho de GPU no planetário.
		renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
		renderer.setClearColor(0x000000);
		// shadowMap estava habilitado mas nenhuma luz projeta sombra
		// (castShadow=false) e nenhum material as recebe — era custo morto.
		renderer.shadowMap.enabled = false;

		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x000000); // fundo preto garantido
		orbitalCam = new OrbitalCamera(w / h);

		scene.add(new THREE.AmbientLight(0x443a33, 1.2));
		const starLight = new THREE.PointLight(0xffd9a0, 6, 1200, 1.2);
		starLight.castShadow = false;
		scene.add(starLight);

		solar = new SolarSystem(scene);
		solar.starLight = starLight;
		if (tracks.length) {
			solar.build(tracks);
			builtKey = tracks.map(t => t.id).join('|');
		}

		// ── Pós-processamento: bloom ──────────────────────────────────────────
		// Render target com MSAA (samples) → o EffectComposer, por padrão, não
		// tem antialiasing; sem isso as bordas das esferas ficam serrilhadas
		// mesmo com antialias:true no renderer.
		const dpr = Math.min(devicePixelRatio, 1.5);
		// MSAA 2x (era 4x): suaviza as bordas das esferas com metade do custo de
		// fill-rate do render target em half-float.
		const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, {
			samples: 2,
			type: THREE.HalfFloatType
		});
		composer = new EffectComposer(renderer, rt);
		composer.setSize(w, h);
		composer.setPixelRatio(dpr);
		composer.addPass(new RenderPass(scene, orbitalCam.camera));
		// strength, radius, threshold — bloom sutil só na auréola, sem estourar o centro
		bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.5, 0.9);
		composer.addPass(bloomPass);
		composer.addPass(new OutputPass());

		// Pré-compila os shaders (inclui o programa de lua) para o 1º clique num
		// planeta não travar com a compilação síncrona de vários materiais.
		solar.warmup(renderer, orbitalCam.camera);

		animate();
	}

	function animate() {
		animId = requestAnimationFrame(animate);
		// Clampa o dt: ao voltar de uma aba oculta, getDelta() pode devolver
		// vários segundos de uma vez, dando um "salto" na simulação. Limitar a
		// ~1/30s mantém o movimento contínuo e previsível.
		const dt = Math.min(clock.getDelta(), 0.033);
		const t  = clock.getElapsedTime();
		solar.update(dt, t);        // simulação + ciclo do sol
		orbitalCam.lerp(dt);        // câmera
		composer.render();          // render com bloom
	}

	// Pausa o loop quando a aba fica oculta — sem isso o planetário continua
	// queimando GPU/CPU em segundo plano.
	function onVisibilityChange() {
		if (document.hidden) {
			cancelAnimationFrame(animId);
			animId = null;
		} else if (animId == null) {
			clock.getDelta(); // descarta o tempo acumulado enquanto oculto
			animate();
		}
	}

	// ── Interação ──────────────────────────────────────────────────────────────
	let pointer = { down: false, x: 0, y: 0, button: 0 };

	function onPointerDown(e) {
		// Botão direito (2) não faz nada — evita quebrar a navegação.
		if (e.button === 2) return;
		pointer.down = true;
		pointer.x = e.clientX; pointer.y = e.clientY;
		pointer.button = e.button;
	}

	function onPointerMove(e) {
		if (!pointer.down) return;
		const dx = e.clientX - pointer.x;
		const dy = e.clientY - pointer.y;
		pointer.x = e.clientX; pointer.y = e.clientY;

		if (e.shiftKey) orbitalCam.pan(dx, dy);
		else            orbitalCam.orbit(dx, dy);
	}

	function onPointerUp(e) {
		const moved = Math.abs(e.clientX - pointer.x) + Math.abs(e.clientY - pointer.y);
		pointer.down = false;
		if (moved < 5) handleClick(e);
	}

	function onWheel(e) {
		e.preventDefault();
		orbitalCam.zoom(e.deltaY);
	}

	function handleClick(e) {
		const rect = canvasEl.getBoundingClientRect();
		mouseVec.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
		mouseVec.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouseVec, orbitalCam.camera);

		const item = solar.pick(raycaster);
		if (!item) return;
		if (item.type === 'planet')      selectPlanet(item.id);
		else if (item.type === 'moon')   openTopicOrDrill(item.topic);
		else if (item.type === 'drill')  openBodyOrDrill(item.body);
	}

	// ── Drill-down (galáxia dentro de galáxia) ───────────────────────────────
	/**
	 * Clique numa lua (tópico): se tem subpastas/arquivos, entra na galáxia
	 * aninhada; senão, abre o painel do tópico como hoje.
	 */
	function openTopicOrDrill(topic) {
		if (solar.drillIntoTopic(topic)) {
			transitionToDrill();
			emitNav();
		} else {
			onTopicSelect?.(topic);
		}
	}

	/**
	 * Clique num corpo do drill: pasta com filhos → entra mais fundo;
	 * folha (arquivo, ou pasta vazia) → abre o painel com o arquivo
	 * pré-selecionado e o README da parte.
	 */
	function openBodyOrDrill(body) {
		if (body.drillable && solar.drillIntoBody(body)) {
			transitionToDrill();
			emitNav();
		} else {
			// Folha: abre o painel. Para um arquivo, passa o caminho p/ pré-seleção.
			onTopicSelect?.(body.topic, body.file ?? null);
		}
	}

	/** Reposiciona a câmera para enquadrar a galáxia aninhada recém-construída. */
	function transitionToDrill() {
		const extent = solar.drillExtent();
		const dist   = Math.max(55, Math.min(220, extent * 1.9 + 34));
		orbitalCam.focusOn(new THREE.Vector3(0, 0, 0), dist);
	}

	/** Sobe um nível no drill (chamado pelo HUD "subir um nível"). */
	export function drillUp() {
		if (!solar?.isDrilled()) { deselectPlanet(); return; }
		const stillDrilled = solar.drillUp();
		if (stillDrilled) {
			transitionToDrill();
		} else {
			// Voltou às luas do tópico: reenquadra como no selectPlanet.
			const id = solar.selectedPlanetId;
			if (id) {
				const extent = solar.moonsExtent(id);
				const dist   = Math.max(55, Math.min(200, extent * 1.8 + 30));
				orbitalCam.focusOn(new THREE.Vector3(0, 0, 0), dist);
			}
		}
		emitNav();
	}

	// ── Seleção de planeta ──────────────────────────────────────────────────────
	function selectPlanet(id) {
		if (solar.selectedPlanetId === id) { deselectPlanet(); return; }
		if (solar.selectedPlanetId) solar.removeMoons(solar.selectedPlanetId);
		if (!solar.planets[id]) return;

		// Oculta o resto do sistema e fixa o planeta no centro (0,0,0)
		solar.enterFocus(id);

		const extent  = solar.moonsExtent(id);        // maior raio de lua
		const MIN_D   = 55;                            // planeta sem/poucas luas
		const MAX_D   = 200;                           // teto para não afastar demais
		const dist    = Math.max(MIN_D, Math.min(MAX_D, extent * 1.8 + 30));

		orbitalCam.focusOn(new THREE.Vector3(0, 0, 0), dist);
		// Com os shaders pré-compilados (warmup) e a criação incremental
		// (poucas luas por frame), não há mais o pico de trabalho que travava o
		// clique — as luas podem começar a surgir já no próximo frame, enquanto
		// a câmera faz o foco. Sem o setTimeout de 200ms.
		solar.buildMoons(id);
		onFocusChange?.(true);
		emitNav();
	}

	function deselectPlanet() {
		solar.exitFocus();
		orbitalCam.reset(180);
		onFocusChange?.(false);
		emitNav();
	}

	// ── Resize / reatividade / lifecycle ────────────────────────────────────────
	function setupResize() {
		resizeObserver = new ResizeObserver(entries => {
			for (const { contentRect } of entries) {
				const { width, height } = contentRect;
				if (!width || !height) return;
				renderer.setSize(width, height, false);
				composer?.setSize(width, height);
				bloomPass?.setSize(width, height);
				orbitalCam.setAspect(width / height);
			}
		});
		resizeObserver.observe(containerEl);
	}

	// Guard: reconstrói só quando o conjunto de tracks muda de verdade.
	// Sem isso, o build do initThree + o build do $effect rodavam os dois no
	// mount e desenhavam DOIS sistemas sobrepostos.
	$effect(() => {
		if (!solar || tracks.length === 0) return;
		const key = tracks.map(t => t.id).join('|');
		if (key === builtKey) return;
		builtKey = key;
		solar.build(tracks);
		// Reaquece os shaders após reconstruir (o clear() descarta materiais).
		if (renderer && orbitalCam) solar.warmup(renderer, orbitalCam.camera);
	});

	export function setTrackTopics(trackId, topics) {
		solar?.setTopics(trackId, topics);
	}

	onMount(() => {
		initThree();
		setupResize();
		document.addEventListener('visibilitychange', onVisibilityChange);
	});
	onDestroy(() => {
		document.removeEventListener('visibilitychange', onVisibilityChange);
		if (animId != null) cancelAnimationFrame(animId);
		resizeObserver?.disconnect();
		composer?.dispose?.();
		renderer?.dispose();
	});
</script>

<div bind:this={containerEl} style="width:100%; height:100%; position:relative; overflow:hidden;">
	<canvas
		bind:this={canvasEl}
		style="width:100%; height:100%; display:block; cursor:grab;"
		onwheel={onWheel}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointerleave={() => { pointer.down = false; }}
		oncontextmenu={e => e.preventDefault()}
	></canvas>

</div>
