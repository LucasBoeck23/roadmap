import * as THREE from 'three';
import { PLANET_COLORS, STATUS_STYLE } from './constants.js';
import { orbitalPosition } from './orbit.js';
import { createStarfield, createSun, createPlanet, createMoon } from './factory.js';
import { disposeObject } from './dispose.js';

/**
 * Orquestra o sistema solar: constrói estrela/planetas/luas, avança a
 * simulação a cada frame e gerencia o foco num planeta.
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
	}

	// ── Construção ───────────────────────────────────────────────────────────
	build(tracks) {
		this.clear();
		this.scene.add(createStarfield());
		const sun = createSun();
		this.sun       = sun;
		this.starParts = sun.parts;
		this.starParts.forEach(o => this.scene.add(o));

		tracks.forEach((track, idx) => {
			const color       = PLANET_COLORS[idx % PLANET_COLORS.length];
			const radius      = 50 + idx * 42;
			// Velocidade orbital ~ 1/raio (Kepler simplificado): planetas distantes
			// giram bem mais devagar, como num sistema solar real.
			const speed       = 2.2 / radius * 0.01;
			const inclination = (idx % 2 === 0 ? 1 : -1) * (0.08 + idx * 0.04);
			const phase       = (idx / tracks.length) * Math.PI * 2;

			const { mesh, label, orbitLine } = createPlanet(track, color, radius, inclination);
			this.scene.add(mesh, label, orbitLine);

			this.planets[track.id] = {
				angle: phase, mesh, label, orbitLine,
				radius, speed, inclination, track, topics: track._topics ?? []
			};
			this.clickables.push({ mesh, type: 'planet', id: track.id });
		});
	}

	clear() {
		this.scene.children.filter(o => o.userData.removable)
			.forEach(o => disposeObject(this.scene, o));
		this.clickables = [];
		this.planets = {};
		this.moons   = {};
		this.sun = null;
	}

	// ── Luas ─────────────────────────────────────────────────────────────────
	buildMoons(trackId) {
		this.removeMoons(trackId);
		const pd = this.planets[trackId];
		if (!pd || !pd.topics.length) return;

		pd.topics.forEach((topic, idx) => {		
			const ring    = idx / 3
			const perRing = 5 + ring * 2;
			const radius  = 32 + ring * 26;
			const phase   = ((idx % perRing) / perRing) * Math.PI * 2;
			const speed   = (0.0015 + idx * 0.0003) * (idx % 2 ? 1 : -1);
			const inc     = (idx % 2 ? 1 : -1) * (0.05 + (idx % 3) * 0.06);
			const style   = STATUS_STYLE[topic.status] ?? STATUS_STYLE['nao-iniciado'];

			const { mesh, label, orbitLine } = createMoon(topic, style, radius, inc);
			this.scene.add(mesh, label, orbitLine);

			const key = `${trackId}::${idx}`;
			this.moons[key] = { angle: phase, mesh, label, orbitLine, radius, speed, inclination: inc, topic };
			this.clickables.push({ mesh, type: 'moon', id: key, topic });
		});
	}

	removeMoons(trackId) {
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
		if (this.selectedPlanetId === trackId) this.buildMoons(trackId);
	}

	// ── Simulação (chamada a cada frame) ───────────────────────────────────────
	update(dt, elapsed) {
		Object.values(this.planets).forEach(pd => {
			const isFocusTarget = this.focused && pd.track.id === this.selectedPlanetId;
			let wpos;
			if (isFocusTarget) {
				wpos = new THREE.Vector3(0, 0, 0);
			} else {
				pd.angle += pd.speed * dt * 60;
				wpos = orbitalPosition(pd.angle, pd.radius, pd.inclination);
			}
			pd.mesh.position.copy(wpos);
			pd.label.position.copy(wpos).y += 11;
			pd.mesh.rotation.y += 0.003;

			// Luas deste planeta. Elas só existem em modo foco, com o planeta
			// fixo no centro (0,0,0) — então a órbita da lua é ESTÁTICA.
			// A linha é criada uma vez em createMoon e nunca recalculada.
			// (Recalcular aqui com um nº de pontos diferente do original gerava
			//  vértices-lixo e aquelas linhas retas espúrias no canvas.)
			Object.keys(this.moons).filter(k => k.startsWith(pd.track.id + '::')).forEach(k => {
				const md = this.moons[k];
				md.angle += md.speed * dt * 60;
				const mpos = orbitalPosition(md.angle, md.radius, md.inclination);
				md.mesh.position.copy(mpos);
				md.label.position.copy(mpos).y += 7;
				md.mesh.rotation.y += 0.004;
			});
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

	/** Sai do modo foco: mostra tudo de volta. */
	exitFocus() {
		this.focused = false;
		this.selectedPlanetId = null;

		this.starParts.forEach(o => { o.visible = true; });
		if (this.starLight) this.starLight.visible = true;

		Object.values(this.planets).forEach(pd => {
			pd.mesh.visible      = true;
			pd.label.visible     = true;
			pd.orbitLine.visible = true;
		});
	}

	// ── Raycasting ──────────────────────────────────────────────────────────────
	/** Retorna o item clicável atingido pelo raio, ou null. */
	pick(raycaster) {
		const hits = raycaster.intersectObjects(this.clickables.map(c => c.mesh), false);
		if (!hits.length) return null;
		return this.clickables.find(c => c.mesh === hits[0].object) ?? null;
	}
}
