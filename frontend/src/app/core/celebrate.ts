/**
 * A short burst of confetti, drawn on a temporary full-screen canvas that ignores taps.
 * No library. Skipped for people who turned animations off.
 */
const COLORS = ['#22c55e', '#facc15', '#f59e0b', '#38bdf8', '#f43f5e', '#ffffff'];

interface Piece { x: number; y: number; vx: number; vy: number; size: number; color: string; spin: number; angle: number }

export const celebrate = (opts: { x?: number; y?: number; count?: number; spread?: number } = {}) => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '70' });
  document.body.appendChild(canvas);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(ratio, ratio);

  // From a point (e.g. a button) or from the top of the screen.
  const fromPoint = opts.x !== undefined && opts.y !== undefined;
  const count = opts.count ?? (fromPoint ? 40 : 140);
  const spread = opts.spread ?? (fromPoint ? 9 : 14);
  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = fromPoint ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const speed = spread * (0.5 + Math.random());
    return {
      x: fromPoint ? opts.x! : innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.6,
      y: fromPoint ? opts.y! : -10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * (fromPoint ? 1 : 0.4),
      size: 5 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      spin: (Math.random() - 0.5) * 0.4,
      angle: Math.random() * Math.PI
    };
  });

  const start = performance.now();
  const life = fromPoint ? 1300 : 2600;
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - life * 0.6) / (life * 0.4));
    for (const p of pieces) {
      p.vy += 0.25; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
};
