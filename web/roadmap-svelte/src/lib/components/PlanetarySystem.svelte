<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';

	let { tracks = [], onTopicSelect } = $props();

	// ── DOM / Three ───────────────────────────────────────────────────────────
	let canvasEl   = $state(null);
	let renderer, scene, camera, animId;
	let raycaster  = new THREE.Raycaster();
	let mouse      = new THREE.Vector2();

	// ── Câmera (top-down, eixo Z) ─────────────────────────────────────────────
	const CAM_Z_DEFAULT = 120;
	const CAM_Z_MIN     = 20;
	const CAM_Z_MAX     = 300;
	let camTarget = new THREE.Vector3(0, 0, 0); // ponto de foco do pan

	// ── Estado de navegação ───────────────────────────────────────────────────
	// null = sistema solar, trackId = dentro de um planeta
	let activeTrackId = $state(null);

	// ── Objetos 3D ────────────────────────────────────────────────────────────
	// Guarda referências para raycasting e animação
	let clickables  = []; // { mesh, data: { type:'planet'|'moon', track, topic } }
	let orbitGroups = []; // { group, speed, radius } para animar

	// ── Drag / Pan ────────────────────────────────────────────────────────────
	let isDragging  = false;
	let dragStart   = { x: 0, y: 0 };
	let camPanStart = new THREE.Vector3();

	// ── Cores por status ──────────────────────────────────────────────────────
	const STATUS_COLOR = {
		'concluido':    0xf0d060,
		'em-progresso': 0xe8a040,
		'nao-iniciado': 0x6a7fa8
	};

	// Paleta de cores para planetas (por track index)
	const PLANET_COLORS = [0x4a88c7, 0x02a8b8, 0xa850c8, 0x50c878, 0xc85050];

	// ── Setup Three.js ────────────────────────────────────────────────────────
	function initThree() {
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;

		// Renderer
		renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000008);

		// Scene
		scene = new THREE.Scene();

		// Câmera orthográfica top-down (eixo Z para cima)
		const aspect = w / h;
		camera = new THREE.OrthographicCamera(
			-CAM_Z_DEFAULT * aspect,
			 CAM_Z_DEFAULT * aspect,
			 CAM_Z_DEFAULT,
			-CAM_Z_DEFAULT,
			0.1, 1000
		);
		camera.position.set(0, 0, 500);
		camera.lookAt(0, 0, 0);
		camera.up.set(0, 1, 0);

		buildStarfield();
		buildSolarSystem();
		animate();
	}

	// ── Starfield ─────────────────────────────────────────────────────────────
	function buildStarfield() {
		const geo = new THREE.BufferGeometry();
		const count = 1800;
		const positions = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			positions[i * 3 + 0] = (Math.random() - 0.5) * 2000;
			positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
			positions[i * 3 + 2] = -1;
		}
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: false });
		scene.add(new THREE.Points(geo, mat));
	}

	// ── Sistema solar (tracks como planetas) ──────────────────────────────────
	function buildSolarSystem() {
		// Limpa objetos anteriores (exceto starfield)
		clickables = [];
		orbitGroups = [];
		scene.children
			.filter(o => o.userData.removable)
			.forEach(o => scene.remove(o));

		// Anã branca central
		const starGeo = new THREE.CircleGeometry(10, 64);
		const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
		const starMesh = new THREE.Mesh(starGeo, starMat);
		starMesh.userData.removable = true;

		// Halo da estrela
		const haloGeo = new THREE.CircleGeometry(15, 64);
		const haloMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.15 });
		const haloMesh = new THREE.Mesh(haloGeo, haloMat);
		haloMesh.userData.removable = true;
		scene.add(haloMesh);
		scene.add(starMesh);

		// Planetas (uma por track)
		tracks.forEach((track, idx) => {
			const orbitRadius = 45 + idx * 35;
			const color = PLANET_COLORS[idx % PLANET_COLORS.length];

			// Órbita (linha pontilhada)
			const orbitGeo = new THREE.BufferGeometry();
			const pts = [];
			for (let i = 0; i <= 128; i++) {
				const a = (i / 128) * Math.PI * 2;
				pts.push(new THREE.Vector3(Math.cos(a) * orbitRadius, Math.sin(a) * orbitRadius, 0));
			}
			orbitGeo.setFromPoints(pts);
			const orbitLine = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.5 }));
			orbitLine.userData.removable = true;
			scene.add(orbitLine);

			// Planeta
			const pGeo  = new THREE.CircleGeometry(8, 48);
			const pMat  = new THREE.MeshBasicMaterial({ color });
			const pMesh = new THREE.Mesh(pGeo, pMat);

			// Halo do planeta
			const phGeo = new THREE.CircleGeometry(11, 48);
			const phMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 });
			const phMesh = new THREE.Mesh(phGeo, phMat);

			// Grupo que orbita
			const orbitGroup = new THREE.Group();
			orbitGroup.userData.removable = true;
			orbitGroup.add(phMesh);
			orbitGroup.add(pMesh);
			// Posição inicial espalhada
			orbitGroup.position.set(orbitRadius, 0, 0);
			orbitGroup.rotation.z = (idx / tracks.length) * Math.PI * 2;

			// Label (sprite de canvas 2D)
			const labelSprite = makeTextSprite(track.nome, color);
			labelSprite.position.set(0, -14, 0);
			orbitGroup.add(labelSprite);

			const pivot = new THREE.Group();
			pivot.userData.removable = true;
			pivot.rotation.z = (idx / tracks.length) * Math.PI * 2;
			pivot.add(orbitGroup);
			scene.add(pivot);

			orbitGroups.push({ pivot, speed: 0.0003 + idx * 0.00008, radius: orbitRadius });
			clickables.push({ mesh: pMesh, data: { type: 'planet', track } });

			pMesh.userData.trackId = track.id;
		});
	}

	// ── Sistema de luas (tópicos de uma track) ────────────────────────────────
	function buildMoonSystem(track, topics) {
		// Limpa tudo removable
		clickables = [];
		orbitGroups = [];
		scene.children
			.filter(o => o.userData.removable)
			.forEach(o => scene.remove(o));

		// Planeta central (a track selecionada)
		const color = PLANET_COLORS[tracks.findIndex(t => t.id === track.id) % PLANET_COLORS.length];
		const cGeo  = new THREE.CircleGeometry(14, 64);
		const cMat  = new THREE.MeshBasicMaterial({ color });
		const cMesh = new THREE.Mesh(cGeo, cMat);
		cMesh.userData.removable = true;

		const chGeo = new THREE.CircleGeometry(20, 64);
		const chMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 });
		const chMesh = new THREE.Mesh(chGeo, chMat);
		chMesh.userData.removable = true;
		scene.add(chMesh);
		scene.add(cMesh);

		// Label do planeta
		const lbl = makeTextSprite(track.nome, color);
		lbl.position.set(0, -26, 0);
		lbl.userData.removable = true;
		scene.add(lbl);

		// Botão voltar (texto sprite)
		const backSprite = makeTextSprite('← Sistema Solar', 0x8899bb, 12);
		backSprite.position.set(-80, 90, 0);
		backSprite.userData.removable = true;
		backSprite.userData.isBack = true;
		scene.add(backSprite);
		clickables.push({ mesh: backSprite, data: { type: 'back' } });

		// Luas (tópicos)
		topics.forEach((topic, idx) => {
			const orbitRadius = 35 + Math.floor(idx / 6) * 30;
			const angleStep   = (Math.PI * 2) / Math.min(topics.length, 6 + Math.floor(idx / 6) * 3);
			const angle       = idx * angleStep;
			const moonColor   = STATUS_COLOR[topic.status] ?? 0x6a7fa8;

			// Órbita
			const oGeo = new THREE.BufferGeometry();
			const pts  = [];
			for (let i = 0; i <= 96; i++) {
				const a = (i / 96) * Math.PI * 2;
				pts.push(new THREE.Vector3(Math.cos(a) * orbitRadius, Math.sin(a) * orbitRadius, 0));
			}
			oGeo.setFromPoints(pts);
			const oLine = new THREE.Line(oGeo, new THREE.LineBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.4 }));
			oLine.userData.removable = true;
			scene.add(oLine);

			// Lua
			const mGeo  = new THREE.CircleGeometry(5, 32);
			const mMat  = new THREE.MeshBasicMaterial({ color: moonColor });
			const mMesh = new THREE.Mesh(mGeo, mMat);

			const mhGeo = new THREE.CircleGeometry(7, 32);
			const mhMat = new THREE.MeshBasicMaterial({ color: moonColor, transparent: true, opacity: 0.25 });
			const mhMesh = new THREE.Mesh(mhGeo, mMat);

			const orbitGroup = new THREE.Group();
			orbitGroup.userData.removable = true;
			orbitGroup.add(mhMesh);
			orbitGroup.add(mMesh);
			orbitGroup.position.set(
				Math.cos(angle) * orbitRadius,
				Math.sin(angle) * orbitRadius,
				0
			);

			// Label da lua
			const moonLabel = makeTextSprite(topic.nome, moonColor, 10);
			moonLabel.position.set(0, -10, 0);
			orbitGroup.add(moonLabel);

			const pivot = new THREE.Group();
			pivot.userData.removable = true;
			pivot.add(orbitGroup);
			scene.add(pivot);

			const speed = 0.0002 + (idx % 3) * 0.0001;
			orbitGroups.push({ pivot, speed, radius: orbitRadius, angle });
			clickables.push({ mesh: mMesh, data: { type: 'moon', track, topic } });
		});
	}

	// ── Sprite de texto (canvas 2D → texture) ─────────────────────────────────
	function makeTextSprite(text, color = 0xffffff, fontSize = 14) {
		const canvas  = document.createElement('canvas');
		canvas.width  = 256;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');

		// Cor hex → rgb string
		const r = (color >> 16) & 0xff;
		const g = (color >>  8) & 0xff;
		const b =  color        & 0xff;

		ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
		ctx.fillStyle = `rgb(${r},${g},${b})`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, 128, 32);

		const tex = new THREE.CanvasTexture(canvas);
		const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
		const spr = new THREE.Sprite(mat);
		spr.scale.set(40, 10, 1);
		return spr;
	}

	// ── Loop de animação ──────────────────────────────────────────────────────
	let clock = new THREE.Clock();

	function animate() {
		animId = requestAnimationFrame(animate);
		const t = clock.getElapsedTime();

		// Orbitar grupos
		orbitGroups.forEach(({ pivot, speed }) => {
			pivot.rotation.z += speed;
		});

		// Pulso sutil da estrela / planeta central
		const scale = 1 + Math.sin(t * 1.5) * 0.02;
		const star = scene.children.find(o => o.isMesh && o.geometry?.type === 'CircleGeometry' && !o.userData.removable);
		if (star) star.scale.setScalar(scale);

		renderer.render(scene, camera);
	}

	// ── Resize ────────────────────────────────────────────────────────────────
	function onResize() {
		if (!canvasEl || !renderer || !camera) return;
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		renderer.setSize(w, h);
		const aspect = w / h;
		const z = camera.top; // usa o top atual como zoom
		camera.left   = -z * aspect;
		camera.right  =  z * aspect;
		camera.updateProjectionMatrix();
	}

	// ── Zoom (scroll) ─────────────────────────────────────────────────────────
	function onWheel(e) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 1.1 : 0.9;
		const newZ = Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, camera.top * factor));
		const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
		camera.left   = -newZ * aspect;
		camera.right  =  newZ * aspect;
		camera.top    =  newZ;
		camera.bottom = -newZ;
		camera.updateProjectionMatrix();
	}

	// ── Pan (drag) ────────────────────────────────────────────────────────────
	function onPointerDown(e) {
		isDragging  = true;
		dragStart   = { x: e.clientX, y: e.clientY };
		camPanStart = camera.position.clone();
	}

	function onPointerMove(e) {
		if (!isDragging) return;
		const dx = e.clientX - dragStart.x;
		const dy = e.clientY - dragStart.y;
		// Converte pixels em unidades de mundo
		const worldUnitsPerPx = (camera.right - camera.left) / canvasEl.clientWidth;
		camera.position.x = camPanStart.x - dx * worldUnitsPerPx;
		camera.position.y = camPanStart.y + dy * worldUnitsPerPx;
	}

	function onPointerUp(e) {
		const dx = Math.abs(e.clientX - dragStart.x);
		const dy = Math.abs(e.clientY - dragStart.y);
		isDragging = false;
		// Só dispara click se não houve drag significativo
		if (dx < 4 && dy < 4) handleClick(e);
	}

	// ── Click / raycasting ────────────────────────────────────────────────────
	function handleClick(e) {
		const rect = canvasEl.getBoundingClientRect();
		mouse.x =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
		mouse.y = -((e.clientY - rect.top)   / rect.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);
		const meshes = clickables.map(c => c.mesh);
		const hits   = raycaster.intersectObjects(meshes, false);

		if (hits.length === 0) return;
		const hit  = hits[0].object;
		const item = clickables.find(c => c.mesh === hit);
		if (!item) return;

		if (item.data.type === 'back') {
			goToSolarSystem();
		} else if (item.data.type === 'planet') {
			goToPlanet(item.data.track);
		} else if (item.data.type === 'moon') {
			onTopicSelect?.(item.data.topic);
		}
	}

	// ── Navegação ─────────────────────────────────────────────────────────────
	async function goToPlanet(track) {
		activeTrackId = track.id;
		// Centraliza câmera
		camera.position.set(0, 0, 500);
		const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
		const z = 80;
		camera.left = -z * aspect; camera.right = z * aspect;
		camera.top = z; camera.bottom = -z;
		camera.updateProjectionMatrix();

		// Busca tópicos via callback do pai
		const topics = track._topics ?? [];
		buildMoonSystem(track, topics);
	}

	function goToSolarSystem() {
		activeTrackId = null;
		camera.position.set(0, 0, 500);
		const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
		camera.left = -CAM_Z_DEFAULT * aspect; camera.right = CAM_Z_DEFAULT * aspect;
		camera.top = CAM_Z_DEFAULT; camera.bottom = -CAM_Z_DEFAULT;
		camera.updateProjectionMatrix();
		buildSolarSystem();
	}

	// ── Atualiza tópicos quando tracks mudam ──────────────────────────────────
	$effect(() => {
		if (!scene || tracks.length === 0) return;
		buildSolarSystem();
	});

	// Expõe função para o pai injetar tópicos numa track
	export function setTrackTopics(trackId, topics) {
		const track = tracks.find(t => t.id === trackId);
		if (track) {
			track._topics = topics;
			if (activeTrackId === trackId) buildMoonSystem(track, topics);
		}
	}

	// ── Mount / Destroy ───────────────────────────────────────────────────────
	onMount(() => {
		initThree();
		window.addEventListener('resize', onResize);
	});

	onDestroy(() => {
		cancelAnimationFrame(animId);
		window.removeEventListener('resize', onResize);
		renderer?.dispose();
	});
</script>

<canvas
	bind:this={canvasEl}
	style="width:100%;height:100%;display:block;cursor:grab;"
	onwheel={onWheel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointerleave={() => isDragging = false}
></canvas>
