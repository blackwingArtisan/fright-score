/** Shared canvas helpers and the board palette (kept in sync with styles.css). */
export const COLORS = {
  mask: '#0c241d',
  maskDeep: '#071611',
  maskRaised: '#12322a',
  copper: '#c9894a',
  copperDim: '#7a5530',
  silk: '#ece6d2',
  silkDim: '#a8b3a9',
  tin: '#8f9a96',
  blood: '#e0343f',
} as const;

export const FONT_SILK = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
export const FONT_GOTHIC = "'Pirata One', Georgia, serif";

/** Size a canvas for the device pixel ratio; returns a context scaled to CSS pixels. */
export function fitCanvas(canvas: HTMLCanvasElement, cssHeight: number): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth);
  canvas.style.height = `${cssHeight}px`;
  const pxW = Math.round(width * dpr);
  const pxH = Math.round(cssHeight * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height: cssHeight };
}
