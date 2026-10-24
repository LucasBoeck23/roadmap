import * as THREE from 'three';
import { GLSL_SIMPLEX, glslFbm } from './noise.glsl.js';

/**
 * Shader de superfície de planeta — ruído 3D (fBm) na GPU, mapeado pela posição
 * do vértice na esfera (sem distorção nos polos). A aparência muda conforme
 * `uKind`, e cada tipo usa uma paleta de 4 cores (uC0..uC3).
 *
 * uKind:
 *   0 gas     1 ocean   2 lava   3 ice   4 toxic   5 desert
 */

const vertexShader = /* glsl */ `
	varying vec3 vPos;      // posição na esfera (base do ruído 3D)
	varying vec3 vNormal;
	void main() {
		vPos = normalize(position);
		vNormal = normalize(normalMatrix * normal);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const fragmentShader = /* glsl */ `
	precision highp float;

	varying vec3 vPos;
	varying vec3 vNormal;

	uniform float uTime;
	uniform int   uKind;
	uniform vec3  uC0;   // mais escura
	uniform vec3  uC1;
	uniform vec3  uC2;
	uniform vec3  uC3;   // mais clara / acento
	uniform vec3  uAtmo; // cor do brilho atmosférico na borda
	uniform vec3  uLightDir;

	${GLSL_SIMPLEX}
	${glslFbm(2.03, 2.1)}

	vec3 ramp(float t){
		t = clamp(t, 0.0, 1.0);
		if (t < 0.33)      return mix(uC0, uC1, t / 0.33);
		else if (t < 0.66) return mix(uC1, uC2, (t - 0.33) / 0.33);
		else               return mix(uC2, uC3, (t - 0.66) / 0.34);
	}

	void main() {
		vec3 p = vPos;
		vec3 col;

		if (uKind == 0) {
			// GÁS — bandas finas e delicadas, onduladas por domain warp, com
			// filetes de contraste entre as faixas e uma tempestade suave.
			float warp = fbm(p * 1.6 + vec3(0.0, 0.0, uTime * 0.02)) * 0.5;
			float lat = p.y * 1.0 + warp * 0.4;
			float bands = sin(lat * 18.0) * 0.5 + 0.5;
			bands = smoothstep(0.15, 0.85, bands);              // bordas suaves
			float detail = fbm(p * 7.0 + warp) * 0.18;
			float fine = fbm(p * 16.0 + warp) * 0.06;           // textura miúda
			col = ramp(bands * 0.8 + detail + fine + 0.1);
			// filetes claros entre faixas
			float seam = smoothstep(0.46, 0.5, bands) * (1.0 - smoothstep(0.5, 0.54, bands));
			col += uC3 * seam * 0.12;
			// tempestade oval suave
			vec3 sd = normalize(vec3(0.6, -0.25, 0.4));
			float storm = smoothstep(0.86, 0.995, dot(normalize(p), sd));
			col = mix(col, mix(uC3, uC2, 0.3) * 1.08, storm * (0.5 + 0.3 * fbm(p * 9.0)));
		}
		else if (uKind == 1) {
			// OCEANO — continentes macios, litoral translúcido, nuvens finas.
			float h = fbm(p * 2.1) + fbm(p * 5.0) * 0.2;
			float land = smoothstep(0.03, 0.14, h);
			vec3 ocean = mix(uC0, uC1, smoothstep(-0.5, 0.12, h));
			vec3 ground = mix(uC2, uC3, smoothstep(0.14, 0.55, h));
			col = mix(ocean, ground, land);
			col = mix(col, mix(uC1, uC2, 0.5) * 1.08, smoothstep(0.0, 0.04, h) * (1.0 - land)); // litoral
			float ice = smoothstep(0.74, 0.92, abs(p.y));
			col = mix(col, vec3(0.93, 0.97, 1.0), ice);
			float cl = smoothstep(0.35, 0.72, fbm(p * 3.2 + vec3(uTime * 0.015, 0.0, 0.0)));
			col = mix(col, vec3(0.96, 0.98, 1.0), cl * 0.22);
		}
		else if (uKind == 2) {
			// LAVA — crosta escura basáltica com veios incandescentes delicados.
			float crust = fbm(p * 3.2) * 0.5 + 0.5;
			col = mix(uC0, uC1, crust * crust);
			float veins = ridged(p * 4.5);
			float glow = smoothstep(1.35, 1.72, veins);
			float pulse = 0.8 + 0.2 * sin(uTime * 1.6 + veins * 6.0);
			vec3 hot = mix(uC2, uC3, glow);
			col = mix(col, hot * (1.0 + glow * 0.6), glow * pulse);
			col += uC3 * smoothstep(1.6, 1.78, veins) * 0.25 * pulse; // núcleo brilhante
		}
		else if (uKind == 3) {
			// GELO — superfície perolada azul com fraturas sutis e brilho frio.
			float base = fbm(p * 2.3) * 0.5 + 0.5;
			col = mix(uC0, uC1, smoothstep(0.2, 0.8, base));
			col = mix(col, uC2, smoothstep(0.55, 0.9, base));
			float fr = ridged(p * 7.0);
			col = mix(col, uC3, smoothstep(1.5, 1.78, fr) * 0.45);
			col += vec3(0.04, 0.06, 0.09) * fbm(p * 20.0);     // cintilância fina
		}
		else if (uKind == 4) {
			// TÓXICO/NÉVOA — redemoinhos iridescentes de domínio distorcido.
			vec3 q = p * 1.8;
			float w = fbm(q + vec3(0.0, 0.0, uTime * 0.04));
			float swirl = fbm(q + w * 1.6);
			col = ramp(swirl * 0.5 + 0.5);
			float acid = smoothstep(0.55, 0.8, fbm(p * 4.5 + w));
			col = mix(col, uC3, acid * 0.35);
			col += uC2 * fbm(p * 10.0 + w) * 0.05;
		}
		else {
			// DESERTO/ÁRIDO — dunas suaves em bandas largas + cânions discretos.
			float dunes = sin((p.y + fbm(p * 1.8) * 0.5) * 16.0) * 0.5 + 0.5;
			dunes = smoothstep(0.2, 0.8, dunes);
			col = ramp(dunes * 0.55 + fbm(p * 4.0) * 0.18 + 0.14);
			float canyon = ridged(p * 3.2);
			col = mix(col, uC0, smoothstep(1.55, 1.8, canyon) * 0.4);
		}

		vec3 N = normalize(vNormal);
		vec3 L = normalize(uLightDir);

		// Iluminação difusa + leve wrap (não deixa o lado escuro 100% preto)
		float diff = dot(N, L);
		float wrapped = clamp((diff + 0.25) / 1.25, 0.0, 1.0);
		float light = 0.1 + wrapped * 1.0;
		col *= light;

		// Limb darkening — escurece a borda da esfera p/ dar volume
		float facing = clamp(dot(N, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
		col *= mix(0.72, 1.08, facing);

		// Atmosfera sutil: brilho frio na borda do lado iluminado (rim light)
		float rim = pow(1.0 - facing, 3.0) * smoothstep(-0.1, 0.5, diff);
		col += uAtmo * rim * 0.9;

		// Suave realce geral
		col = pow(col, vec3(0.95));

		gl_FragColor = vec4(col, 1.0);
	}
`;

const KINDS = { gas: 0, ocean: 1, lava: 2, ice: 3, toxic: 4, desert: 5 };

/**
 * Cria o ShaderMaterial do planeta.
 * @param {object} profile  { kind, palette:[hex,hex,hex,hex] }
 */
export function createPlanetMaterial(profile) {
	const pal = (profile.palette ?? [0x222222, 0x555555, 0x999999, 0xdddddd])
		.map(h => new THREE.Color(h));
	while (pal.length < 4) pal.push(pal[pal.length - 1]);

	// Cor da atmosfera: a do perfil, ou uma versão suave da cor mais clara.
	const atmo = profile.atmo != null
		? new THREE.Color(profile.atmo)
		: pal[3].clone().lerp(new THREE.Color(0xffffff), 0.35);

	return new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			uTime:     { value: 0 },
			uKind:     { value: KINDS[profile.kind] ?? 0 },
			uC0:       { value: pal[0] },
			uC1:       { value: pal[1] },
			uC2:       { value: pal[2] },
			uC3:       { value: pal[3] },
			uAtmo:     { value: atmo },
			uLightDir: { value: new THREE.Vector3(1, 0.3, 0.6).normalize() }
		}
	});
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHADER DE LUA — corpo rochoso/gelado com crateras, sem atmosfera.
// ═══════════════════════════════════════════════════════════════════════════

const moonFragment = /* glsl */ `
	precision highp float;

	varying vec3 vPos;
	varying vec3 vNormal;

	uniform float uTime;
	uniform int   uKind;   // 0 rocha  1 gelo  2 árida  3 pálida  4 ferro
	uniform vec3  uC0;     // sombra / vales
	uniform vec3  uC1;     // superfície média
	uniform vec3  uC2;     // destaque / cristas
	uniform vec3  uLightDir;

	${GLSL_SIMPLEX}
	${glslFbm(2.05, 2.1)}

	// Campo de crateras: várias "bacias" circulares com borda elevada.
	// Aproximação por amostragem de pontos de ruído (sem worley caro).
	float craters(vec3 p, float scale) {
		float d = 1e9;
		float cell = 0.0;
		// 3 oitavas de crateras de tamanhos diferentes
		for (int o = 0; o < 3; o++) {
			float s = scale * (1.0 + float(o) * 1.9);
			vec3 q = p * s;
			// usa snoise como deslocamento de centros pseudo-aleatórios
			float n = snoise(floor(q) + 0.5);
			vec3 center = floor(q) + 0.5 + 0.4 * vec3(
				snoise(floor(q) + 1.3),
				snoise(floor(q) + 7.1),
				snoise(floor(q) + 3.7));
			float dist = length(fract(q) - 0.5 - (center - floor(q) - 0.5));
			float rad = 0.26 + 0.14 * n;
			float crater = smoothstep(rad, rad * 0.6, dist);          // bacia
			float rim = smoothstep(rad * 1.15, rad, dist) * (1.0 - crater); // borda
			cell += (rim * 0.5 - crater * 0.4) / (1.0 + float(o));
		}
		return cell;
	}

	void main() {
		vec3 p = vPos;
		vec3 col;

		if (uKind == 0) {
			// CRATERIZADA — estilo Lua: relevo + crateras + mares escuros
			float base = fbm(p * 3.0) * 0.5 + 0.5;
			float cr = craters(p, 3.0);
			float relief = clamp(base + cr, 0.0, 1.0);
			col = mix(uC0, uC1, smoothstep(0.15, 0.7, relief));
			col = mix(col, uC2, smoothstep(0.7, 1.0, relief + cr));
			float mare = smoothstep(0.45, 0.3, base);
			col = mix(col, uC0 * 0.85, mare * 0.5);
			col += fbm(p * 14.0) * 0.03;
		}
		else if (uKind == 1) {
			// VULCÂNICA — crosta escura com rachaduras incandescentes (tipo Io)
			float crust = fbm(p * 3.4) * 0.5 + 0.5;
			col = mix(uC0, uC1, crust * crust);
			float cracks = ridged(p * 4.0);
			float glow = smoothstep(1.4, 1.72, cracks);
			float pulse = 0.8 + 0.2 * sin(uTime * 1.4 + cracks * 7.0);
			col = mix(col, uC2 * (1.0 + glow * 0.8), glow * pulse);
			col += uC2 * smoothstep(1.62, 1.78, cracks) * 0.3 * pulse;
		}
		else if (uKind == 2) {
			// GELO FRATURADO — superfície clara com linhas de fratura (tipo Europa)
			float base = fbm(p * 2.6) * 0.5 + 0.5;
			col = mix(uC0, uC1, smoothstep(0.2, 0.85, base));
			float lines = ridged(p * 5.5);
			col = mix(col, uC2, smoothstep(1.5, 1.76, lines) * 0.7);  // veios de gelo
			col += vec3(0.03, 0.05, 0.08) * fbm(p * 20.0);
			col = mix(col, uC2, smoothstep(0.82, 0.95, abs(p.y)) * 0.4); // polos
		}
		else if (uKind == 3) {
			// LISTRADA — faixas suaves onduladas (gás pequeno / mundo em bandas)
			float warp = fbm(p * 2.0) * 0.3;
			float bands = sin((p.y + warp) * 12.0) * 0.5 + 0.5;
			bands = smoothstep(0.2, 0.8, bands);
			col = mix(uC0, uC1, bands);
			col = mix(col, uC2, smoothstep(0.6, 1.0, bands + fbm(p * 7.0) * 0.2));
		}
		else if (uKind == 4) {
			// MÁRMORE — manchas fluidas por domain warp (orgânico, sem crateras)
			vec3 q = p * 2.2;
			float w = fbm(q + vec3(0.0, 0.0, uTime * 0.03));
			float marble = fbm(q + w * 1.8) * 0.5 + 0.5;
			col = mix(uC0, uC1, smoothstep(0.25, 0.6, marble));
			col = mix(col, uC2, smoothstep(0.6, 0.9, marble));
			col += (fbm(p * 10.0 + w)) * 0.04;
		}
		else if (uKind == 5) {
			// POLIDA/METÁLICA — superfície quase lisa, brilho suave especular
			float subtle = fbm(p * 2.5) * 0.5 + 0.5;
			col = mix(uC0, uC1, subtle);
			col = mix(col, uC2, smoothstep(0.55, 0.9, subtle) * 0.6);
		}
		else if (uKind == 6) {
			// SALPICADA — asteroide: base escura com depósitos minerais claros
			float base = fbm(p * 3.2) * 0.5 + 0.5;
			col = mix(uC0, uC1, base);
			// depósitos pontuais (manchas pequenas de alta frequência)
			float spots = smoothstep(0.62, 0.72, fbm(p * 9.0));
			col = mix(col, uC2, spots * 0.8);
			float cr = craters(p, 4.0);
			col = mix(col, uC0 * 0.85, smoothstep(0.1, 0.4, -cr) * 0.5);
		}
		else {
			// CRISTALINA — facetas brilhantes (ridged agudo) tipo cristal/geoda
			float facets = ridged(p * 4.5);
			col = mix(uC0, uC1, smoothstep(0.8, 1.4, facets));
			col = mix(col, uC2, smoothstep(1.45, 1.75, facets));
			col += uC2 * smoothstep(1.65, 1.8, facets) * 0.5; // arestas cintilantes
		}

		// Iluminação
		vec3 N = normalize(vNormal);
		vec3 L = normalize(uLightDir);
		float diff = dot(N, L);
		float wrapped = clamp((diff + 0.2) / 1.2, 0.0, 1.0);
		col *= 0.12 + wrapped * 1.0;

		// Brilho especular (gelo, metal e cristal brilham mais)
		if (uKind == 2 || uKind == 5 || uKind == 7) {
			vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
			float shin = uKind == 5 ? 40.0 : (uKind == 7 ? 60.0 : 18.0);
			float amt  = uKind == 5 ? 0.4  : (uKind == 7 ? 0.5  : 0.2);
			float spec = pow(max(dot(N, H), 0.0), shin);
			col += vec3(1.0) * spec * amt * max(diff, 0.0);
		}

		// Limb darkening
		float facing = clamp(dot(N, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
		col *= mix(0.7, 1.06, facing);

		gl_FragColor = vec4(col, 1.0);
	}
`;

const MOON_KINDS = {
	craterizada: 0, vulcanica: 1, gelo: 2, listrada: 3,
	marmore: 4, polida: 5, salpicada: 6, cristalina: 7
};

/**
 * Cria o ShaderMaterial de uma lua.
 * @param {object} profile  { kind, palette:[hex,hex,hex] }  (sombra, média, crista)
 */
export function createMoonMaterial(profile) {
	const pal = (profile.palette ?? [0x3a3a44, 0x7a7a84, 0xc8c8d0])
		.map(h => new THREE.Color(h));
	while (pal.length < 3) pal.push(pal[pal.length - 1]);

	return new THREE.ShaderMaterial({
		vertexShader, // mesmo vertex do planeta (vPos + vNormal)
		fragmentShader: moonFragment,
		uniforms: {
			uTime:     { value: 0 },
			uKind:     { value: MOON_KINDS[profile.kind] ?? 0 },
			uC0:       { value: pal[0] },
			uC1:       { value: pal[1] },
			uC2:       { value: pal[2] },
			uLightDir: { value: new THREE.Vector3(1, 0.3, 0.6).normalize() }
		}
	});
}
