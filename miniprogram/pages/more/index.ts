import { GAMES } from '../../core/catalog';

Page({
  data: { games: GAMES },
  onGameTap(event: WechatMiniprogram.TouchEvent) {
    const game = String(event.currentTarget.dataset.game);
    if (game === 'mot') wx.navigateTo({ url: '/pages/tracking/index' });
    else if (GAMES.some(item => item.id === game)) wx.navigateTo({ url: '/pages/task/index?game=' + game });
  }
});
