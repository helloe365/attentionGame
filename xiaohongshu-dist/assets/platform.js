(function () {
  'use strict';
  var clientVersion = 0;
  var ratio = 1;
  var miniTool;
  var root = document.documentElement;

  function buildVersion(options) {
    return Number(options && options.miniToolEnv && options.miniToolEnv.buildVersion) || 0;
  }

  async function init() {
    var xhs = window.xhs;
    miniTool = xhs && xhs.miniTool;
    var build = buildVersion(xhs && xhs.launchOptions);
    if (!build && miniTool && typeof miniTool.getLaunchOptions === 'function') {
      try { build = buildVersion(await miniTool.getLaunchOptions()); } catch (error) { build = 0; }
    }
    clientVersion = Math.floor(build / 1000);
    await layout();
  }

  function available(name, version) {
    return clientVersion >= version && miniTool && typeof miniTool[name] === 'function';
  }

  async function layout() {
    var info;
    if (available('getWindowInfo', 9490)) {
      try { info = await miniTool.getWindowInfo(); } catch (error) { info = null; }
    }
    ratio = Math.min(2, Math.max(1, Number(info && info.pixelRatio) || window.devicePixelRatio || 1));
    var height = Number(info && info.windowHeight) || window.innerHeight;
    root.style.setProperty('--app-height', height + 'px');
    if (!info) return;
    var safe = info.safeArea;
    var top = safe && Number.isFinite(safe.top) ? Math.max(0, safe.top) : 0;
    var menus = info.menuButtons || {};
    ['back', 'me', 'share'].forEach(function (key) {
      var rect = menus[key];
      if (rect && Number.isFinite(rect.bottom)) top = Math.max(top, rect.bottom + 8);
    });
    root.style.setProperty('--header-inset', top + 'px');
    if (safe) {
      if (Number.isFinite(safe.bottom)) root.style.setProperty('--content-bottom', Math.max(0, height - safe.bottom) + 'px');
      if (Number.isFinite(safe.left)) root.style.setProperty('--content-left', Math.max(0, safe.left) + 'px');
      if (Number.isFinite(safe.right) && Number.isFinite(info.windowWidth)) {
        root.style.setProperty('--content-right', Math.max(0, info.windowWidth - safe.right) + 'px');
      }
    }
  }

  async function feedback() {
    if (!available('vibrateShort', 9500)) return;
    try { await miniTool.vibrateShort({ type: 'light' }); } catch (error) { /* Visual feedback remains available. */ }
  }

  window.AttentionPlatform = {
    init: init, layout: layout, available: available, feedback: feedback,
    api: function () { return miniTool; },
    pixelRatio: function () { return ratio; }
  };
})();
