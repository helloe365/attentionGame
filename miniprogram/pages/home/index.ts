import { MODES } from '../../core/catalog';

Page({
  data: {
    modes: [...MODES, { id: 'more', name: '更多', short: '探索其他注意力训练', mark: '+', rule: '' }]
  },
  onModeTap(event: WechatMiniprogram.TouchEvent) {
    const mode = String(event.currentTarget.dataset.mode);
    if (mode === 'more') wx.navigateTo({ url: '/pages/more/index' });
    else if (MODES.some(item => item.id === mode)) wx.navigateTo({ url: '/pages/schulte/index?mode=' + mode });
  },
  onHistory() { wx.navigateTo({ url: '/pages/history/index' }); }
});
