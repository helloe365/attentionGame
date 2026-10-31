(function () {
"use strict";
var core = {};
(function (exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configKey = exports.localTime = exports.beijingDay = exports.shuffle = exports.sessionId = exports.COGNITIVE_RULE_VERSION = exports.ARITHMETIC_RULE_VERSION = exports.RULE_VERSION = void 0;
exports.RULE_VERSION = 1;
exports.ARITHMETIC_RULE_VERSION = 2;
exports.COGNITIVE_RULE_VERSION = 4;
function sessionId(now = Date.now()) {
    return now.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
exports.sessionId = sessionId;
function shuffle(values, random = Math.random) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
exports.shuffle = shuffle;
function beijingDay(timestamp) {
    const date = new Date(timestamp + 8 * 60 * 60 * 1000);
    return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join('-');
}
exports.beijingDay = beijingDay;
function localTime(timestamp) {
    const date = new Date(timestamp + 8 * 60 * 60 * 1000);
    return beijingDay(timestamp) + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes());
}
exports.localTime = localTime;
function pad(value) { return value < 10 ? '0' + value : String(value); }
function configKey(config, version = exports.RULE_VERSION) {
    if (config.game === 'schulte') {
        return [version, config.game, config.mode, config.spec, config.mode === 'patience' ? config.seconds : ''].join(':');
    }
    if (config.game === 'mot')
        return [version, config.game, config.targets, config.rounds || 8].join(':');
    return [version, config.game, config.count || 'standard'].join(':');
}
exports.configKey = configKey;

})(core.model = {});
(function (exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrialSession = exports.createTrials = exports.STANDARD_TRIAL_COUNTS = exports.TRIAL_COUNT_OPTIONS = exports.COLORS = void 0;
const model_1 = core.model;
exports.COLORS = [
    { key: 'red', label: '红', color: '#c33349' },
    { key: 'blue', label: '蓝', color: '#245dd7' },
    { key: 'green', label: '绿', color: '#087449' },
    { key: 'yellow', label: '黄', color: '#9a7300' }
];
exports.TRIAL_COUNT_OPTIONS = {
    stroop: [8, 24, 40], simon: [8, 24, 40], flanker: [12, 24, 48], gonogo: [12, 24, 60]
};
exports.STANDARD_TRIAL_COUNTS = {
    stroop: exports.TRIAL_COUNT_OPTIONS.stroop[0], simon: exports.TRIAL_COUNT_OPTIONS.simon[0],
    flanker: exports.TRIAL_COUNT_OPTIONS.flanker[0], gonogo: exports.TRIAL_COUNT_OPTIONS.gonogo[0]
};
function createTrials(game, random = Math.random, count = exports.STANDARD_TRIAL_COUNTS[game]) {
    const total = exports.TRIAL_COUNT_OPTIONS[game].includes(count) ? count : exports.STANDARD_TRIAL_COUNTS[game];
    const trials = [];
    const base = { text: '', color: '', side: 'center', shape: '' };
    if (game === 'stroop') {
        exports.COLORS.forEach((ink, i) => {
            for (let j = 0; j < total / 4; j++) {
                const congruent = j < total / 8;
                trials.push(Object.assign(Object.assign({}, base), { condition: congruent ? 'congruent' : 'incongruent', text: exports.COLORS[congruent ? i : (i + 1 + (j - total / 8) % 3) % exports.COLORS.length].label, color: ink.color, answer: ink.key }));
            }
        });
    }
    else if (game === 'simon') {
        for (let repeat = 0; repeat < total / 4; repeat++)
            for (const answer of ['left', 'right'])
                for (const side of ['left', 'right']) {
                    trials.push(Object.assign(Object.assign({}, base), { condition: answer === side ? 'congruent' : 'incongruent', side, color: answer === 'left' ? '#245dd7' : '#c46b00', shape: 'circle', answer }));
                }
    }
    else if (game === 'flanker') {
        for (const condition of ['congruent', 'incongruent', 'neutral']) {
            for (const answer of ['left', 'right'])
                for (let repeat = 0; repeat < total / 6; repeat++) {
                    const middle = answer === 'left' ? '←' : '→';
                    const outside = condition === 'neutral' ? '–' : condition === 'congruent' ? middle : answer === 'left' ? '→' : '←';
                    trials.push(Object.assign(Object.assign({}, base), { condition, text: [outside, outside, middle, outside, outside].join(' '), answer }));
                }
        }
    }
    else {
        for (let i = 0; i < total; i++) {
            const go = i < total * 3 / 4;
            trials.push(Object.assign(Object.assign({}, base), { condition: go ? 'go' : 'nogo', shape: go ? 'circle' : 'square', answer: go ? 'tap' : null }));
        }
    }
    return model_1.shuffle(trials, random);
}
exports.createTrials = createTrials;
class TrialSession {
    constructor(game, random = Math.random, count = exports.STANDARD_TRIAL_COUNTS[game]) {
        this.game = game;
        this.id = model_1.sessionId();
        this.answers = [];
        this.index = 0;
        this.earlyTaps = 0;
        this.phase = 'ready';
        this.startedAt = 0;
        this.endedAt = 0;
        this.onset = 0;
        this.nextAt = 0;
        this.trials = createTrials(game, random, count);
    }
    get current() { return this.trials[this.index]; }
    get responseWindow() { return this.game === 'gonogo' ? 1000 : Infinity; }
    get deadline() { return this.onset + this.responseWindow; }
    get finished() { return this.phase === 'completed' || this.phase === 'interrupted'; }
    start() {
        if (this.phase === 'ready')
            this.phase = 'awaiting';
    }
    reveal(now) {
        if (this.phase !== 'awaiting')
            return;
        if (this.index === 0)
            this.startedAt = now;
        this.onset = now;
        this.phase = 'stimulus';
        this.pending = undefined;
    }
    respond(response, now) {
        this.tick(now);
        if (this.phase === 'gap' && this.game === 'gonogo') {
            this.earlyTaps++;
            return;
        }
        if (this.phase !== 'stimulus' || this.pending)
            return;
        this.pending = {
            condition: this.current.condition, correct: response === this.current.answer,
            response, rtMs: Math.max(0, now - this.onset)
        };
        this.closeTrial(now);
    }
    tick(now) {
        if (this.phase === 'stimulus' && now >= this.deadline)
            this.closeTrial(this.deadline);
        if (this.phase === 'gap' && now >= this.nextAt) {
            if (this.index === this.trials.length - 1) {
                this.phase = 'completed';
                this.endedAt = this.nextAt;
            }
            else {
                this.index++;
                this.phase = 'awaiting';
            }
        }
    }
    closeTrial(now) {
        this.answers.push(this.pending || {
            condition: this.current.condition, correct: this.current.answer === null, response: null, rtMs: null
        });
        this.pending = undefined;
        if (this.game !== 'gonogo' && this.index === this.trials.length - 1) {
            this.phase = 'completed';
            this.endedAt = now;
        }
        else {
            this.phase = 'gap';
            this.nextAt = now + 500;
        }
    }
    interrupt(now) {
        if (this.phase === 'ready' || this.finished)
            return;
        if (this.pending)
            this.answers.push(this.pending);
        this.pending = undefined;
        this.phase = 'interrupted';
        this.endedAt = now;
    }
    record() {
        if (!this.finished)
            throw new Error('本局尚未结束');
        return {
            id: this.id, version: model_1.COGNITIVE_RULE_VERSION, config: { game: this.game, count: this.trials.length },
            status: this.phase,
            startedAt: this.startedAt, endedAt: this.endedAt, durationMs: Math.max(0, this.endedAt - this.startedAt),
            errors: this.answers.filter(item => !item.correct).length + this.earlyTaps,
            correct: this.answers.filter(item => item.correct).length, total: this.trials.length,
            answers: this.answers.slice(), earlyTaps: this.earlyTaps
        };
    }
}
exports.TrialSession = TrialSession;

})(core.trials = {});
(function (exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackingSession = exports.moveDots = exports.createDots = exports.DEFAULT_MOT_ROUNDS = exports.MOT_ROUND_OPTIONS = exports.MOTION_MS = exports.CUE_MS = exports.DOT_COUNT = exports.DOT_RADIUS = void 0;
const model_1 = core.model;
exports.DOT_RADIUS = 0.044;
exports.DOT_COUNT = 10;
exports.CUE_MS = 2000;
exports.MOTION_MS = 8000;
exports.MOT_ROUND_OPTIONS = [2, 4, 8];
exports.DEFAULT_MOT_ROUNDS = exports.MOT_ROUND_OPTIONS[0];
const TARGET_SPEEDS = { 3: 0.22, 4: 0.28, 5: 0.34 };
function createDots(random = Math.random, speed = 0.22) {
    const positions = model_1.shuffle(Array.from({ length: 12 }, (_, i) => ({
        x: 0.18 + (i % 3) * 0.32, y: 0.14 + Math.floor(i / 3) * 0.24
    })), random).slice(0, exports.DOT_COUNT);
    return positions.map((position, id) => {
        const angle = random() * Math.PI * 2;
        return Object.assign(Object.assign({ id }, position), { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    });
}
exports.createDots = createDots;
function moveDots(dots, seconds) {
    let remaining = Math.max(0, seconds);
    while (remaining > 0.000001) {
        const dt = Math.min(remaining, 1 / 120);
        remaining -= dt;
        for (const dot of dots) {
            dot.x += dot.vx * dt;
            dot.y += dot.vy * dt;
            contain(dot);
        }
        for (let i = 0; i < dots.length; i++)
            for (let j = i + 1; j < dots.length; j++) {
                const a = dots[i], b = dots[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance >= exports.DOT_RADIUS * 2)
                    continue;
                const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
                const overlap = (exports.DOT_RADIUS * 2 - distance) / 2;
                a.x -= nx * overlap;
                a.y -= ny * overlap;
                b.x += nx * overlap;
                b.y += ny * overlap;
                const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
                if (closing > 0) {
                    a.vx -= closing * nx;
                    a.vy -= closing * ny;
                    b.vx += closing * nx;
                    b.vy += closing * ny;
                }
                contain(a);
                contain(b);
            }
    }
}
exports.moveDots = moveDots;
function contain(dot) {
    if (dot.x < exports.DOT_RADIUS) {
        dot.x = exports.DOT_RADIUS;
        dot.vx = Math.abs(dot.vx);
    }
    if (dot.x > 1 - exports.DOT_RADIUS) {
        dot.x = 1 - exports.DOT_RADIUS;
        dot.vx = -Math.abs(dot.vx);
    }
    if (dot.y < exports.DOT_RADIUS) {
        dot.y = exports.DOT_RADIUS;
        dot.vy = Math.abs(dot.vy);
    }
    if (dot.y > 1 - exports.DOT_RADIUS) {
        dot.y = 1 - exports.DOT_RADIUS;
        dot.vy = -Math.abs(dot.vy);
    }
}
class TrackingSession {
    constructor(targetCount, random = Math.random, roundCount = exports.DEFAULT_MOT_ROUNDS) {
        this.targetCount = targetCount;
        this.random = random;
        this.id = model_1.sessionId();
        this.dots = [];
        this.targets = [];
        this.selected = [];
        this.results = [];
        this.phase = 'ready';
        this.round = 0;
        this.startedAt = 0;
        this.endedAt = 0;
        this.roundStart = 0;
        this.lastUpdate = 0;
        this.roundCount = exports.MOT_ROUND_OPTIONS.includes(roundCount) ? roundCount : exports.DEFAULT_MOT_ROUNDS;
    }
    start(now) {
        if (this.phase !== 'ready')
            return;
        this.startedAt = now;
        this.setupRound(now);
    }
    setupRound(now) {
        this.round++;
        this.dots = createDots(this.random, TARGET_SPEEDS[this.targetCount]);
        this.targets = model_1.shuffle(this.dots.map(dot => dot.id), this.random).slice(0, this.targetCount);
        this.selected = [];
        this.roundStart = now;
        this.lastUpdate = now + exports.CUE_MS;
        this.phase = 'cue';
    }
    tick(now) {
        if (this.phase === 'cue' && now >= this.roundStart + exports.CUE_MS)
            this.phase = 'moving';
        if (this.phase !== 'moving')
            return;
        const end = Math.min(now, this.roundStart + exports.CUE_MS + exports.MOTION_MS);
        moveDots(this.dots, Math.max(0, end - this.lastUpdate) / 1000);
        this.lastUpdate = end;
        if (now >= this.roundStart + exports.CUE_MS + exports.MOTION_MS)
            this.phase = 'select';
    }
    toggle(id) {
        if (this.phase !== 'select' || !this.dots.some(dot => dot.id === id))
            return;
        if (this.selected.includes(id))
            this.selected = this.selected.filter(value => value !== id);
        else if (this.selected.length < this.targetCount)
            this.selected.push(id);
    }
    hitTest(x, y, radius = exports.DOT_RADIUS) {
        var _a;
        const sorted = this.dots.map(dot => ({ id: dot.id, distance: Math.hypot(dot.x - x, dot.y - y) }))
            .sort((a, b) => a.distance - b.distance);
        return ((_a = sorted[0]) === null || _a === void 0 ? void 0 : _a.distance) <= radius ? sorted[0].id : undefined;
    }
    submit(now) {
        if (this.phase !== 'select' || this.selected.length !== this.targetCount)
            return false;
        this.results.push({ hits: this.selected.filter(id => this.targets.includes(id)).length, targets: this.targetCount });
        if (this.round === this.roundCount) {
            this.phase = 'completed';
            this.endedAt = now;
        }
        else
            this.phase = 'feedback';
        return true;
    }
    next(now) {
        if (this.phase === 'feedback')
            this.setupRound(now);
    }
    interrupt(now) {
        if (this.phase === 'ready' || this.phase === 'completed' || this.phase === 'interrupted')
            return;
        this.phase = 'interrupted';
        this.endedAt = now;
    }
    record() {
        if (this.phase !== 'completed' && this.phase !== 'interrupted')
            throw new Error('本局尚未结束');
        const correct = this.results.reduce((sum, item) => sum + item.hits, 0);
        const attempted = this.results.reduce((sum, item) => sum + item.targets, 0);
        return {
            id: this.id, version: model_1.COGNITIVE_RULE_VERSION, config: { game: 'mot', targets: this.targetCount, rounds: this.roundCount },
            startedAt: this.startedAt, endedAt: this.endedAt, durationMs: this.endedAt - this.startedAt,
            status: this.phase, errors: attempted - correct, correct, total: this.targetCount * this.roundCount,
            tracking: this.results.slice()
        };
    }
}
exports.TrackingSession = TrackingSession;

})(core.tracking = {});
(function (exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSchulte = exports.specName = exports.gameName = exports.modeInfo = exports.GAMES = exports.DURATIONS = exports.SPECS = exports.MODES = void 0;
const tracking_1 = core.tracking;
const trials_1 = core.trials;
exports.MODES = [
    { id: 'practice', name: '练习', short: '点亮起步，逐个找齐', mark: '1  2  3', rule: '按从小到大的顺序点击。点对后格子变暗，帮助你找到下一个。' },
    { id: 'classic', name: '经典', short: '按序寻找，保持专注', mark: '1 → 25', rule: '按从小到大的顺序点击全部目标。点过的格子保持原样。' },
    { id: 'reverse', name: '反转', short: '换个方向，从大到小', mark: '25 → 1', rule: '按从大到小的顺序点击。字母从 Z 到 A，或从 z 到 a。' },
    { id: 'challenge', name: '挑战', short: '一次不错，完成整盘', mark: '零失误', rule: '按从小到大的顺序点击。点错一次，本局挑战立即结束。' },
    { id: 'crazy', name: '疯狂', short: '每点一次，全盘重排', mark: '↔', rule: '按从小到大的顺序点击。每次点对后，所有格子重新打乱。' },
    { id: 'arithmetic', name: '速算', short: '算出结果，找到答案', mark: '+ − × ÷', rule: '算出上方算式的结果，点击对应答案，答对换题。结果都是 100 以内的数，棋盘越小数字越小；每格只用一次。' },
    { id: 'patience', name: '耐心', short: '一轮接一轮，直到到点', mark: '25 ↻', rule: '依次点击 1～25，完成后立即重开。看看限时内能完成几轮。' }
];
exports.SPECS = [
    { id: '3', label: '3×3' }, { id: '4', label: '4×4' }, { id: '5', label: '5×5' },
    { id: '6', label: '6×6' }, { id: '7', label: '7×7' }, { id: '8', label: '8×8' },
    { id: '9', label: '9×9' }, { id: 'upper', label: 'A–Z' }, { id: 'lower', label: 'a–z' }
];
exports.DURATIONS = [
    { id: 30, label: '30 秒' }, { id: 60, label: '1 分钟' },
    { id: 120, label: '2 分钟' }, { id: 240, label: '4 分钟' },
    { id: 300, label: '5 分钟' }, { id: 600, label: '10 分钟' }
];
exports.GAMES = [
    { id: 'stroop', name: '斯特鲁普', englishName: 'Stroop', short: '看颜色，抵抗文字干扰', rule: '选择字的颜色。例如蓝色的“红”，应选择蓝。作答不限时，每题只接受一次作答，答后间隔 0.5 秒进入下一题。', mark: '红', count: trials_1.STANDARD_TRIAL_COUNTS.stroop },
    { id: 'simon', name: '西蒙效应', englishName: 'Simon', short: '按颜色选择，忽略位置', rule: '蓝色选左边按钮，橙色选右边按钮。圆形出现的位置不影响答案。作答不限时，答后间隔 0.5 秒进入下一题。', mark: '●', count: trials_1.STANDARD_TRIAL_COUNTS.simon },
    { id: 'flanker', name: '侧翼干扰', englishName: 'Flanker', short: '只判断中间箭头', rule: '只看中间箭头，点击它指向的方向。两侧符号是干扰。作答不限时，答后间隔 0.5 秒进入下一题。', mark: '←←→←←', count: trials_1.STANDARD_TRIAL_COUNTS.flanker },
    { id: 'gonogo', name: '反应抑制', englishName: 'Go/No-Go', short: '看到圆形点，方形忍住', rule: '圆形出现时点“点击”，方形出现时不操作。作答窗口为 1 秒，作答或窗口结束后空档 0.5 秒，空档点击记抢按。', mark: '● ■', count: trials_1.STANDARD_TRIAL_COUNTS.gonogo },
    { id: 'mot', name: '多目标追踪', short: '记住目标，跟住移动', rule: '记住高亮的小球，颜色消失后追踪它们。停止时选出目标，再提交答案。可选 2、4、8 轮，目标越多，移动越快。', mark: '● · ●', count: tracking_1.DEFAULT_MOT_ROUNDS }
];
function modeInfo(mode) {
    return exports.MODES.find(item => item.id === mode);
}
exports.modeInfo = modeInfo;
function gameName(config) {
    return config.game === 'schulte' ? modeInfo(config.mode || 'classic').name : exports.GAMES.find(item => item.id === config.game).name;
}
exports.gameName = gameName;
function specName(config) {
    var _a;
    if (config.game === 'mot')
        return '追踪 ' + config.targets + ' 个 · ' + (config.rounds || 8) + ' 轮';
    if (config.game !== 'schulte')
        return config.count ? config.count + ' 题' : '标准';
    if (config.mode === 'patience')
        return '5×5 · ' + exports.DURATIONS.find(item => item.id === config.seconds).label;
    return ((_a = exports.SPECS.find(item => item.id === config.spec)) === null || _a === void 0 ? void 0 : _a.label) || '5×5';
}
exports.specName = specName;
function normalizeSchulte(mode, saved = {}) {
    var _a, _b;
    const validMode = ((_a = exports.MODES.find(item => item.id === mode)) === null || _a === void 0 ? void 0 : _a.id) || 'classic';
    const allowed = validMode === 'arithmetic' ? exports.SPECS.slice(0, 7) : exports.SPECS;
    const spec = validMode === 'patience' ? '5' : ((_b = allowed.find(item => item.id === saved.spec)) === null || _b === void 0 ? void 0 : _b.id) || '5';
    const seconds = exports.DURATIONS.some(item => item.id === saved.seconds) ? saved.seconds : 60;
    return Object.assign({ game: 'schulte', mode: validMode, spec }, (validMode === 'patience' ? { seconds } : {}));
}
exports.normalizeSchulte = normalizeSchulte;

})(core.catalog = {});
(function (exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchulteSession = exports.equations = void 0;
const model_1 = core.model;
function equations(count, random = Math.random) {
    const operations = model_1.shuffle(Array.from({ length: count }, (_, i) => ['+', '-', '×', '/'][i % 4]), random);
    const maxAnswer = Math.min(100, Math.max(30, Math.round(count * 1.3)));
    const used = new Set();
    const build = (operator) => {
        const candidates = [];
        if (operator === '×') {
            for (let a = 2; a <= 10; a++)
                for (let b = 2; b <= Math.min(10, Math.floor(maxAnswer / a)); b++) {
                    if (!used.has(a * b))
                        candidates.push({ a, b, operator, answer: a * b, text: a + ' × ' + b });
                }
        }
        else if (operator === '/') {
            for (let b = 2; b <= 9; b++)
                for (let answer = 1; answer <= Math.floor(maxAnswer / b); answer++) {
                    if (!used.has(answer))
                        candidates.push({ a: answer * b, b, operator, answer, text: answer * b + ' / ' + b });
                }
        }
        else {
            const top = operator === '+' ? maxAnswer : maxAnswer - 1;
            for (let answer = operator === '+' ? 2 : 1; answer <= top; answer++) {
                if (used.has(answer))
                    continue;
                const a = operator === '+' ? 1 + Math.floor(random() * (answer - 1)) : answer + 1 + Math.floor(random() * (maxAnswer - answer));
                const b = operator === '+' ? answer - a : a - answer;
                candidates.push({ a, b, operator, answer, text: a + ' ' + operator + ' ' + b });
            }
        }
        const chosen = candidates[Math.floor(random() * candidates.length)];
        used.add(chosen.answer);
        return chosen;
    };
    const priority = (operator) => (operator === '×' ? 0 : operator === '/' ? 1 : operator === '+' ? 2 : 3);
    const questions = new Array(count);
    operations
        .map((operator, index) => ({ operator, index }))
        .sort((x, y) => priority(x.operator) - priority(y.operator) || x.index - y.index)
        .forEach(item => { questions[item.index] = build(item.operator); });
    return questions;
}
exports.equations = equations;
class SchulteSession {
    constructor(config, random = Math.random) {
        this.random = random;
        this.id = model_1.sessionId();
        this.cells = [];
        this.position = 0;
        this.rounds = 0;
        this.errors = 0;
        this.correct = 0;
        this.startedAt = 0;
        this.endedAt = 0;
        this.status = 'ready';
        this.config = Object.assign({}, config);
        const letters = config.spec === 'upper' || config.spec === 'lower';
        this.columns = letters ? 6 : Number(config.spec);
        this.total = letters ? 26 : this.columns * this.columns;
        this.questions = config.mode === 'arithmetic' ? equations(this.total, random) : [];
        let targets = letters
            ? Array.from({ length: 26 }, (_, i) => String.fromCharCode((config.spec === 'upper' ? 65 : 97) + i))
            : Array.from({ length: this.total }, (_, i) => String(i + 1));
        if (config.mode === 'reverse')
            targets = targets.reverse();
        if (config.mode === 'arithmetic')
            targets = this.questions.map(item => String(item.answer));
        this.targets = targets;
        this.resetBoard();
    }
    resetBoard() {
        this.cells = model_1.shuffle(this.targets, this.random).map(value => ({ value, done: false }));
    }
    start(now) {
        if (this.status !== 'ready')
            return;
        this.startedAt = now;
        this.status = 'running';
    }
    get target() { return this.targets[this.position] || ''; }
    get equation() { var _a; return ((_a = this.questions[this.position]) === null || _a === void 0 ? void 0 : _a.text) || ''; }
    get deadline() { return this.startedAt + (this.config.seconds || 0) * 1000; }
    elapsed(now) {
        if (this.status === 'ready')
            return 0;
        const end = this.status === 'running' ? now : this.endedAt;
        return Math.max(0, this.config.mode === 'patience' ? Math.min(end, this.deadline) - this.startedAt : end - this.startedAt);
    }
    tick(now) {
        if (this.status === 'running' && this.config.mode === 'patience' && now >= this.deadline) {
            this.finish('completed', this.deadline);
            return true;
        }
        return false;
    }
    tap(index, now) {
        if (this.status !== 'running')
            return 'ignored';
        if (this.tick(now))
            return 'finished';
        const cell = this.cells[index];
        if (!cell)
            return 'ignored';
        if (cell.value !== this.target) {
            this.errors++;
            if (this.config.mode === 'challenge')
                this.finish('failed', now);
            return 'wrong';
        }
        cell.done = true;
        this.position++;
        this.correct++;
        if (this.position === this.total) {
            if (this.config.mode === 'patience') {
                this.rounds++;
                this.position = 0;
                this.resetBoard();
            }
            else {
                this.finish('completed', now);
                return 'finished';
            }
        }
        else if (this.config.mode === 'crazy') {
            this.cells = model_1.shuffle(this.cells, this.random);
        }
        return 'correct';
    }
    interrupt(now) {
        if (this.status === 'running' && !this.tick(now))
            this.finish('interrupted', now);
    }
    finish(status, now) {
        this.status = status;
        this.endedAt = now;
    }
    record() {
        if (this.status === 'ready' || this.status === 'running')
            throw new Error('本局尚未结束');
        const version = this.config.mode === 'arithmetic' ? model_1.ARITHMETIC_RULE_VERSION : model_1.RULE_VERSION;
        return Object.assign({ id: this.id, version, config: this.config, startedAt: this.startedAt, endedAt: this.endedAt, durationMs: this.elapsed(this.endedAt), status: this.status, errors: this.errors, correct: this.correct, total: this.total }, (this.config.mode === 'patience' ? { rounds: this.rounds, progress: this.position } : {}));
    }
}
exports.SchulteSession = SchulteSession;

})(core.schulte = {});
(function (exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addUnique = exports.summarize = exports.compareRecords = exports.score = exports.inhibition = exports.reaction = void 0;
const model_1 = core.model;
function reaction(answers = []) {
    const values = answers.filter(item => item.correct && item.rtMs !== null).map(item => item.rtMs);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
exports.reaction = reaction;
function inhibition(record) {
    const go = (record.answers || []).filter(item => item.condition === 'go');
    const nogo = (record.answers || []).filter(item => item.condition === 'nogo');
    const hits = go.filter(item => item.correct).length;
    const falseAlarms = nogo.filter(item => !item.correct).length;
    const hitRate = go.length ? hits / go.length : 0;
    const falseRate = nogo.length ? falseAlarms / nogo.length : 0;
    return { hitRate, falseRate, balanced: (hitRate + 1 - falseRate) / 2, misses: go.length - hits, falseAlarms };
}
exports.inhibition = inhibition;
function score(record) {
    return record.config.game === 'gonogo' ? inhibition(record).balanced : record.correct / record.total;
}
exports.score = score;
function compareRecords(a, b) {
    if (a.config.game === 'schulte') {
        return a.config.mode === 'patience'
            ? a.correct - b.correct || b.errors - a.errors
            : b.durationMs - a.durationMs || b.errors - a.errors;
    }
    const accuracy = score(a) - score(b);
    if (Math.abs(accuracy) > 1e-10)
        return accuracy;
    if (a.config.game === 'mot') {
        return (a.tracking || []).filter(item => item.hits === item.targets).length -
            (b.tracking || []).filter(item => item.hits === item.targets).length;
    }
    if (a.config.game === 'gonogo' && a.earlyTaps !== b.earlyTaps)
        return (b.earlyTaps || 0) - (a.earlyTaps || 0);
    const ar = reaction(a.answers), br = reaction(b.answers);
    if (ar === null)
        return br === null ? 0 : -1;
    if (br === null)
        return 1;
    return br - ar;
}
exports.compareRecords = compareRecords;
function summarize(records, config, day, version = 1) {
    const key = model_1.configKey(config, version);
    const completed = records.filter(item => item.status === 'completed' && model_1.configKey(item.config, item.version) === key);
    const today = completed.filter(item => model_1.beijingDay(item.endedAt) === day);
    const best = completed.reduce((current, item) => !current || compareRecords(item, current) > 0 ? item : current, null);
    const meanMs = today.length ? today.reduce((sum, item) => sum + item.durationMs, 0) / today.length : null;
    const meanRounds = today.length ? today.reduce((sum, item) => sum + (item.rounds || 0), 0) / today.length : null;
    const dailyScore = today.length
        ? today.reduce((sum, item) => sum + score(item) * item.total, 0) / today.reduce((sum, item) => sum + item.total, 0)
        : null;
    return { completed, today, best, meanMs, meanRounds, dailyScore };
}
exports.summarize = summarize;
function addUnique(records, record) {
    return records.some(item => item.id === record.id) ? records : [...records, record];
}
exports.addUnique = addUnique;

})(core.records = {});
(function (exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultView = exports.recordValue = exports.patienceValue = exports.rt = exports.percent = exports.seconds = void 0;
const catalog_1 = core.catalog;
const model_1 = core.model;
const records_1 = core.records;
function seconds(ms) { return (ms / 1000).toFixed(2); }
exports.seconds = seconds;
function percent(value) { return value === null ? '—' : (value * 100).toFixed(1); }
exports.percent = percent;
function rt(value) { return value === null ? '—' : String(Math.round(value)); }
exports.rt = rt;
function patienceValue(record) { return (record.rounds || 0) + '轮+' + (record.progress || 0) + '格'; }
exports.patienceValue = patienceValue;
function recordValue(record) {
    if (record.status === 'interrupted')
        return '已中断';
    if (record.status === 'failed')
        return '挑战失败';
    if (record.config.game === 'schulte') {
        return record.config.mode === 'patience' ? patienceValue(record) : seconds(record.durationMs) + ' 秒';
    }
    return percent(records_1.score(record)) + '%';
}
exports.recordValue = recordValue;
function resultView(record, records, available = true) {
    var _a;
    const summary = records_1.summarize(records, record.config, model_1.beijingDay(record.endedAt), record.version);
    const best = available ? summary.best : null;
    const previous = summary.completed.filter(item => item.id !== record.id);
    const isBest = available && record.status === 'completed' &&
        previous.every(item => records_1.compareRecords(record, item) > 0);
    const result = {
        title: record.status === 'completed' ? '训练完成' : record.status === 'failed' ? '挑战失败' : '本局已中断',
        subtitle: catalog_1.gameName(record.config) + ' · ' + catalog_1.specName(record.config),
        hero: '', unit: '', caption: '', metrics: [], details: [], isBest, saveError: '', saved: false,
        settingsLabel: record.config.game === 'schulte' || record.config.game === 'mot' ? '调整设置' : '查看玩法'
    };
    const metric = (label, value, unit = '') => ({ label, value, unit });
    if (record.config.game === 'schulte') {
        const patience = record.config.mode === 'patience';
        result.hero = patience ? String(record.rounds || 0) : seconds(record.durationMs);
        result.unit = patience ? '轮' : '秒';
        result.caption = patience ? '本轮进度 ' + record.progress + '/25' : '完成 ' + record.correct + '/' + record.total + ' 个目标';
        result.metrics = [
            metric('错误', String(record.errors), '次'),
            metric('反应', seconds(record.durationMs), '秒'),
            metric('日均', available ? (patience ? (_a = summary.meanRounds) === null || _a === void 0 ? void 0 : _a.toFixed(2) : summary.meanMs === null ? undefined : seconds(summary.meanMs)) || '—' : '—', patience ? '轮' : '秒'),
            metric('纪录', best ? patience ? patienceValue(best) : seconds(best.durationMs) : '—', patience ? '' : '秒')
        ];
    }
    else if (record.config.game === 'gonogo') {
        const stats = records_1.inhibition(record);
        result.hero = percent(stats.balanced);
        result.unit = '%';
        result.caption = '应答与抑制的平均正确率';
        result.metrics = [
            metric('Go 命中', percent(stats.hitRate), '%'), metric('No-Go 误按', percent(stats.falseRate), '%'),
            metric('漏按', String(stats.misses), '次'), metric('反应', rt(records_1.reaction(record.answers)), '毫秒')
        ];
    }
    else if (record.config.game === 'mot') {
        const rounds = record.tracking || [];
        result.hero = percent(record.correct / record.total);
        result.unit = '%';
        result.caption = '目标找回率';
        result.metrics = [
            metric('找回', record.correct + '/' + record.total, '个'),
            metric('全对', String(rounds.filter(item => item.hits === item.targets).length), '轮'),
            metric('日均', percent(available ? summary.dailyScore : null), '%'),
            metric('纪录', percent(best ? records_1.score(best) : null), '%')
        ];
    }
    else {
        const answers = record.answers || [];
        result.hero = percent(records_1.score(record));
        result.unit = '%';
        result.caption = '正确 ' + record.correct + '/' + record.total + ' 题';
        result.metrics = [
            metric('反应', rt(records_1.reaction(answers)), '毫秒'),
            metric('错误', String(record.errors), '题'),
            metric('日均正确率', percent(available ? summary.dailyScore : null), '%'),
            metric('纪录正确率', percent(best ? records_1.score(best) : null), '%')
        ];
    }
    if (record.status !== 'completed') {
        result.hero = record.status === 'failed' ? '失败' : '中断';
        result.unit = '';
        result.isBest = false;
    }
    return result;
}
exports.resultView = resultView;

})(core.presentation = {});
window.AttentionCore = core;
})();
