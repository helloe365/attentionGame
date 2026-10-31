import { SessionRecord } from '../../core/model';
import { ResultView, persistResult } from '../../core/presentation';
import { loadSettings, saveSettings } from '../../core/storage';
import { CUE_MS, DEFAULT_MOT_ROUNDS, DOT_RADIUS, MOTION_MS, MOT_ROUND_OPTIONS, TrackingSession } from '../../core/tracking';

type Context2D = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
interface CanvasQueryResult { node: WechatMiniprogram.Canvas; width: number; height: number }
interface CanvasTouch { touches: { clientX: number; clientY: number }[] }

function canvasSize(): number {
  const info = wx.getWindowInfo();
  const availableWidth = Math.max(0, info.windowWidth - 32);
  const availableHeight = Math.max(180, info.windowHeight - 200);
  return Math.min(availableWidth, availableHeight, 420);
}

Page({
  data: {
    phase: 'ready', targetCount: 3, targetOptions: [3, 4, 5],
    canvasSize: 320, stage: 'cue', round: 1, roundCount: DEFAULT_MOT_ROUNDS, roundOptions: MOT_ROUND_OPTIONS, countdown: 2,
    stageTitle: '记住高亮的小球', stageHint: '', selectedCount: 0,
    choices: [] as { id: number; label: number; selected: boolean }[],
    notice: '', result: null as ResultView | null
  },
  _session: undefined as TrackingSession | undefined,
  _record: undefined as SessionRecord | undefined,
  _canvas: undefined as WechatMiniprogram.Canvas | undefined,
  _context: undefined as Context2D | undefined,
  _raf: undefined as number | undefined,
  _token: 0,

  onLoad(options) {
    const saved = loadSettings('mot');
    const rounds = Number(options.rounds);
    this.setData({
      targetCount: [3, 4, 5].includes(saved.targets || 0) ? saved.targets! : 3,
      roundCount: MOT_ROUND_OPTIONS.includes(rounds) ? rounds : DEFAULT_MOT_ROUNDS, canvasSize: canvasSize()
    });
  },
  onResize() {
    this.setData({ canvasSize: canvasSize() }, () => {
      if (this.data.phase === 'running' && this._session) this._initCanvas(this._session, false);
    });
  },
  onHide() { this._leave(); },
  onUnload() { this._leave(); },

  onTargets(event: WechatMiniprogram.TouchEvent) {
    const targetCount = Number(event.currentTarget.dataset.targets);
    if (this.data.phase !== 'ready' || ![3, 4, 5].includes(targetCount)) return;
    const saved = saveSettings('mot', { game: 'mot', targets: targetCount });
    this.setData({ targetCount, notice: saved ? '' : '目标数量暂未保存，本局仍可正常开始。' });
  },
  onRounds(event: WechatMiniprogram.TouchEvent) {
    const roundCount = Number(event.currentTarget.dataset.rounds);
    if (this.data.phase === 'ready' && MOT_ROUND_OPTIONS.includes(roundCount)) this.setData({ roundCount });
  },
  onStart() {
    if (this.data.phase === 'running') return;
    this._stopFrame();
    const session = new TrackingSession(this.data.targetCount, Math.random, this.data.roundCount);
    this._session = session;
    this._record = undefined;
    this.setData({
      phase: 'running', stage: 'cue', round: 1, countdown: 2, stageTitle: '记住高亮的小球',
      stageHint: '随后所有小球将变成同一种颜色', selectedCount: 0, choices: [], result: null, notice: ''
    }, () => this._initCanvas(session, true));
  },
  _initCanvas(session: TrackingSession, start: boolean) {
    this._stopFrame();
    const token = this._token;
    wx.createSelectorQuery().in(this).select('#tracking-canvas').fields({ node: true, size: true }).exec((results: CanvasQueryResult[]) => {
      if (token !== this._token || this._session !== session || this.data.phase !== 'running') return;
      const result = results[0];
      if (!result?.node) {
        this._session = undefined;
        this.setData({ phase: 'ready', notice: '画布未能加载，请重新开始或更新微信后再试。' });
        return;
      }
      const canvas = result.node;
      const ratio = wx.getWindowInfo().pixelRatio;
      canvas.width = result.width * ratio;
      canvas.height = result.height * ratio;
      this._canvas = canvas;
      this._context = canvas.getContext('2d');
      this._context.scale(ratio, ratio);
      if (start) session.start(Date.now());
      wx.setKeepScreenOn({ keepScreenOn: true });
      this._draw();
      this._sync();
      if (session.phase === 'cue' || session.phase === 'moving') this._animate();
    });
  },
  _animate() {
    const canvas = this._canvas;
    if (!canvas || !this._session) return;
    const token = this._token;
    this._raf = canvas.requestAnimationFrame(() => {
      if (token !== this._token || this.data.phase !== 'running') return;
      const session = this._session;
      if (!session) return;
      session.tick(Date.now());
      this._draw();
      this._sync();
      if (session.phase === 'cue' || session.phase === 'moving') this._animate();
      else this._raf = undefined;
    });
  },
  _draw() {
    const context = this._context, session = this._session;
    if (!context || !session) return;
    const size = this.data.canvasSize;
    context.clearRect(0, 0, size, size);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    const select = session.phase === 'select' || session.phase === 'feedback';
    for (const dot of session.dots) {
      const target = session.targets.includes(dot.id), selected = session.selected.includes(dot.id);
      const feedback = session.phase === 'feedback';
      context.beginPath();
      context.arc(dot.x * size, dot.y * size, DOT_RADIUS * size, 0, Math.PI * 2);
      context.fillStyle = session.phase === 'cue' && target ? '#245dd7' :
        feedback && target ? '#087b80' : feedback && selected ? '#bd3548' : '#64768b';
      context.fill();
      if (selected && select) {
        context.beginPath();
        context.arc(dot.x * size, dot.y * size, DOT_RADIUS * size + 4, 0, Math.PI * 2);
        context.strokeStyle = '#245dd7'; context.lineWidth = 2; context.stroke();
      }
      if (select) {
        context.fillStyle = '#ffffff';
        context.font = '600 ' + Math.max(12, Math.floor(size * 0.043)) + 'px sans-serif';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(String(dot.id + 1), dot.x * size, dot.y * size);
      }
    }
  },
  _sync() {
    const session = this._session;
    if (!session) return;
    const stage = session.phase;
    const now = Date.now();
    const countdown = stage === 'cue' ? Math.max(0, Math.ceil((session.roundStart + CUE_MS - now) / 1000)) :
      stage === 'moving' ? Math.max(0, Math.ceil((session.roundStart + CUE_MS + MOTION_MS - now) / 1000)) : 0;
    if (this.data.stage === stage && this.data.countdown === countdown && this.data.selectedCount === session.selected.length && this.data.round === session.round) return;
    const last = session.results[session.results.length - 1];
    const stageTitle = stage === 'cue' ? '记住高亮的小球' : stage === 'moving' ? '跟住刚才的目标' :
      stage === 'select' ? '选出刚才追踪的 ' + session.targetCount + ' 个目标' : '本轮找回 ' + (last?.hits || 0) + '/' + session.targetCount + ' 个';
    const stageHint = stage === 'cue' ? '随后所有小球将变成同一种颜色' :
      stage === 'moving' ? '运动结束后再选择' : stage === 'select' ? '可点击小球或下方编号，再点一次撤销' :
        '目标：' + session.targets.map(id => id + 1).join('、') + '；你的选择：' + session.selected.map(id => id + 1).join('、');
    this.setData({
      stage, stageTitle, stageHint, countdown, round: session.round, selectedCount: session.selected.length,
      choices: stage === 'select' ? session.dots.map(dot => ({ id: dot.id, label: dot.id + 1, selected: session.selected.includes(dot.id) })) : []
    });
  },
  onCanvasTouch(event: CanvasTouch) {
    const session = this._session;
    const touch = event.touches[0];
    if (!session || session.phase !== 'select' || !touch) return;
    wx.createSelectorQuery().in(this).select('#tracking-canvas').boundingClientRect(bounds => {
      if (!bounds || this._session !== session || session.phase !== 'select') return;
      const id = session.hitTest((touch.clientX - bounds.left) / bounds.width,
        (touch.clientY - bounds.top) / bounds.height, Math.max(DOT_RADIUS, 22 / bounds.width));
      if (id !== undefined) this._toggle(id);
    }).exec();
  },
  onChoice(event: WechatMiniprogram.TouchEvent) { this._toggle(Number(event.currentTarget.dataset.id)); },
  _toggle(id: number) {
    this._session?.toggle(id);
    this._draw();
    this._sync();
  },
  onSubmit() {
    const session = this._session;
    if (!session?.submit(Date.now())) return;
    if (session.phase === 'completed') this._finish();
    else { this._draw(); this._sync(); }
  },
  onNext() {
    if (this._session?.phase !== 'feedback') return;
    this._session.next(Date.now());
    this._draw();
    this._sync();
    this._animate();
  },
  onEnd() {
    if (!this._session?.startedAt) { this.onSettings(); return; }
    this._session.interrupt(Date.now());
    this._finish();
  },
  _finish() {
    const session = this._session;
    if (!session || this._record?.id === session.id) return;
    this._stopFrame();
    this._record = session.record();
    this.setData({ phase: 'result', result: persistResult(this._record) });
    wx.setKeepScreenOn({ keepScreenOn: false });
  },
  onRetrySave() {
    if (this._record) this.setData({ result: persistResult(this._record) });
  },
  onSettings() {
    this._stopFrame();
    this._session = undefined;
    this._record = undefined;
    wx.setKeepScreenOn({ keepScreenOn: false });
    this.setData({ phase: 'ready', result: null, notice: '' });
  },
  _stopFrame() {
    if (this._raf !== undefined && this._canvas) this._canvas.cancelAnimationFrame(this._raf);
    this._raf = undefined;
    this._token++;
  },
  _leave() {
    this._stopFrame();
    wx.setKeepScreenOn({ keepScreenOn: false });
    const session = this._session;
    if (!session || session.phase === 'completed' || session.phase === 'interrupted') return;
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
