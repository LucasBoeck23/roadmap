import * as THREE from 'three';
import { PLANET_COLORS, PLANET_PROFILES, MOON_PROFILES, moonProfileFor, seedFromString } from './constants.js';
import { orbitalPosition, orbitalPositionInto } from './orbit.js';
import { createStarfield, createSun, createPlanet, createMoon } from './factory.js';
import { disposeObject } from './dispose.js';
import {
	bodiesFromTopic,
	pushFrame,
	popFrame,
	frameForBody,
	frameForTopic,
	breadcrumbFromStack,
	bodiesForTopFrame
} from './navigation.js';

/**
 * Orquestra o sistema solar: constrói estrela/planetas/luas, avança a
 * simulação a cada frame e gerencia o foco num planeta.
 *
 * Além do nível raiz (tracks → planetas, tópicos → luas), suporta
 * DRILL-DOWN: ao entrar num tópico (ou pasta) com subpastas/arquivos, uma
 * NOVA galáxia é construída a partir dos filhos daquele nó, recursivamente,
 * em profundidade ilimitada. A navegação é uma pilha (stack) de níveis.
 * Toda a lógica pura de transformação (nó → corpos, push/pop) vive em
 * navigation.js, que pode ser testada sem GPU.
 *
 * NÃO conhece a câmera nem eventos de mouse — isso é responsabilidade do
 * componente. A simulação é puramente determinística.
 */
export class SolarSystem {
	constructor(scene) {
		this.scene = scene;
		this.planets = {}; // trackId → { angle, mesh, label, orbitLine, radius, speed, inclination, track, topics }
		this.moons   = {}; // "trackId::idx" → { angle, mesh, label, orbitLine, radius, speed, inclination, topic }
		this.clickables = []; // { mesh, type, id, topic }
		this.selectedPlanetId = null;
		this.focused = false;   // true quando um planeta está em foco
		this.starParts = [];    // objetos que compõem o sol (para ocultar no foco)
		this.sun = null;        // refs do sol (ver createSun)
		this.starLight = null;

		// ── Drill-down (galáxia dentro de galáxia) ───────────────────────────
		// Quando this.stack tem frames, estamos DENTRO de um tópico/pasta e o
		// nível raiz (planetas/luas) está oculto. Cada frame = um nível.
		this.stack = [];       // Frame[] (ver navigation.js)
		this.drillBodies = {}; // key → { angle, mesh, label, orbitLine, radius, speed, inclination, body }

		// Vetor de trabalho reutilizado no update() — evita alocar um Vector3
		// novo por corpo por frame (churn de GC → microtravadas).
		this._tmp = new THREE.Vector3();

		// Handle do requestAnimationFrame da construção incremental de luas.
		this._moonBuildRAF = null;
	}

	// ── Construção do nível raiz (tracks → planetas) ─────────────────────────
	build(tracks) {
		this.clear();
		this.stack = [];
		this._addSunAndStars();

		tracks.forEach((track, idx) => {
			const profile     = PLANET_PROFILES[idx % PLANET_PROFILES.length];
			const color       = profile.base ?? PLANET_COLORS[idx % PLANET_COLORS.length];
			const radius      = 50 + idx * 42;
			// Velocidade orbital ~ 1/raio (Kepler simplificado): planetas distantes
			// giram bem mais devagar, como num sistema solar real.
			const speed       = 2.2 / radius * 0.01;
			const inclination = (idx % 2 === 0 ? 1 : -1) * (0.08 + idx * 0.04);
			const phase       = (idx / tracks.length) * Math.PI * 2;

			const { mesh, label, orbitLine } = createPlanet(track, color, radius, inclination, profile);
			this.scene.add(mesh, label, orbitLine);

			this.planets[track.id] = {
				angle: phase, mesh, label, orbitLine,
				radius, speed, inclination, track, topics: track._topics ?? []
			};
			this.clickables.push({ mesh, type: 'planet', id: track.id });
		});
	}

	/** Adiciona o campo de estrelas + o sol central (reutilizado por nível). */
	_addSunAndStars() {
		this.scene.add(createStarfield());
		const sun = createSun();
		this.sun       = sun;
		this.starParts = sun.parts;
		this.starParts.forEach(o => this.scene.add(o));
	}

	/**
	 * Pré-compila os programas de shader na GPU ANTES do primeiro clique.
	 * three.js compila um ShaderMaterial só na 1ª vez que ele é renderizado —
	 * e compilar é síncrono, travando a thread. Como todas as luas usam o mesmo
	 * programa (só mudam uniforms), basta compilar UMA lua de exemplo aqui para
	 * que, ao entrar no planeta, nenhuma compilação aconteça no meio da interação.
	 *
	 * @param {THREE.WebGLRenderer} renderer
	 * @param {THREE.Camera}        camera
	 */
	warmup(renderer, camera) {
		if (!renderer) return;
		// Compila o que já está na cena (sol, planetas, estrelas).
		renderer.compile(this.scene, camera);

		// Compila o programa de lua com um mesh temporário invisível.
		const sample = MOON_PROFILES[0];
		const { mesh, label, orbitLine } = createMoon(
			{ nome: '·' }, sample, 32, 0.1
		);
		mesh.visible = label.visible = orbitLine.visible = false;
		this.scene.add(mesh, label, orbitLine);
		renderer.compile(this.scene, camera);
		[mesh, label, orbitLine].forEach(o => disposeObject(this.scene, o));
	}

	clear() {
		this._cancelMoonBuild();
		this.scene.children.filter(o => o.userData.removable)
			.forEach(o => disposeObject(this.scene, o));
		this.clickables = [];
		this.planets = {};
		this.moons   = {};
		this.drillBodies = {};
		this.sun = null;
	}

	// ── Luas (nível raiz: tópicos de um planeta) ─────────────────────────────
	/** Calcula os parâmetros orbitais de uma lua pelo índice (determinístico). */
	_moonParams(trackId, topic, idx) {
		const ring    = idx / 3;
		const perRing = 5 + ring * 2;
		return {
			radius:      32 + ring * 26,
			phase:       ((idx % perRing) / perRing) * Math.PI * 2,
			speed:       (0.0015 + idx * 0.0003) * (idx % 2 ? 1 : -1),
			inclination: (idx % 2 ? 1 : -1) * (0.05 + (idx % 3) * 0.06),
			profile:     moonProfileFor(topic.id ?? `${trackId}::${idx}`)
		};
	}

	/** Cria uma única lua e a registra. Usado pela construção incremental. */
	_spawnMoon(trackId, topic, idx) {
		const { radius, phase, speed, inclination, profile } = this._moonParams(trackId, topic, idx);
		const { mesh, label, orbitLine } = createMoon(topic, profile, radius, inclination);
		this.scene.add(mesh, label, orbitLine);

		const key = `${trackId}::${idx}`;
		this.moons[key] = { angle: phase, mesh, label, orbitLine, radius, speed, inclination, topic };
		this.clickables.push({ mesh, type: 'moon', id: key, topic });
	}

	/**
	 * Constrói as luas de forma INCREMENTAL — algumas por frame — em vez de
	 * todas num único frame. Criar uma lua envolve montar um ShaderMaterial e
	 * um label em canvas; fazer N de uma vez congelava a thread no clique.
	 * Espalhar no tempo mantém a entrada no planeta fluida.
	 *
	 * @param {number} perFrame  quantas luas criar por frame
	 */
	buildMoons(trackId, perFrame = 2) {
		this.removeMoons(trackId);
		this._cancelMoonBuild();
		const pd = this.planets[trackId];
		if (!pd || !pd.topics.length) return;

		const topics = pd.topics;
		let i = 0;
		const step = () => {
			// Se o usuário trocou de planeta / saiu do foco, aborta.
			if (this.selectedPlanetId !== trackId) { this._moonBuildRAF = null; return; }
			const end = Math.min(i + perFrame, topics.length);
			for (; i < end; i++) this._spawnMoon(trackId, topics[i], i);
			if (i < topics.length) {
				this._moonBuildRAF = requestAnimationFrame(step);
			} else {
				this._moonBuildRAF = null;
			}
		};
		this._moonBuildRAF = requestAnimationFrame(step);
	}

	/** Cancela uma construção incremental de luas em andamento. */
	_cancelMoonBuild() {
		if (this._moonBuildRAF != null) {
			cancelAnimationFrame(this._moonBuildRAF);
			this._moonBuildRAF = null;
		}
	}

	removeMoons(trackId) {
		this._cancelMoonBuild();
		Object.keys(this.moons).filter(k => k.startsWith(trackId + '::')).forEach(k => {
			const d = this.moons[k];
			[d.mesh, d.label, d.orbitLine].forEach(o => disposeObject(this.scene, o));
			this.clickables = this.clickables.filter(c => c.id !== k);
			delete this.moons[k];
		});
	}

	moonsExtent(trackId) {
		const pd = this.planets[trackId];
		const lastIdx = pd.topics.length - 1;
		const ring    = lastIdx / 3;
		return 32 + ring * 26;
	}

	setTopics(trackId, topics) {
		const pd = this.planets[trackId];
		if (!pd) return;
		pd.topics = topics;
		if (this.selectedPlanetId === trackId && !this.isDrilled()) this.buildMoons(trackId);
	}

	// ── Drill-down: galáxia dentro de galáxia ────────────────────────────────

	/** true quando estamos dentro de um tópico/pasta (nível > raiz). */
	isDrilled() { return this.stack.length > 0; }

	/** Profundidade atual do drill (0 = nível raiz de tracks/luas). */
	depth() { return this.stack.length; }

	/** Trilha de nomes do nível atual (tópico → pastas), p/ o breadcrumb. */
	breadcrumb() { return breadcrumbFromStack(this.stack); }

	/**
	 * Entra num tópico (lua). Se o tópico tem subpastas/arquivos, empilha o
	 * frame raiz do tópico e constrói a primeira galáxia aninhada; retorna true.
	 * Se o tópico é vazio/sem filhos, NÃO drilla (retorna false) — o chamador
	 * deve abrir o painel como hoje.
	 */
	drillIntoTopic(topic) {
		const bodies = bodiesFromTopic(topic);
		if (!bodies) return false; // folha: abrir painel
		this.stack = pushFrame([], frameForTopic(topic));
		this._hideFocusedPlanet(true); // planeta em foco "abre" na galáxia aninhada
		this._buildDrillLevel();
		return true;
	}

	/**
	 * Entra numa pasta (corpo "folder" drillable) do nível atual.
	 * Empilha o frame e reconstrói a cena a partir dos filhos da pasta.
	 */
	drillIntoBody(body) {
		if (!body?.drillable) return false;
		this.stack = pushFrame(this.stack, frameForBody(body));
		this._buildDrillLevel();
		return true;
	}

	/**
	 * Sobe um nível (voltar). Se ainda houver frames, reconstrói o nível pai;
	 * se a pilha esvaziou, volta ao sistema de luas do tópico (nível raiz do
	 * drill), reconstruindo as luas do planeta em foco.
	 * @returns {boolean} true se ainda está drillado, false se voltou às luas.
	 */
	drillUp() {
		this.stack = popFrame(this.stack);
		this._clearDrill();
		if (this.stack.length) {
			this._buildDrillLevel();
			return true;
		}
		// Voltou ao nível das luas do tópico selecionado
		this._hideFocusedPlanet(false);
		if (this.selectedPlanetId) this.buildMoons(this.selectedPlanetId);
		return false;
	}

	/** Remove todos os corpos do nível de drill atual (dispose + limpa refs). */
	_clearDrill() {
		Object.values(this.drillBodies).forEach(d => {
			[d.mesh, d.label, d.orbitLine].forEach(o => o && disposeObject(this.scene, o));
		});
		this.clickables = this.clickables.filter(c => c.type !== 'drill');
		this.drillBodies = {};
	}

	/**
	 * Constrói o nível de drill atual (topo da pilha): subpastas viram corpos
	 * tipo "folder" (perfil de planeta), arquivos viram corpos "file" (perfil
	 * de lua). Visual estável por semente (caminho). Dispõe o nível anterior
	 * antes de construir, evitando vazamento de objetos Three.
	 */
	_buildDrillLevel() {
		this._clearDrill();
		// Enquanto drillado, as luas do tópico ficam ocultas (removidas).
		if (this.selectedPlanetId) this.removeMoons(this.selectedPlanetId);

		const bodies = bodiesForTopFrame(this.stack) ?? [];

		bodies.forEach((body, idx) => {
			const ring    = idx / 3;
			const perRing = 5 + ring * 2;
			const radius  = 34 + ring * 26;
			const phase   = ((idx % perRing) / perRing) * Math.PI * 2;
			const speed   = (0.0016 + idx * 0.0003) * (idx % 2 ? 1 : -1);
			const inc     = (idx % 2 ? 1 : -1) * (0.05 + (idx % 3) * 0.06);
			const seed    = body.seed ?? body.caminho ?? String(idx);

			let mesh, label, orbitLine;
			if (body.kind === 'folder') {
				// Pasta → planeta (perfil estável por semente)
				const profile = PLANET_PROFILES[seedFromString(seed) % PLANET_PROFILES.length];
				const color   = profile.base ?? PLANET_COLORS[idx % PLANET_COLORS.length];
				const pseudoTrack = { id: `drill::${seed}`, nome: body.nome };
				({ mesh, label, orbitLine } = createPlanet(pseudoTrack, color, radius, inc, profile));
			} else {
				// Arquivo → lua (perfil estável por semente)
				const profile = moonProfileFor(seed);
				({ mesh, label, orbitLine } = createMoon({ nome: body.nome }, profile, radius, inc));
			}
			this.scene.add(mesh, label, orbitLine);

			const key = `drill::${this.stack.length}::${idx}`;
			this.drillBodies[key] = { angle: phase, mesh, label, orbitLine, radius, speed, inclination: inc, body };
			this.clickables.push({ mesh, type: 'drill', id: key, body });
		});
	}

	/** Maior raio orbital do nível de drill atual (p/ posicionar a câmera). */
	drillExtent() {
		const vals = Object.values(this.drillBodies);
		if (!vals.length) return 40;
		return vals.reduce((m, d) => Math.max(m, d.radius), 0);
	}

	// ── Simulação (chamada a cada frame) ───────────────────────────────────────
	update(dt, elapsed) {
		const tmp = this._tmp;
		Object.values(this.planets).forEach(pd => {
			const isFocusTarget = this.focused && pd.track.id === this.selectedPlanetId;
			let wpos;
			if (isFocusTarget) {
				wpos = tmp.set(0, 0, 0);
			} else {
				pd.angle += pd.speed * dt * 60;
				wpos = orbitalPositionInto(tmp, pd.angle, pd.radius, pd.inclination);
			}
			pd.mesh.position.copy(wpos);
			pd.label.position.copy(wpos).y += 11;
			pd.mesh.rotation.y += 0.003;

			// Anima o shader do planeta (nuvens/lava/redemoinhos)
			const pm = pd.mesh.userData.planetMat;
			if (pm) pm.uniforms.uTime.value = elapsed;

			// Luas deste planeta. Elas só existem em modo foco, com o planeta
			// fixo no centro (0,0,0) — então a órbita da lua é ESTÁTICA.
			// A linha é criada uma vez em createMoon e nunca recalculada.
			// (Recalcular aqui com um nº de pontos diferente do original gerava
			//  vértices-lixo e aquelas linhas retas espúrias no canvas.)
			Object.keys(this.moons).filter(k => k.startsWith(pd.track.id + '::')).forEach(k => {
				const md = this.moons[k];
				md.angle += md.speed * dt * 60;
				const mpos = orbitalPositionInto(tmp, md.angle, md.radius, md.inclination);
				md.mesh.position.copy(mpos);
				md.label.position.copy(mpos).y += 7;
				md.mesh.rotation.y += 0.004;
				const mm = md.mesh.userData.moonMat;
				if (mm) mm.uniforms.uTime.value = elapsed;
			});
		});

		// ── Corpos do drill-down (galáxia aninhada), centrados em (0,0,0) ──────
		Object.values(this.drillBodies).forEach(d => {
			d.angle += d.speed * dt * 60;
			const pos = orbitalPosition(d.angle, d.radius, d.inclination);
			d.mesh.position.copy(pos);
			d.label.position.copy(pos).y += (d.body.kind === 'folder' ? 11 : 7);
			d.mesh.rotation.y += 0.004;
			const pm = d.mesh.userData.planetMat;
			if (pm) pm.uniforms.uTime.value = elapsed;
			const mm = d.mesh.userData.moonMat;
			if (mm) mm.uniforms.uTime.value = elapsed;
		});

		// ── Sol: anima o plasma do shader e rotaciona a fotosfera ─────────────
		const sun = this.sun;
		if (sun) {
			sun.material.uniforms.uTime.value += dt;
			sun.surface.rotation.y += 0.0005;
		}
		if (this.starLight) this.starLight.intensity = 5 + Math.sin(elapsed * 1.6) * 0.4;
	}

	// ── Foco ───────────────────────────────────────────────────────────────────
	/**
	 * Entra em modo foco: oculta estrela, demais planetas e as órbitas do
	 * sistema solar. O planeta selecionado é fixado no centro (ver update).
	 */
	enterFocus(trackId) {
		this.selectedPlanetId = trackId;
		this.focused = true;

		this.starParts.forEach(o => { o.visible = false; });
		if (this.starLight) this.starLight.visible = false;

		Object.entries(this.planets).forEach(([id, pd]) => {
			const isTarget = id === trackId;
			pd.mesh.visible      = isTarget;
			pd.label.visible     = isTarget;
			pd.orbitLine.visible = false;
		});
	}

	/** Sai do modo foco: mostra tudo de volta. Também desfaz qualquer drill. */
	exitFocus() {
		// Desfaz um eventual drill (volta a estrela/planetas visíveis).
		if (this.isDrilled()) {
			this._clearDrill();
			this.stack = [];
		}
		this.focused = false;
		const prev = this.selectedPlanetId;
		this.selectedPlanetId = null;
		if (prev) this.removeMoons(prev);

		this.starParts.forEach(o => { o.visible = true; });
		if (this.starLight) this.starLight.visible = true;

		Object.values(this.planets).forEach(pd => {
			pd.mesh.visible      = true;
			pd.label.visible     = true;
			pd.orbitLine.visible = true;
		});
	}

	/** Ao drillar, o planeta em foco e sua órbita somem (vira a "galáxia"). */
	_hideFocusedPlanet(hidden) {
		if (!this.selectedPlanetId) return;
		const pd = this.planets[this.selectedPlanetId];
		if (!pd) return;
		pd.mesh.visible  = !hidden;
		pd.label.visible = !hidden;
	}

	// ── Raycasting ──────────────────────────────────────────────────────────────
	/** Retorna o item clicável atingido pelo raio, ou null. */
	pick(raycaster) {
		const hits = raycaster.intersectObjects(this.clickables.map(c => c.mesh), false);
		if (!hits.length) return null;
		return this.clickables.find(c => c.mesh === hits[0].object) ?? null;
	}
}
