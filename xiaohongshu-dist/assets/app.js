(function () {
  'use strict';
  const core = window.AttentionCore;
  const catalog = core.catalog;
  const presentation = core.presentation;
  const storage = window.AttentionStorage;
  const platform = window.AttentionPlatform;
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  let route = 'loading';
  let config = null;
  let session = null;
  let record = null;
  let result = null;
  let records = [];
  let storageError = '';
  let notice = '';
  let timer = 0;
  let frame = 0;
  let flash = 0;
  let correctFlash = 0;
  let correctIndex = -1;
  let revision = 0;
  let shownTrial = '';
  let shownTracking = '';
  let context = null;
  let canvasSize = 0;
  let historyDetail = false;
  let historyLimit = 30;
  let savePending = false;
  const filters = { game: 'all', mode: 'all', spec: 'all', seconds: '0' };

  function escape(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function image(file, className) {
    return '<img class="' + className + '" src="./assets/images/' + file + '" alt="" aria-hidden="true">';
  }
  function button(action, label, className, attributes) {
    return '<button type="button" class="' + className + '" data-action="' + action + '" ' + (attributes || '') + '>' + label + '</button>';
  }
  function setText(id, value) {
    const node = document.getElementById(id);
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }
  function page(name, className, html, scroll) {
    route = name;
    app.className = 'page ' + className;
    app.innerHTML = html;
    const title = name === 'home' ? '专注训练' : name === 'more' ? '更多游戏' :
      name === 'history' || historyDetail ? '训练记录' : config ? catalog.gameName(config) : '专注训练';
    nav.innerHTML = '<div class="app-nav">' + (name === 'home' ? '<span class="nav-title">专注训练</span>' :
      button('back', '‹ 返回', 'text-button')) + '<span class="nav-title">' + (name === 'home' ? '' : escape(title)) + '</span>' +
      (name === 'home' ? '<span></span>' : button('home', '首页', 'text-button')) + '</div>';
    document.documentElement.style.setProperty('--nav-height', nav.offsetHeight + 'px');
    if (scroll !== false) window.scrollTo(0, 0);
  }
  function stop() {
    window.clearInterval(timer);
    window.cancelAnimationFrame(frame);
    window.clearTimeout(flash);
    clearCorrectFeedback();
    timer = 0; frame = 0; flash = 0; context = null;
  }
  function clearCorrectFeedback() {
    window.clearTimeout(correctFlash);
    correctFlash = 0; correctIndex = -1;
    app.querySelectorAll('.grid-cell.correct').forEach(function (node) { node.classList.remove('correct'); });
  }
  function abandon() {
    if (!session) return;
    if (session.startedAt) {
      session.interrupt(Date.now());
      finish(false);
    } else { stop(); session = null; }
  }

  function showHome() {
    revision++;
    abandon();
    historyDetail = false;
    const modes = catalog.MODES.concat([{ id: 'more', name: '更多游戏', short: '换一种方式，练习专注' }]);
    page('home', 'home-page', '<div class="home-hero">' + image('home/focus-banner.jpg', 'home-banner') +
      '<div class="home-hero-content"><div class="row home-heading"><div class="title">舒尔特方格</div>' +
      button('history', '训练记录', 'text-button history-link') + '</div><div class="subtitle home-intro">从一个数字开始，把注意力放回眼前。</div></div></div>' +
      '<div class="mode-grid">' + modes.map(function (mode) {
        return button(mode.id === 'more' ? 'more' : 'mode', '<div class="mode-title">' + mode.name + '</div>' +
          '<div class="mode-description">' + mode.short + '</div><div class="mode-mark">' +
          image('icons/' + (mode.id === 'more' ? 'more-training' : 'schulte-' + mode.id) + '.png', 'mode-icon') + '</div>',
        'mode-card' + (mode.id === 'classic' ? ' featured' : '') + (mode.id === 'more' ? ' more-card' : ''),
        'data-mode="' + mode.id + '" aria-label="' + mode.name + '，' + mode.short + '"');
      }).join('') + '</div><div class="home-note">选择玩法，点击开始。每一次训练都从零计时。</div>');
  }

  function showMore() {
    revision++;
    abandon();
    historyDetail = false;
    page('more', 'more-page', '<div class="title">换一种专注方式</div><div class="subtitle intro">从辨认颜色，到跟住移动的目标。</div>' +
      catalog.GAMES.map(function (game) {
        return button('game', '<div class="game-mark ' + game.id + '">' + image('icons/task-' + game.id + '.png', 'game-icon') +
          '</div><div class="game-copy"><div class="game-name"><span>' + game.name + '</span>' +
          (game.englishName ? '<span class="game-english">' + game.englishName + '</span>' : '') + '</div><div class="subtitle">' +
          game.short + '</div></div>', 'game-card', 'data-game="' + game.id + '"');
      }).join(''));
  }

  async function openGame(game, mode, replay) {
    abandon();
    const token = ++revision;
    historyDetail = false;
    notice = '';
    page('loading', '', '<div class="notice" role="status">正在准备训练…</div>');
    let next;
    if (game === 'schulte') {
      const validMode = catalog.normalizeSchulte(mode).mode;
      const saved = replay || await storage.loadSettings('schulte:' + validMode);
      next = catalog.normalizeSchulte(validMode, saved);
    } else if (game === 'mot') {
      const saved = replay || await storage.loadSettings('mot');
      next = { game: 'mot', targets: [3, 4, 5].includes(saved.targets) ? saved.targets : 3,
        rounds: replay && core.tracking.MOT_ROUND_OPTIONS.includes(replay.rounds || 8) ? replay.rounds || 8 : core.tracking.DEFAULT_MOT_ROUNDS };
    } else {
      const allowed = core.trials.TRIAL_COUNT_OPTIONS[game];
      if (!allowed) { showMore(); return; }
      next = { game: game, count: replay && allowed.includes(replay.count) ? replay.count : allowed[0] };
    }
    if (token !== revision) return;
    config = next;
    showReady();
  }

  function chips(items, field, suffix, className) {
    return '<div class="chips ' + (className || '') + '">' + items.map(function (item) {
      const value = typeof item === 'object' ? item.id : item;
      const label = typeof item === 'object' ? item.label : item + (suffix || '');
      const selected = config[field] === value;
      return button('setting', escape(label), 'chip' + (selected ? ' selected' : ''),
        'data-field="' + field + '" data-value="' + escape(value) + '" aria-pressed="' + selected + '"');
    }).join('') + '</div>';
  }

  function showReady(scroll) {
    stop(); session = null; record = null; result = null; savePending = false;
    let html;
    if (config.game === 'schulte') {
      const mode = catalog.modeInfo(config.mode);
      html = '<div class="title">' + mode.name + '</div><div class="subtitle prepare-subtitle">' + mode.short + '</div>' +
        '<div id="notice" class="notice" role="status">' + escape(notice) + '</div>';
      if (config.mode === 'patience') html += '<div class="section-label">训练时限 <span class="fixed-spec">固定 5×5</span></div>' + chips(catalog.DURATIONS, 'seconds');
      else html += '<div class="section-label">格子规格</div>' + chips(config.mode === 'arithmetic' ? catalog.SPECS.slice(0, 7) : catalog.SPECS, 'spec');
      html += '<div class="rule">' + mode.rule + '</div>';
    } else if (config.game === 'mot') {
      html = '<div class="title">多目标追踪</div><div class="subtitle tracking-subtitle">记住目标，跟住它们的移动。</div>' +
        '<div id="notice" class="notice" role="status">' + escape(notice) + '</div><div class="tracking-preview" aria-hidden="true">' +
        [1, 2, 3, 4, 5, 6].map(function (i) { return '<div class="preview-dot d' + i + ([1, 3, 6].includes(i) ? ' target' : '') + '"></div>'; }).join('') + '</div>' +
        '<div class="section-label">题目数量</div>' + chips(core.tracking.MOT_ROUND_OPTIONS, 'rounds', ' 题', 'tracking-options round-options') +
        '<div class="section-label">需要追踪的目标数</div>' + chips([3, 4, 5], 'targets', ' 个', 'tracking-options target-options') +
        '<div class="rule">10 个小球中，高亮的 ' + config.targets + ' 个是目标。记住 2 秒，跟踪 8 秒，停止后选出它们。共 ' + config.rounds + ' 轮，目标越多，移动越快。</div>';
    } else {
      const info = catalog.GAMES.find(function (game) { return game.id === config.game; });
      const preview = config.game === 'stroop' ? '<div class="preview-word">红</div>' :
        config.game === 'flanker' ? '<div class="preview-arrows">← ← → ← ←</div>' :
        '<div class="preview-shapes"><div class="shape circle' + (config.game === 'simon' ? ' blue' : '') + '"></div><div class="shape ' + (config.game === 'simon' ? 'circle orange' : 'square') + '"></div></div>';
      const caption = { stroop: '这个字是蓝色，应该选择“蓝”', flanker: '中间指向右，应该选择“向右”', simon: '蓝色选左，橙色选右', gonogo: '圆形点击，方形不操作' };
      html = '<div class="title">' + info.name + '</div><div class="subtitle task-subtitle">' + info.englishName + ' · ' + info.short + '</div>' +
        '<div id="notice" class="notice" role="status">' + escape(notice) + '</div><div class="task-preview">' + preview + '<div class="preview-caption">' + caption[config.game] + '</div></div>' +
        '<div class="section-label">题目数量</div>' + chips(core.trials.TRIAL_COUNT_OPTIONS[config.game], 'count', ' 题') + '<div class="rule">' + info.rule + '</div>';
    }
    html += button('start', '开始', 'primary start-button') + '<div class="prepare-footnote">开始后计时，切后台或锁屏将中断本局。' +
      (config.game === 'schulte' ? '<div>日均与纪录按同模式、同规格分别统计。</div>' : '') + '</div>';
    page('ready', config.game === 'schulte' ? 'schulte-page' : config.game === 'mot' ? 'tracking-page' : 'task-page', html, scroll);
  }

  async function setting(node) {
    if (route !== 'ready') return;
    const field = node.dataset.field;
    const value = field === 'spec' ? node.dataset.value : Number(node.dataset.value);
    config = Object.assign({}, config);
    config[field] = value;
    if (config.game === 'schulte') config = catalog.normalizeSchulte(config.mode, config);
    const selected = config;
    showReady(false);
    if (config.game === 'schulte' || config.game === 'mot') {
      const saved = await storage.saveSettings(config.game === 'mot' ? 'mot' : 'schulte:' + config.mode, selected);
      if (route === 'ready' && config === selected) {
        notice = saved ? '' : '设置暂未保存，本局仍可正常开始。';
        setText('notice', notice);
      }
    }
  }

  function endButton() { return '<div class="end-row">' + button('end', '结束本局', 'text-button') + '</div>'; }
  function startGame() {
    if (route !== 'ready' && route !== 'result') return;
    stop(); record = null; result = null; historyDetail = false; savePending = false; notice = '';
    if (config.game === 'schulte') startSchulte();
    else if (config.game === 'mot') startTracking();
    else startTrial();
  }

  function startSchulte() {
    const next = new core.schulte.SchulteSession(config);
    session = next;
    page('playing', 'schulte-page playing', '<div class="play-header"><div id="play-target" class="play-hint"></div><div class="play-clock numbers"><span id="clock">0.00</span><span>' +
      (config.mode === 'patience' ? '秒剩余' : '秒') + '</span></div></div><div class="board-stage">' +
      (config.mode === 'arithmetic' ? '<div id="equation" class="equation numbers"></div>' : '') +
      '<div id="board" class="board' + (['upper', 'lower'].includes(config.spec) ? ' letter-board' : '') + '"></div></div>' +
      '<div class="play-footer"><div id="progress"></div><div id="errors"></div></div>' + endButton());
    syncSchulte();
    frame = window.requestAnimationFrame(function () {
      if (session !== next || route !== 'playing') return;
      next.start(Date.now());
      clockSchulte();
      timer = window.setInterval(clockSchulte, 50);
    });
  }
  function syncSchulte() {
    if (!session || config.game !== 'schulte') return;
    const board = document.getElementById('board');
    const size = board.getBoundingClientRect().width;
    const cellSize = size / session.columns;
    const fontSize = Math.max(12, Math.min(36, Math.floor(cellSize * (config.mode === 'arithmetic' ? 0.42 : 0.48))));
    const letters = ['upper', 'lower'].includes(config.spec);
    board.innerHTML = session.cells.map(function (cell, index) {
      const dimmed = cell.done && config.mode === 'practice';
      return button('tile', escape(cell.value), 'grid-cell numbers' + (dimmed ? ' dimmed' : '') + (index === correctIndex ? ' correct' : ''),
        'data-instant="true" data-index="' + index + '" data-value="' + escape(cell.value) + '" aria-label="' + escape(cell.value) + (dimmed ? '，已完成' : '') +
        '" style="width:' + cellSize + 'px;height:' + cellSize + 'px;font-size:' + fontSize + 'px;' + (letters && index === 24 ? 'margin-left:33.333333%;' : '') + '"');
    }).join('');
    document.getElementById('play-target').innerHTML = config.mode === 'arithmetic' ? '第 <span class="play-target">' + (session.position + 1) + '</span> / ' + session.total + ' 题' :
      '下一个<span class="play-target">' + escape(session.target) + '</span>';
    setText('equation', session.equation + ' = ?');
    setText('progress', config.mode === 'patience' ? '完成 ' + session.rounds + ' 轮 · 本轮 ' + session.position + '/25' : '完成 ' + session.position + '/' + session.total);
    setText('errors', '错误 ' + session.errors);
  }
  function clockSchulte() {
    if (!session || route !== 'playing') return;
    const now = Date.now();
    if (session.tick(now)) { finish(); return; }
    setText('clock', config.mode === 'patience' ? (Math.max(0, session.deadline - now) / 1000).toFixed(1) : presentation.seconds(session.elapsed(now)));
  }
  function tile(node) {
    if (!session || config.game !== 'schulte' || route !== 'playing') return;
    const index = Number(node.dataset.index);
    const action = session.tap(index, Date.now());
    if (action === 'ignored') return;
    if (session.status !== 'running') { finish(); return; }
    window.clearTimeout(flash);
    clearCorrectFeedback();
    if (action === 'wrong') {
      app.querySelectorAll('.wrong').forEach(function (item) { item.classList.remove('wrong'); });
      node.classList.add('wrong');
      setText('errors', '错误 ' + session.errors);
      platform.feedback();
      flash = window.setTimeout(function () { node.classList.remove('wrong'); }, 160);
    } else if (action === 'correct') {
      correctIndex = config.mode === 'practice' ? -1 : index;
      syncSchulte();
      if (correctIndex >= 0) {
        const current = session;
        correctFlash = window.setTimeout(function () {
          if (session === current) clearCorrectFeedback();
        }, 180);
      }
    }
  }

  function responseButtons(game) {
    if (game === 'stroop') return core.trials.COLORS;
    if (game === 'simon') return [{ key: 'left', label: '← 蓝', color: '#245dd7', filled: true }, { key: 'right', label: '橙 →', color: '#aa5a00', filled: true }];
    if (game === 'gonogo') return [{ key: 'tap', label: '点击', color: '#245dd7', filled: true }];
    return [{ key: 'left', label: '← 向左', color: '#245dd7' }, { key: 'right', label: '向右 →', color: '#245dd7' }];
  }
  function startTrial() {
    session = new core.trials.TrialSession(config.game, Math.random, config.count);
    session.start(); shownTrial = '';
    page('playing', 'task-page', '<div class="play-header"><div class="play-hint">第 <span id="trial-number" class="play-target">1</span> / ' + config.count +
      ' 题</div><div class="play-clock numbers"><span id="clock">0.00</span><span>秒</span></div></div>' +
      '<div class="progress-track"><div id="trial-progress" class="progress-fill"></div></div><div id="stimulus" class="stimulus-stage"></div>' +
      '<div class="response-buttons' + (config.game === 'stroop' ? ' four-buttons' : config.game === 'gonogo' ? ' one-button' : '') + '">' +
      responseButtons(config.game).map(function (item) {
        return button('response', item.label, 'response-button', 'data-instant="true" data-key="' + item.key + '" disabled style="color:' +
          (item.filled ? '#ffffff' : item.color) + ';background:' + (item.filled ? item.color : '#ffffff') + ';border-color:' + item.color + ';"');
      }).join('') + '</div><div class="play-footer"><div id="progress"></div><div id="errors"></div></div>' + endButton());
    syncTrial();
    timer = window.setInterval(function () {
      if (!session || route !== 'playing') return;
      const now = Date.now();
      session.tick(now);
      if (session.finished) { finish(); return; }
      syncTrial();
      setText('clock', session.startedAt ? presentation.seconds(now - session.startedAt) : '0.00');
    }, 25);
  }
  function enableResponses(enabled) {
    app.querySelectorAll('.response-button').forEach(function (node) { node.disabled = !enabled; });
  }
  function syncTrial() {
    if (!session || route !== 'playing') return;
    if (session.finished) { finish(); return; }
    const key = session.phase + ':' + session.index;
    setText('errors', '错误 ' + (session.answers.filter(function (answer) { return !answer.correct; }).length + session.earlyTaps));
    if (shownTrial === key) return;
    shownTrial = key;
    const current = session.current;
    const awaiting = session.phase === 'awaiting';
    const visible = awaiting || session.phase === 'stimulus';
    let html = '<div class="fixation" aria-label="等待下一题">+</div>';
    if (visible) {
      if (config.game === 'stroop') html = '<div class="stimulus-word" style="color:' + current.color + '">' + escape(current.text) + '</div>';
      else if (config.game === 'flanker') html = '<div class="stimulus-arrows">' + escape(current.text) + '</div>';
      else html = '<div aria-label="' + (current.shape === 'circle' ? '圆形' : '方形') + '" class="shape ' + current.shape + ' stimulus-shape ' +
        (config.game === 'simon' ? current.side : 'center') + '" style="' + (current.color ? 'background:' + current.color + ';' : '') + '"></div>';
    }
    document.getElementById('stimulus').innerHTML = html;
    setText('trial-number', session.index + 1);
    setText('progress', '已完成 ' + session.answers.length + '/' + session.trials.length);
    document.getElementById('trial-progress').style.width = session.answers.length / session.trials.length * 100 + '%';
    enableResponses(!awaiting && (config.game === 'gonogo' || session.phase === 'stimulus'));
    if (awaiting) {
      const currentSession = session;
      frame = window.requestAnimationFrame(function () {
        if (session !== currentSession || route !== 'playing') return;
        currentSession.reveal(Date.now());
        shownTrial = currentSession.phase + ':' + currentSession.index;
        enableResponses(true);
      });
    }
  }
  function respond(node) {
    if (!session || config.game === 'schulte' || config.game === 'mot' || route !== 'playing' || node.disabled) return;
    session.respond(node.dataset.key, Date.now());
    syncTrial();
  }

  function startTracking() {
    const next = new core.tracking.TrackingSession(config.targets, Math.random, config.rounds);
    session = next; shownTracking = '';
    page('playing', 'tracking-page', '<div class="play-header"><div class="play-hint">第 <span id="tracking-round" class="play-target">1</span> / ' + config.rounds +
      ' 轮</div><div id="tracking-countdown" class="play-clock numbers"></div></div><div id="stage-title" class="stage-title">记住高亮的小球</div>' +
      '<div id="canvas-wrap" class="canvas-wrap"><canvas id="tracking-canvas" data-action="canvas" data-instant="true" aria-label="多目标追踪画布"></canvas></div>' +
      '<div id="stage-hint" class="stage-hint"></div><div id="tracking-controls"></div>' + endButton());
    if (!sizeCanvas()) {
      notice = '画布暂不可用，请重新开始或更新小红书后再试。';
      showReady(); return;
    }
    frame = window.requestAnimationFrame(function () {
      if (session !== next || route !== 'playing') return;
      next.start(Date.now());
      drawTracking(); syncTracking(); animateTracking();
    });
  }
  function sizeCanvas() {
    const canvas = document.getElementById('tracking-canvas');
    if (!canvas) return false;
    try { context = canvas.getContext('2d'); } catch (error) { context = null; }
    if (!context) return false;
    const height = parseFloat(document.documentElement.style.getPropertyValue('--app-height')) || window.innerHeight;
    canvasSize = Math.max(1, Math.min(app.clientWidth - 32, Math.max(180, height - nav.offsetHeight - 220), 420));
    const wrap = document.getElementById('canvas-wrap');
    wrap.style.width = canvasSize + 'px'; wrap.style.height = canvasSize + 'px';
    const ratio = platform.pixelRatio();
    canvas.width = Math.round(canvasSize * ratio); canvas.height = Math.round(canvasSize * ratio);
    context.setTransform(canvas.width / canvasSize, 0, 0, canvas.height / canvasSize, 0, 0);
    return true;
  }
  function animateTracking() {
    const current = session;
    frame = window.requestAnimationFrame(function () {
      if (session !== current || route !== 'playing') return;
      const before = current.phase;
      current.tick(Date.now());
      if (before !== current.phase || current.phase === 'moving') drawTracking();
      syncTracking();
      if (current.phase === 'cue' || current.phase === 'moving') animateTracking();
    });
  }
  function drawTracking() {
    if (!context || !session) return;
    const size = canvasSize;
    context.clearRect(0, 0, size, size);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size);
    const selecting = session.phase === 'select' || session.phase === 'feedback';
    session.dots.forEach(function (dot) {
      const target = session.targets.includes(dot.id), selected = session.selected.includes(dot.id);
      const feedback = session.phase === 'feedback';
      context.beginPath(); context.arc(dot.x * size, dot.y * size, core.tracking.DOT_RADIUS * size, 0, Math.PI * 2);
      context.fillStyle = session.phase === 'cue' && target ? '#245dd7' : feedback && target ? '#087b80' : feedback && selected ? '#bd3548' : '#64768b';
      context.fill();
      if (selected && selecting) {
        context.beginPath(); context.arc(dot.x * size, dot.y * size, core.tracking.DOT_RADIUS * size + 4, 0, Math.PI * 2);
        context.strokeStyle = '#245dd7'; context.lineWidth = 2; context.stroke();
      }
      if (selecting) {
        context.fillStyle = '#ffffff'; context.font = '600 ' + Math.max(12, Math.floor(size * 0.043)) + 'px sans-serif';
        context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(dot.id + 1), dot.x * size, dot.y * size);
      }
    });
  }
  function syncTracking() {
    if (!session) return;
    const stage = session.phase;
    const now = Date.now();
    const countdown = stage === 'cue' ? Math.max(0, Math.ceil((session.roundStart + core.tracking.CUE_MS - now) / 1000)) :
      stage === 'moving' ? Math.max(0, Math.ceil((session.roundStart + core.tracking.CUE_MS + core.tracking.MOTION_MS - now) / 1000)) : 0;
    const key = stage + ':' + session.round + ':' + countdown + ':' + session.selected.join(',');
    if (key === shownTracking) return;
    shownTracking = key;
    const last = session.results[session.results.length - 1];
    setText('tracking-round', session.round);
    setText('tracking-countdown', countdown ? countdown + ' 秒' : stage === 'select' ? '已选 ' + session.selected.length + '/' + session.targetCount : '');
    setText('stage-title', stage === 'cue' ? '记住高亮的小球' : stage === 'moving' ? '跟住刚才的目标' :
      stage === 'select' ? '选出刚才追踪的 ' + session.targetCount + ' 个目标' : '本轮找回 ' + (last ? last.hits : 0) + '/' + session.targetCount + ' 个');
    setText('stage-hint', stage === 'cue' ? '随后所有小球将变成同一种颜色' : stage === 'moving' ? '运动结束后再选择' :
      stage === 'select' ? '可点击小球或下方编号，再点一次撤销' : '目标：' + session.targets.map(function (id) { return id + 1; }).join('、') +
      '；你的选择：' + session.selected.map(function (id) { return id + 1; }).join('、'));
    const controls = document.getElementById('tracking-controls');
    controls.innerHTML = stage === 'select' ? '<div class="dot-choices">' + session.dots.map(function (dot) {
      const selected = session.selected.includes(dot.id);
      return button('choice', dot.id + 1, 'dot-choice' + (selected ? ' selected' : ''),
        'data-instant="true" data-id="' + dot.id + '" aria-pressed="' + selected + '" aria-label="' + (dot.id + 1) + '号小球"');
    }).join('') + '</div>' + button('submit', '提交选择', 'primary submit-button', session.selected.length !== session.targetCount ? 'disabled' : '') :
      stage === 'feedback' ? button('next', '下一轮', 'primary next-round') : '';
  }
  function toggleDot(id) {
    if (!session || config.game !== 'mot' || route !== 'playing') return;
    session.toggle(id); drawTracking(); syncTracking();
  }
  function canvasTap(event, node) {
    if (!session || config.game !== 'mot' || session.phase !== 'select') return;
    const pointer = event.touches ? event.touches[0] : event;
    if (!pointer) return;
    const rect = node.getBoundingClientRect();
    const id = session.hitTest((pointer.clientX - rect.left) / rect.width, (pointer.clientY - rect.top) / rect.height, Math.max(core.tracking.DOT_RADIUS, 22 / rect.width));
    if (id !== undefined) toggleDot(id);
  }

  function endGame() {
    if (!session) return;
    if (!session.startedAt) { showReady(); return; }
    session.interrupt(Date.now()); finish();
  }
  function finish(show) {
    if (!session) return;
    const finished = config.game === 'schulte' ? ['completed', 'failed', 'interrupted'].includes(session.status) :
      ['completed', 'interrupted'].includes(session.phase);
    if (!finished) return;
    const completedRecord = session.record();
    stop(); session = null;
    if (show !== false) {
      record = completedRecord; historyDetail = false; savePending = true;
      result = presentation.resultView(record, [], false);
      renderResult();
    }
    persist(completedRecord);
  }
  async function persist(completedRecord) {
    const saved = await storage.saveRecord(completedRecord);
    const loaded = await storage.loadRecords();
    records = loaded.records; storageError = loaded.error;
    if (record === completedRecord && route === 'result' && !historyDetail) {
      savePending = false;
      result = presentation.resultView(completedRecord, records, saved && !loaded.error);
      result.saved = saved;
      result.saveError = saved ? loaded.error : '本局尚未保存。请检查可用存储空间后重试。';
      renderResult(false);
    }
  }
  function renderResult(scroll) {
    const view = result;
    page('result', 'result-page', '<div class="result"><div class="result-title">' + escape(view.title) + '</div><div class="subtitle">' + escape(view.subtitle) + '</div>' +
      (view.isBest ? image('states/result-best.png', 'result-best-image') : '') + '<div class="result-hero numbers">' + escape(view.hero) + '<span>' + escape(view.unit) + '</span></div>' +
      '<div class="result-caption">' + escape(view.caption) + '</div><div class="best-slot">' + (view.isBest ? '<span class="best-tag">本次最佳</span>' : '') + '</div>' +
      '<div class="metrics">' + view.metrics.map(function (metric) {
        return '<div class="metric"><div class="metric-label">' + escape(metric.label) + '</div><div class="metric-value numbers">' + escape(metric.value) + '<span>' + escape(metric.unit) + '</span></div></div>';
      }).join('') + '</div>' + (savePending ? '<div class="result-saving" role="status">正在保存成绩…</div>' : '') +
      (view.saveError ? '<div class="notice error-notice" role="status">' + escape(view.saveError) + button('retry-save', '重试保存与读取', 'text-button retry-save') + '</div>' : '') +
      (view.details.length ? '<div class="details">' + view.details.map(function (detail) { return '<div>' + escape(detail) + '</div>'; }).join('') + '</div>' : '') +
      button('again', '再来一次', 'primary again-button') + button('settings', historyDetail ? '返回记录列表' : escape(view.settingsLabel), 'secondary settings-button') +
      '<div class="result-links">' + button('history', '训练记录', 'text-button') + button('home', '返回首页', 'text-button') + '</div></div>', scroll);
  }

  async function showHistory() {
    abandon();
    const token = ++revision;
    historyDetail = false;
    page('history', 'history-page', '<div class="title">训练记录</div><div class="notice" role="status">正在读取记录…</div>');
    const loaded = await storage.loadRecords();
    if (token !== revision || route !== 'history') return;
    records = loaded.records; storageError = loaded.error;
    renderHistory();
  }
  function selectFilter(field, label, options) {
    return '<select class="filter-control" data-filter="' + field + '" aria-label="' + label + '">' + options.map(function (option) {
      return '<option value="' + escape(option.id) + '"' + (String(option.id) === filters[field] ? ' selected' : '') + '>' + escape(option.name || option.label) + '</option>';
    }).join('') + '</select>';
  }
  function renderHistory(scroll) {
    historyDetail = false;
    const filtered = records.filter(function (item) {
      return (filters.game === 'all' || item.config.game === filters.game) &&
        (filters.game !== 'schulte' || filters.mode === 'all' || item.config.mode === filters.mode) &&
        (filters.game !== 'schulte' || (filters.mode === 'patience' ? filters.seconds === '0' || item.config.seconds === Number(filters.seconds) : filters.spec === 'all' || item.config.spec === filters.spec));
    });
    const bests = new Map();
    records.filter(function (item) { return item.status === 'completed'; }).forEach(function (item) {
      const key = core.model.configKey(item.config, item.version);
      const old = bests.get(key);
      if (!old || core.records.compareRecords(item, old) > 0) bests.set(key, item);
    });
    const today = core.model.beijingDay(Date.now());
    const complete = filtered.filter(function (item) { return item.status === 'completed'; });
    let selectors = selectFilter('game', '训练类型', [{ id: 'all', name: '全部训练' }, { id: 'schulte', name: '舒尔特方格' }].concat(catalog.GAMES));
    if (filters.game === 'schulte') {
      selectors += selectFilter('mode', '模式', [{ id: 'all', name: '全部模式' }].concat(catalog.MODES));
      selectors += filters.mode === 'patience' ? selectFilter('seconds', '训练时限', [{ id: 0, label: '全部时限' }].concat(catalog.DURATIONS)) :
        selectFilter('spec', '格子规格', [{ id: 'all', label: '全部规格' }].concat(filters.mode === 'arithmetic' ? catalog.SPECS.slice(0, 7) : catalog.SPECS));
    }
    page('history', 'history-page', '<div class="title">训练记录</div><div class="subtitle history-subtitle">按模式与规格，查看每次训练的成绩。</div><div class="filters">' + selectors + '</div>' +
      (storageError ? '<div class="notice error-notice">' + escape(storageError) + button('history', '重试读取', 'text-button') + '</div>' :
        '<div class="history-summary">今日完成 ' + complete.filter(function (item) { return core.model.beijingDay(item.endedAt) === today; }).length + ' 局 <span>累计完成 ' + complete.length + ' 局</span></div>') +
      (!filtered.length && !storageError ? '<div class="empty">' + image('states/history-empty.png', 'empty-illustration') + '<div class="empty-title">这里还没有训练记录</div>' +
        '<div class="subtitle">完成一次训练，成绩就会出现在这里。</div>' + button('home', '选择训练', 'primary') + '</div>' : '') +
      filtered.slice(0, historyLimit).map(function (item) {
        const best = bests.get(core.model.configKey(item.config, item.version));
        const extra = item.config.game === 'schulte' ? '错误 ' + item.errors + ' 次' : item.config.game === 'mot' ? '找回 ' + item.correct + '/' + item.total + ' 个' :
          '反应 ' + presentation.rt(core.records.reaction(item.answers)) + ' 毫秒 · 错误 ' + item.errors;
        return button('detail', '<div class="record-top"><div class="record-name">' + escape(catalog.gameName(item.config) + ' · ' + catalog.specName(item.config)) + '</div>' +
          (best && best.id === item.id ? '<div class="record-badge">纪录</div>' : '') + '</div><div class="record-main"><div class="record-time">' + core.model.localTime(item.endedAt) +
          '</div><div class="record-value' + (item.status !== 'completed' ? ' incomplete' : '') + '">' + escape(presentation.recordValue(item)) + '</div></div><div class="record-extra">' +
          escape(extra) + '</div>', 'record-row', 'data-id="' + escape(item.id) + '"');
      }).join('') + (filtered.length > historyLimit ? button('load-more', '查看更多', 'text-button load-more') : ''), scroll);
  }
  function showRecord(id) {
    const selected = records.find(function (item) { return item.id === id; });
    if (!selected) return;
    record = selected; historyDetail = true; savePending = false;
    result = presentation.resultView(record, records, !storageError);
    result.saved = true; result.saveError = storageError;
    renderResult();
  }

  function back() {
    revision++;
    if (historyDetail) renderHistory();
    else if (route === 'playing') endGame();
    else if (route === 'result') { notice = ''; showReady(); }
    else if ((route === 'ready' || route === 'loading') && config && config.game !== 'schulte') showMore();
    else showHome();
  }
  function action(node, event) {
    const name = node.dataset.action;
    if (node.disabled) return;
    if (name === 'home') showHome();
    else if (name === 'back') back();
    else if (name === 'more') showMore();
    else if (name === 'mode') openGame('schulte', node.dataset.mode);
    else if (name === 'game') openGame(node.dataset.game);
    else if (name === 'setting') setting(node);
    else if (name === 'start') startGame();
    else if (name === 'tile') tile(node);
    else if (name === 'response') respond(node);
    else if (name === 'choice') toggleDot(Number(node.dataset.id));
    else if (name === 'canvas') canvasTap(event, node);
    else if (name === 'submit' && session && config.game === 'mot') {
      if (session.submit(Date.now())) {
        if (session.phase === 'completed') finish();
        else { drawTracking(); syncTracking(); }
      }
    } else if (name === 'next' && session && config.game === 'mot' && session.phase === 'feedback') {
      session.next(Date.now()); drawTracking(); syncTracking(); animateTracking();
    } else if (name === 'end') endGame();
    else if (name === 'again') {
      if (historyDetail && record) openGame(record.config.game, record.config.mode, record.config);
      else startGame();
    } else if (name === 'settings') {
      if (historyDetail) renderHistory();
      else { notice = ''; showReady(); }
    } else if (name === 'retry-save' && record && !savePending) {
      if (historyDetail) showHistory();
      else { savePending = true; renderResult(false); persist(record); }
    } else if (name === 'history') showHistory();
    else if (name === 'detail') showRecord(node.dataset.id);
    else if (name === 'load-more') { historyLimit += 30; renderHistory(false); }
  }
  function actionNode(event) { return event.target && event.target.closest ? event.target.closest('[data-action]') : null; }
  document.addEventListener('click', function (event) {
    const node = actionNode(event);
    if (!node || (node.dataset.instant && event.detail !== 0)) return;
    action(node, event);
  });
  function instant(event) {
    const node = actionNode(event);
    if (!node || !node.dataset.instant || node.disabled || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    action(node, event);
  }
  if (window.PointerEvent) document.addEventListener('pointerdown', instant, { passive: false });
  else {
    let lastTouch = 0;
    document.addEventListener('touchstart', function (event) { lastTouch = Date.now(); instant(event); }, { passive: false });
    document.addEventListener('mousedown', function (event) { if (Date.now() - lastTouch > 700) instant(event); });
  }
  document.addEventListener('change', function (event) {
    const field = event.target.dataset && event.target.dataset.filter;
    if (!field || route !== 'history') return;
    filters[field] = event.target.value; historyLimit = 30;
    if (field === 'game') { filters.mode = 'all'; filters.spec = 'all'; filters.seconds = '0'; }
    if (field === 'mode') { filters.spec = 'all'; filters.seconds = '0'; }
    renderHistory(false);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) endGame();
  });
  window.addEventListener('pagehide', endGame);
  let resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(async function () {
      await platform.layout();
      document.documentElement.style.setProperty('--nav-height', nav.offsetHeight + 'px');
      if (route !== 'playing' || !session) return;
      if (config.game === 'schulte') syncSchulte();
      else if (config.game === 'mot') {
        if (sizeCanvas()) drawTracking();
        else { notice = '画布暂不可用，本局已中断。'; endGame(); }
      }
    }, 100);
  });

  async function init() {
    await platform.init();
    await storage.init();
    showHome();
  }
  init().catch(function () {
    page('home', '', '<div class="notice error-notice">暂时无法打开训练，请关闭后重新打开。</div>');
  });
})();
