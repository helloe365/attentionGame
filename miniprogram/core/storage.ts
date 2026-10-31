import { DURATIONS, GAMES, MODES, SPECS } from './catalog';
import { GameConfig, SessionRecord, beijingDay } from './model';
import { addUnique } from './records';

const RECORD_PREFIX = 'attention:records:v1:';
const SETTINGS_PREFIX = 'attention:settings:v1:';

function validRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as SessionRecord;
  if (typeof item.id !== 'string' || !item.config || !['completed', 'failed', 'interrupted'].includes(item.status)) return false;
  if (![item.version, item.startedAt, item.endedAt, item.durationMs, item.errors, item.correct, item.total].every(Number.isFinite)) return false;
  if (item.durationMs < 0 || item.errors < 0 || item.correct < 0 || item.total <= 0) return false;
  const config = item.config;
  if (config.game === 'schulte') {
    return MODES.some(mode => mode.id === config.mode) && SPECS.some(spec => spec.id === config.spec) &&
      (config.mode !== 'patience' || (config.spec === '5' && DURATIONS.some(time => time.id === config.seconds)));
  }
  if (config.game === 'mot') return [3, 4, 5].includes(config.targets || 0) && Array.isArray(item.tracking);
  return GAMES.some(game => game.id === config.game) && Array.isArray(item.answers);
}

function readBucket(key: string): SessionRecord[] {
  const raw: unknown = wx.getStorageSync(key);
  if (raw === '' || raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every(validRecord)) throw new Error('训练记录读取失败，原数据已保留。');
  return raw;
}

export function loadRecords(): { records: SessionRecord[]; error: string } {
  try {
    const keys = wx.getStorageInfoSync().keys.filter(key => key.startsWith(RECORD_PREFIX));
    const records = keys.reduce<SessionRecord[]>((all, key) => all.concat(readBucket(key)), []);
    return { records: records.sort((a, b) => b.endedAt - a.endedAt), error: '' };
  } catch {
    return { records: [], error: '暂时无法读取训练记录，请稍后重试。原数据已保留。' };
  }
}

export function saveRecord(record: SessionRecord): void {
  if (!validRecord(record)) throw new Error('训练记录格式错误。');
  // Monthly, per-game buckets avoid growing a single storage key indefinitely.
  const key = RECORD_PREFIX + beijingDay(record.endedAt).slice(0, 7) + ':' + record.config.game;
  const existing = readBucket(key);
  const updated = addUnique(existing, record);
  if (updated !== existing) wx.setStorageSync(key, updated);
}

export function loadSettings(key: string): Partial<GameConfig> {
  try {
    const value: unknown = wx.getStorageSync(SETTINGS_PREFIX + key);
    return value && typeof value === 'object' ? value as Partial<GameConfig> : {};
  } catch { return {}; }
}

export function saveSettings(key: string, config: GameConfig): boolean {
  try { wx.setStorageSync(SETTINGS_PREFIX + key, config); return true; }
  catch { return false; }
}
