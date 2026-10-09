// Cor de cada planeta, escolhida pelo índice da track
export const PLANET_COLORS = [0x4a88c7, 0x02c8b8, 0xa050d8, 0x50d878, 0xd85050, 0xd8a030];

// Estilo visual das luas por status do tópico.
// `ei` = emissiveIntensity (quanto a lua brilha por conta própria).
export const STATUS_STYLE = {
	'concluido':    { color: 0xd4b040, ei: 0.7 },
	'em-progresso': { color: 0xd08030, ei: 0.5 },
	'nao-iniciado': { color: 0x3a4a6a, ei: 0.0 }
};
