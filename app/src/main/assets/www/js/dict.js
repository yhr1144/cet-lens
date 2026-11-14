/* Offline dictionary, phrase matching and tokenisation. */
(function () {
  'use strict';
  const CET = window.CET;

  const STOP = new Set(('a an the and or but if of to in on at for with from by as is are was were be been being ' +
    'this that these those it its he she they we you i me my your his her their our them us who whom which what ' +
    'when where why how not no nor so than then too very can could may might must shall should will would do does ' +
    'did done have has had having there here also just only more most some any each every both either neither ' +
    'one two three first second new old good bad big small many much few little other another such same own about ' +
    'above across after again against all almost along already among around because before behind below between ' +
    'during through under until up down out off over once further thus hence').split(/\s+/));

  /* A word right before one of these is acting as a noun ("a promising approach may…"). */
  const NEXT_VERB = new Set('may might can could will would shall should must is are was were has have had does do did of'.split(/\s+/));
  const DETERMINERS = new Set(('a an the this that these those my your his her its our their some any every no ' +
    'another each both more most such').split(/\s+/));

  const Dict = CET.Dict = {
    data: null,
    words: null,
    order: [],
    phrases: [],
    phraseMap: new Map(),
    upgrades: new Map(),
    upgradeList: [],
    samples: null,
    patterns: null,
    articles: null,
    known: new Set(),
    formIndex: new Map(),
    phraseRegex: null,
    sentenceUpgrades: [],
    chinglish: [],
    loaded: false,

    async load(onProgress) {
      const tick = (p, label) => { if (typeof onProgress === 'function') onProgress(p, label); };
      tick(0.05, '读取词库');
      const [dict, phrases, upgrades, samples, known, patterns, articles, collocations, phraseBank, phraseCet] = await Promise.all([
        fetch('data/dict.json').then((r) => r.json()),
        fetch('data/phrases.json').then((r) => r.json()),
        fetch('data/upgrades.json').then((r) => r.json()),
        fetch('data/samples.json').then((r) => r.json()),
        fetch('data/known.json').then((r) => r.json()),
        fetch('data/patterns.json').then((r) => r.json()),
        fetch('data/articles.json').then((r) => r.json()),
        fetch('data/collocations.json').then((r) => r.json()).catch(() => ({ phrases: [] })),
        fetch('data/phrase_bank.json').then((r) => r.json()).catch(() => ({ phrases: [] })),
        fetch('data/phrase_cet.json').then((r) => r.json()).catch(() => ({ phrases: [] }))
      ]);
      tick(0.55, '建立索引');
      this.data = dict;
      this.words = dict.w;
      this.order = dict.order || Object.keys(dict.w);
      this.phrases = (phrases.phrases || []).concat(collocations.phrases || []);
      const bank = (phraseBank.phrases || []);
      const seenPhrase = new Set();
      this.cetPhraseBank = (phraseCet.phrases || []).slice();
      this.phraseBank = bank.filter((x) => {
        const k = String(x.p || '').toLowerCase();
        if (!k || seenPhrase.has(k)) return false;
        seenPhrase.add(k);
        return true;
      });
      this.sentenceUpgrades = phrases.sentence_upgrades || [];
      this.chinglish = phrases.chinglish || [];
      this.upgradeList = upgrades.words || [];
      this.samples = samples;
      this.patterns = patterns;
      this.articles = articles;
      this.known = new Set(known);

      this.phraseMap.clear();
      this.phrases.forEach((p) => { this.phraseMap.set(p.p.toLowerCase(), p); });
      this.upgrades.clear();
      this.upgradeList.forEach((u) => { this.upgrades.set(u.w.toLowerCase(), u); });
      this.buildFormIndex();
      this.buildPhraseRegex();
      CET.state.dict = dict;
      CET.state.phrases = Object.assign({}, phrases, { phrases: this.phrases });
      CET.state.upgrades = upgrades;
      CET.state.samples = samples;
      CET.state.patterns = patterns;
      CET.state.articles = articles;
      tick(1, '准备完成');
      this.loaded = true;
    },

    buildFormIndex() {
      const idx = this.formIndex = new Map();
      for (const head of Object.keys(this.words)) {
        const entry = this.words[head];
        if (!entry || !entry.fm) continue;
        for (const part of String(entry.fm).split('/')) {
          const c = part.indexOf(':');
          if (c <= 0) continue;
          const form = this.normalize(part.slice(c + 1));
          if (form && !Object.prototype.hasOwnProperty.call(this.words, form) && !idx.has(form)) {
            idx.set(form, head);
          }
        }
      }
    },

    buildPhraseRegex() {
      const alts = this.phrases
        .map((p) => p.p)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map((p) => {
          let s = CET.escapeRegExp(p);
          s = s.replace(/\\\.\\\.\\\./g, '.{1,42}?');
          return s;
        });
      try {
        this.phraseRegex = new RegExp('\\b(?:' + alts.join('|') + ')\\b', 'gi');
      } catch (e) {
        console.warn('phrase regex failed', e);
        this.phraseRegex = null;
      }
    },

    normalize(raw) {
      if (raw == null) return '';
      return String(raw)
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
        .toLowerCase();
    },

    wordKey(raw) {
      return this.normalize(raw).replace(/[.'-]+$/g, '');
    },

    stemCandidates(key) {
      const out = [];
      const add = (x) => { if (x && x !== key && !out.includes(x)) out.push(x); };
      if (!key) return out;
      if (key.endsWith('ies') && key.length > 4) add(key.slice(0, -3) + 'y');
      if (key.endsWith('ves') && key.length > 4) { add(key.slice(0, -3) + 'f'); add(key.slice(0, -3) + 'fe'); }
      if (key.endsWith('es') && key.length > 3) { add(key.slice(0, -2)); add(key.slice(0, -1)); }
      if (key.endsWith('s') && key.length > 3) add(key.slice(0, -1));
      if (key.endsWith('ied') && key.length > 4) add(key.slice(0, -3) + 'y');
      if (key.endsWith('ed') && key.length > 4) {
        add(key.slice(0, -2)); add(key.slice(0, -1));
        if (/([b-df-hj-np-tv-z])\1ed$/.test(key)) add(key.slice(0, -3));
      }
      if (key.endsWith('ing') && key.length > 5) {
        add(key.slice(0, -3)); add(key.slice(0, -3) + 'e');
        if (/([b-df-hj-np-tv-z])\1ing$/.test(key)) add(key.slice(0, -4));
      }
      if (key.endsWith('ier') && key.length > 5) add(key.slice(0, -3) + 'y');
      if (key.endsWith('iest') && key.length > 6) add(key.slice(0, -4) + 'y');
      if (key.endsWith('er') && key.length > 4) { add(key.slice(0, -2)); add(key.slice(0, -1)); }
      if (key.endsWith('est') && key.length > 5) { add(key.slice(0, -3)); add(key.slice(0, -2)); }
      if (key.endsWith('ly') && key.length > 4) { add(key.slice(0, -2)); add(key.slice(0, -2) + 'le'); }
      if (key.endsWith('ally') && key.length > 6) add(key.slice(0, -4) + 'al');
      return out;
    },

    lookup(raw) {
      if (!this.words) return null;
      const key = this.normalize(raw);
      if (!key) return null;
      if (Object.prototype.hasOwnProperty.call(this.words, key)) {
        return { head: key, entry: this.words[key], matchedBy: 'head' };
      }
      const viaForm = this.formIndex.get(key);
      if (viaForm && this.words[viaForm]) {
        return { head: viaForm, entry: this.words[viaForm], matchedBy: 'form' };
      }
      for (const cand of this.stemCandidates(key)) {
        if (this.words[cand]) return { head: cand, entry: this.words[cand], matchedBy: 'stem' };
        const f = this.formIndex.get(cand);
        if (f && this.words[f]) return { head: f, entry: this.words[f], matchedBy: 'stem' };
      }
      return null;
    },

    get(word) {
      return this.words ? this.words[this.wordKey(word)] : null;
    },

    senses(entry) {
      if (!entry || !Array.isArray(entry.s)) return [];
      return entry.s.map((g) => ({
        pos: g[0] || '',
        zh: Array.isArray(g[1]) ? g[1] : [],
        en: Array.isArray(g[2]) ? g[2] : []
      })).filter((x) => x.zh.length || x.en.length);
    },

    firstZh(entry) {
      const senses = this.senses(entry);
      const withZh = senses.find((s) => s.zh.length);
      return withZh ? withZh.zh.slice(0, 3).join('；') : '';
    },

    allZh(entry) {
      const senses = this.senses(entry);
      return senses.map((s) => s.zh.join('，')).join('；');
    },

    /** Coarse POS family used to match a sense against sentence context. */
    posFamily(pos) {
      const p = String(pos || '').toLowerCase().trim();
      if (/^(v|vt|vi|aux)/.test(p)) return 'v';
      if (/^(n|pl)/.test(p)) return 'n';
      if (/^(adj|a\.?$|a\b)/.test(p)) return 'adj';
      if (/^(adv|ad\.?$|ad\b)/.test(p)) return 'adv';
      return 'other';
    },

    /**
     * Guess the POS a word takes in its sentence from the surface form and the
     * two neighbouring words. Deliberately conservative: returns '' when the
     * evidence is weak, so the card keeps the dictionary order.
     */
    inferPos(ctx) {
      const c = ctx || {};
      const surface = String(c.surface || '').toLowerCase();
      const prev = String(c.prev || '').toLowerCase();
      const next = String(c.next || '').toLowerCase();
      if (!surface) return '';
      if (/ly$/.test(surface) && surface.length > 4) return 'adv';
      if (/(ing|ed)$/.test(surface) && surface.length > 5) return 'v';
      if (NEXT_VERB.has(next)) return 'n';
      if (prev === 'to') return 'v';
      if (DETERMINERS.has(prev)) return 'n';
      return '';
    },

    /**
     * Order senses so the one matching the sentence comes first.
     * Returns { list, hit } — hit is the original index that was promoted
     * (or -1 when we did not reorder).
     */
    pickSenses(entry, ctx) {
      const senses = this.senses(entry);
      if (senses.length < 2) return { list: senses, hit: -1 };
      const want = this.inferPos(ctx);
      if (!want) return { list: senses, hit: -1 };
      let idx = -1;
      for (let i = 0; i < senses.length; i++) {
        if (!senses[i].zh.length && !senses[i].en.length) continue;
        if (this.posFamily(senses[i].pos) === want) { idx = i; break; }
      }
      if (idx <= 0) return { list: senses, hit: idx === 0 ? 0 : -1 };
      const list = senses.slice();
      const picked = list.splice(idx, 1)[0];
      list.unshift(picked);
      return { list: list, hit: idx };
    },

    levelLabel(entry) {
      if (!entry) return '';
      if (entry.l === 4) return '四级';
      if (entry.l === 6) return '六级';
      if (entry.l === 46) return '四六级';
      if (entry.o || entry.c >= 4) return '高频';
      return '';
    },

    levelClass(entry) {
      if (!entry) return 'lv0';
      if (entry.l === 4) return 'lv4';
      if (entry.l === 6) return 'lv6';
      if (entry.l === 46) return 'lv46';
      return 'lv0';
    },

    forms(entry) {
      if (!entry || !entry.fm) return [];
      const labels = { p: '过去式', d: '过去分词', i: '现在分词', 3: '第三人称单数', s: '复数', r: '比较级', t: '最高级' };
      const out = [];
      String(entry.fm).split('/').forEach((part) => {
        const c = part.indexOf(':');
        if (c <= 0) return;
        const v = part.slice(c + 1).trim();
        if (v) out.push([v, labels[part.slice(0, c)] || '变体']);
      });
      return out;
    },

    synonyms(word, limit) {
      const e = this.get(word);
      if (!e || !Array.isArray(e.y)) return [];
      return e.y.slice(0, limit || 10);
    },

    advanced(word) {
      const u = this.upgrades.get(this.wordKey(word));
      return u ? u.adv || [] : [];
    },

    upgradeEntry(word) {
      return this.upgrades.get(this.wordKey(word)) || null;
    },

    phraseByText(text) {
      const key = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (this.phraseMap.has(key)) return this.phraseMap.get(key);
      for (const p of this.phrases) {
        if (!p.p.includes('...')) continue;
        const parts = p.p.split('...').map((x) => x.trim().toLowerCase());
        if (parts.length === 2 && key.startsWith(parts[0]) && key.endsWith(parts[1])) return p;
      }
      return null;
    },

    phrasesForWord(word) {
      const w = this.wordKey(word);
      if (!w) return [];
      const re = new RegExp('\\b' + CET.escapeRegExp(w) + '\\b', 'i');
      return this.phrases.filter((p) => re.test(p.p)).slice(0, 8);
    },

    examples(word) {
      const e = this.get(word);
      return e && Array.isArray(e.x) ? e.x : [];
    },

    isKnown(word) {
      const w = this.wordKey(word);
      if (!w) return false;
      if (this.words[w]) return true;
      if (this.known.has(w)) return true;
      return !!this.lookup(w);
    },

    isStop(word) {
      return STOP.has(String(word || '').toLowerCase());
    },

    search(query, limit) {
      const q = String(query || '').trim();
      if (!q) return [];
      const max = limit || 40;
      const lower = q.toLowerCase();
      const chinese = /[\u4e00-\u9fff]/.test(q);
      const out = [];
      for (const w of this.order) {
        const e = this.words[w];
        if (!e) continue;
        let score = 0;
        if (chinese) {
          const zh = this.allZh(e);
          if (zh.includes(q)) score = zh.startsWith(q) ? 90 : 60;
        } else if (w === lower) {
          score = 120;
        } else if (w.startsWith(lower)) {
          score = 95 - Math.min(20, w.length - lower.length);
        } else if (w.includes(lower)) {
          score = 65 - Math.min(20, w.length - lower.length);
        }
        if (!score) continue;
        if (e.l === 6 || e.l === 46) score += 3;
        else if (e.l === 4) score += 2;
        if (e.o) score += 2;
        if (e.c >= 4) score += 1;
        out.push({ head: w, entry: e, score });
      }
      out.sort((a, b) => b.score - a.score || (a.entry.f || 1e9) - (b.entry.f || 1e9));
      return out.slice(0, max);
    },

    /** Merge phrase and word matches into renderable tokens. */
    tokenize(text) {
      const src = String(text || '');
      const marks = [];
      if (this.phraseRegex) {
        this.phraseRegex.lastIndex = 0;
        let m;
        while ((m = this.phraseRegex.exec(src)) !== null) {
          if (!m[0]) { this.phraseRegex.lastIndex++; continue; }
          const data = this.phraseByText(m[0]);
          if (data) marks.push({ start: m.index, end: m.index + m[0].length, kind: 'phrase', text: m[0], data });
          if (this.phraseRegex.lastIndex === m.index) this.phraseRegex.lastIndex++;
        }
      }
      const wordRe = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
      let wm;
      while ((wm = wordRe.exec(src)) !== null) {
        const start = wm.index;
        const end = start + wm[0].length;
        if (marks.some((x) => start < x.end && end > x.start)) continue;
        const hit = this.lookup(wm[0]);
        marks.push({
          start, end, kind: 'word', text: wm[0],
          head: hit ? hit.head : null,
          entry: hit ? hit.entry : null
        });
      }
      marks.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
      // remove overlaps, phrases win because they were inserted first for equal starts
      const final = [];
      let lastEnd = -1;
      for (const m of marks) {
        if (m.start < lastEnd) continue;
        final.push(m);
        lastEnd = m.end;
      }
      const tokens = [];
      let cursor = 0;
      for (const m of final) {
        if (m.start > cursor) tokens.push({ k: 't', text: src.slice(cursor, m.start) });
        if (m.kind === 'phrase') {
          tokens.push({ k: 'p', text: m.text, data: m.data });
        } else {
          tokens.push({ k: 'w', text: m.text, head: m.head, entry: m.entry });
        }
        cursor = m.end;
      }
      if (cursor < src.length) tokens.push({ k: 't', text: src.slice(cursor) });
      return tokens;
    },

    tokensToHtml(tokens, opts) {
      const options = opts || {};
      /* Highlight density: 0 = only CET-6 and phrases, 1 = CET-4 + CET-6, 2 = also core words. */
      const lvl = options.level == null ? 1 : Number(options.level);
      return tokens.map((t) => {
        if (t.k === 't') return CET.esc(t.text);
        if (t.k === 'p') {
          return '<span class="tok tok-phrase" data-phrase="' + CET.escAttr(t.text) + '" role="button" tabindex="0">' +
            CET.esc(t.text) + '</span>';
        }
        let cls = 'tok tok-word';
        /* Function words (can/will/the/and…) are in the CET word list but are not
           vocabulary worth marking — never highlight them. */
        if (t.entry && !this.isStop(t.head || t.text)) {
          const l = t.entry.l;
          if (lvl <= 0) {
            if (l === 6 || l === 46) cls += ' tok-cet6';
          } else if (lvl >= 2) {
            cls += l === 4 ? ' tok-cet4' : (l === 6 || l === 46) ? ' tok-cet6' : ' tok-core';
          } else if (l === 4) cls += ' tok-cet4';
          else if (l === 6 || l === 46) cls += ' tok-cet6';
        } else if (!t.entry) {
          cls += ' tok-unknown';
        }
        return '<span class="' + cls + '" data-word="' + CET.escAttr(t.head || t.text) +
          '" role="button" tabindex="0">' + CET.esc(t.text) + '</span>';
      }).join('');
    },

    keyItems(tokens, limit) {
      const seen = new Set();
      const words = [];
      const phrases = [];
      const pSeen = new Set();
      const edgeWord = (tok, last) => {
        if (!tok) return '';
        const words = String(tok.text || '').match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || [];
        if (!words.length) return '';
        return last ? words[words.length - 1] : words[0];
      };
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.k === 'p') {
          if (!pSeen.has(t.data.p)) { pSeen.add(t.data.p); phrases.push(t.data); }
        } else if (t.k === 'w' && t.entry) {
          const key = t.head;
          if (seen.has(key) || this.isStop(key) || key.length < 2) continue;
          seen.add(key);
          let prev = '', next = '';
          for (let j = i - 1; j >= 0; j--) { prev = edgeWord(tokens[j], true); if (prev) break; }
          for (let j = i + 1; j < tokens.length; j++) { next = edgeWord(tokens[j], false); if (next) break; }
          words.push({ head: key, entry: t.entry, surface: t.text, ctx: { prev, next, surface: t.text } });
        }
      }
      words.sort((a, b) => {
        const rank = (e) => e.l === 6 ? 0 : e.l === 46 ? 1 : e.l === 4 ? 2 : 3;
        return rank(a.entry) - rank(b.entry) || (a.entry.f || 1e9) - (b.entry.f || 1e9);
      });
      return { words: words.slice(0, limit || 16), phrases: phrases.slice(0, 20) };
    },

    splitSentences(text) {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean) return [];
      const raw = clean.match(/[^.!?]+(?:[.!?]+["']?|$)/g) || [clean];
      return raw.map((s) => s.trim()).filter((s) => s.length > 3);
    },

    editDistance(a, b) {
      a = String(a); b = String(b);
      if (a === b) return 0;
      if (Math.abs(a.length - b.length) > 2) return 9;
      const m = a.length, n = b.length;
      let prev = new Array(n + 1);
      let cur = new Array(n + 1);
      for (let j = 0; j <= n; j++) prev[j] = j;
      for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        const tmp = prev; prev = cur; cur = tmp;
      }
      return prev[n];
    },

    closestWord(word) {
      const w = this.wordKey(word);
      if (!w || w.length < 3) return null;
      const first = w[0];
      let best = null;
      let bestD = 3;
      for (const cand of this.order) {
        if (cand[0] !== first) continue;
        if (Math.abs(cand.length - w.length) > 2) continue;
        const d = this.editDistance(w, cand);
        if (d < bestD) { bestD = d; best = cand; if (d === 1) break; }
      }
      return best && bestD <= 2 ? { word: best, distance: bestD, entry: this.words[best] } : null;
    },

    randomDaily() {
      if (!this.order.length) return null;
      const d = new Date();
      const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
      // choose among useful CET words in the first 3500 by frequency
      const pool = [];
      for (let i = 0; i < Math.min(this.order.length, 5200); i++) {
        const w = this.order[i];
        const e = this.words[w];
        if (e && (e.l === 4 || e.l === 6 || e.l === 46) && w.length > 3) pool.push(w);
        if (pool.length >= 1400) break;
      }
      const w = pool[seed % Math.max(1, pool.length)] || this.order[0];
      return { head: w, entry: this.words[w] };
    },

    levelText(l) {
      return l === 4 ? 'CET-4' : l === 6 ? 'CET-6' : l === 46 ? 'CET-4/6' : '核心词';
    }
  };

  /**
   * Full ECDICT via the native SQLite bridge.  The core 20k dictionary stays
   * in JS for instant lookup; this covers the long tail without loading 700k
   * JSON records into the WebView heap.
   */
  const FullDict = CET.FullDict = {
    available: false,
    count: 0,
    ready: false,

    init() {
      try {
        if (window.CET46 && window.CET46.fullCount) {
          this.count = Number(window.CET46.fullCount()) || 0;
          this.available = this.count > 0;
        }
      } catch (e) {
        this.count = 0;
        this.available = false;
      }
      this.ready = true;
      return this.available;
    },

    lookup(raw) {
      if (!this.available) return null;
      try {
        const s = window.CET46.fullLookup(String(raw || ''));
        if (!s) return null;
        const data = JSON.parse(s);
        if (!data || !data.entry) return null;
        return data;
      } catch (e) {
        return null;
      }
    },

    search(raw, limit) {
      if (!this.available) return [];
      try {
        const s = window.CET46.fullSearch(String(raw || ''), limit || 30);
        const arr = JSON.parse(s || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },

    toEntry(full) {
      const src = full || {};
      const tr = String(src.tr || '').replace(/\\n/g, '\n');
      const lines = tr.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      const senses = [];
      for (const line of lines) {
        const m = line.match(/^((?:[a-z]{1,5}\.)+)\s*(.*)$/i);
        const pos = m ? m[1].trim() : '补充';
        const body = (m ? m[2] : line).replace(/^\[[^\]]+\]\s*/, '').trim();
        if (!body) continue;
        senses.push([pos, body.split(/[,，;；]\s*/).filter(Boolean), []]);
        if (senses.length >= 7) break;
      }
      const def = String(src.de || '').replace(/\\n/g, '\n').split(/\n+/).filter(Boolean).join('; ');
      return {
        s: senses,
        t: src.t || '',
        f: Number(src.f) || 0,
        c: Number(src.c) || 0,
        o: Number(src.o) || 0,
        l: Number(src.l) || 0,
        p: src.p || '',
        y: String(src.y || '').split('|').filter(Boolean).slice(0, 8),
        x: [],
        fm: src.fm || '',
        d: def,
        full: true
      };
    },

    lookupAny(raw) {
      const data = this.lookup(raw);
      if (!data) return null;
      return {
        head: data.head,
        entry: this.toEntry(data.entry),
        matchedBy: data.matchedBy || 'head',
        full: true
      };
    },

    searchAny(raw, limit) {
      return this.search(raw, limit).map((row) => ({
        head: row.key || row.word,
        entry: this.toEntry(row),
        full: true
      })).filter((x) => x.head);
    }
  };
})();

