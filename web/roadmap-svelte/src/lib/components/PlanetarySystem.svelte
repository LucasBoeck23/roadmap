<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';

	let { tracks = [], onTopicSelect } = $props();

	// ─────────────────────────────────────────────────────────────────────────
	// DOM
	// ─────────────────────────────────────────────────────────────────────────
	let containerEl = $state(null);
	let canvasEl    = $state(null);

	// ─────────────────────────────────────────────────────────────────────────
	// Three.js core
	// ─────────────────────────────────────────────────────────────────────────
	let renderer, scene, camera;
	let animId;
	let clock = new THREE.Clock();

	// ─────────────────────────────────────────────────────────────────────────
	// SISTEMA 1 — CÂMERA ORBITAL
	// Separado completamente da simulação.
	// A câmera é definida por (azimuth, elevation, distance, target).
	// A posição é derivada desses parâmetros a cada frame.
	// ─────────────────────────────────────────────────────────────────────────
	const cam = {
		azimuth:   Math.PI / 6,      // ângulo horizontal (radianos)
		elevation: Math.PI / 3.5,    // ângulo vertical — começa em perspectiva
		distance:  180,              // distância ao target
		target:    new THREE.Vector3(0, 0, 0),

		// Valores alvo para interpolação suave
		targetAzimuth:   Math.PI / 6,
		targetElevation: Math.PI / 3.5,
		targetDistance:  180,
		targetPos:       new THREE.Vector3(0, 0, 0),

		// Limites
		minElevation: 0.08,    // evita atravessar o plano
		maxElevation: Math.PI / 2 - 0.04,
		minDistance:  30,
		maxDistance:  600,
	};

	/** Recalcula camera.position a partir dos parâmetros orbitais */
	function applyCameraState() {
		const { azimuth, elevation, distance, target } = cam;
		camera.position.set(
			target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
			target.y + distance * Math.sin(elevation),
			target.z + distance * Math.cos(elevation) * Math.cos(azimuth)
		);
		camera.lookAt(target);
	}

	/** Interpola câmera em direção aos valores alvo */
	function lerpCamera(dt) {
		const k = 1 - Math.pow(0.001, dt); // suavidade independente de framerate
		cam.azimuth   += (cam.targetAzimuth   - cam.azimuth)   * k;
		cam.elevation += (cam.targetElevation - cam.elevation) * k;
		cam.distance  += (cam.targetDistance  - cam.distance)  * k;
		cam.target.lerp(cam.targetPos, k);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// SISTEMA 2 — SIMULAÇÃO ORBITAL
	// Determinística. Cada corpo tem seus próprios parâmetros.
	// A câmera nunca influencia a posição dos corpos.
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Calcula a posição world de um corpo em órbita circular inclinada.
	 * @param {number} angle       - ângulo atual da órbita (radianos)
	 * @param {number} radius      - raio orbital
	 * @param {number} inclination - inclinação do plano orbital (radianos)
	 * @param {THREE.Vector3} center - posição do corpo pai
	 * @returns {THREE.Vector3}
	 */
	function orbitalPosition(angle, radius, inclination, center = new THREE.Vector3()) {
		// Posição local no plano da órbita (antes da inclinação)
		const lx = Math.cos(angle) * radius;
		const lz = Math.sin(angle) * radius;

		// Aplica inclinação: rotação em torno do eixo X do plano orbital
		// y_world = lz * sin(inclination)
		// z_world = lz * cos(inclination) — mantém lx inalterado
		return new THREE.Vector3(
			center.x + lx,
			center.y + lz * Math.sin(inclination),
			center.z + lz * Math.cos(inclination)
		);
	}

	// Dados orbitais de cada planeta (indexado por track.id)
	const planetData = {};   // { angle, mesh, labelSprite, orbitLine, radius, speed, inclination, phase }
	// Dados das luas de cada planeta (indexado por track.id → array)
	const moonData   = {};   // { angle, mesh, labelSprite, radius, speed, inclination, phase, topic }

	const PLANET_COLORS = [0x4a88c7, 0x02c8b8, 0xa050d8, 0x50d878, 0xd85050, 0xd8a030];

	const STATUS_STYLE = {
		'concluido':    { color: 0xd4b040, emissive: 0x3a2800, ei: 0.7 },
		'em-progresso': { color: 0xd08030, emissive: 0x2a1200, ei: 0.5 },
		'nao-iniciado': { color: 0x3a4a6a, emissive: 0x000000, ei: 0.0 },
	};

	// ─────────────────────────────────────────────────────────────────────────
	// SISTEMA 3 — INTERFACE / SELEÇÃO
	// Separado da simulação. Apenas lê posições dos objetos.
	// ─────────────────────────────────────────────────────────────────────────
	let selectedPlanetId = $state(null);
	let planetFocused    = false; // true quando em modo foco (sistema solar oculto)
	let raycaster = new THREE.Raycaster();
	let mouseVec  = new THREE.Vector2();
	let clickableMeshes = []; // { mesh, type: 'planet'|'moon'|'back', id, topic }

	// ─────────────────────────────────────────────────────────────────────────
	// Texturas procedurais
	// ─────────────────────────────────────────────────────────────────────────
	function makePlanetTex(hex, size = 256) {
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d');
		const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
		ctx.fillStyle = `rgb(${r},${g},${b})`;
		ctx.fillRect(0, 0, size, size);
		// faixas atmosféricas
		for (let i = 0; i < 12; i++) {
			const y = (i / 12) * size, h = size / 12 + Math.random() * 10;
			ctx.fillStyle = `rgba(${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},${0.05+Math.random()*0.09})`;
			ctx.fillRect(0, y, size, h);
		}
		// manchas
		for (let i = 0; i < 16; i++) {
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
			map: new THREE.CanvasTexture(c),
			transparent: true, depthTest: false
		}));
		spr.scale.set(50, 12, 1);
		return spr;
	}

	/**
	 * Constrói geometria de órbita respeitando a inclinação real do planeta.
	 * Os pontos são calculados com a mesma função orbitalPosition(),
	 * garantindo que o planeta esteja sempre sobre a linha.
	 */
	function makeOrbitLine(radius, inclination, center = new THREE.Vector3(), color = 0x2a4466) {
		const pts = [];
		const steps = 180;
		for (let i = 0; i <= steps; i++) {
			const a = (i / steps) * Math.PI * 2;
			pts.push(orbitalPosition(a, radius, inclination, center));
		}
		const geo = new THREE.BufferGeometry().setFromPoints(pts);
		const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
		return new THREE.Line(geo, mat);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Init Three.js
	// ─────────────────────────────────────────────────────────────────────────
	function initThree() {
		const w = containerEl.clientWidth;
		const h = containerEl.clientHeight;

		renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
		renderer.setSize(w, h, false);
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.setClearColor(0x00000c);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		scene = new THREE.Scene();

		camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 3000);
		// posição inicial derivada dos parâmetros orbitais
		applyCameraState();

		// Iluminação
		scene.add(new THREE.AmbientLight(0x334466, 1.2));
		const starLight = new THREE.PointLight(0xfff5e0, 6, 1200, 1.2);
		starLight.castShadow = false;
		scene.add(starLight);
		// Guarda ref para pulso
		scene._starLight = starLight;

		buildStarfield();
		buildSolarSystem();
		animate();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Starfield
	// ─────────────────────────────────────────────────────────────────────────
	function buildStarfield() {
		const n = 3000, pos = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			pos[i*3]   = (Math.random()-.5) * 4000;
			pos[i*3+1] = (Math.random()-.5) * 2000;
			pos[i*3+2] = (Math.random()-.5) * 4000;
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color:0xffffff, size:0.8, sizeAttenuation:false })));
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Sistema Solar
	// ─────────────────────────────────────────────────────────────────────────
	function clearSolarSystem() {
		// Remove apenas objetos marcados como removable
		const toRemove = scene.children.filter(o => o.userData.removable);
		toRemove.forEach(o => {
			o.traverse(c => { c.geometry?.dispose(); [c.material].flat().forEach(m => m?.dispose()); });
			scene.remove(o);
		});
		clickableMeshes = [];
		Object.keys(planetData).forEach(k => delete planetData[k]);
		Object.keys(moonData).forEach(k => delete moonData[k]);
	}

	function buildSolarSystem() {
		clearSolarSystem();

		// ── Estrela ──────────────────────────────────────────────────────────
		// MeshBasicMaterial: ignora iluminação completamente, sem sombra, sem seam
		const starMesh = new THREE.Mesh(
			new THREE.SphereGeometry(13, 64, 64),
			new THREE.MeshBasicMaterial({ color: 0xffffff })
		);
		starMesh.castShadow    = false;
		starMesh.receiveShadow = false;
		starMesh.userData.removable = true;
		scene.add(starMesh);

		// Halo interno levemente azulado (cor de anã branca)
		const coreMesh = new THREE.Mesh(
			new THREE.SphereGeometry(11, 64, 64),
			new THREE.MeshBasicMaterial({ color: 0xe8f0ff })
		);
		coreMesh.castShadow    = false;
		coreMesh.receiveShadow = false;
		coreMesh.userData.removable = true;
		scene.add(coreMesh);

		// Glow additive via sprite — o gradiente radial funciona bem em sprite (não em esfera)
		const glow = new THREE.Sprite(new THREE.SpriteMaterial({
			map: makeStarTex(256),
			transparent: true, opacity: 0.4,
			depthTest: false, blending: THREE.AdditiveBlending
		}));
		glow.scale.set(90, 90, 1);
		glow.userData.removable = true;
		scene.add(glow);

		// ── Planetas ─────────────────────────────────────────────────────────
		tracks.forEach((track, idx) => {
			const pColor      = PLANET_COLORS[idx % PLANET_COLORS.length];
			const orbitRadius = 50 + idx * 42;
			const orbitSpeed  = 0.0006 - idx * 0.00004;
			// Inclinações variadas: ±15° distribuídas
			const inclination = (idx % 2 === 0 ? 1 : -1) * (0.08 + idx * 0.04);
			const phase       = (idx / tracks.length) * Math.PI * 2;

			// Esfera do planeta
			const pMesh = new THREE.Mesh(
				new THREE.SphereGeometry(7, 48, 48),
				new THREE.MeshStandardMaterial({
					map: makePlanetTex(pColor),
					roughness: 0.78, metalness: 0.1,
					emissive: new THREE.Color(pColor),
					emissiveIntensity: 0.18
				})
			);
			pMesh.castShadow = true;
			pMesh.receiveShadow = true;
			pMesh.userData.removable = true;
			pMesh.userData.planetId  = track.id;
			scene.add(pMesh);

			// Label
			const label = makeTextSprite(track.nome, pColor);
			label.userData.removable = true;
			scene.add(label);

			// Linha de órbita — mesmo plano que o planeta
			const orbitLine = makeOrbitLine(orbitRadius, inclination);
			orbitLine.userData.removable = true;
			scene.add(orbitLine);

			planetData[track.id] = {
				angle: phase,
				mesh: pMesh,
				label,
				orbitLine,
				radius: orbitRadius,
				speed: orbitSpeed,
				inclination,
				track,
				topics: track._topics ?? [],
			};

			clickableMeshes.push({ mesh: pMesh, type: 'planet', id: track.id });
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Sistema de luas — hierarquia correta:
	// a posição das luas é RELATIVA ao planeta pai
	// ─────────────────────────────────────────────────────────────────────────
	function buildMoonSystem(trackId) {
		// Remove luas antigas deste planeta
		Object.keys(moonData).filter(k => k.startsWith(trackId + '::'))
			.forEach(k => {
				const d = moonData[k];
				d.mesh.geometry.dispose(); d.mesh.material.dispose(); scene.remove(d.mesh);
				scene.remove(d.label);
				scene.remove(d.orbitLine);
				delete moonData[k];
			});

		const pd = planetData[trackId];
		if (!pd || !pd.topics.length) return;

		pd.topics.forEach((topic, idx) => {
			const ring    = Math.floor(idx / 5);
			const perRing = 5 + ring * 2;
			const radius  = 32 + ring * 26;   // bem mais espaçado
			const phase   = ((idx % perRing) / perRing) * Math.PI * 2;
			const speed   = (0.0015 + idx * 0.0003) * (idx % 2 ? 1 : -1);
			const inc     = (idx % 2 ? 1 : -1) * (0.05 + (idx % 3) * 0.06);
			const sc      = STATUS_STYLE[topic.status] ?? STATUS_STYLE['nao-iniciado'];

			const mMesh = new THREE.Mesh(
				new THREE.SphereGeometry(3.5, 32, 32),
				new THREE.MeshStandardMaterial({
					map: makePlanetTex(sc.color, 128),
					roughness: 0.85,
					emissive: new THREE.Color(sc.color),
					emissiveIntensity: sc.ei + 0.12
				})
			);
			mMesh.castShadow = true;
			mMesh.userData.removable = true;
			mMesh.userData.moonKey   = `${trackId}::${idx}`;
			scene.add(mMesh);

			const mLabel = makeTextSprite(topic.nome, sc.color, 10);
			mLabel.userData.removable = true;
			scene.add(mLabel);

			// Órbita da lua centrada NO PLANETA (calculada no loop)
			// Não pode ser pré-calculada porque o planeta se move.
			// Geramos uma linha placeholder que é atualizada no loop.
			const mOrbitLine = makeOrbitLine(radius, inc, new THREE.Vector3(0,0,0), 0x1a2a3a);
			mOrbitLine.userData.removable = true;
			scene.add(mOrbitLine);

			const key = `${trackId}::${idx}`;
			moonData[key] = { angle: phase, mesh: mMesh, label: mLabel, orbitLine: mOrbitLine, radius, speed, inclination: inc, topic, trackId };
			clickableMeshes.push({ mesh: mMesh, type: 'moon', id: key, topic });
		});
	}

	function removeMoonSystem(trackId) {
		Object.keys(moonData).filter(k => k.startsWith(trackId + '::')).forEach(k => {
			const d = moonData[k];
			[d.mesh, d.label, d.orbitLine].forEach(o => {
				o.traverse(c => { c.geometry?.dispose(); [c.material].flat().forEach(m=>m?.dispose()); });
				scene.remove(o);
			});
			// Remove de clickables
			clickableMeshes = clickableMeshes.filter(c => c.id !== k);
			delete moonData[k];
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// LOOP DE ANIMAÇÃO
	// Simulação e câmera são atualizadas independentemente.
	// ─────────────────────────────────────────────────────────────────────────
	const _worldPos = new THREE.Vector3();

	function animate() {
		animId = requestAnimationFrame(animate);
		const dt = clock.getDelta();
		const t  = clock.getElapsedTime();

		// ── 1. SIMULAÇÃO ──────────────────────────────────────────────────────
		// Avança ângulos e recalcula posições world de todos os corpos.
		// A câmera não é consultada aqui.

		Object.values(planetData).forEach(pd => {
			pd.angle += pd.speed * dt * 60; // normalizado para 60fps

			// Posição world do planeta (centro = origem)
			const wpos = orbitalPosition(pd.angle, pd.radius, pd.inclination);
			pd.mesh.position.copy(wpos);
			pd.label.position.copy(wpos).y += 11;
			pd.mesh.rotation.y += 0.003;

			// Atualiza linha de órbita da lua — centrada no planeta atual
			Object.keys(moonData).filter(k => k.startsWith(pd.track.id + '::')).forEach(k => {
				const md = moonData[k];
				md.angle += md.speed * dt * 60;

				// Posição da lua = relativa ao planeta
				const mpos = orbitalPosition(md.angle, md.radius, md.inclination, wpos);
				md.mesh.position.copy(mpos);
				md.label.position.copy(mpos).y += 7;
				md.mesh.rotation.y += 0.004;

				// Reconstrói a linha de órbita da lua centrada no planeta
				// (feito apenas quando o planeta se mover significativamente — a cada 4 frames)
				if (Math.round(t * 60) % 4 === 0) {
					const pts = [];
					for (let i = 0; i <= 120; i++) {
						const a = (i / 120) * Math.PI * 2;
						pts.push(orbitalPosition(a, md.radius, md.inclination, wpos));
					}
					md.orbitLine.geometry.setFromPoints(pts);
					md.orbitLine.geometry.attributes.position.needsUpdate = true;
				}
			});
		});

		// ── 2. CÂMERA ─────────────────────────────────────────────────────────
		// Interpola suavemente para os valores alvo.
		// Não afeta a simulação.
		lerpCamera(dt);
		applyCameraState();

		// ── 3. PULSO DA ESTRELA ───────────────────────────────────────────────
		if (scene._starLight) {
			scene._starLight.intensity = 4.5 + Math.sin(t * 1.6) * 0.3;
		}

		renderer.render(scene, camera);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// INTERAÇÃO — Drag para orbitar câmera, shift+drag para pan
	// ─────────────────────────────────────────────────────────────────────────
	let pointer = {
		down: false,
		x: 0, y: 0,
		button: 0,
	};

	function onPointerDown(e) {
		pointer.down   = true;
		pointer.x      = e.clientX;
		pointer.y      = e.clientY;
		pointer.button = e.button;
	}

	function onPointerMove(e) {
		if (!pointer.down) return;
		const dx = e.clientX - pointer.x;
		const dy = e.clientY - pointer.y;
		pointer.x = e.clientX;
		pointer.y = e.clientY;

		const isRightBtn = pointer.button === 2 || e.shiftKey;

		if (isRightBtn) {
			// PAN — relativo aos vetores right/up da câmera
			const sens = cam.distance / 800;

			// Vetor "right" da câmera projetado no plano horizontal
			const rightVec = new THREE.Vector3();
			camera.getWorldDirection(rightVec);
			rightVec.cross(camera.up).normalize();

			// Vetor "up" da câmera projetado no plano horizontal
			const upVec = new THREE.Vector3();
			upVec.copy(camera.up).normalize();
			// Projeta no plano Y=0 para pan intuitivo
			upVec.y = 0;
			upVec.normalize();

			cam.targetPos.addScaledVector(rightVec, -dx * sens);
			cam.targetPos.addScaledVector(upVec,     dy * sens);
		} else {
			// ORBIT — rotaciona câmera ao redor do target
			const sensitivity = 0.005;
			cam.targetAzimuth   -= dx * sensitivity;
			cam.targetElevation += dy * sensitivity;
			cam.targetElevation = Math.max(cam.minElevation, Math.min(cam.maxElevation, cam.targetElevation));
		}
	}

	function onPointerUp(e) {
		const dx = Math.abs(e.clientX - pointer.x);
		const dy = Math.abs(e.clientY - pointer.y);
		pointer.down = false;
		if (dx < 4 && dy < 4) handleClick(e);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// ZOOM — modifica distance, não position.y
	// ─────────────────────────────────────────────────────────────────────────
	function onWheel(e) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 1.07 : 0.93;
		cam.targetDistance = Math.max(cam.minDistance, Math.min(cam.maxDistance, cam.targetDistance * factor));
	}

	// ─────────────────────────────────────────────────────────────────────────
	// RAYCASTING / SELEÇÃO
	// ─────────────────────────────────────────────────────────────────────────
	function handleClick(e) {
		const rect = canvasEl.getBoundingClientRect();
		mouseVec.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
		mouseVec.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouseVec, camera);

		const meshes = clickableMeshes.map(c => c.mesh);
		const hits   = raycaster.intersectObjects(meshes, false);
		if (!hits.length) return;

		const item = clickableMeshes.find(c => c.mesh === hits[0].object);
		if (!item) return;

		if (item.type === 'planet') selectPlanet(item.id);
		else if (item.type === 'moon') onTopicSelect?.(item.topic);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// SELEÇÃO DE PLANETA
	// Apenas muda o cameraTarget e a distância.
	// A simulação continua rodando sem interrupção.
	// ─────────────────────────────────────────────────────────────────────────

	// ── Fade do sistema solar ao focar num planeta ────────────────────────────
	function fadeSolarSystem(targetOpacity, duration = 600) {
		const objects = scene.children.filter(o =>
			o.userData.removable &&
			o.userData.planetId !== selectedPlanetId
		);
		const start   = performance.now();
		const targets = [];
		objects.forEach(o => {
			o.traverse(child => {
				if (!child.isMesh && !child.isLine && !child.isSprite) return;
				[child.material].flat().filter(Boolean).forEach(m => {
					if (!m.transparent) m.transparent = true;
					targets.push({ mat: m, from: m.opacity ?? 1, to: targetOpacity });
				});
			});
		});
		function step(now) {
			const t    = Math.min((now - start) / duration, 1);
			const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
			targets.forEach(({ mat, from, to }) => { mat.opacity = from + (to - from) * ease; });
			if (t < 1) requestAnimationFrame(step);
		}
		requestAnimationFrame(step);
	}

	function selectPlanet(id) {
		if (selectedPlanetId === id) {
			deselectPlanet();
			return;
		}

		// Desfaz foco anterior
		if (selectedPlanetId) {
			removeMoonSystem(selectedPlanetId);
			// restaura posição orbital do planeta anterior
			planetFocused = false;
		}

		selectedPlanetId = id;
		const pd = planetData[id];
		if (!pd) return;

		planetFocused = true;

		// 1. Fade out de tudo exceto o planeta selecionado
		fadeSolarSystem(0, 500);

		// 2. Tween do planeta pro centro (origem) — depois de um pequeno delay
		//    O planeta continua animado pelo loop, então "congelamos" a posição
		//    guardando um offset. Mais simples: movemos o target da câmera para
		//    a posição atual do planeta e zeramos o sistema de referência.
		//    Implementamos via flag: no loop, se planetFocused, o planeta fica em (0,0,0).
		pd.focusOffset = pd.mesh.position.clone(); // posição no momento do clique

		// 3. Câmera: recua para ver o sistema de luas
		cam.targetPos.set(0, 0, 0);
		cam.targetDistance = 120;
		cam.targetElevation = Math.max(0.35, cam.elevation);

		// 4. Cria luas
		setTimeout(() => buildMoonSystem(id), 300);
	}

	function deselectPlanet() {
		if (selectedPlanetId) {
			const pd = planetData[selectedPlanetId];
			if (pd) pd.focusOffset = null;
			removeMoonSystem(selectedPlanetId);
		}
		selectedPlanetId = null;
		planetFocused    = false;

		// Fade in do sistema solar
		fadeSolarSystem(1, 600);

		// Câmera volta para o centro
		cam.targetPos.set(0, 0, 0);
		cam.targetDistance = 180;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// RESIZE — ResizeObserver para acompanhar o container exatamente
	// ─────────────────────────────────────────────────────────────────────────
	let resizeObserver;

	function setupResize() {
		resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width === 0 || height === 0) return;
				renderer.setSize(width, height, false);
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
			}
		});
		resizeObserver.observe(containerEl);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Reage quando tracks chegam do pai
	// ─────────────────────────────────────────────────────────────────────────
	$effect(() => {
		if (!scene || tracks.length === 0) return;
		buildSolarSystem();
	});

	export function setTrackTopics(trackId, topics) {
		const pd = planetData[trackId];
		if (pd) {
			pd.topics = topics;
			if (selectedPlanetId === trackId) buildMoonSystem(trackId);
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Mount / Destroy
	// ─────────────────────────────────────────────────────────────────────────
	onMount(() => {
		initThree();
		setupResize();
	});

	onDestroy(() => {
		cancelAnimationFrame(animId);
		resizeObserver?.disconnect();
		renderer?.dispose();
	});
</script>

<!-- Container define o tamanho, canvas é filho -->
<div
	bind:this={containerEl}
	style="width:100%; height:100%; position:relative; overflow:hidden;"
>
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

	<!-- Hint de controles -->
	<div style="
		position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
		font-family:'JetBrains Mono',monospace; font-size:11px;
		color:rgba(150,170,210,0.45); pointer-events:none; white-space:nowrap;
	">
		arrastar → orbitar &nbsp;·&nbsp; shift+arrastar → pan &nbsp;·&nbsp; scroll → zoom &nbsp;·&nbsp; clique → selecionar
	</div>
</div>
