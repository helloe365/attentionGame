import { GameConfig, GameId, SchulteMode } from './model';
import { DEFAULT_MOT_ROUNDS } from './tracking';
import { STANDARD_TRIAL_COUNTS } from './trials';

export const MODES: { id: SchulteMode; name: string; short: string; mark: string; rule: string }[] = [
  { id: 'practice', name: '练习', short: '点亮起步，逐个找齐', mark: '1  2  3', rule: '按从小到大的顺序点击。点对后格子变暗，帮助你找到下一个。' },
  { id: 'classic', name: '经典', short: '按序寻找，保持专注', mark: '1 → 25', rule: '按从小到大的顺序点击全部目标。点过的格子保持原样。' },
  { id: 'reverse', name: '反转', short: '换个方向，从大到小', mark: '25 → 1', rule: '按从大到小的顺序点击。字母从 Z 到 A，或从 z 到 a。' },
  { id: 'challenge', name: '挑战', short: '一次不错，完成整盘', mark: '零失误', rule: '按从小到大的顺序点击。点错一次，本局挑战立即结束。' },
  { id: 'crazy', name: '疯狂', short: '每点一次，全盘重排', mark: '↔', rule: '按从小到大的顺序点击。每次点对后，所有格子重新打乱。' },
  { id: 'arithmetic', name: '速算', short: '算出结果，找到答案', mark: '+ − × ÷', rule: '算出上方算式的结果，点击对应答案，答对换题。结果都是 100 以内的数，棋盘越小数字越小；每格只用一次。' },
  { id: 'patience', name: '耐心', short: '一轮接一轮，直到到点', mark: '25 ↻', rule: '依次点击 1～25，完成后立即重开。看看限时内能完成几轮。' }
];

export const SPECS = [
  { id: '3', label: '3×3' }, { id: '4', label: '4×4' }, { id: '5', label: '5×5' },
  { id: '6', label: '6×6' }, { id: '7', label: '7×7' }, { id: '8', label: '8×8' },
  { id: '9', label: '9×9' }, { id: 'upper', label: 'A–Z' }, { id: 'lower', label: 'a–z' }
];

export const DURATIONS = [
  { id: 30, label: '30 秒' }, { id: 60, label: '1 分钟' },
  { id: 120, label: '2 分钟' }, { id: 240, label: '4 分钟' },
  { id: 300, label: '5 分钟' }, { id: 600, label: '10 分钟' }
];

export const GAMES: { id: GameId; name: string; englishName?: string; short: string; rule: string; mark: string; count: number }[] = [
  { id: 'stroop', name: '斯特鲁普', englishName: 'Stroop', short: '看颜色，抵抗文字干扰', rule: '选择字的颜色。例如蓝色的“红”，应选择蓝。作答不限时，每题只接受一次作答，答后间隔 0.5 秒进入下一题。', mark: '红', count: STANDARD_TRIAL_COUNTS.stroop },
  { id: 'simon', name: '西蒙效应', englishName: 'Simon', short: '按颜色选择，忽略位置', rule: '蓝色选左边按钮，橙色选右边按钮。圆形出现的位置不影响答案。作答不限时，答后间隔 0.5 秒进入下一题。', mark: '●', count: STANDARD_TRIAL_COUNTS.simon },
  { id: 'flanker', name: '侧翼干扰', englishName: 'Flanker', short: '只判断中间箭头', rule: '只看中间箭头，点击它指向的方向。两侧符号是干扰。作答不限时，答后间隔 0.5 秒进入下一题。', mark: '←←→←←', count: STANDARD_TRIAL_COUNTS.flanker },
  { id: 'gonogo', name: '反应抑制', englishName: 'Go/No-Go', short: '看到圆形点，方形忍住', rule: '圆形出现时点“点击”，方形出现时不操作。作答窗口为 1 秒，作答或窗口结束后空档 0.5 秒，空档点击记抢按。', mark: '● ■', count: STANDARD_TRIAL_COUNTS.gonogo },
  { id: 'mot', name: '多目标追踪', short: '记住目标，跟住移动', rule: '记住高亮的小球，颜色消失后追踪它们。停止时选出目标，再提交答案。可选 2、4、8 轮，目标越多，移动越快。', mark: '● · ●', count: DEFAULT_MOT_ROUNDS }
];

export function modeInfo(mode: SchulteMode) {
  return MODES.find(item => item.id === mode)!;
}

export function gameName(config: GameConfig): string {
  return config.game === 'schulte' ? modeInfo(config.mode || 'classic').name : GAMES.find(item => item.id === config.game)!.name;
}

export function specName(config: GameConfig): string {
  if (config.game === 'mot') return '追踪 ' + config.targets + ' 个 · ' + (config.rounds || 8) + ' 轮';
  if (config.game !== 'schulte') return config.count ? config.count + ' 题' : '标准';
  if (config.mode === 'patience') return '5×5 · ' + DURATIONS.find(item => item.id === config.seconds)!.label;
  return SPECS.find(item => item.id === config.spec)?.label || '5×5';
}

export function normalizeSchulte(mode: string | undefined, saved: Partial<GameConfig> = {}): GameConfig {
  const validMode = MODES.find(item => item.id === mode)?.id || 'classic';
  const allowed = validMode === 'arithmetic' ? SPECS.slice(0, 7) : SPECS;
  const spec = validMode === 'patience' ? '5' : allowed.find(item => item.id === saved.spec)?.id || '5';
  const seconds = DURATIONS.some(item => item.id === saved.seconds) ? saved.seconds! : 60;
  return { game: 'schulte', mode: validMode, spec, ...(validMode === 'patience' ? { seconds } : {}) };
}
