<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { EffectComposer }   from 'three/examples/jsm/postprocessing/EffectComposer.js';
	import { RenderPass }       from 'three/examples/jsm/postprocessing/RenderPass.js';
	import { UnrealBloomPass }  from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
	import { OutputPass }       from 'three/examples/jsm/postprocessing/OutputPass.js';
	import { OrbitalCamera } from '$lib/planetarium/camera.js';
	import { SolarSystem }   from '$lib/planetarium/scene.js';

	let { tracks = [], onTopicSelect } = $props();

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

		renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
		renderer.setSize(w, h, false);
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.setClearColor(0x000000);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
		composer = new EffectComposer(renderer);
		composer.setSize(w, h);
		composer.setPixelRatio(Math.min(devicePixelRatio, 2));
		composer.addPass(new RenderPass(scene, orbitalCam.camera));
		// strength, radius, threshold — bloom sutil só na auréola, sem estourar o centro
		bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.5, 0.9);
		composer.addPass(bloomPass);
		composer.addPass(new OutputPass());

		animate();
	}

	function animate() {
		animId = requestAnimationFrame(animate);
		const dt = clock.getDelta();
		const t  = clock.getElapsedTime();
		solar.update(dt, t);        // simulação + ciclo do sol
		orbitalCam.lerp(dt);        // câmera
		composer.render();          // render com bloom
	}

	// ── Interação ──────────────────────────────────────────────────────────────
	let pointer = { down: false, x: 0, y: 0, button: 0 };

	function onPointerDown(e) {
		pointer.down = true;
		pointer.x = e.clientX; pointer.y = e.clientY;
		pointer.button = e.button;
	}

	function onPointerMove(e) {
		if (!pointer.down) return;
		const dx = e.clientX - pointer.x;
		const dy = e.clientY - pointer.y;
		pointer.x = e.clientX; pointer.y = e.clientY;

		if (pointer.button === 2 || e.shiftKey) orbitalCam.pan(dx, dy);
		else                                     orbitalCam.orbit(dx, dy);
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
		if (item.type === 'planet')    selectPlanet(item.id);
		else if (item.type === 'moon') onTopicSelect?.(item.topic);
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
		setTimeout(() => solar.buildMoons(id), 200);
	}

	function deselectPlanet() {
		if (solar.selectedPlanetId) solar.removeMoons(solar.selectedPlanetId);
		solar.exitFocus();
		orbitalCam.reset(180);
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
	});

	export function setTrackTopics(trackId, topics) {
		solar?.setTopics(trackId, topics);
	}

	onMount(() => { initThree(); setupResize(); });
	onDestroy(() => {
		cancelAnimationFrame(animId);
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
