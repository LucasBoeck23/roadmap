import * as THREE from 'three';
import { GLSL_SIMPLEX, glslFbm } from './noise.glsl.js';

/**
 * Shader de superfície solar — plasma procedural animado.
 *
 * Uniforms controlados pelo ciclo de evolução (sunCycle.js):
 *   uTime        tempo contínuo (anima o plasma)
 *   uActivity    0..1  turbulência / velocidade do plasma
 *   uHeat        0..1  temperatura visual (desloca a paleta p/ branco)
 *   uTurbulence  0..1  intensidade da distorção do noise
 *   uSpots       0..1  contraste das manchas solares
 *   uColorCool   cor fria da paleta (vermelho/laranja)
 *   uColorMid    cor média (laranja/dourado)
 *   uColorHot    cor quente (amarelo/branco)
 *   uBrightness  0..~2 multiplicador geral de luminosidade
 */

const vertexShader = /* glsl */ `
	varying vec2 vUv;
	varying vec3 vNormal;
	void main() {
		vUv = uv;
		vNormal = normalize(normalMatrix * normal);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

// Noise simplex 3D clássico (Ashima / stegu) — domínio público.
const fragmentShader = /* glsl */ `
	precision highp float;

	varying vec2 vUv;
	varying vec3 vNormal;

	uniform float uTime;
	uniform float uActivity;
	uniform float uHeat;
	uniform float uTurbulence;
	uniform float uSpots;
	uniform float uBrightness;
	uniform vec3  uColorCool;
	uniform vec3  uColorMid;
	uniform vec3  uColorHot;

	${GLSL_SIMPLEX}
	${glslFbm(2.02)}

	void main() {
		// Coordenada esférica aproximada a partir do uv
		vec3 sp = vec3(vUv * 6.2831, 0.0);

		float t = uTime * (0.15 + uActivity * 0.5);

		// Distorção do domínio (plasma fluindo e se misturando)
		vec3 q = vec3(sp.xy * 2.0, t);
		float warp = fbm(q) * (0.6 + uTurbulence * 1.6);

		vec3 r = vec3(sp.xy * 3.0 + warp, t * 1.3);
		float n = fbm(r);              // -1..1 aprox
		float cells = fbm(vec3(sp.xy * 7.0 + warp * 1.5, t * 2.0));

		// Base de calor: combina as escalas de noise
		float heat = 0.5 + 0.5 * n;
		heat = mix(heat, 0.5 + 0.5 * cells, 0.4);
		heat = clamp(heat + uHeat * 0.35, 0.0, 1.0);

		// Paleta: frio → médio → quente
		vec3 col = mix(uColorCool, uColorMid, smoothstep(0.2, 0.6, heat));
		col = mix(col, uColorHot, smoothstep(0.6, 0.95, heat));

		// Manchas solares — regiões escuras onde o noise de baixa freq é negativo
		float spotNoise = fbm(vec3(sp.xy * 1.6 + 10.0, t * 0.4));
		float spot = smoothstep(0.35, 0.55, spotNoise) * uSpots;
		col *= (1.0 - spot * 0.8);

		// Limb darkening — escurece as bordas da esfera (normal perpendicular à câmera)
		float limb = pow(clamp(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 0.35);
		col *= mix(0.75, 1.15, limb);

		col *= uBrightness;

		gl_FragColor = vec4(col, 1.0);
	}
`;

export function createSunMaterial() {
	return new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			// Fase 1 — estrela estável, amarelo-dourada, plasma animado suavemente
			uTime:       { value: 0 },
			uActivity:   { value: 0.12 },  // movimento sutil do plasma
			uHeat:       { value: 0.0 },   // sem regiões branco-estouradas
			uTurbulence: { value: 0.25 },  // deformação discreta
			uSpots:      { value: 0.3 },   // manchas discretas
			uBrightness: { value: 0.95 },  // luminosidade estável
			uColorCool:  { value: new THREE.Color(0xff5a10) },
			uColorMid:   { value: new THREE.Color(0xffb430) },
			uColorHot:   { value: new THREE.Color(0xfff2b0) }
		}
	});
}
