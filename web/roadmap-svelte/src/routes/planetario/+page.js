// O planetário usa Three.js (WebGL + requestAnimationFrame), que não existem
// no servidor. Renderizar só no cliente evita o erro de SSR e garante que o
// container já tenha tamanho real quando a cena inicializa.
export const ssr = false;
