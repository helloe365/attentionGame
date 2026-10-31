import { ARITHMETIC_RULE_VERSION, GameConfig, RULE_VERSION, SessionRecord, SessionStatus, sessionId, shuffle } from './model';

export interface Equation { text: string; answer: number; operator: string; a: number; b: number }
export interface Cell { value: string; done: boolean; empty?: boolean }

export function equations(count: number, random: () => number = Math.random): Equation[] {
  const operations = shuffle(Array.from({ length: count }, (_, i) => ['+', '-', '×', '/'][i % 4]), random);
  // 降低难度：答案与操作数都限制在 100 以内；棋盘越小，数字上限越小。
  const maxAnswer = Math.min(100, Math.max(30, Math.round(count * 1.3)));
  const used = new Set<number>();
  const build = (operator: string): Equation => {
    // Enumerating candidates guarantees a finite, unique result for every board.
    const candidates: Equation[] = [];
    if (operator === '×') {
      for (let a = 2; a <= 10; a++) for (let b = 2; b <= Math.min(10, Math.floor(maxAnswer / a)); b++) {
        if (!used.has(a * b)) candidates.push({ a, b, operator, answer: a * b, text: a + ' × ' + b });
      }
    } else if (operator === '/') {
      for (let b = 2; b <= 9; b++) for (let answer = 1; answer <= Math.floor(maxAnswer / b); answer++) {
        if (!used.has(answer)) candidates.push({ a: answer * b, b, operator, answer, text: answer * b + ' / ' + b });
      }
    } else {
      const top = operator === '+' ? maxAnswer : maxAnswer - 1;
      for (let answer = operator === '+' ? 2 : 1; answer <= top; answer++) {
        if (used.has(answer)) continue;
        const a = operator === '+' ? 1 + Math.floor(random() * (answer - 1)) : answer + 1 + Math.floor(random() * (maxAnswer - answer));
        const b = operator === '+' ? answer - a : a - answer;
        candidates.push({ a, b, operator, answer, text: a + ' ' + operator + ' ' + b });
      }
    }
    const chosen = candidates[Math.floor(random() * candidates.length)];
    used.add(chosen.answer);
    return chosen;
  };
  // 先生成候选较少的乘除，再生成加减，保证任何盘面都能凑齐全部题目。
  const priority = (operator: string) => (operator === '×' ? 0 : operator === '/' ? 1 : operator === '+' ? 2 : 3);
  const questions: Equation[] = new Array(count);
  operations
    .map((operator, index) => ({ operator, index }))
    .sort((x, y) => priority(x.operator) - priority(y.operator) || x.index - y.index)
    .forEach(item => { questions[item.index] = build(item.operator); });
  return questions;
}

export class SchulteSession {
  readonly id = sessionId();
  readonly config: GameConfig;
  readonly targets: string[];
  readonly questions: Equation[];
  readonly columns: number;
  readonly total: number;
  cells: Cell[] = [];
  position = 0;
  rounds = 0;
  errors = 0;
  correct = 0;
  startedAt = 0;
  endedAt = 0;
  status: SessionStatus | 'ready' | 'running' = 'ready';

  constructor(config: GameConfig, private readonly random: () => number = Math.random) {
    this.config = { ...config };
    const letters = config.spec === 'upper' || config.spec === 'lower';
    this.columns = letters ? 6 : Number(config.spec);
    this.total = letters ? 26 : this.columns * this.columns;
    this.questions = config.mode === 'arithmetic' ? equations(this.total, random) : [];
    let targets = letters
      ? Array.from({ length: 26 }, (_, i) => String.fromCharCode((config.spec === 'upper' ? 65 : 97) + i))
      : Array.from({ length: this.total }, (_, i) => String(i + 1));
    if (config.mode === 'reverse') targets = targets.reverse();
    if (config.mode === 'arithmetic') targets = this.questions.map(item => String(item.answer));
    this.targets = targets;
    this.resetBoard();
  }

  private resetBoard(): void {
    this.cells = shuffle(this.targets, this.random).map(value => ({ value, done: false }));
  }

  start(now: number): void {
    if (this.status !== 'ready') return;
    this.startedAt = now;
    this.status = 'running';
  }

  get target(): string { return this.targets[this.position] || ''; }
  get equation(): string { return this.questions[this.position]?.text || ''; }
  get deadline(): number { return this.startedAt + (this.config.seconds || 0) * 1000; }

  elapsed(now: number): number {
    if (this.status === 'ready') return 0;
    const end = this.status === 'running' ? now : this.endedAt;
    return Math.max(0, this.config.mode === 'patience' ? Math.min(end, this.deadline) - this.startedAt : end - this.startedAt);
  }

  tick(now: number): boolean {
    if (this.status === 'running' && this.config.mode === 'patience' && now >= this.deadline) {
      this.finish('completed', this.deadline);
      return true;
    }
    return false;
  }

  tap(index: number, now: number): 'ignored' | 'wrong' | 'correct' | 'finished' {
    if (this.status !== 'running') return 'ignored';
    if (this.tick(now)) return 'finished';
    const cell = this.cells[index];
    if (!cell) return 'ignored';
    if (cell.value !== this.target) {
      this.errors++;
      if (this.config.mode === 'challenge') this.finish('failed', now);
      return 'wrong';
    }
    cell.done = true;
    this.position++;
    this.correct++;
    if (this.position === this.total) {
      if (this.config.mode === 'patience') {
        this.rounds++;
        this.position = 0;
        this.resetBoard();
      } else {
        this.finish('completed', now);
        return 'finished';
      }
    } else if (this.config.mode === 'crazy') {
      this.cells = shuffle(this.cells, this.random);
    }
    return 'correct';
  }

  interrupt(now: number): void {
    if (this.status === 'running' && !this.tick(now)) this.finish('interrupted', now);
  }

  private finish(status: SessionStatus, now: number): void {
    this.status = status;
    this.endedAt = now;
  }

  record(): SessionRecord {
    if (this.status === 'ready' || this.status === 'running') throw new Error('本局尚未结束');
    const version = this.config.mode === 'arithmetic' ? ARITHMETIC_RULE_VERSION : RULE_VERSION;
    return {
      id: this.id, version, config: this.config, startedAt: this.startedAt,
      endedAt: this.endedAt, durationMs: this.elapsed(this.endedAt), status: this.status,
      errors: this.errors, correct: this.correct, total: this.total,
      ...(this.config.mode === 'patience' ? { rounds: this.rounds, progress: this.position } : {})
    };
  }
}
