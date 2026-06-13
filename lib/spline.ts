export type Point = { x: number; y: number };

/**
 * Map a series of numbers to evenly-spaced SVG points within a viewbox,
 * with vertical padding so the stroke never clips at the edges.
 */
export function seriesToPoints(
  values: number[],
  width: number,
  height: number,
  pad = 4
): Point[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerH = height - pad * 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: i * step,
    y: pad + innerH - ((v - min) / span) * innerH
  }));
}

/**
 * Build a smooth Catmull-Rom-derived cubic bezier path through points.
 * `smoothing` ~0.18 gives an expensive, gentle curve without overshoot.
 */
export function smoothLinePath(points: Point[], smoothing = 0.18): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  const line = (a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
  };

  const controlPoint = (current: Point, prev: Point, next: Point, reverse?: boolean) => {
    const p = prev || current;
    const n = next || current;
    const o = line(p, n);
    const angle = o.angle + (reverse ? Math.PI : 0);
    const length = o.length * smoothing;
    return {
      x: current.x + Math.cos(angle) * length,
      y: current.y + Math.sin(angle) * length
    };
  };

  return points.reduce((acc, point, i, arr) => {
    if (i === 0) {
      return `M ${point.x},${point.y}`;
    }
    const cps = controlPoint(arr[i - 1], arr[i - 2], point);
    const cpe = controlPoint(point, arr[i - 1], arr[i + 1], true);
    return `${acc} C ${cps.x},${cps.y} ${cpe.x},${cpe.y} ${point.x},${point.y}`;
  }, "");
}

/** Close a line path into a filled area down to the baseline. */
export function areaPath(points: Point[], height: number, smoothing = 0.18): string {
  if (points.length === 0) return "";
  const line = smoothLinePath(points, smoothing);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x},${height} L ${first.x},${height} Z`;
}
