import * as THREE from 'three';

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

	vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
	vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
	vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
	vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

	float snoise(vec3 v){
		const vec2 C = vec2(1.0/6.0, 1.0/3.0);
		const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
		vec3 i  = floor(v + dot(v, C.yyy));
		vec3 x0 = v - i + dot(i, C.xxx);
		vec3 g = step(x0.yzx, x0.xyz);
		vec3 l = 1.0 - g;
		vec3 i1 = min(g.xyz, l.zxy);
		vec3 i2 = max(g.xyz, l.zxy);
		vec3 x1 = x0 - i1 + C.xxx;
		vec3 x2 = x0 - i2 + C.yyy;
		vec3 x3 = x0 - D.yyy;
		i = mod289(i);
		vec4 p = permute(permute(permute(
			i.z + vec4(0.0, i1.z, i2.z, 1.0))
			+ i.y + vec4(0.0, i1.y, i2.y, 1.0))
			+ i.x + vec4(0.0, i1.x, i2.x, 1.0));
		float n_ = 0.142857142857;
		vec3 ns = n_ * D.wyz - D.xzx;
		vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
		vec4 x_ = floor(j * ns.z);
		vec4 y_ = floor(j - 7.0 * x_);
		vec4 x = x_ * ns.x + ns.yyyy;
		vec4 y = y_ * ns.x + ns.yyyy;
		vec4 h = 1.0 - abs(x) - abs(y);
		vec4 b0 = vec4(x.xy, y.xy);
		vec4 b1 = vec4(x.zw, y.zw);
		vec4 s0 = floor(b0) * 2.0 + 1.0;
		vec4 s1 = floor(b1) * 2.0 + 1.0;
		vec4 sh = -step(h, vec4(0.0));
		vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
		vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
		vec3 p0 = vec3(a0.xy, h.x);
		vec3 p1 = vec3(a0.zw, h.y);
		vec3 p2 = vec3(a1.xy, h.z);
		vec3 p3 = vec3(a1.zw, h.w);
		vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
		p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
		vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
		m = m * m;
		return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
	}

	// FBM — soma de oitavas de noise
	float fbm(vec3 p){
		float f = 0.0;
		float amp = 0.5;
		for (int i = 0; i < 5; i++) {
			f += amp * snoise(p);
			p *= 2.02;
			amp *= 0.5;
		}
		return f;
	}

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
