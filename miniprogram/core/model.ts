export type GameId = 'schulte' | 'stroop' | 'simon' | 'flanker' | 'gonogo' | 'mot';
export type SchulteMode = 'practice' | 'classic' | 'reverse' | 'challenge' | 'crazy' | 'arithmetic' | 'patience';
export type SessionStatus = 'completed' | 'failed' | 'interrupted';
export type Condition = 'congruent' | 'incongruent' | 'neutral' | 'go' | 'nogo';

export interface GameConfig {
  game: GameId;
  mode?: SchulteMode;
  spec?: string;
  seconds?: number;
  targets?: number;
  count?: number;
  rounds?: number;
}

export interface TrialAnswer {
  condition: Condition;
  correct: boolean;
  response: string | null;
  rtMs: number | null;
}

export interface TrackingRound {
  hits: number;
  targets: number;
}

export interface SessionRecord {
  id: string;
  version: number;
  config: GameConfig;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  status: SessionStatus;
  errors: number;
  correct: number;
  total: number;
  rounds?: number;
  progress?: number;
  answers?: TrialAnswer[];
  earlyTaps?: number;
  tracking?: TrackingRound[];
}

export const RULE_VERSION = 1;
// Arithmetic difficulty was lowered (answers now within 100); it uses its own version so
// old scores stay readable but never mix into new daily means or records.
export const ARITHMETIC_RULE_VERSION = 2;
// Response timing and selectable tracking rounds changed; keep earlier scores readable but separate.
export const COGNITIVE_RULE_VERSION = 4;

export function sessionId(now = Date.now()): string {
  return now.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function shuffle<T>(values: readonly T[], random: () => number = Math.random): T[] {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function beijingDay(timestamp: number): string {
  const date = new Date(timestamp + 8 * 60 * 60 * 1000);
  return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join('-');
}

export function localTime(timestamp: number): string {
  const date = new Date(timestamp + 8 * 60 * 60 * 1000);
  return beijingDay(timestamp) + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes());
}

function pad(value: number): string { return value < 10 ? '0' + value : String(value); }

export function configKey(config: GameConfig, version = RULE_VERSION): string {
  if (config.game === 'schulte') {
    return [version, config.game, config.mode, config.spec, config.mode === 'patience' ? config.seconds : ''].join(':');
  }
  if (config.game === 'mot') return [version, config.game, config.targets, config.rounds || 8].join(':');
  return [version, config.game, config.count || 'standard'].join(':');
}
