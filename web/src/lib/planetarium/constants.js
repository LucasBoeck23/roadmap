// Cor de cada planeta, escolhida pelo índice da track
export const PLANET_COLORS = [0x4a88c7, 0x02c8b8, 0xa050d8, 0x50d878, 0xd85050, 0xd8a030];

/**
 * Perfis visuais dos planetas — cada track ganha identidade própria (tipo +
 * paleta), escolhida pelo índice da track (cicla se houver mais tracks).
 * O `kind` seleciona o desenho no shader (ver planetShader.js):
 * gas · ocean · lava · ice · toxic · desert.
 * palette: [escura → clara/acento] · atmo: brilho atmosférico (rim light)
 * base: cor representativa (HUD / fallback).
 */
export const PLANET_PROFILES = [
	{ kind: 'ocean',  base: 0x1f7a8c, atmo: 0x9fe8e0, palette: [0x0a2a4a, 0x1f7a8c, 0x6fd0c8, 0xdbead0] }, // Aqua
	{ kind: 'gas',    base: 0xc98a6a, atmo: 0xffd9b0, palette: [0x6b4a7a, 0xc98a6a, 0xf0b98a, 0xfbe3c0] }, // Âmbar
	{ kind: 'toxic',  base: 0x5a3fa8, atmo: 0xc9a8ff, palette: [0x241a4a, 0x5a3fa8, 0xb06fd8, 0x8fe3c0] }, // Aurora
	{ kind: 'ice',    base: 0xaccbe8, atmo: 0xcfe6ff, palette: [0x5a7fb0, 0xaccbe8, 0xeaf3fb, 0xd4e8ff] }, // Glacial
	{ kind: 'lava',   base: 0xe0552f, atmo: 0xff8a5a, palette: [0x1b0f1a, 0x5a1f3a, 0xe0552f, 0xffcf7a] }, // Brasa
	{ kind: 'gas',    base: 0xa85a7a, atmo: 0xffc9dd, palette: [0x4a2a52, 0xa85a7a, 0xe89fb0, 0xf7dce4] }, // Rosé
	{ kind: 'desert', base: 0xb8824a, atmo: 0xffe6b0, palette: [0x5a3a2a, 0xb8824a, 0xe8c784, 0xf6e6c0] }, // Dunas
	{ kind: 'ocean',  base: 0x1f7a52, atmo: 0xaef0c6, palette: [0x0a2e24, 0x1f7a52, 0x5fd090, 0xe0f0cf] }  // Esmeralda
];

/**
 * Perfis de lua (shader). Cores naturais, tipos visualmente distintos.
 * Atribuídos por SEMENTE determinística (hash do
 * id do tópico) — cada tópico tem sempre a mesma lua, sem relação com status.
 * palette: [sombra/vales → média → cristas/destaque]
 */
export const MOON_PROFILES = [
	{ kind: 'craterizada', palette: [0x3a3a3e, 0x82828a, 0xd2d2d8] },
	{ kind: 'craterizada', palette: [0x3a2e22, 0x7e6448, 0xcbb08a] },
	{ kind: 'vulcanica',   palette: [0x241614, 0x5a342a, 0xc06a40] },
	{ kind: 'vulcanica',   palette: [0x322c18, 0x6e6030, 0xc8b068] },
	{ kind: 'gelo',        palette: [0x6a7682, 0xbecdd8, 0xdfeaf2] },
	{ kind: 'gelo',        palette: [0x5a6066, 0xa8b0b6, 0xdadee2] },
	{ kind: 'listrada',    palette: [0x3e352c, 0x8a7a62, 0xd0c0a0] },
	{ kind: 'listrada',    palette: [0x443620, 0x9a7e4a, 0xd8c088] },
	{ kind: 'marmore',     palette: [0x33403e, 0x6e8482, 0xc2d2ce] },
	{ kind: 'marmore',     palette: [0x3a2c26, 0x8a6a58, 0xd4b8a0] },
	{ kind: 'polida',      palette: [0x2c2a28, 0x746a60, 0xc8bcaa] },
	{ kind: 'polida',      palette: [0x2e2018, 0x7a543a, 0xc89470] },
	{ kind: 'salpicada',   palette: [0x26221f, 0x564e44, 0xb8a888] },
	{ kind: 'salpicada',   palette: [0x1a1a1c, 0x40424a, 0x9aa0a8] },
	{ kind: 'cristalina',  palette: [0x33383e, 0x7a8490, 0xcdd6de] },
	{ kind: 'cristalina',  palette: [0x342a1e, 0x7e6440, 0xd0ac78] }
];

/** Hash determinístico simples (string → uint32). */
export function seedFromString(str) {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Escolhe um perfil de lua estável a partir do id do tópico. */
export function moonProfileFor(id) {
	return MOON_PROFILES[seedFromString(String(id)) % MOON_PROFILES.length];
}
