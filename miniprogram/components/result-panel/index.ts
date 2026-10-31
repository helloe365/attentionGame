Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { result: { type: Object, value: null } },
  methods: {
    again() { this.triggerEvent('again'); },
    settings() { this.triggerEvent('settings'); },
    history() {
      const pages = getCurrentPages();
      if (pages[pages.length - 1]?.route === 'pages/history/index') this.triggerEvent('history');
      else wx.navigateTo({ url: '/pages/history/index' });
    },
    home() { wx.reLaunch({ url: '/pages/home/index' }); },
    retry() { this.triggerEvent('retry'); }
  }
});
