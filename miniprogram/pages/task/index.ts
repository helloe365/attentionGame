import { GAMES } from '../../core/catalog';
import { SessionRecord } from '../../core/model';
import { ResultView, persistResult, seconds } from '../../core/presentation';
import { COLORS, TRIAL_COUNT_OPTIONS, Trial, TrialGame, TrialSession } from '../../core/trials';

interface ResponseButton { key: string; label: string; color: string; filled: boolean }

function buttons(game: TrialGame): ResponseButton[] {
  if (game === 'stroop') return COLORS.map(item => ({ ...item, filled: false }));
  if (game === 'simon') return [
    { key: 'left', label: '← 蓝', color: '#245dd7', filled: true },
    { key: 'right', label: '橙 →', color: '#aa5a00', filled: true }
  ];
  if (game === 'gonogo') return [{ key: 'tap', label: '点击', color: '#245dd7', filled: true }];
  return [
    { key: 'left', label: '← 向左', color: '#245dd7', filled: false },
    { key: 'right', label: '向右 →', color: '#245dd7', filled: false }
  ];
}

Page({
  data: {
    phase: 'ready', game: 'stroop' as TrialGame, info: GAMES[0],
    buttons: [] as ResponseButton[], countOptions: [] as number[], count: GAMES[0].count,
    trial: { condition: 'congruent', text: '', color: '', side: 'center', shape: '', answer: null } as Trial,
    visible: false, inputEnabled: false, trialNumber: 1, answered: 0, progressWidth: 0, errors: 0,
    elapsed: '0.00', notice: '', result: null as ResultView | null
  },
  _session: undefined as TrialSession | undefined,
  _record: undefined as SessionRecord | undefined,
  _timer: undefined as number | undefined,
  _rendering: false,
  _renderToken: 0,
  _shownPhase: '',
  _shownIndex: -1,

  onLoad(options) {
    const game = ['stroop', 'simon', 'flanker', 'gonogo'].includes(options.game || '') ? options.game as TrialGame : 'stroop';
    const info = GAMES.find(item => item.id === game)!;
    const count = Number(options.count);
    const initialCount = TRIAL_COUNT_OPTIONS[game].includes(count) ? count : info.count;
    this.setData({ game, info, buttons: buttons(game), countOptions: TRIAL_COUNT_OPTIONS[game], count: initialCount });
    wx.setNavigationBarTitle({ title: info.name });
  },
  onHide() { this._leave(); },
  onUnload() { this._leave(); },

  onCount(event: WechatMiniprogram.TouchEvent) {
    const count = Number(event.currentTarget.dataset.count);
    if (this.data.phase === 'ready' && this.data.countOptions.includes(count)) this.setData({ count });
  },
  onStart() {
    if (this.data.phase === 'running') return;
    this._stop();
    this._record = undefined;
    this._session = new TrialSession(this.data.game, Math.random, this.data.count);
    this._session.start();
    this._shownPhase = '';
    this._shownIndex = -1;
    this.setData({ phase: 'running', result: null, notice: '', elapsed: '0.00' });
    this._sync();
    wx.setKeepScreenOn({ keepScreenOn: true });
    this._timer = setInterval(() => this._tick(), 25);
  },
  _sync() {
    const session = this._session;
    if (!session) return;
    if (session.finished) { this._finish(); return; }
    if (this._rendering) return;
    const awaiting = session.phase === 'awaiting';
    this._rendering = awaiting;
    const token = ++this._renderToken;
    this._shownPhase = session.phase;
    this._shownIndex = session.index;
    this.setData({
      trial: session.current,
      visible: awaiting || session.phase === 'stimulus',
      inputEnabled: this.data.game === 'gonogo' || awaiting || session.phase === 'stimulus',
      trialNumber: session.index + 1, answered: session.answers.length,
      progressWidth: session.answers.length / session.trials.length * 100,
      errors: session.answers.filter(item => !item.correct).length + session.earlyTaps
    }, () => {
      if (token !== this._renderToken || this._session !== session || this.data.phase !== 'running') return;
      if (awaiting) session.reveal(Date.now());
      this._rendering = false;
    });
  },
  _tick() {
    const session = this._session;
    if (!session || this.data.phase !== 'running') return;
    const now = Date.now();
    session.tick(now);
    if (session.finished) { this._finish(); return; }
    if (this._shownPhase !== session.phase || this._shownIndex !== session.index) this._sync();
    const elapsed = session.startedAt ? seconds(now - session.startedAt) : '0.00';
    if (elapsed !== this.data.elapsed) this.setData({ elapsed });
  },
  onResponse(event: WechatMiniprogram.TouchEvent) {
    if (!this._session || this._session.finished || this._rendering) return;
    this._session.respond(String(event.currentTarget.dataset.key), Date.now());
    this._sync();
  },
  onEnd() {
    if (!this._session?.startedAt) { this.onSettings(); return; }
    this._session.interrupt(Date.now());
    this._finish();
  },
  _finish() {
    const session = this._session;
    if (!session?.finished || this._record?.id === session.id) return;
    this._stop();
    this._record = session.record();
    this.setData({ phase: 'result', result: persistResult(this._record) });
    wx.setKeepScreenOn({ keepScreenOn: false });
  },
  onRetrySave() {
    if (this._record) this.setData({ result: persistResult(this._record) });
  },
  onSettings() {
    this._stop();
    this._session = undefined;
    this._record = undefined;
    wx.setKeepScreenOn({ keepScreenOn: false });
    this.setData({ phase: 'ready', result: null, notice: '' });
  },
  _stop() {
    if (this._timer !== undefined) clearInterval(this._timer);
    this._timer = undefined;
    this._rendering = false;
    this._renderToken++;
  },
  _leave() {
    this._stop();
    wx.setKeepScreenOn({ keepScreenOn: false });
    const session = this._session;
    if (!session || session.finished) return;
    if (session.startedAt) {
      session.interrupt(Date.now());
      this._record = session.record();
      const result = persistResult(this._record);
      this.setData({ notice: result.saveError || '上局因离开训练而中断，不计入日均与纪录。' });
    }
    this._session = undefined;
    this.setData({ phase: 'ready', result: null });
  }
});
