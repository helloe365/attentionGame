import { DURATIONS, MODES, SPECS, modeInfo, normalizeSchulte } from '../../core/catalog';
import { GameConfig, SessionRecord } from '../../core/model';
import { ResultView, persistResult, seconds } from '../../core/presentation';
import { SchulteSession } from '../../core/schulte';
import { loadSettings, saveSettings } from '../../core/storage';

interface ViewCell { value: string; index: number; dimmed: boolean; tail: boolean }

function layout(config: GameConfig) {
  const letter = config.spec === 'upper' || config.spec === 'lower';
  const columns = letter ? 6 : Number(config.spec);
  const boardSize = Math.min(wx.getWindowInfo().windowWidth - 8, 544);
  const cellSize = boardSize / columns;
  return { letter, columns, boardSize, cellSize, fontSize: Math.max(12, Math.min(36, Math.floor(cellSize * (config.mode === 'arithmetic' ? 0.42 : 0.48)))) };
}

Page({
  data: {
    phase: 'ready',
    config: normalizeSchulte('classic'),
    mode: MODES[1],
    specs: SPECS,
    durations: DURATIONS,
    cells: [] as ViewCell[],
    boardSize: 0, cellSize: 0, fontSize: 24, columns: 5, letter: false,
    target: '', equation: '', elapsed: '0.00', remaining: '60.0', progress: 0, total: 25,
    rounds: 0, errors: 0, revision: 0, wrongIndex: -1, correctIndex: -1,
    result: null as ResultView | null, notice: ''
  },
  _session: undefined as SchulteSession | undefined,
  _record: undefined as SessionRecord | undefined,
  _timer: undefined as number | undefined,
  _flash: undefined as number | undefined,
  _correctFlash: undefined as number | undefined,
  _rendering: false,
  _revision: 0,

  onLoad(options) {
    const mode = normalizeSchulte(options.mode).mode!;
    const config = normalizeSchulte(mode, loadSettings('schulte:' + mode));
    this.setData({
      config, mode: modeInfo(mode), specs: mode === 'arithmetic' ? SPECS.slice(0, 7) : SPECS,
      ...layout(config)
    });
    wx.setNavigationBarTitle({ title: '舒尔特 · ' + modeInfo(mode).name });
  },
  onResize() { this.setData(layout(this.data.config)); },
  onHide() { this._leave(); },
  onUnload() { this._leave(); },

  onSpec(event: WechatMiniprogram.TouchEvent) {
    if (this.data.phase !== 'ready') return;
    const config = normalizeSchulte(this.data.config.mode, { ...this.data.config, spec: String(event.currentTarget.dataset.spec) });
    const saved = saveSettings('schulte:' + config.mode, config);
    this.setData({ config, ...layout(config), notice: saved ? '' : '规格设置暂未保存，本局仍可正常开始。' });
  },
  onDuration(event: WechatMiniprogram.TouchEvent) {
    if (this.data.phase !== 'ready') return;
    const config = normalizeSchulte('patience', { ...this.data.config, seconds: Number(event.currentTarget.dataset.seconds) });
    const saved = saveSettings('schulte:patience', config);
    this.setData({ config, notice: saved ? '' : '时限设置暂未保存，本局仍可正常开始。' });
  },
  onStart() {
    if (this.data.phase === 'running' || this._rendering) return;
    this._stopTimers();
    const session = new SchulteSession(this.data.config);
    this._session = session;
    this._record = undefined;
    this._rendering = true;
    this._revision++;
    this.setData({
      phase: 'running', result: null, notice: '', wrongIndex: -1, correctIndex: -1, elapsed: '0.00',
      remaining: String(this.data.config.seconds || 60), ...this._boardData(session)
    }, () => {
      if (this._session !== session || this.data.phase !== 'running') return;
      session.start(Date.now());
      this._rendering = false;
      wx.setKeepScreenOn({ keepScreenOn: true });
      this._timer = setInterval(() => this._clock(), 50);
    });
  },
  _boardData(session: SchulteSession) {
    return {
      cells: session.cells.map((cell, index) => ({
        value: cell.value, index, dimmed: cell.done && session.config.mode === 'practice',
        tail: this.data.letter && index === 24
      })),
      target: session.target, equation: session.equation, progress: session.position,
      total: session.total, rounds: session.rounds, errors: session.errors, revision: this._revision
    };
  },
  onTile(event: WechatMiniprogram.TouchEvent) {
    const session = this._session;
    if (!session || this._rendering || Number(event.currentTarget.dataset.revision) !== this._revision) return;
    const index = Number(event.currentTarget.dataset.index);
    const action = session.tap(index, Date.now());
    if (action === 'ignored') return;
    if (this._correctFlash !== undefined) clearTimeout(this._correctFlash);
    this._correctFlash = undefined;
    if (session.status !== 'running') { this._finish(); return; }
    if (action === 'wrong') {
      if (this._flash !== undefined) clearTimeout(this._flash);
      this.setData({ errors: session.errors, wrongIndex: index, correctIndex: -1 });
      this._flash = setTimeout(() => this.setData({ wrongIndex: -1 }), 160);
      return;
    }
    if (action !== 'correct') return;
    const correctIndex = session.config.mode === 'practice' ? -1 : index;
    this._rendering = true;
    this._revision++;
    this.setData({ ...this._boardData(session), wrongIndex: -1, correctIndex }, () => {
      if (this._session !== session || this.data.phase !== 'running') return;
      this._rendering = false;
      if (correctIndex >= 0) {
        this._correctFlash = setTimeout(() => {
          this._correctFlash = undefined;
          if (this._session === session && this.data.phase === 'running') this.setData({ correctIndex: -1 });
        }, 180);
      }
    });
  },
  _clock() {
    const session = this._session;
    if (!session || session.status !== 'running') return;
    const now = Date.now();
    if (session.tick(now)) { this._finish(); return; }
    this.setData({
      elapsed: seconds(session.elapsed(now)),
      remaining: (Math.max(0, session.deadline - now) / 1000).toFixed(1)
    });
  },
  onEnd() {
    this._session?.interrupt(Date.now());
    this._finish();
  },
  _finish() {
    const session = this._session;
    if (!session || session.status === 'ready' || session.status === 'running' || this._record?.id === session.id) return;
    this._stopTimers();
    this._rendering = false;
    wx.setKeepScreenOn({ keepScreenOn: false });
    this._record = session.record();
    this.setData({ phase: 'result', result: persistResult(this._record) });
  },
  onRetrySave() {
    if (this._record) this.setData({ result: persistResult(this._record) });
  },
  onSettings() {
    this._stopTimers();
    this._session = undefined;
    this._record = undefined;
    this._rendering = false;
    this.setData({ phase: 'ready', result: null, notice: '' });
  },
  _stopTimers() {
    if (this._timer !== undefined) clearInterval(this._timer);
    if (this._flash !== undefined) clearTimeout(this._flash);
    if (this._correctFlash !== undefined) clearTimeout(this._correctFlash);
    this._timer = undefined;
    this._flash = undefined;
    this._correctFlash = undefined;
    if (this.data.correctIndex !== -1) this.setData({ correctIndex: -1 });
  },
  _leave() {
    this._stopTimers();
    this._rendering = false;
    wx.setKeepScreenOn({ keepScreenOn: false });
    const session = this._session;
    if (!session || (session.status !== 'running' && session.status !== 'ready')) return;
    if (session.status === 'running') {
      session.interrupt(Date.now());
      this._record = session.record();
      const result = persistResult(this._record);
      this.setData({ notice: result.saveError || (this._record.status === 'completed' ? '上局已到时，成绩已保存。' : '上局因离开训练而中断，不计入日均与纪录。') });
    }
    this._session = undefined;
    this.setData({ phase: 'ready', result: null });
  }
});
