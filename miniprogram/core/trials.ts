import { COGNITIVE_RULE_VERSION, Condition, GameId, SessionRecord, TrialAnswer, sessionId, shuffle } from './model';

export type TrialGame = Exclude<GameId, 'schulte' | 'mot'>;
export interface Trial {
  condition: Condition;
  text: string;
  color: string;
  side: string;
  shape: string;
  answer: string | null;
}

export const COLORS = [
  { key: 'red', label: '红', color: '#c33349' },
  { key: 'blue', label: '蓝', color: '#245dd7' },
  { key: 'green', label: '绿', color: '#087449' },
  { key: 'yellow', label: '黄', color: '#9a7300' }
];

export const TRIAL_COUNT_OPTIONS: Record<TrialGame, number[]> = {
  stroop: [8, 24, 40], simon: [8, 24, 40], flanker: [12, 24, 48], gonogo: [12, 24, 60]
};
export const STANDARD_TRIAL_COUNTS: Record<TrialGame, number> = {
  stroop: TRIAL_COUNT_OPTIONS.stroop[0], simon: TRIAL_COUNT_OPTIONS.simon[0],
  flanker: TRIAL_COUNT_OPTIONS.flanker[0], gonogo: TRIAL_COUNT_OPTIONS.gonogo[0]
};

export function createTrials(game: TrialGame, random: () => number = Math.random,
  count: number = STANDARD_TRIAL_COUNTS[game]): Trial[] {
  const total = TRIAL_COUNT_OPTIONS[game].includes(count) ? count : STANDARD_TRIAL_COUNTS[game];
  const trials: Trial[] = [];
  const base = { text: '', color: '', side: 'center', shape: '' };
  if (game === 'stroop') {
    COLORS.forEach((ink, i) => {
      for (let j = 0; j < total / 4; j++) {
        const congruent = j < total / 8;
        trials.push({ ...base, condition: congruent ? 'congruent' : 'incongruent',
          text: COLORS[congruent ? i : (i + 1 + (j - total / 8) % 3) % COLORS.length].label, color: ink.color, answer: ink.key });
      }
    });
  } else if (game === 'simon') {
    for (let repeat = 0; repeat < total / 4; repeat++) for (const answer of ['left', 'right']) for (const side of ['left', 'right']) {
      trials.push({ ...base, condition: answer === side ? 'congruent' : 'incongruent', side,
        color: answer === 'left' ? '#245dd7' : '#c46b00', shape: 'circle', answer });
    }
  } else if (game === 'flanker') {
    for (const condition of ['congruent', 'incongruent', 'neutral'] as Condition[]) {
      for (const answer of ['left', 'right']) for (let repeat = 0; repeat < total / 6; repeat++) {
        const middle = answer === 'left' ? '←' : '→';
        const outside = condition === 'neutral' ? '–' : condition === 'congruent' ? middle : answer === 'left' ? '→' : '←';
        trials.push({ ...base, condition, text: [outside, outside, middle, outside, outside].join(' '), answer });
      }
    }
  } else {
    for (let i = 0; i < total; i++) {
      const go = i < total * 3 / 4;
      trials.push({ ...base, condition: go ? 'go' : 'nogo', shape: go ? 'circle' : 'square', answer: go ? 'tap' : null });
    }
  }
  return shuffle(trials, random);
}

export class TrialSession {
  readonly id = sessionId();
  readonly trials: Trial[];
  answers: TrialAnswer[] = [];
  index = 0;
  earlyTaps = 0;
  phase: 'ready' | 'awaiting' | 'stimulus' | 'gap' | 'completed' | 'interrupted' = 'ready';
  startedAt = 0;
  endedAt = 0;
  onset = 0;
  nextAt = 0;
  private pending: TrialAnswer | undefined;

  constructor(readonly game: TrialGame, random: () => number = Math.random,
    count: number = STANDARD_TRIAL_COUNTS[game]) {
    this.trials = createTrials(game, random, count);
  }

  get current(): Trial { return this.trials[this.index]; }
  get responseWindow(): number { return this.game === 'gonogo' ? 1000 : Infinity; }
  get deadline(): number { return this.onset + this.responseWindow; }
  get finished(): boolean { return this.phase === 'completed' || this.phase === 'interrupted'; }

  start(): void {
    if (this.phase === 'ready') this.phase = 'awaiting';
  }

  // Called after the native view has rendered, so preparation time is excluded.
  reveal(now: number): void {
    if (this.phase !== 'awaiting') return;
    if (this.index === 0) this.startedAt = now;
    this.onset = now;
    this.phase = 'stimulus';
    this.pending = undefined;
  }

  respond(response: string, now: number): void {
    this.tick(now);
    if (this.phase === 'gap' && this.game === 'gonogo') {
      this.earlyTaps++;
      return;
    }
    if (this.phase !== 'stimulus' || this.pending) return;
    this.pending = {
      condition: this.current.condition, correct: response === this.current.answer,
      response, rtMs: Math.max(0, now - this.onset)
    };
    this.closeTrial(now);
  }

  tick(now: number): void {
    if (this.phase === 'stimulus' && now >= this.deadline) this.closeTrial(this.deadline);
    if (this.phase === 'gap' && now >= this.nextAt) {
      if (this.index === this.trials.length - 1) {
        this.phase = 'completed';
        this.endedAt = this.nextAt;
      } else {
        this.index++;
        this.phase = 'awaiting';
      }
    }
  }

  private closeTrial(now: number): void {
    this.answers.push(this.pending || {
      condition: this.current.condition, correct: this.current.answer === null, response: null, rtMs: null
    });
    this.pending = undefined;
    if (this.game !== 'gonogo' && this.index === this.trials.length - 1) {
      this.phase = 'completed';
      this.endedAt = now;
    } else {
      this.phase = 'gap';
      this.nextAt = now + 500;
    }
  }

  interrupt(now: number): void {
    if (this.phase === 'ready' || this.finished) return;
    if (this.pending) this.answers.push(this.pending);
    this.pending = undefined;
    this.phase = 'interrupted';
    this.endedAt = now;
  }

  record(): SessionRecord {
    if (!this.finished) throw new Error('本局尚未结束');
    return {
      id: this.id, version: COGNITIVE_RULE_VERSION, config: { game: this.game, count: this.trials.length }, status: this.phase as 'completed' | 'interrupted',
      startedAt: this.startedAt, endedAt: this.endedAt, durationMs: Math.max(0, this.endedAt - this.startedAt),
      errors: this.answers.filter(item => !item.correct).length + this.earlyTaps,
      correct: this.answers.filter(item => item.correct).length, total: this.trials.length,
      answers: this.answers.slice(), earlyTaps: this.earlyTaps
    };
  }
}
