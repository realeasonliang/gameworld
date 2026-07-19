/*
 * 共享国际化模块 (Shared i18n) — GameWorld
 * 用法：
 *   1) 在游戏 HTML 里引入：<script src="../../assets/i18n.js"></script>
 *   2) 在游戏 JS 里初始化：i18n.init({ dict: { zh:{...}, en:{...} }, onLang: fn });
 *   3) 静态文本用 data-i18n="key"（textContent）/ data-i18n-ph="key"（placeholder）/ data-i18n-title="key"（title）
 *   4) JS 动态文本用 i18n.t('key') 读取，语言切换时自动随渲染刷新
 * 语言：根据浏览器自动选（zh / en），右上角 🌐 按钮手动切换并记忆到 localStorage('gw-lang')
 */
(function () {
  'use strict';

  var state = {
    lang: 'zh',
    dict: { zh: {}, en: {} },
    listeners: []
  };

  function detect() {
    var s = localStorage.getItem('gw-lang');
    if (s === 'zh' || s === 'en') return s;
    var nav = (navigator.language || 'zh').toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  function t(key) {
    var d = state.dict[state.lang] || {};
    if (d[key] != null) return d[key];
    var zh = state.dict.zh || {};
    if (zh[key] != null) return zh[key];
    return key;
  }

  function apply(root) {
    root = root || document;
    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute('data-i18n');
      var v = t(k);
      if (v != null) nodes[i].innerHTML = v;
    }
    var ph = root.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < ph.length; j++) {
      ph[j].setAttribute('placeholder', t(ph[j].getAttribute('data-i18n-ph')));
    }
    var tt = root.querySelectorAll('[data-i18n-title]');
    for (var m = 0; m < tt.length; m++) {
      tt[m].setAttribute('title', t(tt[m].getAttribute('data-i18n-title')));
    }
  }

  function setLang(l) {
    state.lang = l;
    localStorage.setItem('gw-lang', l);
    if (document.documentElement) document.documentElement.lang = (l === 'zh' ? 'zh-CN' : 'en');
    apply();
    for (var i = 0; i < state.listeners.length; i++) {
      try { state.listeners[i](l); } catch (e) {}
    }
  }

  function init(opts) {
    opts = opts || {};
    if (opts.dict) state.dict = opts.dict;
    if (typeof opts.onLang === 'function') state.listeners.push(opts.onLang);
    state.lang = detect();
    if (document.documentElement) document.documentElement.lang = (state.lang === 'zh' ? 'zh-CN' : 'en');

    // 注入切换按钮样式（只一次）
    if (!document.getElementById('gw-i18n-style')) {
      var st = document.createElement('style');
      st.id = 'gw-i18n-style';
      st.textContent = '.gw-lang-switch{position:fixed;top:12px;right:12px;z-index:9999;cursor:pointer;' +
        'background:rgba(8,16,28,.72);color:#7fffd4;border:1px solid #2c4a4a;padding:7px 13px;' +
        'border-radius:18px;font-size:13px;user-select:none;font-family:inherit;}' +
        '.gw-lang-switch:hover{border-color:#7fffd4;}';
      document.head.appendChild(st);
    }

    // 切换按钮
    var btn = document.getElementById('gw-lang-switch');
    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'gw-lang-switch';
      btn.className = 'gw-lang-switch';
      document.body.appendChild(btn);
    }
    btn.textContent = '🌐 ' + (state.lang === 'zh' ? 'EN' : '中文');
    btn.onclick = function () {
      setLang(state.lang === 'zh' ? 'en' : 'zh');
      btn.textContent = '🌐 ' + (state.lang === 'zh' ? 'EN' : '中文');
    };

    apply();
    // 初始化后立即通知一次监听者（让 onLang 用已探测到的语言刷新界面）
    for (var i = 0; i < state.listeners.length; i++) {
      try { state.listeners[i](state.lang); } catch (e) {}
    }
    return state.lang;
  }

  window.i18n = {
    init: init,
    t: t,
    setLang: setLang,
    apply: apply,
    on: function (cb) { state.listeners.push(cb); },
    get lang() { return state.lang; }
  };
})();
