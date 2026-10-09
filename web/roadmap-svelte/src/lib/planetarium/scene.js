import * as THREE from 'three';
import { PLANET_COLORS, STATUS_STYLE } from './constants.js';
import { orbitalPosition, orbitPoints } from './orbit.js';
import { createStarfield, createStar, createPlanet, createMoon } from './factory.js';
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
		this.starLight = null;
	}

	// ── Construção ───────────────────────────────────────────────────────────
	build(tracks) {
		this.clear();
		this.scene.add(createStarfield());
		createStar().forEach(o => this.scene.add(o));

		tracks.forEach((track, idx) => {
			const color       = PLANET_COLORS[idx % PLANET_COLORS.length];
			const radius      = 50 + idx * 42;
			const speed       = 0.0006 - idx * 0.00004;
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
	}

	// ── Luas ─────────────────────────────────────────────────────────────────
	buildMoons(trackId) {
		this.removeMoons(trackId);
		const pd = this.planets[trackId];
		if (!pd || !pd.topics.length) return;

		pd.topics.forEach((topic, idx) => {
			const ring    = Math.floor(idx / 5);
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

	setTopics(trackId, topics) {
		const pd = this.planets[trackId];
		if (!pd) return;
		pd.topics = topics;
		if (this.selectedPlanetId === trackId) this.buildMoons(trackId);
	}

	// ── Simulação (chamada a cada frame) ───────────────────────────────────────
	update(dt, elapsed) {
		Object.values(this.planets).forEach(pd => {
			pd.angle += pd.speed * dt * 60;
			const wpos = orbitalPosition(pd.angle, pd.radius, pd.inclination);
			pd.mesh.position.copy(wpos);
			pd.label.position.copy(wpos).y += 11;
			pd.mesh.rotation.y += 0.003;

			// Luas deste planeta — centro = posição atual do planeta
			Object.keys(this.moons).filter(k => k.startsWith(pd.track.id + '::')).forEach(k => {
				const md = this.moons[k];
				md.angle += md.speed * dt * 60;
				const mpos = orbitalPosition(md.angle, md.radius, md.inclination, wpos);
				md.mesh.position.copy(mpos);
				md.label.position.copy(mpos).y += 7;
				md.mesh.rotation.y += 0.004;

				// Linha de órbita segue o planeta — atualizada a cada 4 frames
				if (Math.round(elapsed * 60) % 4 === 0) {
					md.orbitLine.geometry.setFromPoints(orbitPoints(md.radius, md.inclination, wpos, 120));
					md.orbitLine.geometry.attributes.position.needsUpdate = true;
				}
			});
		});

		if (this.starLight) this.starLight.intensity = 4.5 + Math.sin(elapsed * 1.6) * 0.3;
	}

	// ── Foco ───────────────────────────────────────────────────────────────────
	/** Anima a opacidade de tudo exceto o planeta selecionado. */
	fade(targetOpacity, duration = 600) {
		const targets = [];
		this.scene.children
			.filter(o => o.userData.removable && o.userData.planetId !== this.selectedPlanetId)
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

	// ── Raycasting ──────────────────────────────────────────────────────────────
	/** Retorna o item clicável atingido pelo raio, ou null. */
	pick(raycaster) {
		const hits = raycaster.intersectObjects(this.clickables.map(c => c.mesh), false);
		if (!hits.length) return null;
		return this.clickables.find(c => c.mesh === hits[0].object) ?? null;
	}
}
