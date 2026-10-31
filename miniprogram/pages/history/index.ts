import { DURATIONS, GAMES, MODES, SPECS, gameName, specName } from '../../core/catalog';
import { SessionRecord, beijingDay, configKey, localTime } from '../../core/model';
import { ResultView, recordValue, resultView, rt } from '../../core/presentation';
import { compareRecords, reaction } from '../../core/records';
import { loadRecords, saveSettings } from '../../core/storage';

const GAME_OPTIONS = [{ id: 'all', name: '全部训练' }, { id: 'schulte', name: '舒尔特方格' }, ...GAMES];
const MODE_OPTIONS = [{ id: 'all', name: '全部模式' }, ...MODES];
const SPEC_OPTIONS = [{ id: 'all', label: '全部规格' }, ...SPECS];
const TIME_OPTIONS = [{ id: 0, label: '全部时限' }, ...DURATIONS];
interface RecordRow { id: string; title: string; time: string; value: string; extra: string; status: string; best: boolean }

Page({
  data: {
    gameOptions: GAME_OPTIONS, modeOptions: MODE_OPTIONS, specOptions: SPEC_OPTIONS, timeOptions: TIME_OPTIONS,
    gameIndex: 0, modeIndex: 0, specIndex: 0, timeIndex: 0,
    rows: [] as RecordRow[], hasMore: false, totalCount: 0, todayCount: 0, error: '',
    detail: null as ResultView | null
  },
  _records: [] as SessionRecord[],
  _selected: undefined as SessionRecord | undefined,
  _limit: 30,

  onShow() { this.onRefresh(); },
  onRefresh() {
    const result = loadRecords();
    this._records = result.records;
    this.setData({ error: result.error });
    this._renderList();
    if (this._selected && !result.error) {
      this.setData({ detail: { ...resultView(this._selected, this._records), saved: true, settingsLabel: '返回记录列表' } });
    }
  },
  onGame(event: WechatMiniprogram.PickerChange) {
    this._limit = 30;
    this.setData({ gameIndex: Number(event.detail.value), modeIndex: 0, specIndex: 0, timeIndex: 0, specOptions: SPEC_OPTIONS });
    this._renderList();
  },
  onMode(event: WechatMiniprogram.PickerChange) {
    this._limit = 30;
    const modeIndex = Number(event.detail.value);
    this.setData({ modeIndex, specIndex: 0, timeIndex: 0, specOptions: MODE_OPTIONS[modeIndex].id === 'arithmetic' ? SPEC_OPTIONS.slice(0, 8) : SPEC_OPTIONS });
    this._renderList();
  },
  onSpec(event: WechatMiniprogram.PickerChange) {
    this._limit = 30;
    this.setData({ specIndex: Number(event.detail.value) });
    this._renderList();
  },
  onTime(event: WechatMiniprogram.PickerChange) {
    this._limit = 30;
    this.setData({ timeIndex: Number(event.detail.value) });
    this._renderList();
  },
  onMore() { this._limit += 30; this._renderList(); },
  _renderList() {
    const game = GAME_OPTIONS[this.data.gameIndex].id;
    const mode = MODE_OPTIONS[this.data.modeIndex].id;
    const spec = this.data.specOptions[this.data.specIndex].id;
    const time = TIME_OPTIONS[this.data.timeIndex].id;
    const filtered = this._records.filter(item =>
      (game === 'all' || item.config.game === game) &&
      (game !== 'schulte' || mode === 'all' || item.config.mode === mode) &&
      (game !== 'schulte' || (mode === 'patience' ? !time || item.config.seconds === time : spec === 'all' || item.config.spec === spec)));
    const bests = new Map<string, SessionRecord>();
    for (const item of this._records.filter(record => record.status === 'completed')) {
      const key = configKey(item.config, item.version);
      const old = bests.get(key);
      if (!old || compareRecords(item, old) > 0) bests.set(key, item);
    }
    const today = beijingDay(Date.now());
    this.setData({
      rows: filtered.slice(0, this._limit).map(item => ({
        id: item.id, title: gameName(item.config) + ' · ' + specName(item.config),
        time: localTime(item.endedAt), value: recordValue(item),
        extra: item.config.game === 'schulte' ? '错误 ' + item.errors + ' 次' :
          item.config.game === 'mot' ? '找回 ' + item.correct + '/' + item.total + ' 个' :
            '反应 ' + rt(reaction(item.answers)) + ' 毫秒 · 错误 ' + item.errors,
        status: item.status, best: bests.get(configKey(item.config, item.version))?.id === item.id
      })),
      hasMore: filtered.length > this._limit,
      totalCount: filtered.filter(item => item.status === 'completed').length,
      todayCount: filtered.filter(item => item.status === 'completed' && beijingDay(item.endedAt) === today).length
    });
  },
  onDetail(event: WechatMiniprogram.TouchEvent) {
    const record = this._records.find(item => item.id === event.currentTarget.dataset.id);
    if (!record) return;
    this._selected = record;
    this.setData({ detail: { ...resultView(record, this._records), saved: true, settingsLabel: '返回记录列表' } });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  onBackList() {
    this._selected = undefined;
    this.setData({ detail: null });
  },
  onPlay() {
    const config = this._selected?.config;
    if (!config) { this.onHome(); return; }
    if (config.game === 'schulte') {
      saveSettings('schulte:' + config.mode, config);
      wx.navigateTo({ url: '/pages/schulte/index?mode=' + config.mode });
    } else if (config.game === 'mot') {
      saveSettings('mot', config);
      wx.navigateTo({ url: '/pages/tracking/index?rounds=' + (config.rounds || 8) });
    } else {
      const count = config.count ? '&count=' + config.count : '';
      wx.navigateTo({ url: '/pages/task/index?game=' + config.game + count });
    }
  },
  onHome() { wx.reLaunch({ url: '/pages/home/index' }); }
});
