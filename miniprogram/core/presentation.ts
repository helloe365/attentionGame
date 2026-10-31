import { gameName, specName } from './catalog';
import { SessionRecord, beijingDay } from './model';
import { compareRecords, inhibition, reaction, score, summarize } from './records';
import { loadRecords, saveRecord } from './storage';

export interface Metric { label: string; value: string; unit: string }
export interface ResultView {
  title: string;
  subtitle: string;
  hero: string;
  unit: string;
  caption: string;
  metrics: Metric[];
  details: string[];
  isBest: boolean;
  saveError: string;
  saved: boolean;
  settingsLabel: string;
}

export function seconds(ms: number): string { return (ms / 1000).toFixed(2); }
export function percent(value: number | null): string { return value === null ? '—' : (value * 100).toFixed(1); }
export function rt(value: number | null): string { return value === null ? '—' : String(Math.round(value)); }
export function patienceValue(record: SessionRecord): string { return (record.rounds || 0) + '轮+' + (record.progress || 0) + '格'; }

export function recordValue(record: SessionRecord): string {
  if (record.status === 'interrupted') return '已中断';
  if (record.status === 'failed') return '挑战失败';
  if (record.config.game === 'schulte') {
    return record.config.mode === 'patience' ? patienceValue(record) : seconds(record.durationMs) + ' 秒';
  }
  return percent(score(record)) + '%';
}

export function resultView(record: SessionRecord, records: SessionRecord[], available = true): ResultView {
  const summary = summarize(records, record.config, beijingDay(record.endedAt), record.version);
  const best = available ? summary.best : null;
  const previous = summary.completed.filter(item => item.id !== record.id);
  const isBest = available && record.status === 'completed' &&
    previous.every(item => compareRecords(record, item) > 0);
  const result: ResultView = {
    title: record.status === 'completed' ? '训练完成' : record.status === 'failed' ? '挑战失败' : '本局已中断',
    subtitle: gameName(record.config) + ' · ' + specName(record.config),
    hero: '', unit: '', caption: '', metrics: [], details: [], isBest, saveError: '', saved: false,
    settingsLabel: record.config.game === 'schulte' || record.config.game === 'mot' ? '调整设置' : '查看玩法'
  };
  const metric = (label: string, value: string, unit = '') => ({ label, value, unit });
  if (record.config.game === 'schulte') {
    const patience = record.config.mode === 'patience';
    result.hero = patience ? String(record.rounds || 0) : seconds(record.durationMs);
    result.unit = patience ? '轮' : '秒';
    result.caption = patience ? '本轮进度 ' + record.progress + '/25' : '完成 ' + record.correct + '/' + record.total + ' 个目标';
    result.metrics = [
      metric('错误', String(record.errors), '次'),
      metric('反应', seconds(record.durationMs), '秒'),
      metric('日均', available ? (patience ? summary.meanRounds?.toFixed(2) : summary.meanMs === null ? undefined : seconds(summary.meanMs)) || '—' : '—', patience ? '轮' : '秒'),
      metric('纪录', best ? patience ? patienceValue(best) : seconds(best.durationMs) : '—', patience ? '' : '秒')
    ];
  } else if (record.config.game === 'gonogo') {
    const stats = inhibition(record);
    result.hero = percent(stats.balanced); result.unit = '%'; result.caption = '应答与抑制的平均正确率';
    result.metrics = [
      metric('Go 命中', percent(stats.hitRate), '%'), metric('No-Go 误按', percent(stats.falseRate), '%'),
      metric('漏按', String(stats.misses), '次'), metric('反应', rt(reaction(record.answers)), '毫秒')
    ];
  } else if (record.config.game === 'mot') {
    const rounds = record.tracking || [];
    result.hero = percent(record.correct / record.total); result.unit = '%'; result.caption = '目标找回率';
    result.metrics = [
      metric('找回', record.correct + '/' + record.total, '个'),
      metric('全对', String(rounds.filter(item => item.hits === item.targets).length), '轮'),
      metric('日均', percent(available ? summary.dailyScore : null), '%'),
      metric('纪录', percent(best ? score(best) : null), '%')
    ];
  } else {
    const answers = record.answers || [];
    result.hero = percent(score(record)); result.unit = '%'; result.caption = '正确 ' + record.correct + '/' + record.total + ' 题';
    result.metrics = [
      metric('反应', rt(reaction(answers)), '毫秒'),
      metric('错误', String(record.errors), '题'),
      metric('日均正确率', percent(available ? summary.dailyScore : null), '%'),
      metric('纪录正确率', percent(best ? score(best) : null), '%')
    ];
  }
  if (record.status !== 'completed') {
    result.hero = record.status === 'failed' ? '失败' : '中断';
    result.unit = '';
    result.isBest = false;
  }
  return result;
}

export function persistResult(record: SessionRecord): ResultView {
  let saved = false;
  let saveError = '';
  try { saveRecord(record); saved = true; }
  catch { saveError = '本局尚未保存。请检查可用存储空间后重试。'; }
  const loaded = loadRecords();
  const result = resultView(record, loaded.records, saved && !loaded.error);
  return { ...result, saved, saveError: saveError || loaded.error };
}
