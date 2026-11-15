/* Core utilities: state, storage, favorites, sheets, toast, TTS. */
(function () {
  'use strict';
  const CET = window.CET = window.CET || {};

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  CET.$ = $;
  CET.$$ = $$;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const escAttr = esc;
  CET.esc = esc;
  CET.escAttr = escAttr;
  CET.nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  CET.escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  };
  CET.store = store;

  /* Single source of truth for the version shown in-app and in exports. */
  CET.APP_VERSION = '1.2.1';

  const state = CET.state = {
    tab: 'scan',
    dict: null,
    phrases: null,
    upgrades: null,
    samples: null,
    known: null,
    scan: null,
    exam: null,
    favoritesFilter: 'all',
    favoritesQuery: '',
    recentSearches: store.get('cet46:recent', []),
    settings: Object.assign({}, store.get('cet46:settings', {}), { rate: 0.95 }),
    stats: Object.assign({ scans: 0, lookups: 0, grades: 0, favorites: 0 }, store.get('cet46:stats', {})),
    /* Masking is per screen — turning it on in 收藏 must not hide 词库/扫描/词卡. */
    reciteScopes: Object.assign({ scan: false, dict: false, favorites: false, detail: false }, store.get('cet46:reciteScopes', {})),
    highlightLevel: store.get('cet46:hl', 1),
    favAuto: store.get('cet46:favAuto', true),
    scanHandwriting: false,
    favoritesPage: 1,
    booted: false
  };
  CET.saveStats = () => store.set('cet46:stats', state.stats);
  CET.bump = (key, n) => {
    state.stats[key] = (state.stats[key] || 0) + (n == null ? 1 : n);
    CET.saveStats();
  };
  // One-time: this device has no usable English system voice, default to online.
  if (!store.get('cet46:ttsOnlineV1', false)) {
    state.settings.ttsMode = 'online';
    store.set('cet46:settings', state.settings);
    store.set('cet46:ttsOnlineV1', true);
  }

  CET.saveSettings = () => {
    store.set('cet46:settings', state.settings);
    CET.applySettings();
  };
  CET.applySettings = () => {
    document.documentElement.style.removeProperty('--reading-size');
    CET.applyReciteScopes();
  };
  /** Paint the mask onto every scope container according to its own state. */
  CET.applyReciteScopes = function () {
    $$('[data-recite-scope]').forEach((el) => {
      const scope = el.getAttribute('data-recite-scope');
      el.classList.toggle('masked', !!state.reciteScopes[scope]);
    });
  };
  CET.reciteOn = function (scope) { return !!state.reciteScopes[scope]; };
  CET.setRecite = function (scope, on) {
    state.reciteScopes[scope] = !!on;
    store.set('cet46:reciteScopes', state.reciteScopes);
    CET.applyReciteScopes();
  };
  CET.toggleRecite = function (scope) {
    const next = !CET.reciteOn(scope);
    CET.setRecite(scope, next);
    return next;
  };
  CET.setHighlightLevel = function (n) {
    state.highlightLevel = Math.max(0, Math.min(2, Number(n) || 0));
    store.set('cet46:hl', state.highlightLevel);
  };
  CET.highlightLabel = function () {
    return ['轻', '中', '重'][state.highlightLevel] || '中';
  };
  CET.setFavAuto = function (on) {
    state.favAuto = !!on;
    store.set('cet46:favAuto', state.favAuto);
  };

  CET.icon = function (name, cls) {
    const icons = CET.icons || {};
    const body = icons[name] || icons.circle || '';
    const fill = (name === 'starFill' || name === 'heartFill') ? 'currentColor' : 'none';
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="' + fill +
      '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };

  CET.icons = {
    camera: '<path d="M4 8.5h3.2L9 5.8h6l1.8 2.7H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.3" r="3.7"/>',
    image: '<rect x="3.2" y="4.5" width="17.6" height="15" rx="2.4"/><circle cx="8.3" cy="9.3" r="1.7"/><path d="m4.5 18 5.2-5.2 3.1 3.1 2.3-2.3 4.4 4.4"/>',
    book: '<path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H20v16.8H6.2A2.2 2.2 0 0 0 4 22V5.2Z"/><path d="M4 18.8A2.2 2.2 0 0 1 6.2 16.6H20"/>',
    exam: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 9h7M8.5 13h7M8.5 17h4"/>',
    star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z"/>',
    starFill: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 21c.7-4 3.6-6.2 7.5-6.2s6.8 2.2 7.5 6.2"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.5 4.5"/>',
    settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    volume: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.2 8.6a4.5 4.5 0 0 1 0 6.8M17.8 6a8 8 0 0 1 0 12"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    share: '<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="m8 11 8-4M8 13l8 4"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/>',
    sparkles: '<path d="m12 3 1.2 4.2L17.5 9l-4.3 1.8L12 15l-1.2-4.2L6.5 9l4.3-1.8L12 3Z"/><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11m0 0 4.5-4.5M12 15 7.5 10.5M5 19h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    shield: '<path d="m12 3 7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.7M20 5v6h-6"/>',
    translate: '<path d="M4 5h9M8.5 3v2M6 5c.4 3 2.1 5.4 5 7M11 5c-.4 3-2.1 5.4-5 7M13 19l4-10 4 10M14.8 15h4.4"/>',
    writing: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    scan: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><path d="M4 12h16"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>',
    message: '<path d="M4 5.5h16v11H9l-5 4v-15Z"/><path d="M8 9.5h8M8 12.8h5"/>',
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15.5 12v2"/>',
    award: '<circle cx="12" cy="9" r="5"/><path d="m8.5 13.5-1 7 4.5-2.4 4.5 2.4-1-7"/>',
    flame: '<path d="M12 3c.7 4-2 5.1-2 8a2 2 0 1 0 4 0c0-1.7.6-2.8 1.4-3.8 1.7 2 2.6 3.8 2.6 5.8a6 6 0 0 1-12 0c0-3.8 2.7-6.5 6-10Z"/>',
    eye: '<path d="M2.7 12s3.4-6.2 9.3-6.2S21.3 12 21.3 12s-3.4 6.2-9.3 6.2S2.7 12 2.7 12Z"/><circle cx="12" cy="12" r="2.9"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c5.9 0 9.3 6 9.3 6a17.6 17.6 0 0 1-3.2 3.7M6.3 6.5A17.8 17.8 0 0 0 2.7 12s3.4 6.2 9.3 6.2c1.3 0 2.5-.3 3.6-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    quote: '<path d="M9.5 6C6 7.2 4 10 4 13.2 4 15.9 5.5 18 8 18c2 0 3.5-1.4 3.5-3.4 0-1.9-1.3-3.2-3.1-3.2-.3 0-.7 0-1 .1.4-1.5 1.6-2.7 3.3-3.5L9.5 6Zm9 0C15 7.2 13 10 13 13.2 13 15.9 14.5 18 17 18c2 0 3.5-1.4 3.5-3.4 0-1.9-1.3-3.2-3.1-3.2-.3 0-.7 0-1 .1.4-1.5 1.6-2.7 3.3-3.5L18.5 6Z"/>',
    circle: '<circle cx="12" cy="12" r="8"/>'
  };

  /* ------------------------------------------------------------ toast */
  let toastTimer = null;
  CET.toast = function (msg, kind) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast' + (kind ? ' ' + kind : ''); }, 2300);
  };

  /* ------------------------------------------------------------ favorites */
  const FAV_KEY = 'cet46:favs:v1';
  const favItems = store.get(FAV_KEY, []);
  const favIndex = new Map(favItems.map((x) => [x.id, x]));
  const favRegistry = new Map();
  CET.favRegistry = favRegistry;

  function favId(type, term) {
    let h = 5381;
    const s = String(type || 'item') + '|' + String(term || '').trim().toLowerCase();
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'f' + h.toString(36);
  }
  CET.favId = favId;

  function persistFavs() {
    store.set(FAV_KEY, favItems);
    state.stats.favorites = favItems.length;
    CET.saveStats();
  }

  const fav = CET.fav = {
    list() { return favItems.slice().sort((a, b) => b.ts - a.ts); },
    count() { return favItems.length; },
    has(id) { return favIndex.has(id); },
    get(id) { return favIndex.get(id); },
    add(item) {
      if (!item || !item.term) return null;
      const id = item.id || favId(item.type, item.term + (item.key || ''));
      if (favIndex.has(id)) return id;
      const record = {
        id,
        type: item.type || 'word',
        term: String(item.term).trim(),
        sub: item.sub || '',
        note: item.note || '',
        source: item.source || '词典',
        payload: item.payload || null,
        related: Array.isArray(item.related) ? item.related.slice(0, 10) : [],
        ts: Date.now()
      };
      if (record.type === 'word' && (!record.related || !record.related.length)) {
        try {
          if (item.payload && Array.isArray(item.payload.syn)) {
            record.related = item.payload.syn.slice(0, 10);
          } else if (CET.Dict && CET.Dict.loaded) {
            const e = CET.Dict.get(record.term);
            if (e && Array.isArray(e.y)) record.related = e.y.slice(0, 10);
          }
        } catch (e) {
          record.related = [];
        }
      }
      favItems.push(record);
      favIndex.set(id, record);
      persistFavs();
      return id;
    },
    remove(id) {
      const i = favItems.findIndex((x) => x.id === id);
      if (i >= 0) {
        favItems.splice(i, 1);
        favIndex.delete(id);
        persistFavs();
        return true;
      }
      return false;
    },
    toggle(item) {
      const id = item.id || favId(item.type, item.term + (item.key || ''));
      if (favIndex.has(id)) { fav.remove(id); return false; }
      fav.add(Object.assign({}, item, { id }));
      return true;
    },
    register(item) {
      const id = item.id || favId(item.type, item.term + (item.key || ''));
      favRegistry.set(id, Object.assign({}, item, { id }));
      return id;
    },
    button(item, cls) {
      const id = fav.register(item);
      const on = favIndex.has(id);
      return '<button type="button" class="star-btn ' + (cls || '') + (on ? ' on' : '') +
        '" data-fav-toggle="' + escAttr(id) + '" aria-label="' + (on ? '取消收藏' : '收藏') +
        '" aria-pressed="' + on + '">' + CET.icon(on ? 'starFill' : 'star') + '</button>';
    },
    chip(item, label) {
      const id = fav.register(item);
      const on = favIndex.has(id);
      return '<span class="syn-chip" data-fav-chip="' + escAttr(id) + '">' +
        '<button type="button" class="s-star ' + (on ? 'on' : '') + '" data-fav-toggle="' + escAttr(id) +
        '" aria-label="收藏">' + CET.icon(on ? 'starFill' : 'star') + '</button>' +
        '<span data-chip-label>' + esc(label) + '</span></span>';
    },
    exportText() {
      const list = fav.list();
      const typeName = { word: '单词', phrase: '词组', sentence: '句子', syn: '同义词', adv: '高级表达', example: '例句', translation: '翻译', feedback: '批改建议', report: '判分报告', pattern: '句式', template: '模板', article: '外刊' };
      const lines = ['CET Lens · 收藏夹', '共 ' + list.length + ' 条', ''];
      list.forEach((x, i) => {
        const type = (x.type === 'phrase' && !/\s/.test(x.term)) ? 'word' : x.type;
        lines.push((i + 1) + '. [' + (typeName[type] || type) + '] ' + x.term);
        if (x.sub) lines.push('   ' + x.sub);
        if (x.related && x.related.length) lines.push('   同义：' + x.related.join(' / '));
        if (x.note) lines.push('   备注：' + x.note);
        lines.push('   来源：' + x.source + ' · ' + new Date(x.ts).toLocaleDateString('zh-CN'));
      });
      return lines.join('\n');
    }
  };

  function paintFav(id, on) {
    $$('[data-fav-toggle="' + id + '"]').forEach((btn) => {
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? '取消收藏' : '收藏');
      btn.innerHTML = CET.icon(on ? 'starFill' : 'star');
    });
  }

  document.addEventListener('click', function (e) {
    const z = e.target.closest('.zh-mask');
    if (z && z.closest('.masked')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      z.classList.toggle('revealed');
      return;
    }
    const btn = e.target.closest('[data-fav-toggle]');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-fav-toggle');
      const item = favRegistry.get(id) || fav.get(id);
      if (!item) return;
      const added = fav.toggle(item);
      paintFav(id, added);
      CET.haptic(12);
      CET.toast(added ? '已收藏 · ' + item.term : '已取消收藏');
      if (CET.onFavChanged) CET.onFavChanged(id, added);
      return;
    }
    const sp = e.target.closest('[data-speak]');
    if (sp) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const src = sp.getAttribute('data-speak-src');
      if (src) CET.speakSrc(src);
      else CET.speak(sp.getAttribute('data-speak'));
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      e.preventDefault();
      CET.copy(cp.getAttribute('data-copy'));
    }
    const sh = e.target.closest('[data-share]');
    if (sh) {
      e.preventDefault();
      CET.share(sh.getAttribute('data-share'));
    }
  });

  /* ------------------------------------------------------------ TTS / clipboard */
  let speakAudio = null;
  let speakSeq = 0;
  function splitSpeech(text, maxLen) {
    const out = [];
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return out;
    const sentences = clean.match(/[^.!?;]+[.!?;]?/g) || [clean];
    let cur = '';
    const pushCur = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    for (const s of sentences) {
      const parts = s.split(/\s+/);
      for (const w of parts) {
        if ((cur + ' ' + w).trim().length > maxLen) pushCur();
        cur = (cur ? cur + ' ' : '') + w;
      }
      if (cur.length >= maxLen * 0.8) pushCur();
    }
    pushCur();
    return out;
  }
  let audioUnlocked = false;
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  function ensureAudio() {
    if (!speakAudio) {
      speakAudio = new Audio();
      speakAudio.preload = 'auto';
      speakAudio.setAttribute('playsinline', '');
      speakAudio.style.display = 'none';
      document.body.appendChild(speakAudio);
    }
    return speakAudio;
  }
  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      const a = new Audio(SILENT);
      a.muted = true;
      const p = a.play();
      if (p && p.then) p.then(() => { audioUnlocked = true; }).catch(() => {});
      else audioUnlocked = true;
    } catch (e) {}
  }
  document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  document.addEventListener('click', unlockAudio, { once: true });

  function showAudioFallback(url) {
    if (!CET.sheet) { CET.toast('请点一次朗读按钮再试'); return; }
    CET.sheet.open({
      title: '朗读',
      sub: '点播放按钮继续',
      html: '<div class="pill-note mb10">系统拦截了自动播放，点下面的播放按钮即可朗读。</div>' +
        '<audio id="tts-fallback-audio" controls autoplay playsinline src="' + url + '" style="width:100%"></audio>',
      onMount(body) {
        const a = body.querySelector('#tts-fallback-audio');
        if (a) a.play().catch(() => {});
      }
    });
  }

  CET.speakOnline = function (text) {
    const chunks = splitSpeech(text, 180);
    if (!chunks.length) return;
    const audio = ensureAudio();
    try { audio.pause(); audio.currentTime = 0; } catch (e) {}
    const seq = ++speakSeq;
    const playAt = (i) => {
      if (seq !== speakSeq || i >= chunks.length) return;
      const wordLike = /^[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2}$/.test(chunks[i]);
      const url = wordLike
        ? 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(chunks[i]) + '&type=2'
        : 'https://fanyi.baidu.com/gettts?lan=en&spd=3&source=web&text=' + encodeURIComponent(chunks[i]);
      audio.onended = () => playAt(i + 1);
      audio.onerror = () => {
        if (seq !== speakSeq) return;
        // If the online clip fails, try native speech for this chunk before
        // reporting an error.  This is what makes long article reading usable
        // on restricted networks.
        if (window.CET46 && window.CET46.speak) {
          try { window.CET46.speak(chunks[i], Number(state.settings.rate) || 0.95); return; } catch (e) {}
        }
        if ('speechSynthesis' in window) {
          try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(chunks[i]);
            u.lang = 'en-US'; u.rate = Number(state.settings.rate) || 0.95;
            speechSynthesis.speak(u); return;
          } catch (e) {}
        }
        CET.toast('在线发音失败，请检查网络', 'red');
      };
      audio.src = url;
      try { audio.load(); } catch (e) {}
      const p = audio.play();
      if (p && p.catch) p.catch(() => { if (seq === speakSeq) showAudioFallback(url); });
    };
    playAt(0);
  };

  CET.speakSrc = function (src) {
    if (!src) return;
    const audio = ensureAudio();
    try { audio.pause(); audio.currentTime = 0; } catch (e) {}
    audio.onended = null;
    audio.onerror = () => CET.toast('音频播放失败', 'red');
    audio.src = src;
    try { audio.load(); } catch (e) {}
    const p = audio.play();
    if (p && p.catch) p.catch(() => showAudioFallback(src));
  };

  CET.speak = function (text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    // Native TTS and Web Speech are unreliable for a whole article; long text
    // goes through short online clips with a native fallback per clip.
    if (clean.length > 260) { CET.speakOnline(clean); return; }
    if (state.settings.ttsMode === 'online') { CET.speakOnline(clean); return; }
    if (window.CET46 && window.CET46.speak) {
      try { window.CET46.speak(clean, Number(state.settings.rate) || 0.95); return; } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'en-US';
        u.rate = Number(state.settings.rate) || 0.95;
        speechSynthesis.speak(u);
        return;
      } catch (e) {}
    }
    CET.speakOnline(clean);
  };
  CET.stopSpeak = function () {
    speakSeq++;
    try { if (speakAudio) { speakAudio.pause(); speakAudio.currentTime = 0; } } catch (e) {}
    if (window.CET46 && window.CET46.stopSpeak) { try { window.CET46.stopSpeak(); } catch (e) {} }
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
  };
  CET.copy = function (text) {
    const t = String(text == null ? '' : text);
    if (window.CET46 && window.CET46.copyText) {
      try { window.CET46.copyText(t); return; } catch (e) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => CET.toast('已复制')).catch(() => CET.toast('复制失败'));
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); CET.toast('已复制'); } catch (e) { CET.toast('复制失败'); }
    ta.remove();
  };
  CET.share = function (text) {
    if (window.CET46 && window.CET46.shareText) {
      try { window.CET46.shareText(text); return; } catch (e) {}
    }
    if (navigator.share) {
      navigator.share({ text: text }).catch(() => {});
    } else {
      CET.copy(text);
      CET.toast('已复制，可粘贴分享');
    }
  };
  CET.haptic = function (ms) {
    if (window.CET46 && window.CET46.vibrate) {
      try { window.CET46.vibrate(ms || 10); } catch (e) {}
    } else if (navigator.vibrate) {
      try { navigator.vibrate(ms || 10); } catch (e) {}
    }
  };
  CET.keepAwake = function (on) {
    if (window.CET46 && window.CET46.keepAwake) {
      try { window.CET46.keepAwake(!!on); } catch (e) {}
    }
  };

  /* ------------------------------------------------------------ sheet stack */
  const sheetRoot = () => $('#sheet-root');
  const sheetStack = [];
  CET.sheetStack = sheetStack;

  function renderSheet() {
    const root = sheetRoot();
    if (!root) return;
    if (!sheetStack.length) {
      root.classList.remove('show');
      root.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      return;
    }
    const cur = sheetStack[sheetStack.length - 1];
    const head = $('#sheet-head');
    const body = $('#sheet-body');
    const back = sheetStack.length > 1
      ? '<button type="button" class="sheet-close" data-sheet-back aria-label="返回">' + CET.icon('arrowLeft') + '</button>'
      : '';
    head.innerHTML =
      '<div class="sheet-grab"></div>' +
      '<div class="sheet-title"><b>' + esc(cur.title || '') + '</b>' +
      (cur.sub ? '<span>' + esc(cur.sub) + '</span>' : '') + '</div>' +
      back +
      '<button type="button" class="sheet-close" data-sheet-close aria-label="关闭">' + CET.icon('close') + '</button>';
    body.innerHTML = cur.html || '';
    body.scrollTop = 0;
    root.classList.add('show');
    root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (typeof cur.onMount === 'function') {
      requestAnimationFrame(() => { try { cur.onMount(body); } catch (e) { console.error(e); } });
    }
  }

  CET.sheet = {
    open(opts) {
      sheetStack.push({
        title: opts.title || '',
        sub: opts.sub || '',
        html: opts.html || '',
        onMount: opts.onMount
      });
      renderSheet();
    },
    replace(opts) {
      sheetStack.pop();
      this.open(opts);
    },
    close() {
      sheetStack.pop();
      renderSheet();
    },
    closeAll() {
      sheetStack.length = 0;
      renderSheet();
    },
    isOpen() { return sheetStack.length > 0; }
  };

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-sheet-close]')) {
      e.preventDefault();
      CET.sheet.close();
    } else if (e.target.closest('[data-sheet-back]')) {
      e.preventDefault();
      CET.sheet.close();
    }
  });
  const sr = sheetRoot();
  if (sr) {
    sr.addEventListener('click', function (e) {
      if (e.target === sr) CET.sheet.closeAll();
    });
  }

  /* ------------------------------------------------------------ modal */
  let modalOpen = false;
  CET.modal = {
    open(html, opts) {
      const root = $('#modal-root');
      const box = $('#modal');
      if (!root || !box) return;
      box.innerHTML = html;
      root.classList.add('show');
      root.setAttribute('aria-hidden', 'false');
      modalOpen = true;
      document.body.style.overflow = 'hidden';
      if (opts && typeof opts.onMount === 'function') {
        requestAnimationFrame(() => { try { opts.onMount(box); } catch (e) { console.error(e); } });
      }
    },
    close() {
      const root = $('#modal-root');
      if (!root) return;
      root.classList.remove('show');
      root.setAttribute('aria-hidden', 'true');
      modalOpen = false;
      if (!sheetStack.length) document.body.style.overflow = '';
    },
    isOpen() { return modalOpen; }
  };
  const mr = $('#modal-root');
  if (mr) {
    mr.addEventListener('click', function (e) {
      if (e.target === mr) CET.modal.close();
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-modal-close]')) CET.modal.close();
  });

  CET.confirm = function (title, message, onOk, okText) {
    CET.modal.open(
      '<h3>' + esc(title) + '</h3><p>' + esc(message) + '</p>' +
      '<div class="modal-actions"><button class="btn btn-outline" data-modal-close>取消</button>' +
      '<button class="btn btn-primary" id="modal-ok">' + esc(okText || '确定') + '</button></div>',
      {
        onMount() {
          const b = $('#modal-ok');
          if (b) b.addEventListener('click', function () {
            CET.modal.close();
            if (typeof onOk === 'function') onOk();
          });
        }
      }
    );
  };

  CET.handleBack = function () {
    if (CET.modal.isOpen()) { CET.modal.close(); return true; }
    if (CET.sheet.isOpen()) { CET.sheet.close(); return true; }
    if (CET.state.tab === 'reading') {
      if (CET.state.articleFolder && CET.backReadingRoot) { CET.backReadingRoot(); return true; }
      CET.state._navDir = 'left';
      if (CET.go) CET.go('scan');
      return true;
    }
    if (CET.state.tab === 'patterns') {
      CET.state._navDir = 'left';
      if (CET.go) CET.go('scan');
      return true;
    }
    return false;
  };
  window.handleBack = function () { return CET.handleBack(); };

  /* ------------------------------------------------------------ misc */
  CET.debounce = function (fn, wait) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 180);
    };
  };
  CET.fmtDate = function (ts) {
    const d = new Date(ts || Date.now());
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return '今天 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };
  CET.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  CET.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  CET.round = (n, d) => {
    const p = Math.pow(10, d == null ? 1 : d);
    return Math.round(n * p) / p;
  };
  CET.todayKey = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
})();
