<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';

	let { tracks = [], onTopicSelect } = $props();

	// ── DOM / Three core ───────────────────────────────────────────────────────
	let containerEl = $state(null);
	let canvasEl    = $state(null);
	let renderer, scene, camera, starLight, animId;
	let clock = new THREE.Clock();

	// ── Constantes ─────────────────────────────────────────────────────────────
	const PLANET_COLORS = [0x4a88c7, 0x02c8b8, 0xa050d8, 0x50d878, 0xd85050, 0xd8a030];
	const STATUS_STYLE = {
		'concluido':    { color: 0xd4b040, ei: 0.7 },
		'em-progresso': { color: 0xd08030, ei: 0.5 },
		'nao-iniciado': { color: 0x3a4a6a, ei: 0.0 }
	};

	// ════════════════════════════════════════════════════════════════════════
	// SISTEMA 1 — CÂMERA ORBITAL (azimuth, elevation, distance, target)
	// ════════════════════════════════════════════════════════════════════════
	const cam = {
		azimuth: Math.PI / 6, elevation: Math.PI / 3.5, distance: 180,
		target: new THREE.Vector3(0, 0, 0),
		// alvos para interpolação suave
		targetAzimuth: Math.PI / 6, targetElevation: Math.PI / 3.5,
		targetDistance: 180, targetPos: new THREE.Vector3(0, 0, 0),
		// limites
		minElevation: 0.08, maxElevation: Math.PI / 2 - 0.04,
		minDistance: 30, maxDistance: 600
	};

	/** Deriva camera.position a partir dos parâmetros orbitais */
	function applyCameraState() {
		const { azimuth, elevation, distance, target } = cam;
		camera.position.set(
			target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
			target.y + distance * Math.sin(elevation),
			target.z + distance * Math.cos(elevation) * Math.cos(azimuth)
		);
		camera.lookAt(target);
	}

	/** Interpola a câmera em direção aos valores alvo (independente de framerate) */
	function lerpCamera(dt) {
		const k = 1 - Math.pow(0.001, dt);
		cam.azimuth   += (cam.targetAzimuth   - cam.azimuth)   * k;
		cam.elevation += (cam.targetElevation - cam.elevation) * k;
		cam.distance  += (cam.targetDistance  - cam.distance)  * k;
		cam.target.lerp(cam.targetPos, k);
	}

	// ════════════════════════════════════════════════════════════════════════
	// SISTEMA 2 — SIMULAÇÃO ORBITAL (determinística, não depende da câmera)
	// ════════════════════════════════════════════════════════════════════════
	const planetData = {};  // trackId → { angle, mesh, label, orbitLine, radius, speed, inclination, track, topics }
	const moonData   = {};  // "trackId::idx" → { angle, mesh, label, orbitLine, radius, speed, inclination, topic }

	/** Posição 3D de um corpo numa órbita circular inclinada ao redor de `center` */
	function orbitalPosition(angle, radius, inclination, center = new THREE.Vector3()) {
		const lx = Math.cos(angle) * radius;
		const lz = Math.sin(angle) * radius;
		return new THREE.Vector3(
			center.x + lx,
			center.y + lz * Math.sin(inclination),
			center.z + lz * Math.cos(inclination)
		);
	}

	/** Gera os pontos de uma órbita (reutilizado na criação e na atualização das luas) */
	function orbitPoints(radius, inclination, center, steps = 180) {
		const pts = [];
		for (let i = 0; i <= steps; i++) {
			pts.push(orbitalPosition((i / steps) * Math.PI * 2, radius, inclination, center));
		}
		return pts;
	}

	function makeOrbitLine(radius, inclination, center = new THREE.Vector3(), color = 0x2a4466) {
		const geo = new THREE.BufferGeometry().setFromPoints(orbitPoints(radius, inclination, center));
		return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }));
	}

	// ════════════════════════════════════════════════════════════════════════
	// SISTEMA 3 — SELEÇÃO / INTERFACE
	// ════════════════════════════════════════════════════════════════════════
	let selectedPlanetId = $state(null);
	let planetFocused    = false;
	let raycaster = new THREE.Raycaster();
	let mouseVec  = new THREE.Vector2();
	let clickables = []; // { mesh, type, id, topic }

	// ── Texturas procedurais (canvas 2D) ───────────────────────────────────────
	function makePlanetTex(hex, size = 256) {
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d');
		const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
		ctx.fillStyle = `rgb(${r},${g},${b})`;
		ctx.fillRect(0, 0, size, size);
		for (let i = 0; i < 12; i++) {  // faixas atmosféricas
			const y = (i / 12) * size, h = size / 12 + Math.random() * 10;
			ctx.fillStyle = `rgba(${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},${0.05+Math.random()*0.09})`;
			ctx.fillRect(0, y, size, h);
		}
		for (let i = 0; i < 16; i++) {  // manchas
			ctx.beginPath();
			ctx.ellipse(Math.random()*size, Math.random()*size, 5+Math.random()*22, 3+Math.random()*12, Math.random()*Math.PI, 0, Math.PI*2);
			ctx.fillStyle = `rgba(255,255,255,${0.03+Math.random()*0.07})`;
			ctx.fill();
		}
		return new THREE.CanvasTexture(c);
	}

	function makeStarTex(size = 256) {
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d');
		const g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
		g.addColorStop(0,   'rgba(255,255,255,1)');
		g.addColorStop(0.3, 'rgba(245,250,255,1)');
		g.addColorStop(0.7, 'rgba(180,215,255,0.7)');
		g.addColorStop(1,   'rgba(100,160,255,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, size, size);
		return new THREE.CanvasTexture(c);
	}

	function makeTextSprite(text, hex = 0xffffff, fs = 13) {
		const c = document.createElement('canvas');
		c.width = 320; c.height = 64;
		const ctx = c.getContext('2d');
		const r = (hex>>16)&0xff, g = (hex>>8)&0xff, b = hex&0xff;
		ctx.font = `${fs}px 'JetBrains Mono',monospace`;
		ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText(text, 160, 32);
		const spr = new THREE.Sprite(new THREE.SpriteMaterial({
			map: new THREE.CanvasTexture(c), transparent: true, depthTest: false
		}));
		spr.scale.set(50, 12, 1);
		return spr;
	}

	// ── Helper: libera geometria e materiais de um objeto e remove da cena ──────
	function disposeObject(o) {
		o.traverse(c => {
			c.geometry?.dispose();
			[c.material].flat().forEach(m => m?.dispose());
		});
		scene.remove(o);
	}

	// ════════════════════════════════════════════════════════════════════════
	// CONSTRUÇÃO DA CENA
	// ════════════════════════════════════════════════════════════════════════
	function initThree() {
		const w = containerEl.clientWidth, h = containerEl.clientHeight;

		renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
		renderer.setSize(w, h, false);
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.setClearColor(0x00000c);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 3000);
		applyCameraState();

		scene.add(new THREE.AmbientLight(0x334466, 1.2));
		starLight = new THREE.PointLight(0xfff5e0, 6, 1200, 1.2);
		starLight.castShadow = false;
		scene.add(starLight);

		buildStarfield();
		buildSolarSystem();
		animate();
	}

	function buildStarfield() {
		const n = 3000, pos = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			pos[i*3]   = (Math.random()-.5) * 4000;
			pos[i*3+1] = (Math.random()-.5) * 2000;
			pos[i*3+2] = (Math.random()-.5) * 4000;
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: false })));
	}

	function clearSolarSystem() {
		scene.children.filter(o => o.userData.removable).forEach(disposeObject);
		clickables = [];
		Object.keys(planetData).forEach(k => delete planetData[k]);
		Object.keys(moonData).forEach(k => delete moonData[k]);
	}

	function buildSolarSystem() {
		clearSolarSystem();

		// Estrela: esfera branca sólida (sem textura → sem seam) + core azulado + glow
		const star = new THREE.Mesh(
			new THREE.SphereGeometry(13, 64, 64),
			new THREE.MeshBasicMaterial({ color: 0xffffff })
		);
		star.userData.removable = true;
		scene.add(star);

		const core = new THREE.Mesh(
			new THREE.SphereGeometry(11, 64, 64),
			new THREE.MeshBasicMaterial({ color: 0xe8f0ff })
		);
		core.userData.removable = true;
		scene.add(core);

		const glow = new THREE.Sprite(new THREE.SpriteMaterial({
			map: makeStarTex(256), transparent: true, opacity: 0.4,
			depthTest: false, blending: THREE.AdditiveBlending
		}));
		glow.scale.set(90, 90, 1);
		glow.userData.removable = true;
		scene.add(glow);

		// Planetas: um por track
		tracks.forEach((track, idx) => {
			const color       = PLANET_COLORS[idx % PLANET_COLORS.length];
			const radius      = 50 + idx * 42;
			const speed       = 0.0006 - idx * 0.00004;
			const inclination = (idx % 2 === 0 ? 1 : -1) * (0.08 + idx * 0.04);
			const phase       = (idx / tracks.length) * Math.PI * 2;

			const mesh = new THREE.Mesh(
				new THREE.SphereGeometry(7, 48, 48),
				new THREE.MeshStandardMaterial({
					map: makePlanetTex(color), roughness: 0.78, metalness: 0.1,
					emissive: new THREE.Color(color), emissiveIntensity: 0.18
				})
			);
			mesh.castShadow = mesh.receiveShadow = true;
			mesh.userData.removable = true;
			mesh.userData.planetId  = track.id;
			scene.add(mesh);

			const label = makeTextSprite(track.nome, color);
			label.userData.removable = true;
			scene.add(label);

			const orbitLine = makeOrbitLine(radius, inclination);
			orbitLine.userData.removable = true;
			scene.add(orbitLine);

			planetData[track.id] = {
				angle: phase, mesh, label, orbitLine,
				radius, speed, inclination, track, topics: track._topics ?? []
			};
			clickables.push({ mesh, type: 'planet', id: track.id });
		});
	}

	// Luas de um planeta — posição sempre relativa ao planeta pai
	function buildMoonSystem(trackId) {
		removeMoonSystem(trackId);
		const pd = planetData[trackId];
		if (!pd || !pd.topics.length) return;

		pd.topics.forEach((topic, idx) => {
			const ring    = Math.floor(idx / 5);
			const perRing = 5 + ring * 2;
			const radius  = 32 + ring * 26;
			const phase   = ((idx % perRing) / perRing) * Math.PI * 2;
			const speed   = (0.0015 + idx * 0.0003) * (idx % 2 ? 1 : -1);
			const inc     = (idx % 2 ? 1 : -1) * (0.05 + (idx % 3) * 0.06);
			const sc      = STATUS_STYLE[topic.status] ?? STATUS_STYLE['nao-iniciado'];

			const mesh = new THREE.Mesh(
				new THREE.SphereGeometry(3.5, 32, 32),
				new THREE.MeshStandardMaterial({
					map: makePlanetTex(sc.color, 128), roughness: 0.85,
					emissive: new THREE.Color(sc.color), emissiveIntensity: sc.ei + 0.12
				})
			);
			mesh.castShadow = true;
			mesh.userData.removable = true;
			scene.add(mesh);

			const label = makeTextSprite(topic.nome, sc.color, 10);
			label.userData.removable = true;
			scene.add(label);

			const orbitLine = makeOrbitLine(radius, inc, new THREE.Vector3(), 0x1a2a3a);
			orbitLine.userData.removable = true;
			scene.add(orbitLine);

			const key = `${trackId}::${idx}`;
			moonData[key] = { angle: phase, mesh, label, orbitLine, radius, speed, inclination: inc, topic };
			clickables.push({ mesh, type: 'moon', id: key, topic });
		});
	}

	function removeMoonSystem(trackId) {
		Object.keys(moonData).filter(k => k.startsWith(trackId + '::')).forEach(k => {
			const d = moonData[k];
			[d.mesh, d.label, d.orbitLine].forEach(disposeObject);
			clickables = clickables.filter(c => c.id !== k);
			delete moonData[k];
		});
	}

	// ════════════════════════════════════════════════════════════════════════
	// LOOP DE ANIMAÇÃO
	// ════════════════════════════════════════════════════════════════════════
	function animate() {
		animId = requestAnimationFrame(animate);
		const dt = clock.getDelta();
		const t  = clock.getElapsedTime();

		// 1. Simulação — avança ângulos e recalcula posições
		Object.values(planetData).forEach(pd => {
			pd.angle += pd.speed * dt * 60;
			const wpos = orbitalPosition(pd.angle, pd.radius, pd.inclination);
			pd.mesh.position.copy(wpos);
			pd.label.position.copy(wpos).y += 11;
			pd.mesh.rotation.y += 0.003;

			// Luas deste planeta — centro = posição atual do planeta
			Object.keys(moonData).filter(k => k.startsWith(pd.track.id + '::')).forEach(k => {
				const md = moonData[k];
				md.angle += md.speed * dt * 60;
				const mpos = orbitalPosition(md.angle, md.radius, md.inclination, wpos);
				md.mesh.position.copy(mpos);
				md.label.position.copy(mpos).y += 7;
				md.mesh.rotation.y += 0.004;

				// Órbita da lua segue o planeta — atualizada a cada 4 frames
				if (Math.round(t * 60) % 4 === 0) {
					md.orbitLine.geometry.setFromPoints(orbitPoints(md.radius, md.inclination, wpos, 120));
					md.orbitLine.geometry.attributes.position.needsUpdate = true;
				}
			});
		});

		// 2. Câmera
		lerpCamera(dt);
		applyCameraState();

		// 3. Pulso da estrela
		if (starLight) starLight.intensity = 4.5 + Math.sin(t * 1.6) * 0.3;

		renderer.render(scene, camera);
	}

	// ════════════════════════════════════════════════════════════════════════
	// INTERAÇÃO
	// ════════════════════════════════════════════════════════════════════════
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

		if (pointer.button === 2 || e.shiftKey) {
			// PAN — relativo aos vetores da câmera, projetado no plano horizontal
			const sens = cam.distance / 800;
			const right = new THREE.Vector3();
			camera.getWorldDirection(right);
			right.cross(camera.up).normalize();
			const up = camera.up.clone(); up.y = 0; up.normalize();
			cam.targetPos.addScaledVector(right, -dx * sens);
			cam.targetPos.addScaledVector(up,     dy * sens);
		} else {
			// ORBIT — rotaciona ao redor do target
			cam.targetAzimuth   -= dx * 0.005;
			cam.targetElevation += dy * 0.005;
			cam.targetElevation = Math.max(cam.minElevation, Math.min(cam.maxElevation, cam.targetElevation));
		}
	}

	function onPointerUp(e) {
		const moved = Math.abs(e.clientX - pointer.x) + Math.abs(e.clientY - pointer.y);
		pointer.down = false;
		if (moved < 5) handleClick(e);
	}

	function onWheel(e) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 1.07 : 0.93;
		cam.targetDistance = Math.max(cam.minDistance, Math.min(cam.maxDistance, cam.targetDistance * factor));
	}

	function handleClick(e) {
		const rect = canvasEl.getBoundingClientRect();
		mouseVec.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
		mouseVec.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouseVec, camera);

		const hits = raycaster.intersectObjects(clickables.map(c => c.mesh), false);
		if (!hits.length) return;
		const item = clickables.find(c => c.mesh === hits[0].object);
		if (!item) return;

		if (item.type === 'planet')    selectPlanet(item.id);
		else if (item.type === 'moon') onTopicSelect?.(item.topic);
	}

	// ════════════════════════════════════════════════════════════════════════
	// SELEÇÃO DE PLANETA (a simulação continua rodando durante a transição)
	// ════════════════════════════════════════════════════════════════════════

	/** Anima a opacidade de tudo exceto o planeta selecionado */
	function fadeSolarSystem(targetOpacity, duration = 600) {
		const targets = [];
		scene.children
			.filter(o => o.userData.removable && o.userData.planetId !== selectedPlanetId)
			.forEach(o => o.traverse(child => {
				if (!child.isMesh && !child.isLine && !child.isSprite) return;
				[child.material].flat().filter(Boolean).forEach(m => {
					if (!m.transparent) m.transparent = true;
					targets.push({ mat: m, from: m.opacity ?? 1, to: targetOpacity });
				});
			}));

		const start = performance.now();
		(function step(now) {
			const t = Math.min((now - start) / duration, 1);
			const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t) * t;
			targets.forEach(({ mat, from, to }) => { mat.opacity = from + (to - from) * ease; });
			if (t < 1) requestAnimationFrame(step);
		})(start);
	}

	function selectPlanet(id) {
		if (selectedPlanetId === id) { deselectPlanet(); return; }
		if (selectedPlanetId) removeMoonSystem(selectedPlanetId);

		selectedPlanetId = id;
		planetFocused    = true;
		if (!planetData[id]) return;

		fadeSolarSystem(0, 500);
		cam.targetPos.set(0, 0, 0);
		cam.targetDistance  = 120;
		cam.targetElevation = Math.max(0.35, cam.elevation);
		setTimeout(() => buildMoonSystem(id), 300);
	}

	function deselectPlanet() {
		if (selectedPlanetId) removeMoonSystem(selectedPlanetId);
		selectedPlanetId = null;
		planetFocused    = false;
		fadeSolarSystem(1, 600);
		cam.targetPos.set(0, 0, 0);
		cam.targetDistance = 180;
	}

	// ════════════════════════════════════════════════════════════════════════
	// RESIZE / REATIVIDADE / LIFECYCLE
	// ════════════════════════════════════════════════════════════════════════
	let resizeObserver;

	function setupResize() {
		resizeObserver = new ResizeObserver(entries => {
			for (const { contentRect } of entries) {
				const { width, height } = contentRect;
				if (!width || !height) return;
				renderer.setSize(width, height, false);
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
			}
		});
		resizeObserver.observe(containerEl);
	}

	$effect(() => {
		if (!scene || tracks.length === 0) return;
		buildSolarSystem();
	});

	export function setTrackTopics(trackId, topics) {
		const pd = planetData[trackId];
		if (!pd) return;
		pd.topics = topics;
		if (selectedPlanetId === trackId) buildMoonSystem(trackId);
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
