/* CET-4/6 scoring engine: writing, translation, objective sections. */
(function () {
  'use strict';
  const CET = window.CET;

  const WEIGHTS = {
    4: {
      total: 710,
      writing: 106.5,
      translation: 106.5,
      listening: {
        max: 248.5,
        sections: [
          { id: 'news', name: '短篇新闻', start: 1, end: 7, max: 49.7 },
          { id: 'long', name: '长对话', start: 8, end: 15, max: 56.8 },
          { id: 'passage', name: '听力篇章', start: 16, end: 25, max: 142 }
        ]
      },
      reading: {
        max: 248.5,
        sections: [
          { id: 'cloze', name: '选词填空', start: 26, end: 35, max: 35.5 },
          { id: 'match', name: '长篇阅读', start: 36, end: 45, max: 71 },
          { id: 'careful', name: '仔细阅读', start: 46, end: 55, max: 142 }
        ]
      }
    },
    6: {
      total: 710,
      writing: 106.5,
      translation: 106.5,
      listening: {
        max: 248.5,
        sections: [
          { id: 'long', name: '长对话', start: 1, end: 8, max: 56.8 },
          { id: 'passage', name: '听力篇章', start: 9, end: 15, max: 49.7 },
          { id: 'lecture', name: '讲座/讲话', start: 16, end: 25, max: 142 }
        ]
      },
      reading: {
        max: 248.5,
        sections: [
          { id: 'cloze', name: '选词填空', start: 26, end: 35, max: 35.5 },
          { id: 'match', name: '长篇阅读', start: 36, end: 45, max: 71 },
          { id: 'careful', name: '仔细阅读', start: 46, end: 55, max: 142 }
        ]
      }
    }
  };

  const STOP = new Set(('a an the and or but if of to in on at for with from by as is are was were be been being ' +
    'this that these those it its he she they we you i me my your his her their our them us who whom which what ' +
    'when where why how not no nor so than then too very can could may might must shall should will would do does ' +
    'did done have has had having there here also just only more most some any each every both either neither ' +
    'one two three first second new old good bad big small many much few little other another such same own about ' +
    'above across after again against all almost along already among around because before behind below between ' +
    'during through under until up down out off over once further thus hence write essay words word directions ' +
    'you should at least no more than on the topic importance important give your opinion support reasons examples ' +
    'from your own experience knowledge').split(/\s+/));

  const INSTRUCTION = new Set(('write essay words word directions you should at least no more than on the topic ' +
    'importance important give your opinion support reasons examples from your own experience knowledge ' +
    'read following carefully').split(/\s+/));

  const BANDS = [
    { min: 13, label: '优秀', desc: '内容切题，结构清晰，语言准确，词汇与句式丰富' },
    { min: 10, label: '良好', desc: '内容较切题，结构完整，少量语言错误' },
    { min: 7, label: '及格', desc: '基本切题，结构尚可，错误较明显' },
    { min: 4, label: '较弱', desc: '部分切题，连贯性不足，语言错误较多' },
    { min: 1, label: '较差', desc: '偏题或表达困难，严重影响理解' },
    { min: 0, label: '未作答', desc: '' }
  ];

  const GRAMMAR = [
    { re: /\bi\b/g, type: '大小写', level: 2, msg: '第一人称代词 I 必须大写。', fix: (m) => 'I' },
    { re: /\b(he|she|it)\s+(have|do|go|make|take|know|think|want|need|like|look|seem|come|give|get)\b/gi, type: '主谓一致', level: 2, msg: '第三人称单数作主语时，谓语动词需要加 -s/-es。', fix: (m) => {
      const p = m.split(/\s+/); const v = p[1].toLowerCase();
      const map = { have: 'has', do: 'does', go: 'goes' };
      const conjugated = map[v] || (/(s|x|z|ch|sh|o)$/.test(v) ? v + 'es' : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'ies' : v + 's');
      return p[0] + ' ' + conjugated;
    }},
    { re: /\b(they|we|you|people|students|children|teachers|parents)\s+(is|was|has|does)\b/gi, type: '主谓一致', level: 2, msg: '复数主语应搭配复数谓语。', fix: (m) => {
      const p = m.split(/\s+/); const v = p[1].toLowerCase();
      const map = { is: 'are', was: 'were', has: 'have', does: 'do' };
      return p[0] + ' ' + (map[v] || v);
    }},
    { re: /\b(a)\s+([aeiou][a-z]+)\b/gi, type: '冠词', level: 1, msg: '元音音素开头的单词前通常用 an。', fix: (m) => m.replace(/\ba\b/i, 'an') },
    { re: /\b(an)\s+([bcdfghjklmnpqrstvwxyz][a-z]+)\b/gi, type: '冠词', level: 1, msg: '辅音音素开头的单词前通常用 a。', fix: (m) => m.replace(/\ban\b/i, 'a') },
    { re: /\bmore\s+(better|easier|faster|bigger|smaller|worse|more)\b/gi, type: '比较级', level: 2, msg: '比较级不能再用 more 修饰。', fix: (m) => m.split(/\s+/)[1] },
    { re: /\bmost\s+(easiest|fastest|biggest|smallest|best|worst)\b/gi, type: '最高级', level: 2, msg: '最高级不能再用 most 修饰。', fix: (m) => m.split(/\s+/)[1] },
    { re: /\b(can|could|should|must|may|might|will|would)\s+to\s+([a-z]+)\b/gi, type: '情态动词', level: 2, msg: '情态动词后接动词原形，不加 to。', fix: (m) => m.replace(/\s+to\s+/i, ' ') },
    { re: /\bthere\s+is\s+(many|several|a lot of|numerous|two|three|four|five)\b/gi, type: '主谓一致', level: 2, msg: 'there be 句型中，复数名词应搭配 there are。', fix: (m) => m.replace(/\bis\b/i, 'are') },
    { re: /\b(although|though)\b[^.!?]*\bbut\b/gi, type: '连词', level: 2, msg: 'although/though 与 but 不能同时使用。', fix: (m) => m.replace(/\bbut\b/i, '') },
    { re: /\bbecause\b[^.!?]*\bso\b/gi, type: '连词', level: 2, msg: 'because 与 so 不能同时使用。', fix: (m) => m.replace(/\bso\b/i, '') },
    { re: /\bsince\b[^.!?]*\bago\b/gi, type: '时态', level: 2, msg: 'since 与 ago 不宜连用。', fix: (m) => m.replace(/\bago\b/i, '') },
    { re: /[,;:](?=[A-Za-z])/g, type: '标点', level: 1, msg: '逗号、分号、冒号后需要空格。', fix: (m) => m + ' ' },
    { re: /\s+[,.;:!?]/g, type: '标点', level: 1, msg: '标点前不应有空格。', fix: (m) => m.trim() },
    { re: /[，。；：！？（）【】]/g, type: '标点', level: 1, msg: '英文写作中应使用英文标点。', fix: (m) => ({ '，': ', ', '。': '. ', '；': '; ', '：': ': ', '！': '! ', '？': '? ', '（': '(', '）': ')', '【': '[', '】': ']' }[m] || m) },
    { re: /\b([a-z]+)\s+\1\b/gi, type: '重复', level: 1, msg: '重复了同一个词。', fix: (m) => m.split(/\s+/)[0] }
  ];

  const CLICHES = [
    'with the development of society', 'every coin has two sides', 'in a word',
    'last but not least', 'more and more', 'a lot of', 'as we all know'
  ];

  // Conservative lexical substitutions for sentence-level rewriting.  Broad
  // noun swaps (e.g. knowledge -> expertise) easily produce unnatural
  // collocations, so they are intentionally excluded here.
  const SAFE_WORD_UPGRADES = new Set([
    'important', 'very important', 'many', 'a lot of', 'more and more',
    'think', 'believe', 'good', 'bad', 'big', 'small', 'help', 'use', 'show',
    'get', 'change', 'problem', 'reason', 'result', 'advantage', 'disadvantage',
    'improve', 'develop', 'increase', 'decrease', 'difficult', 'easy', 'happy',
    'sad', 'beautiful', 'famous', 'modern', 'old', 'young', 'people', 'choose',
    'cause', 'affect', 'solve', 'protect', 'provide', 'spend', 'save', 'learn',
    'teach', 'communicate', 'start', 'finish', 'success', 'failure', 'opportunity',
    'challenge', 'benefit', 'harm', 'effect', 'influence', 'role', 'action',
    'plan', 'goal', 'dream', 'hope', 'effort', 'progress', 'achievement',
    'competition', 'cooperation', 'communication', 'information'
  ]);

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function round(n, d) { const p = Math.pow(10, d == null ? 1 : d); return Math.round(n * p) / p; }
  function words(text) { return String(text || '').match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || []; }
  function sentences(text) { return CET.Dict.splitSentences(text); }
  function paragraphs(text) { return String(text || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean); }
  function contentWords(text) {
    return words(text).filter((w) => !STOP.has(w.toLowerCase()) && w.length > 2);
  }
  function pct(n, d) { return d ? n / d : 0; }
  function bandOf(raw) { return BANDS.find((b) => raw >= b.min) || BANDS[BANDS.length - 1]; }
  function converted(raw) { return round(clamp(raw, 0, 15) / 15 * 106.5, 1); }

  const Grader = CET.Grader = {
    WEIGHTS,
    BANDS,

    weights(level) { return WEIGHTS[level === 6 ? 6 : 4]; },

    grammarIssues(text) {
      const src = String(text || '');
      const out = [];
      const seen = new Set();
      for (const rule of GRAMMAR) {
        rule.re.lastIndex = 0;
        let m;
        let guard = 0;
        while ((m = rule.re.exec(src)) !== null && guard++ < 40) {
          const excerpt = m[0].trim();
          if (!excerpt || seen.has(rule.type + '|' + excerpt + '|' + m.index)) {
            if (rule.re.lastIndex === m.index) rule.re.lastIndex++;
            continue;
          }
          // a useful exception: "a university", "a European", "a one"
          if (rule.type === '冠词' && /^a\s+(university|European|one|useful|unique|uniform)/i.test(excerpt)) {
            if (rule.re.lastIndex === m.index) rule.re.lastIndex++;
            continue;
          }
          if (rule.type === '冠词' && /^an\s+(hour|honest|honor|heir)/i.test(excerpt)) {
            if (rule.re.lastIndex === m.index) rule.re.lastIndex++;
            continue;
          }
          seen.add(rule.type + '|' + excerpt + '|' + m.index);
          out.push({
            type: rule.type,
            severity: rule.level,
            excerpt,
            message: rule.msg,
            suggestion: typeof rule.fix === 'function' ? rule.fix(m[0]) : ''
          });
          if (rule.re.lastIndex === m.index) rule.re.lastIndex++;
        }
      }
      return out.slice(0, 30);
    },

    spellingIssues(text) {
      const out = [];
      const seen = new Set();
      const tokens = words(text);
      let checked = 0;
      for (const tok of tokens) {
        if (checked >= 18) break;
        const w = tok.toLowerCase();
        if (w.length < 4 || seen.has(w)) continue;
        if (/^[A-Z]/.test(tok) && tok !== tok.toUpperCase()) continue;
        if (tok === tok.toUpperCase() && tok.length <= 5) continue;
        seen.add(w);
        checked++;
        if (CET.Dict.isKnown(w)) continue;
        const close = CET.Dict.closestWord(w);
        if (close && close.distance === 1) {
          out.push({
            type: '拼写',
            severity: 2,
            excerpt: tok,
            message: '这个词可能是拼写错误。',
            suggestion: close.word
          });
        }
      }
      return out.slice(0, 6);
    },

    clicheIssues(text) {
      const lower = String(text || '').toLowerCase();
      const out = [];
      for (const c of CLICHES) {
        if (lower.includes(c)) {
          out.push({ type: '表达', severity: 1, excerpt: c, message: '这是较常见的模板表达，容易显得套路化。', suggestion: '' });
        }
      }
      return out;
    },

    analyze(text) {
      const src = String(text || '');
      const ws = words(src);
      const n = ws.length;
      const sents = sentences(src);
      const paras = paragraphs(src);
      const content = contentWords(src);
      const unique = new Set(content.map((x) => x.toLowerCase()));
      const lengths = sents.map((s) => words(s).length).filter(Boolean);
      const avgLen = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
      const variance = lengths.length ? lengths.reduce((a, b) => a + Math.pow(b - avgLen, 2), 0) / lengths.length : 0;
      const stdDev = Math.sqrt(variance);
      const tokens = CET.Dict.tokenize(src);
      const phraseTokens = tokens.filter((t) => t.k === 'p');
      const transitionCats = new Set(['contrast', 'addition', 'effect', 'conclusion', 'example', 'cause']);
      const transitions = phraseTokens.filter((t) => transitionCats.has(t.data.cat)).length;
      const advanced = [];
      let advancedCount = 0;
      const seenAdv = new Set();
      for (const w of ws) {
        const low = w.toLowerCase();
        const e = CET.Dict.get(low);
        if ((e && (e.l === 6 || e.l === 46)) || CET.Dict.upgrades.has(low)) {
          advancedCount++;
          if (!seenAdv.has(low)) { seenAdv.add(low); advanced.push(low); }
        }
      }
      const errors = this.grammarIssues(src).concat(this.spellingIssues(src));
      const cliches = this.clicheIssues(src);
      const passive = (src.match(/\b(?:is|are|was|were|be|been|being)\s+[a-z]+ed\b/gi) || []).length;
      const complex = (src.match(/\b(although|though|while|whereas|because|since|if|unless|which|who|whose|that|not only|rather than|in order to|even though|as long as)\b/gi) || []).length;
      const firstPerson = (src.match(/\bI\b/g) || []).length;
      return {
        text: src, words: ws, wordCount: n, sentences: sents, sentenceCount: sents.length,
        paragraphs: paras, paragraphCount: paras.length,
        contentCount: content.length, uniqueContent: unique.size,
        ttr: pct(unique.size, Math.max(1, content.length)),
        avgSentenceLength: round(avgLen, 1), sentenceStdDev: round(stdDev, 1),
        longSentences: sents.filter((s) => words(s).length > 38).length,
        shortSentences: sents.filter((s) => words(s).length > 0 && words(s).length < 6).length,
        transitions, phraseCount: phraseTokens.length, phraseTokens,
        advancedCount, advancedRatio: pct(advancedCount, Math.max(1, n)), advancedWords: advanced.slice(0, 12),
        errors, cliches, passive, complex, firstPerson
      };
    },

    parseAnswers(raw, expectedStart) {
      const map = new Map();
      let src = String(raw || '')
        .replace(/[Ａ-Ｄａ-ｄ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .toUpperCase()
        .replace(/[，、;；]/g, ' ');
      if (!src.trim()) return { map, count: 0 };
      // ranges: 1-5 ABCDA, 26–30 ABCDA
      src = src.replace(/(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*[：:\-]?\s*([A-D](?:\s*[A-D])*)/g, (all, a, b, letters) => {
        const start = parseInt(a, 10), end = parseInt(b, 10);
        const ls = letters.replace(/\s+/g, '').split('');
        for (let q = start, i = 0; q <= end && i < ls.length; q++, i++) map.set(q, ls[i]);
        return ' ';
      });
      // numbered pairs: 1.A 2-B 3：C 4)D
      src = src.replace(/(\d{1,2})\s*[.)、:：\-]?\s*([A-D])\b/g, (all, q, a) => {
        map.set(parseInt(q, 10), a);
        return ' ';
      });
      // unnumbered letter runs: ABCDABCD...
      const left = src.replace(/[^A-D]/g, '');
      if (left.length >= 3) {
        let q = expectedStart || 1;
        while (map.has(q)) q++;
        for (const ch of left) {
          while (map.has(q)) q++;
          map.set(q, ch);
          q++;
        }
      }
      return { map, count: map.size };
    },

    parseMarks(raw, expectedStart) {
      const map = new Map();
      let src = String(raw || '')
        .replace(/[，、;；]/g, ' ')
        .replace(/正确/g, '√').replace(/错误/g, '×')
        .replace(/[✓✔√对∨]/g, '√')
        .replace(/[✗✘叉]/g, '×')
        .replace(/[¥￥]/g, '√')
        .replace(/\*/g, '√')
        .replace(/\bV\b/gi, '√').replace(/\bX\b/gi, '×')
        .replace(/[×xX]/g, '×');
      if (!src.trim()) return { map, count: 0 };
      // ranges: 1-5 √×√√×
      src = src.replace(/(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*[：:\-]?\s*([√×\s]+)/g, (all, a, b, marks) => {
        const start = parseInt(a, 10), end = parseInt(b, 10);
        const ms = marks.replace(/[^√×]/g, '').split('');
        for (let q = start, i = 0; q <= end && i < ms.length; q++, i++) map.set(q, ms[i] === '√');
        return ' ';
      });
      // numbered pairs: 1.√ 2.× 3：√
      src = src.replace(/(\d{1,2})\s*[.)、:：\-]?\s*([√×])/g, (all, q, mark) => {
        map.set(parseInt(q, 10), mark === '√');
        return ' ';
      });
      // unnumbered runs
      const left = src.replace(/[^√×]/g, '');
      if (left.length >= 3) {
        let q = expectedStart || 1;
        while (map.has(q)) q++;
        for (const ch of left) {
          while (map.has(q)) q++;
          map.set(q, ch === '√');
          q++;
        }
      }
      return { map, count: map.size };
    },

    gradeMarks(raw, kind, level) {
      const cfg = this.weights(level);
      const section = cfg[kind];
      if (!section) return null;
      const start = section.sections[0].start;
      const end = section.sections[section.sections.length - 1].end;
      const marks = this.parseMarks(raw, start).map;
      let correctAll = 0;
      const wrong = [];
      const sections = section.sections.map((sec) => {
        let correct = 0;
        for (let q = sec.start; q <= sec.end; q++) {
          const ok = marks.get(q) === true;
          if (ok) correct++;
          else wrong.push({ q, mark: marks.has(q) ? '×' : '' });
        }
        correctAll += correct;
        return {
          id: sec.id, name: sec.name, correct,
          total: sec.end - sec.start + 1,
          max: sec.max,
          score: round(correct / Math.max(1, sec.end - sec.start + 1) * sec.max, 1)
        };
      });
      const score = round(sections.reduce((a, b) => a + b.score, 0), 1);
      return {
        kind: 'marks',
        section: kind,
        score, max: section.max,
        sections, wrong: wrong.slice(0, 80), wrongCount: wrong.length,
        answered: marks.size,
        totalQuestions: end - start + 1,
        unanswered: Math.max(0, end - start + 1 - marks.size)
      };
    },

    gradeObjective(keyRaw, mineRaw, kind, level) {
      const cfg = this.weights(level);
      const section = cfg[kind];
      if (!section) return null;
      const start = section.sections[0].start;
      const end = section.sections[section.sections.length - 1].end;
      const key = this.parseAnswers(keyRaw, start).map;
      const mine = this.parseAnswers(mineRaw, start).map;
      const keyCount = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter((q) => key.has(q)).length;
      const answered = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter((q) => mine.has(q)).length;
      const wrong = [];
      let correctAll = 0;
      const sections = section.sections.map((sec) => {
        let correct = 0;
        for (let q = sec.start; q <= sec.end; q++) {
          if (key.has(q) && mine.get(q) === key.get(q)) correct++;
          else if (key.has(q) && mine.has(q) && mine.get(q) !== key.get(q)) {
            wrong.push({ q, key: key.get(q), mine: mine.get(q) });
          } else if (key.has(q) && !mine.has(q)) {
            wrong.push({ q, key: key.get(q), mine: '' });
          }
        }
        correctAll += correct;
        return {
          id: sec.id, name: sec.name, correct,
          total: sec.end - sec.start + 1,
          max: sec.max,
          score: round(correct / Math.max(1, sec.end - sec.start + 1) * sec.max, 1)
        };
      });
      const score = round(sections.reduce((a, b) => a + b.score, 0), 1);
      return {
        kind: 'objective',
        section: kind,
        score, max: section.max,
        sections, wrong: wrong.slice(0, 80), wrongCount: wrong.length,
        answered, keyCount,
        totalQuestions: end - start + 1,
        unanswered: Math.max(0, end - start + 1 - answered),
        completeKey: keyCount >= (end - start + 1),
        completeMine: answered >= (end - start + 1)
      };
    },

    extractKeywords(prompt) {
      const ws = words(prompt).map((w) => w.toLowerCase());
      const out = [];
      const seen = new Set();
      for (const w of ws) {
        if (w.length < 3 || STOP.has(w) || INSTRUCTION.has(w) || seen.has(w)) continue;
        seen.add(w);
        out.push(w);
        if (out.length >= 12) break;
      }
      return out;
    },

    coversKeyword(text, kw) {
      if (!kw) return false;
      if (text.includes(kw)) return true;
      const syn = CET.Dict.synonyms(kw, 14);
      for (const s of syn) {
        if (text.includes(s.toLowerCase())) return true;
      }
      const forms = CET.Dict.forms(CET.Dict.get(kw) || {});
      for (const f of forms) {
        if (text.includes(String(f[0]).toLowerCase())) return true;
      }
      return false;
    },

    findUpgrades(text) {
      const src = String(text || '');
      const lower = src.toLowerCase();
      const out = [];
      const used = new Set();
      const rules = [];
      for (const u of CET.Dict.upgradeList) {
        if (!u.adv || !u.adv.length) continue;
        const from = u.w;
        if (!lower.includes(from)) continue;
        rules.push({ from, to: u.adv[0].t, why: u.note || u.adv[0].zh || '', at: lower.indexOf(from) });
      }
      for (const r of CET.Dict.sentenceUpgrades) {
        const from = r.from.toLowerCase();
        if (!lower.includes(from)) continue;
        rules.push({ from: r.from, to: r.to, why: r.why || '', at: lower.indexOf(from) });
      }
      rules.sort((a, b) => b.from.length - a.from.length || a.at - b.at);
      const occupied = [];
      for (const r of rules) {
        const pos = lower.indexOf(r.from.toLowerCase());
        if (pos < 0) continue;
        if (used.has(r.from.toLowerCase())) continue;
        if (occupied.some((x) => pos < x.end && pos + r.from.length > x.start)) continue;
        occupied.push({ start: pos, end: pos + r.from.length });
        used.add(r.from.toLowerCase());
        out.push({ from: r.from, to: r.to, why: r.why });
        if (out.length >= 10) break;
      }
      return out.sort((a, b) => lower.indexOf(a.from.toLowerCase()) - lower.indexOf(b.from.toLowerCase()));
    },

    applyRewrites(sentence) {
      let out = String(sentence || '');
      const changes = [];
      const rules = [];
      for (const r of CET.Dict.sentenceUpgrades) rules.push({ from: r.from, to: r.to, why: r.why || '句式升级' });
      for (const r of CET.Dict.chinglish) rules.push({ from: r.from, to: r.to, why: r.why || '更地道的表达' });
      rules.sort((a, b) => b.from.length - a.from.length);
      for (const r of rules) {
        const re = new RegExp('\\b' + CET.escapeRegExp(r.from) + '\\b', 'ig');
        if (re.test(out)) {
          out = out.replace(re, (m) => {
            if (m && m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase()) {
              return r.to[0].toUpperCase() + r.to.slice(1);
            }
            return r.to;
          });
          changes.push(r);
        }
      }
      return { text: out, changes };
    },

    applyWordUpgrades(sentence) {
      let out = String(sentence || '');
      const changes = [];
      const rules = [];
      for (const u of CET.Dict.upgradeList) {
        if (!u.adv || !u.adv.length || !SAFE_WORD_UPGRADES.has(u.w)) continue;
        rules.push({ from: u.w, to: u.adv[0].t, why: u.adv[0].zh || '高级替换' });
      }
      rules.sort((a, b) => b.from.length - a.from.length);
      for (const r of rules) {
        const re = new RegExp('\\b' + CET.escapeRegExp(r.from) + '\\b', 'ig');
        if (re.test(out)) {
          out = out.replace(re, (m, offset, whole) => {
            const before = whole.slice(0, offset);
            if (/^(contemporary|modern|traditional)\s+$/i.test(before) && /^the\s/i.test(r.to)) return m;
            if (m && m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase()) {
              return r.to[0].toUpperCase() + r.to.slice(1);
            }
            return r.to;
          });
          changes.push(r);
        }
      }
      return { text: out, changes };
    },

    frames() {
      const list = (CET.state.patterns && CET.state.patterns.frames) || [];
      if (list.length) return list;
      return [
        { id: 'f1', en: 'There is no doubt that ...', zh: '毫无疑问，……', use: '陈述句强调' },
        { id: 'f2', en: 'It is widely acknowledged that ...', zh: '人们普遍承认，……', use: '普遍观点' },
        { id: 'f3', en: 'What deserves particular attention is that ...', zh: '尤其值得注意的是，……', use: '强调重点' }
      ];
    },

    applyFrame(frame, sentence) {
      let clause = String(sentence || '').trim().replace(/[.!?]+$/, '');
      if (!clause) return '';
      if (!/^I\b/.test(clause) && !/^[A-Z]{2,}/.test(clause) && /^[A-Z]/.test(clause)) {
        clause = clause[0].toLowerCase() + clause.slice(1);
      }
      let out = String(frame.en || '').replace(/\.\.\./, clause);
      if (!/[.!?]$/.test(out)) out += '.';
      return out;
    },

    sentenceVersions(sentence) {
      const frames = this.frames();
      const polished = this.applyRewrites(sentence);
      let base = polished.text;
      if (!polished.changes.length || base === sentence) base = this.applyFrame(frames[0], sentence);
      const lexical = this.applyWordUpgrades(sentence);
      let mid = lexical.text;
      if (!lexical.changes.length || mid === sentence || mid === base) mid = this.applyFrame(frames[1] || frames[0], sentence);
      const highClause = lexical.text && lexical.text !== sentence ? lexical.text : sentence;
      let high = this.applyFrame(frames[2] || frames[0], highClause);
      if (high === base || high === mid) high = this.applyFrame(frames[3] || frames[0], highClause);
      if (high === base || high === mid) high = this.applyFrame(frames[4] || frames[0], highClause);
      return [
        { label: '基础', level: 1, text: base, why: polished.changes.length ? '修正搭配/语法，表达更自然' : '用基础强调框架让句子更正式' },
        { label: '进阶', level: 2, text: mid, why: lexical.changes.length ? '替换为更正式/高级词汇' : '加入进阶句式框架' },
        { label: '高分', level: 3, text: high, why: '套用高分句式框架；可在下方更换模板', pattern: (frames[2] || frames[0]).en }
      ];
    },

    rewritesFor(text) {
      const sents = sentences(text);
      const out = [];
      for (const s of sents) {
        if (!s || s.length < 4) continue;
        const versions = this.sentenceVersions(s);
        out.push({ original: s, versions });
        if (out.length >= 10) break;
      }
      return out;
    },

    modelSentences(prompt) {
      const kws = this.extractKeywords(prompt || '');
      const topic = kws[0] || 'this issue';
      return [
        'In recent years, ' + topic + ' has aroused widespread concern among the public.',
        'Several factors may account for this phenomenon, and the most important one is ...',
        'It is high time that we took effective measures to address this issue.'
      ];
    },

    scoreEssay(input) {
      const text = String(input.text || '');
      const level = input.level === 6 ? 6 : 4;
      const prompt = String(input.prompt || '');
      const a = this.analyze(text);
      if (!a.wordCount) {
        return {
          kind: 'essay', raw: 0, max: 15, converted: 0, band: bandOf(0),
          rubric: [], analysis: a, issues: [], strengths: [], upgrades: [], rewrites: [],
          models: this.modelSentences(prompt), topicWords: [], wordCount: 0,
          expected: level === 6 ? '150–200 词' : '120–180 词'
        };
      }
      const min = level === 6 ? 150 : 120;
      const max = level === 6 ? 200 : 180;
      const n = a.wordCount;
      const strict = level === 6;

      const lengthScore = n >= min && n <= max ? 2 : n < min ? 2 * clamp(n / min, 0.05, 0.98) : 1.6;
      let relevance = 1.7;
      let keywordCoverage = null;
      const kws = this.extractKeywords(prompt);
      if (kws.length) {
        const lower = text.toLowerCase();
        let hit = 0;
        for (const kw of kws) if (this.coversKeyword(lower, kw)) hit++;
        keywordCoverage = pct(hit, kws.length);
        relevance = 2.5 * clamp((strict ? 0.16 : 0.25) + keywordCoverage * (strict ? 1.0 : 1.1), 0, 1);
      } else if (a.contentCount >= 10) {
        relevance = 2.1;
      }

      const paragraphsScore = clamp((a.paragraphCount - 1) / 2, 0, 1) * 1.2;
      const transitionsScore = clamp(a.transitions / 5, 0, 1) * 1.0;
      const first = a.paragraphs[0] || '';
      const last = a.paragraphs[a.paragraphCount - 1] || '';
      const hasIntro = words(first).length >= 8;
      const hasConclusion = /(in conclusion|to sum up|in summary|all in all|on the whole|therefore|in short)/i.test(last) || a.paragraphCount >= 3;
      const structureScore = (hasIntro && hasConclusion ? 0.8 : 0.35);

      const errorCount = a.errors.length;
      let accuracy;
      if (errorCount === 0) accuracy = strict ? 3.35 : 3.5;
      else if (errorCount <= 1) accuracy = strict ? 3.0 : 3.25;
      else if (errorCount <= 3) accuracy = strict ? 2.55 : 2.9;
      else if (errorCount <= 5) accuracy = strict ? 2.1 : 2.5;
      else if (errorCount <= 8) accuracy = strict ? 1.5 : 2.0;
      else if (errorCount <= 12) accuracy = strict ? 0.9 : 1.4;
      else accuracy = strict ? 0.4 : 0.8;

      const ttrScore = clamp((a.ttr - 0.32) / 0.33, 0, 1) * 0.8;
      const advScore = clamp(a.advancedRatio / (strict ? 0.14 : 0.1), 0, 1) * 1.0;
      const phraseScore = clamp(a.phraseCount / (strict ? 6 : 5), 0, 1) * 0.7;

      const lengthVar = clamp(a.sentenceStdDev / 8, 0, 1) * 0.6;
      const complexScore = clamp((a.complex / Math.max(1, a.sentenceCount)) / (strict ? 0.65 : 0.55), 0, 1) * 0.6;
      const passiveScore = a.passive > 0 ? 0.3 : 0.12;

      let raw = lengthScore + relevance + paragraphsScore + transitionsScore + structureScore +
        accuracy + ttrScore + advScore + phraseScore + lengthVar + complexScore + passiveScore;
      if (strict) raw -= 0.4;
      if (n < 40) raw = Math.min(raw, 3);
      else if (n < 80) raw = Math.min(raw, 6);
      else if (n < min * 0.6) raw = Math.min(raw, 9);
      raw = clamp(Math.round(raw * 2) / 2, 0, 15);

      const rubric = [
        { name: '任务完成', score: round(lengthScore + relevance, 1), max: 4.5 },
        { name: '连贯衔接', score: round(paragraphsScore + transitionsScore + structureScore, 1), max: 3.0 },
        { name: '语言准确', score: round(accuracy, 1), max: 3.5 },
        { name: '词汇丰富', score: round(ttrScore + advScore + phraseScore, 1), max: 2.5 },
        { name: '句式多样', score: round(lengthVar + complexScore + passiveScore, 1), max: 1.5 }
      ];

      const issues = a.errors.map((e) => ({
        type: e.type, severity: e.severity, title: e.type + '：' + e.excerpt,
        detail: e.message, fix: e.suggestion
      }));
      if (n < min) issues.push({ type: '篇幅', severity: 1, title: '字数不足', detail: '当前 ' + n + ' 词，' + level + ' 级建议 ' + min + '–' + max + ' 词。字数明显不足会影响任务完成度。', fix: '' });
      if (n > max) issues.push({ type: '篇幅', severity: 1, title: '字数偏多', detail: '当前 ' + n + ' 词，超过建议上限 ' + max + ' 词；冗长不等于高分，注意删减重复信息。', fix: '' });
      if (a.paragraphCount < 3) issues.push({ type: '结构', severity: 1, title: '段落偏少', detail: '建议采用“引入—主体（2 段）—结论”的三段或四段结构。', fix: '' });
      if (a.transitions < 3) issues.push({ type: '衔接', severity: 1, title: '衔接手段不足', detail: '适当使用 however / moreover / therefore / in conclusion 等逻辑连接词。', fix: '' });
      for (const c of a.cliches) issues.push({ type: '表达', severity: 1, title: '模板化表达', detail: '“' + c.excerpt + '”较常见，建议换成更具体的表达。', fix: '' });

      const strengths = [];
      if (n >= min && n <= max) strengths.push('篇幅符合 ' + level + ' 级要求（' + n + ' 词）。');
      if (a.paragraphCount >= 3) strengths.push('段落结构完整，层次较清楚。');
      if (a.transitions >= 4) strengths.push('使用了较多逻辑衔接词，行文较连贯。');
      if (errorCount <= 2) strengths.push('语言错误很少，基础表达较扎实。');
      if (a.advancedRatio >= 0.07) strengths.push('出现了一定比例的高级词汇与表达。');
      if (a.sentenceStdDev >= 5 && a.complex >= 3) strengths.push('句式有长短变化，能使用从句等复杂结构。');
      if (!strengths.length) strengths.push('已经完成成文，下一步优先解决篇幅、结构与高频语法问题。');

      const upgrades = this.findUpgrades(text);
      const rewrites = this.rewritesFor(text);
      const models = this.modelSentences(prompt || text);

      return {
        kind: 'essay', raw, max: 15, converted: converted(raw), band: bandOf(raw),
        rubric, analysis: a, issues: issues.slice(0, 14), strengths,
        upgrades, rewrites, models,
        topicWords: kws, keywordCoverage,
        wordCount: n, expected: min + '–' + max + ' 词'
      };
    },

    scoreTranslation(input) {
      const text = String(input.text || '');
      const reference = String(input.reference || '');
      const prompt = String(input.prompt || '');
      const level = input.level === 6 ? 6 : 4;
      const a = this.analyze(text);
      const n = a.wordCount;
      if (!n) {
        return {
          kind: 'translation', raw: 0, max: 15, converted: 0, band: bandOf(0),
          rubric: [], analysis: a, issues: [], strengths: [], upgrades: [], rewrites: [],
          missing: [], coverage: 0, warning: '', wordCount: 0
        };
      }

      const hasRef = reference.trim().length > 10 && !/[\u4e00-\u9fff]/.test(reference);
      let coverage = 0;
      let missing = [];
      let refWords = [];
      if (hasRef) {
        const toks = words(reference).map((w) => w.toLowerCase());
        const uniq = [];
        const seen = new Set();
        for (const w of toks) {
          if (w.length < 4 || STOP.has(w) || seen.has(w)) continue;
          seen.add(w);
          uniq.push(w);
        }
        refWords = uniq.slice(0, 28);
        const lower = text.toLowerCase();
        let hit = 0;
        for (const w of refWords) {
          if (this.coversKeyword(lower, w)) hit++;
          else missing.push(w);
        }
        coverage = pct(hit, Math.max(1, refWords.length));
      }

      let lengthScore;
      if (n < 55) lengthScore = 2 * clamp(n / 55, 0.05, 0.95);
      else if (n <= 240) lengthScore = 2;
      else lengthScore = 1.7;

      let content;
      if (hasRef) content = 4 * coverage + lengthScore;
      else {
        const kws = this.extractKeywords(prompt);
        let hit = 0;
        if (kws.length) {
          const lower = text.toLowerCase();
          for (const kw of kws) if (this.coversKeyword(lower, kw)) hit++;
        }
        content = lengthScore + (n >= 55 ? 2.2 : 1.2) + (kws.length ? 1.5 * pct(hit, kws.length) : 1.0);
      }
      content = clamp(content, 0, 6);

      const chineseLeft = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const errCount = a.errors.length + (chineseLeft ? 2 : 0);
      let accuracy;
      if (errCount === 0) accuracy = 4;
      else if (errCount <= 1) accuracy = 3.7;
      else if (errCount <= 3) accuracy = 3.3;
      else if (errCount <= 5) accuracy = 2.8;
      else if (errCount <= 8) accuracy = 2.2;
      else accuracy = 1.4;
      if (chineseLeft) accuracy = Math.min(accuracy, 2.0);

      const lenOk = a.avgSentenceLength >= 10 && a.avgSentenceLength <= 28;
      const fluency = clamp(
        (lenOk ? 1.5 : 0.9) +
        clamp(a.transitions / 4, 0, 1) * 0.9 +
        (a.longSentences > 3 ? 0.2 : 0.6), 0, 3);

      const lang = clamp(
        clamp((a.ttr - 0.3) / 0.35, 0, 1) * 0.9 +
        clamp(a.advancedRatio / 0.08, 0, 1) * 1.1, 0, 2);

      let raw = content + accuracy + fluency + lang;
      if (n < 35) raw = Math.min(raw, 5);
      raw = clamp(Math.round(raw * 2) / 2, 0, 15);

      const rubric = [
        { name: '内容完整', score: round(content, 1), max: 6 },
        { name: '语言准确', score: round(accuracy, 1), max: 4 },
        { name: '表达流畅', score: round(fluency, 1), max: 3 },
        { name: '词汇句式', score: round(lang, 1), max: 2 }
      ];

      const issues = a.errors.map((e) => ({
        type: e.type, severity: e.severity, title: e.type + '：' + e.excerpt,
        detail: e.message, fix: e.suggestion
      }));
      if (chineseLeft) issues.push({ type: '完整性', severity: 2, title: '译文中仍有中文', detail: '翻译题需要用英文完整表达，扫描或输入后请检查是否漏译。', fix: '' });
      if (hasRef && missing.length) {
        issues.push({ type: '内容', severity: 1, title: '可能漏译的要点', detail: '参考译文中这些关键词未在译文中找到对应表达：' + missing.slice(0, 8).join('、') + '。', fix: '' });
      }
      if (!hasRef) issues.push({ type: '评分提示', severity: 1, title: '未填写参考译文', detail: '当前内容分按篇幅与题目关键词估算。填写参考译文后，系统会用关键信息覆盖度重新评分。', fix: '' });
      if (a.avgSentenceLength > 30) issues.push({ type: '流畅', severity: 1, title: '句子偏长', detail: '平均句长约 ' + a.avgSentenceLength + ' 词，适当拆分可提升可读性。', fix: '' });

      const strengths = [];
      if (hasRef && coverage >= 0.7) strengths.push('参考译文的主要信息覆盖较完整。');
      if (n >= 55 && n <= 240) strengths.push('译文篇幅合适，信息量较充分。');
      if (errCount <= 2) strengths.push('语法与拼写错误较少。');
      if (a.advancedRatio >= 0.06) strengths.push('使用了一些高级词汇和固定搭配。');
      if (a.transitions >= 2) strengths.push('能使用连接词组织译文。');
      if (!strengths.length) strengths.push('已经完成翻译，建议先补全信息点，再处理语法与搭配。');

      return {
        kind: 'translation', raw, max: 15, converted: converted(raw), band: bandOf(raw),
        rubric, analysis: a, issues: issues.slice(0, 14), strengths,
        upgrades: this.findUpgrades(text), rewrites: this.rewritesFor(text),
        missing: missing.slice(0, 12), coverage, refWords,
        warning: hasRef ? '' : '未填写参考译文，内容分采用启发式估算。',
        wordCount: n, expected: level === 6 ? '建议 120–180 词' : '建议 100–160 词'
      };
    },

    total(result) {
      const r = result || {};
      const parts = {
        writing: r.essay ? r.essay.converted : null,
        listening: r.listening ? r.listening.score : null,
        reading: r.reading ? r.reading.score : null,
        translation: r.translation ? r.translation.converted : null
      };
      const maxes = { writing: 106.5, listening: 248.5, reading: 248.5, translation: 106.5 };
      let score = 0, max = 0;
      for (const k of Object.keys(parts)) {
        if (parts[k] != null) { score += parts[k]; max += maxes[k]; }
      }
      const projected = max > 0 ? round(score / max * 710, 1) : 0;
      return {
        parts, score: round(score, 1), max: round(max, 1),
        projected,
        complete: max >= 709.5,
        pass: projected >= 425
      };
    }
  };
})();
