import { GameConfig, SessionRecord, TrialAnswer, beijingDay, configKey } from './model';

export function reaction(answers: TrialAnswer[] = []): number | null {
  const values = answers.filter(item => item.correct && item.rtMs !== null).map(item => item.rtMs!);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function inhibition(record: SessionRecord): { hitRate: number; falseRate: number; balanced: number; misses: number; falseAlarms: number } {
  const go = (record.answers || []).filter(item => item.condition === 'go');
  const nogo = (record.answers || []).filter(item => item.condition === 'nogo');
  const hits = go.filter(item => item.correct).length;
  const falseAlarms = nogo.filter(item => !item.correct).length;
  const hitRate = go.length ? hits / go.length : 0;
  const falseRate = nogo.length ? falseAlarms / nogo.length : 0;
  return { hitRate, falseRate, balanced: (hitRate + 1 - falseRate) / 2, misses: go.length - hits, falseAlarms };
}

export function score(record: SessionRecord): number {
  return record.config.game === 'gonogo' ? inhibition(record).balanced : record.correct / record.total;
}

// Positive means a is better. Only completed sessions enter this comparison.
export function compareRecords(a: SessionRecord, b: SessionRecord): number {
  if (a.config.game === 'schulte') {
    return a.config.mode === 'patience'
      ? a.correct - b.correct || b.errors - a.errors
      : b.durationMs - a.durationMs || b.errors - a.errors;
  }
  const accuracy = score(a) - score(b);
  if (Math.abs(accuracy) > 1e-10) return accuracy;
  if (a.config.game === 'mot') {
    return (a.tracking || []).filter(item => item.hits === item.targets).length -
      (b.tracking || []).filter(item => item.hits === item.targets).length;
  }
  if (a.config.game === 'gonogo' && a.earlyTaps !== b.earlyTaps) return (b.earlyTaps || 0) - (a.earlyTaps || 0);
  const ar = reaction(a.answers), br = reaction(b.answers);
  if (ar === null) return br === null ? 0 : -1;
  if (br === null) return 1;
  return br - ar;
}

export function summarize(records: SessionRecord[], config: GameConfig, day: string, version = 1) {
  const key = configKey(config, version);
  const completed = records.filter(item => item.status === 'completed' && configKey(item.config, item.version) === key);
  const today = completed.filter(item => beijingDay(item.endedAt) === day);
  const best = completed.reduce<SessionRecord | null>((current, item) =>
    !current || compareRecords(item, current) > 0 ? item : current, null);
  const meanMs = today.length ? today.reduce((sum, item) => sum + item.durationMs, 0) / today.length : null;
  const meanRounds = today.length ? today.reduce((sum, item) => sum + (item.rounds || 0), 0) / today.length : null;
  const dailyScore = today.length
    ? today.reduce((sum, item) => sum + score(item) * item.total, 0) / today.reduce((sum, item) => sum + item.total, 0)
    : null;
  return { completed, today, best, meanMs, meanRounds, dailyScore };
}

export function addUnique(records: SessionRecord[], record: SessionRecord): SessionRecord[] {
  return records.some(item => item.id === record.id) ? records : [...records, record];
}
