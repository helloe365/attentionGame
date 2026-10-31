import { COGNITIVE_RULE_VERSION, SessionRecord, TrackingRound, sessionId, shuffle } from './model';

export interface Dot { id: number; x: number; y: number; vx: number; vy: number }
export const DOT_RADIUS = 0.044;
export const DOT_COUNT = 10;
export const CUE_MS = 2000;
export const MOTION_MS = 8000;
export const MOT_ROUND_OPTIONS = [2, 4, 8];
export const DEFAULT_MOT_ROUNDS = MOT_ROUND_OPTIONS[0];
const TARGET_SPEEDS: Record<number, number> = { 3: 0.22, 4: 0.28, 5: 0.34 };

export function createDots(random: () => number = Math.random, speed = 0.22): Dot[] {
  const positions = shuffle(Array.from({ length: 12 }, (_, i) => ({
    x: 0.18 + (i % 3) * 0.32, y: 0.14 + Math.floor(i / 3) * 0.24
  })), random).slice(0, DOT_COUNT);
  return positions.map((position, id) => {
    const angle = random() * Math.PI * 2;
    return { id, ...position, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  });
}

export function moveDots(dots: Dot[], seconds: number): void {
  let remaining = Math.max(0, seconds);
  while (remaining > 0.000001) {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    for (const dot of dots) {
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
      contain(dot);
    }
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      const a = dots[i], b = dots[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= DOT_RADIUS * 2) continue;
      const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
      const overlap = (DOT_RADIUS * 2 - distance) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing > 0) {
        a.vx -= closing * nx; a.vy -= closing * ny;
        b.vx += closing * nx; b.vy += closing * ny;
      }
      contain(a); contain(b);
    }
  }
}

function contain(dot: Dot): void {
  if (dot.x < DOT_RADIUS) { dot.x = DOT_RADIUS; dot.vx = Math.abs(dot.vx); }
  if (dot.x > 1 - DOT_RADIUS) { dot.x = 1 - DOT_RADIUS; dot.vx = -Math.abs(dot.vx); }
  if (dot.y < DOT_RADIUS) { dot.y = DOT_RADIUS; dot.vy = Math.abs(dot.vy); }
  if (dot.y > 1 - DOT_RADIUS) { dot.y = 1 - DOT_RADIUS; dot.vy = -Math.abs(dot.vy); }
}

export class TrackingSession {
  readonly id = sessionId();
  readonly roundCount: number;
  dots: Dot[] = [];
  targets: number[] = [];
  selected: number[] = [];
  results: TrackingRound[] = [];
  phase: 'ready' | 'cue' | 'moving' | 'select' | 'feedback' | 'completed' | 'interrupted' = 'ready';
  round = 0;
  startedAt = 0;
  endedAt = 0;
  roundStart = 0;
  lastUpdate = 0;

  constructor(readonly targetCount: number, private readonly random: () => number = Math.random,
    roundCount = DEFAULT_MOT_ROUNDS) {
    this.roundCount = MOT_ROUND_OPTIONS.includes(roundCount) ? roundCount : DEFAULT_MOT_ROUNDS;
  }

  start(now: number): void {
    if (this.phase !== 'ready') return;
    this.startedAt = now;
    this.setupRound(now);
  }

  private setupRound(now: number): void {
    this.round++;
    this.dots = createDots(this.random, TARGET_SPEEDS[this.targetCount]);
    this.targets = shuffle(this.dots.map(dot => dot.id), this.random).slice(0, this.targetCount);
    this.selected = [];
    this.roundStart = now;
    this.lastUpdate = now + CUE_MS;
    this.phase = 'cue';
  }

  tick(now: number): void {
    if (this.phase === 'cue' && now >= this.roundStart + CUE_MS) this.phase = 'moving';
    if (this.phase !== 'moving') return;
    const end = Math.min(now, this.roundStart + CUE_MS + MOTION_MS);
    moveDots(this.dots, Math.max(0, end - this.lastUpdate) / 1000);
    this.lastUpdate = end;
    if (now >= this.roundStart + CUE_MS + MOTION_MS) this.phase = 'select';
  }

  toggle(id: number): void {
    if (this.phase !== 'select' || !this.dots.some(dot => dot.id === id)) return;
    if (this.selected.includes(id)) this.selected = this.selected.filter(value => value !== id);
    else if (this.selected.length < this.targetCount) this.selected.push(id);
  }

  hitTest(x: number, y: number, radius = DOT_RADIUS): number | undefined {
    const sorted = this.dots.map(dot => ({ id: dot.id, distance: Math.hypot(dot.x - x, dot.y - y) }))
      .sort((a, b) => a.distance - b.distance);
    return sorted[0]?.distance <= radius ? sorted[0].id : undefined;
  }

  submit(now: number): boolean {
    if (this.phase !== 'select' || this.selected.length !== this.targetCount) return false;
    this.results.push({ hits: this.selected.filter(id => this.targets.includes(id)).length, targets: this.targetCount });
    if (this.round === this.roundCount) { this.phase = 'completed'; this.endedAt = now; }
    else this.phase = 'feedback';
    return true;
  }

  next(now: number): void {
    if (this.phase === 'feedback') this.setupRound(now);
  }

  interrupt(now: number): void {
    if (this.phase === 'ready' || this.phase === 'completed' || this.phase === 'interrupted') return;
    this.phase = 'interrupted';
    this.endedAt = now;
  }

  record(): SessionRecord {
    if (this.phase !== 'completed' && this.phase !== 'interrupted') throw new Error('本局尚未结束');
    const correct = this.results.reduce((sum, item) => sum + item.hits, 0);
    const attempted = this.results.reduce((sum, item) => sum + item.targets, 0);
    return {
      id: this.id, version: COGNITIVE_RULE_VERSION, config: { game: 'mot', targets: this.targetCount, rounds: this.roundCount },
      startedAt: this.startedAt, endedAt: this.endedAt, durationMs: this.endedAt - this.startedAt,
      status: this.phase, errors: attempted - correct, correct, total: this.targetCount * this.roundCount,
      tracking: this.results.slice()
    };
  }
}
