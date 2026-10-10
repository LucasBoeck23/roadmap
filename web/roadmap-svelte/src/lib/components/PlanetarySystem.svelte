<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitalCamera } from '$lib/planetarium/camera.js';
	import { SolarSystem }   from '$lib/planetarium/scene.js';

	let { tracks = [], onTopicSelect } = $props();

	// ── DOM / Three core ───────────────────────────────────────────────────────
	let containerEl = $state(null);
	let canvasEl    = $state(null);
	let renderer, scene, orbitalCam, solar, animId;
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
		renderer.setClearColor(0x00000c);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		scene = new THREE.Scene();
		orbitalCam = new OrbitalCamera(w / h);

		scene.add(new THREE.AmbientLight(0x334466, 1.2));
		const starLight = new THREE.PointLight(0xfff5e0, 6, 1200, 1.2);
		starLight.castShadow = false;
		scene.add(starLight);

		solar = new SolarSystem(scene);
		solar.starLight = starLight;
		if (tracks.length) solar.build(tracks);

		animate();
	}

	function animate() {
		animId = requestAnimationFrame(animate);
		const dt = clock.getDelta();
		const t  = clock.getElapsedTime();
		solar.update(dt, t);        // simulação
		orbitalCam.lerp(dt);        // câmera
		renderer.render(scene, orbitalCam.camera);
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
		// Câmera foca no centro, onde o planeta agora está
		orbitalCam.focusOn(new THREE.Vector3(0, 0, 0), 70);
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
				orbitalCam.setAspect(width / height);
			}
		});
		resizeObserver.observe(containerEl);
	}

	$effect(() => {
		if (!solar || tracks.length === 0) return;
		solar.build(tracks);
	});

	export function setTrackTopics(trackId, topics) {
		solar?.setTopics(trackId, topics);
	}

	onMount(() => { initThree(); setupResize(); });
	onDestroy(() => {
		cancelAnimationFrame(animId);
		resizeObserver?.disconnect();
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

	<div style="
		position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
		font-family:'JetBrains Mono',monospace; font-size:11px;
		color:rgba(150,170,210,0.45); pointer-events:none; white-space:nowrap;
	">
		arrastar → orbitar &nbsp;·&nbsp; shift+arrastar → pan &nbsp;·&nbsp; scroll → zoom &nbsp;·&nbsp; clique → selecionar
	</div>
</div>
