(function () {
  'use strict';
  var core = window.AttentionCore;
  var platform = window.AttentionPlatform;
  var RECORD_PREFIX = 'attention:records:v1:';
  var SETTINGS_PREFIX = 'attention:settings:v1:';
  var nativeStorage = false;
  var queue = Promise.resolve();
  var migrationNotice = '';

  function isRecord(value) {
    if (!value || typeof value !== 'object') return false;
    var config = value.config;
    if (typeof value.id !== 'string' || !config || !['completed', 'failed', 'interrupted'].includes(value.status)) return false;
    if (![value.version, value.startedAt, value.endedAt, value.durationMs, value.errors, value.correct, value.total].every(Number.isFinite)) return false;
    if (value.durationMs < 0 || value.errors < 0 || value.correct < 0 || value.total <= 0) return false;
    if (config.game === 'schulte') {
      return core.catalog.MODES.some(function (mode) { return mode.id === config.mode; }) &&
        core.catalog.SPECS.some(function (spec) { return spec.id === config.spec; }) &&
        (config.mode !== 'patience' || (config.spec === '5' && core.catalog.DURATIONS.some(function (time) { return time.id === config.seconds; })));
    }
    if (config.game === 'mot') return [3, 4, 5].includes(config.targets) && Array.isArray(value.tracking) &&
      value.tracking.every(function (round) { return round && Number.isFinite(round.hits) && Number.isFinite(round.targets); });
    return ['stroop', 'simon', 'flanker', 'gonogo'].includes(config.game) && Array.isArray(value.answers) &&
      value.answers.every(function (answer) { return answer && typeof answer.correct === 'boolean' && (answer.rtMs === null || Number.isFinite(answer.rtMs)); });
  }

  function browserKeys() {
    var keys = [];
    for (var i = 0; i < window.localStorage.length; i++) keys.push(window.localStorage.key(i));
    return keys;
  }

  async function keys() {
    if (!nativeStorage) return browserKeys();
    var result = await platform.api().getStorageInfo();
    if (!result || !Array.isArray(result.keys)) throw new Error('Invalid storage metadata');
    return result.keys;
  }

  async function read(key) {
    var data;
    if (nativeStorage) {
      var result = await platform.api().getStorage({ key: key });
      data = result && result.data;
    } else data = window.localStorage.getItem(key);
    return data === null || data === undefined || data === '' ? null : JSON.parse(data);
  }

  async function write(key, value) {
    var data = JSON.stringify(value);
    if (new Blob([data]).size > 1024 * 1024) throw new Error('Storage key exceeds quota');
    if (nativeStorage) await platform.api().setStorage({ key: key, data: data });
    else window.localStorage.setItem(key, data);
  }

  function serialize(operation) {
    var result = queue.then(operation);
    queue = result.catch(function () {});
    return result;
  }

  async function migrateBrowserData() {
    if (!nativeStorage) return;
    var oldKeys;
    try { oldKeys = browserKeys().filter(function (key) { return key && (key.startsWith(RECORD_PREFIX) || key.startsWith(SETTINGS_PREFIX)); }); }
    catch (error) { return; }
    if (!oldKeys.length) return;
    var currentKeys = await keys();
    for (var i = 0; i < oldKeys.length; i++) {
      var key = oldKeys[i];
      try {
        var old = JSON.parse(window.localStorage.getItem(key));
        var current = currentKeys.includes(key) ? await read(key) : null;
        if (key.startsWith(RECORD_PREFIX)) {
          if (!Array.isArray(old) || !old.every(isRecord) || (current !== null && (!Array.isArray(current) || !current.every(isRecord)))) throw new Error('Invalid records');
          var merged = current || [];
          old.forEach(function (record) { merged = core.records.addUnique(merged, record); });
          await write(key, merged);
        } else if (current === null) {
          if (!old || typeof old !== 'object' || Array.isArray(old)) throw new Error('Invalid settings');
          await write(key, old);
        }
        window.localStorage.removeItem(key);
      } catch (error) { migrationNotice = '部分旧记录暂未迁移，原数据已保留。请稍后重新打开。'; }
    }
  }

  async function init() {
    nativeStorage = ['getStorage', 'setStorage', 'getStorageInfo'].every(function (method) { return platform.available(method, 9460); });
    try { await migrateBrowserData(); }
    catch (error) { migrationNotice = '旧记录暂未迁移，原数据已保留。请稍后重新打开。'; }
  }

  async function readBucket(key) {
    var raw = await read(key);
    if (raw === null) return [];
    if (!Array.isArray(raw) || !raw.every(isRecord)) throw new Error('Invalid record bucket');
    return raw;
  }

  async function loadRecords() {
    await queue;
    try {
      var recordKeys = (await keys()).filter(function (key) { return typeof key === 'string' && key.startsWith(RECORD_PREFIX); });
      var records = [];
      for (var i = 0; i < recordKeys.length; i++) records = records.concat(await readBucket(recordKeys[i]));
      return { records: records.sort(function (a, b) { return b.endedAt - a.endedAt; }), error: migrationNotice };
    } catch (error) { return { records: [], error: '暂时无法读取训练记录，请稍后重试。原数据已保留。' }; }
  }

  async function saveRecord(record) {
    return serialize(async function () {
      try {
        if (!isRecord(record)) throw new Error('Invalid record');
        var key = RECORD_PREFIX + core.model.beijingDay(record.endedAt).slice(0, 7) + ':' + record.config.game;
        var existing = await readBucket(key);
        var updated = core.records.addUnique(existing, record);
        if (existing !== updated) await write(key, updated);
        return true;
      } catch (error) { return false; }
    });
  }

  async function loadSettings(key) {
    await queue;
    try {
      var value = await read(SETTINGS_PREFIX + key);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) { return {}; }
  }

  async function saveSettings(key, config) {
    return serialize(async function () {
      try { await write(SETTINGS_PREFIX + key, config); return true; }
      catch (error) { return false; }
    });
  }

  window.AttentionStorage = {
    init: init, loadRecords: loadRecords, saveRecord: saveRecord,
    loadSettings: loadSettings, saveSettings: saveSettings
  };
})();
