/* Generic OpenAI-compatible vision + grading client. */
(function () {
  'use strict';
  const CET = window.CET;
  if (!CET) return;
  const CONFIG_KEY = 'cet46:aiConfig';
  const LEGACY_KEY = 'cet46:deepseekKey';
  const HAND_KEY = 'cet46:aiHand';
  const GRADE_KEY = 'cet46:aiGrade';

  const PRESETS = [
    {
      id: 'deepseek', name: 'DeepSeek',
      base: 'https://api.deepseek.com', model: 'deepseek-flash',
      site: 'https://platform.deepseek.com/api_keys',
      note: '默认'
    }
  ];
  function presetOf(id) {
    for (const p of PRESETS) if (p.id === id) return p;
    return PRESETS[0];
  }
  const PRESET = PRESETS[0];
  /* fetch() rejects header values with non ISO-8859-1 code points, and a key pasted
     from chat apps often carries a full-width char or a zero-width space. */
  function asciiOnly(v) {
    return String(v == null ? '' : v)
      .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '')
      .replace(/[^\x20-\x7e]/g, '')
      .trim();
  }
  function readJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function normalize(c) {
    const src = c || {};
    const p = presetOf(src.preset);
    /* Only DeepSeek ships now: anything stored under another preset falls back to it. */
    const same = src.preset === p.id;
    return {
      preset: p.id,
      base: String((same ? src.base : '') || p.base || '').trim(),
      model: String((same ? src.model : '') || p.model || '').trim(),
      key: asciiOnly(src.key)
    };
  }
  function getConfig() {
    let c = readJSON(CONFIG_KEY, null);
    if (!c) {
      let legacy = '';
      try { legacy = String(localStorage.getItem(LEGACY_KEY) || '').trim(); } catch (e) {}
      c = { preset: PRESET.id, base: PRESET.base, model: PRESET.model, key: legacy };
      writeJSON(CONFIG_KEY, c);
    }
    return normalize(c);
  }
  function setConfig(patch) {
    const next = normalize(Object.assign({}, getConfig(), patch || {}));
    writeJSON(CONFIG_KEY, next);
    return next;
  }
  function hasKey() { return !!getConfig().key; }
  function apiKey() { return getConfig().key; }
  function setKey(k) { setConfig({ key: asciiOnly(k) }); }
  function flag(key) {
    try { const v = localStorage.getItem(key); return v === null ? true : v === '1'; } catch (e) { return true; }
  }
  function handwritingOn() { return hasKey() && flag(HAND_KEY); }
  function gradingOn() { return hasKey() && flag(GRADE_KEY); }
  function setFeature(kind, on) {
    try { localStorage.setItem(kind === 'hand' ? HAND_KEY : GRADE_KEY, on ? '1' : '0'); } catch (e) {}
  }
  function parseJSON(s) {
    let t = String(s || '').trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    return null;
  }
  let lastCall = null;

  async function chat(content, opts) {
    const o = opts || {};
    const cfg = getConfig();
    if (!cfg.key) throw new Error('未配置 API Key');
    if (!cfg.base || !cfg.model) throw new Error('请先选择模型并填写 Base URL / 模型名');
    const model = (o && o.model) || cfg.model;
    let base = cfg.base.replace(/\/+$/, '');
    const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
    const timeoutMs = (o && o.timeoutMs) || 60000;
    const ctrl = new AbortController();
    const started = Date.now();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const key = asciiOnly(cfg.key);
      if (!key) throw new Error('API Key 里没有可用字符，请重新粘贴（只要 sk- 开头的英文数字）');
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };

      const buildBody = function (withEffort) {
        /* 固定前缀（system）放最前、可变内容放最后，命中上下文缓存后输入按缓存价计费。 */
        const messages = [];
        if (o.system) messages.push({ role: 'system', content: o.system });
        messages.push({ role: 'user', content });
        const b = {
          model: model,
          messages: messages,
          temperature: (typeof o.temperature === 'number') ? o.temperature : 0.15,
          max_tokens: (o && o.maxTokens) || 8192
        };
        /* 接口限制：开了 safety_check 就只能用 text，不能同时要 json_object。JSON 靠提示词约束，解析端会兜底。 */
        if (o.json && !o.safety) b.response_format = { type: 'json_object' };
        if (o.safety) b.safety_check = { level: 'high' };
        if (withEffort) b.reasoning_effort = withEffort;
        return b;
      };

      const post = async function (payload) {
        return fetch(url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(payload) });
      };

      let res;
      try {
        /* 先带着 reasoning_effort 试一次；老接口不认这个参数会回 400，那时自动去掉重发。 */
        res = await post(buildBody('low'));
        if (res.status === 400) {
          let detail = '';
          try { const j = await res.clone().json(); detail = (j.error && j.error.message) || ''; } catch (e) {}
          if (/reasoning_effort|unknown|invalid.*(param|argument)/i.test(detail)) {
            res = await post(buildBody(null));
          }
        }
      } catch (fetchErr) {
        const name = (fetchErr && fetchErr.name) || '?';
        const detail = (fetchErr && fetchErr.message) || '?';
        console.error('AI 请求失败 ' + url + ' origin=' + window.location.href + ' name=' + name + ' msg=' + detail + ' after=' + (Date.now() - started) + 'ms');
        if (name === 'AbortError') throw new Error('请求超时（' + Math.round(timeoutMs / 1000) + ' 秒）：网络慢或图片过大，可换普通模式或重试');
        if (/ISO-8859-1/i.test(detail)) throw new Error('API Key 含有非英文字符（多半是粘贴时带进了中文或全角符号），请到「AI 模型」重新粘贴');
        throw new Error('网络请求失败：' + detail);
      }
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); msg = j.error && j.error.message ? j.error.message : msg; } catch (e) {}
        if (res.status === 400 && /content exists risk/i.test(msg)) msg = '内容未通过安全审核，换一段内容再试';
        else if (res.status === 401) msg = 'API Key 无效，请到「AI 模型」重新填写';
        else if (res.status === 402) msg = 'DeepSeek 余额不足，请到 platform.deepseek.com 充值';
        else if (res.status === 429) msg = '请求太频繁，等一分钟再试';
        throw new Error(msg);
      }
      const j = await res.json();
      lastCall = { at: Date.now(), ms: Date.now() - started, usage: j.usage || null, endpoint: 'chat/completions' };
      const choice = j.choices && j.choices[0];
      const message = choice && choice.message ? choice.message : {};
      if (message.refusal) throw new Error('内容未通过安全审核，换一段内容再试');
      const text = typeof message.content === 'string' ? message.content : '';
      if (!text) {
        const usage = j.usage || {};
        const bits = [
          'finish=' + (choice ? choice.finish_reason : '无 choices'),
          'out=' + (usage.completion_tokens != null ? usage.completion_tokens : '?'),
          'in=' + (usage.prompt_tokens != null ? usage.prompt_tokens : '?'),
          'reasoning=' + (message.reasoning_content ? '有' : '无'),
          'keys=' + Object.keys(j).join(',')
        ];
        console.error('AI 空返回 model=' + model + ' ' + bits.join(' '));
        throw new Error('模型返回为空（' + bits.join('，') + '）');
      }
      return text;
    } finally { clearTimeout(timer); }
  }


  /** Minimal authenticated round-trip, used by the settings self-test. */
  async function ping() {
    const cfg = getConfig();
    const key = asciiOnly(cfg.key);
    if (!key) throw new Error('未配置 API Key');
    let base = cfg.base.replace(/\/+$/, '');
    const url = /\/models$/.test(base) ? base : base + '/models';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const started = Date.now();
    try {
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal, headers: { 'Authorization': 'Bearer ' + key } });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); msg = j.error && j.error.message ? j.error.message : msg; } catch (e) {}
        if (res.status === 401) msg = 'API Key 无效';
        else if (res.status === 402) msg = '余额不足';
        throw new Error(msg);
      }
      const j = await res.json();
      const models = (j.data || []).map((m) => m.id).slice(0, 3);
      return { ms: Date.now() - started, models };
    } catch (err) {
      if ((err && err.name) === 'AbortError') throw new Error('20 秒无响应');
      if (/ISO-8859-1/i.test(String(err && err.message))) throw new Error('Key 含非英文字符');
      throw new Error((err && err.message) || '请求失败');
    } finally { clearTimeout(timer); }
  }

  /* 独立 OCR 接口（/v1/tools/ocr）：multipart 上传，按页返回纯文本，不走对话模型、不花思考 token。 */
  function stripOcrTokens(t) {
    return String(t || '')
      .replace(/<｜[^｜]*｜>/g, '')
      .replace(/<\|[^|]*\|>/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /* 联网搜索：用于批改时查证搭配是否地道（结果按成功请求计费）。 */
  /* 抓取单个网页正文（Markdown）。 */
  async function ocrText(dataUrl, opts) {
    const cfg = getConfig();
    const key = asciiOnly(cfg.key);
    if (!key) throw new Error('未配置 API Key');
    let base = String(cfg.base || '').replace(/\/+$/, '');
    if (!/\/v1$/.test(base)) base += '/v1';
    const url = base + '/tools/ocr';
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData();
    fd.append('purpose', (opts && opts.purpose) || 'text_recognition');
    fd.append('file', blob, (opts && opts.filename) || 'scan.jpg');
    const ctrl = new AbortController();
    const started = Date.now();
    const timeoutMs = (opts && opts.timeoutMs) || 120000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers: { Authorization: 'Bearer ' + key }, body: fd });
      const raw = await res.text();
      let data = null;
      try { data = JSON.parse(raw.trim()); } catch (e) {}
      if (!res.ok) {
        let msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
        if (res.status === 401) msg = 'API Key 无效，请到「AI 模型」重新填写';
        else if (res.status === 402) msg = 'DeepSeek 余额不足';
        else if (res.status === 413) msg = '图片太大';
        else if (res.status === 429) msg = 'OCR 并发已满，稍等再试';
        else if (res.status === 503) msg = 'OCR 服务忙，稍后重试';
        throw new Error(msg);
      }
      if (!data) throw new Error('OCR 返回格式错误');
      if (data.error) throw new Error(data.error.message || 'OCR 失败');
      lastCall = { at: Date.now(), ms: Date.now() - started, usage: data.usage || null, endpoint: 'tools/ocr' };
      const pages = data.pages || [];
      const texts = pages.map((p) => stripOcrTokens(p.text || ''));
      const text = texts.filter(Boolean).join('\n\n').trim();
      if (!text) throw new Error('OCR 没有识别到文字');
      return { text, pages: pages.length, texts, usage: data.usage || null };
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('OCR 超时（120 秒）');
      throw e;
    } finally { clearTimeout(timer); }
  }

  async function marks(dataUrl) {
    const prompt = [
      'Look at this CET answer sheet photo. Read the teacher red marks only.',
      'Return JSON: {"text":"1.√ 2.× 3.√ ..."}.',
      'Use √ for a red tick / correct, × for a red cross, slash or underline / wrong.',
      'Only include question numbers that have a visible red mark. Do not invent.',
      'If nothing is visible return {"text":""}.'
    ].join(' ');
    const raw = await chat([
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'original' } }
    ], { json: true }).catch(() => chat([
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'original' } }
    ]));
    const obj = parseJSON(raw);
    return obj && typeof obj.text === 'string' ? obj.text : '';
  }

  async function paper(dataUrl, level) {
    const prompt = [
      'Read this CET-4/6 exam paper photo.',
      'Return ONLY JSON:',
      '{"marks":"1.√ 2.× 3.√", "essay":{"prompt":"...","text":"..."}, "translation":{"prompt":"...","text":"..."}}',
      'marks: only red teacher ticks/crosses; √ for correct, × for wrong; empty string if none.',
      'essay: handwritten English composition; prompt is the writing task if visible.',
      'translation: Chinese source paragraph and the student English translation.',
      'Do not invent text. Use empty strings when a part is not visible.',
      'Level: ' + (level === 6 ? 'CET-6' : 'CET-4')
    ].join(' ');
    const raw = await chat([
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'original' } }
    ], { json: true });
    const obj = parseJSON(raw);
    if (!obj) throw new Error('模型返回格式错误');
    return obj;
  }

  /* 固定的评分规则单独放 system：每次调用字节一致，能命中上下文缓存。 */
  const GRADE_SYSTEM = `You are a CET-4/6 writing and translation examiner.
Return ONLY valid JSON, no Markdown.
Schema:
{
 "essay": {
   "raw": 0-15,
   "band": "优秀|良好|合格|较弱|较差",
   "bandReason": "为什么落在这个档，一句话",
   "wordCount": 0,
   "expected": "字数要求与是否达标",
   "rubric": [{"name":"任务完成","score":0,"max":4,"why":"这一项为什么拿这个分"},{"name":"书写与卷面","score":0,"max":3,"why":"字迹是否清晰、涂改是否影响判读"}],
   "deductions": [{"item":"扣分点","lost":0.5,"why":"具体原因"}],
   "issues": [{"title":"问题类型","detail":"引用原句 + 为什么错 + 正确写法"}],
   "sentences": [{"index":1,"original":"原句","fixed":"改写后","notes":["为什么这么改"]}],
   "strengths": ["做得好的地方"],
   "upgrades": [{"from":"原表达","to":"更地道表达","why":"原因"}],
   "nextSteps": ["下一步可以练的具体动作"]
 },
 "translation": { same fields, rubric names use 准确性/通顺度/完整性/书写与卷面 }
}
Score honestly. Omit the section that has no text.
Handwriting is judged from the photo, not the transcript: score 书写与卷面 on legibility (clear 3, readable 2, hard to read 1, illegible 0). Handwriting does NOT change the official band by itself; if strokes are so unclear that words cannot be read, add a deduction of 0.5-1 named "字迹难以辨认" instead. Never invent content you cannot read.
Bands: 13-15 优秀, 10-12.5 良好, 7-9.5 合格, 4-6.5 较弱, 1-3.5 较差.
CET-6 expects 150-200 words and clearly higher vocabulary, sentence variety and cohesion than CET-4: do not give CET-4-level credit for simple language. CET-4 expects 120-180 words.
If essay.prompt is empty, DO NOT judge task relevance; grade language only and set essay.band to "语言评分（无题目）".
Use Chinese for rubric[].name, band, bandReason, expected, deductions, issues, notes, nextSteps; quote the student's English verbatim.
The text comes from OCR of handwriting and may contain strike-out artifacts: the same word twice in a row, or a word immediately followed by the word that replaced it. Treat an immediately repeated identical word as written once and do NOT list it as a repetition error; ignore fragments that are obviously crossed out.
Be terse. Every correction must be word-level: upgrades.from is the exact words to change, upgrades.to is the replacement, why <= 30 chars. issues.detail <= 60 chars. No paragraphs.`;

  /* 直接把题目图和手写图交给模型：一次请求完成转写 + 批改，不先做 OCR。 */
  async function gradeFromImages(p) {
    const isW = p.kind !== 'translation';
    const prompt = isW
      ? 'Image 1 is the essay prompt (Directions). Image 2 is the student handwritten essay. Transcribe the essay into "text" (skipping words the writer clearly crossed out), then grade it and fill "essay".'
      : 'Image 1 is the Chinese source passage. Image 2 is the student handwritten English translation. Transcribe the translation into "text" (skipping crossed-out words), then grade it and fill "translation".';
    const raw = await chat([
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: p.promptImage, detail: 'high' } },
      { type: 'image_url', image_url: { url: p.answerImage, detail: 'high' } }
    ], { json: true, safety: true, system: GRADE_SYSTEM, maxTokens: 8192, timeoutMs: 240000, temperature: 0 });
    const obj = parseJSON(raw);
    if (!obj) throw new Error('模型返回格式错误');
    return obj;
  }

  /* 按题目生成一篇范文。 */
  async function composeEssay(promptText, level) {
    const sys = [
      'You are a CET-4/6 writing examiner writing a reference essay that would score 13-15/15.',
      'Requirements:',
      '1) Answer the prompt exactly; state a clear position in the first two sentences.',
      '2) Three-part structure: opening with position, two developed body arguments (each with a concrete example or reason), and a conclusion that restates the position with a practical suggestion.',
      '3) Use varied sentence patterns: at least one cleft or inversion, one relative clause, one participle phrase, and one concession (while/although/though) with a rebuttal.',
      '4) Precise collocations; no memorised template clichés (avoid "with the rapid development of society", "every coin has two sides", "As we all know").',
      '5) Do not copy the prompt wording; paraphrase it.',
      '6) Word count: CET-4 140-160, CET-6 170-190. Grammar must be flawless, spelling exact.',
      'Return ONLY the essay text, no title, no notes, no word count.'
    ].join('\n');
    const raw = await chat('Prompt:\n' + String(promptText || '').slice(0, 2000), { system: sys, maxTokens: 1200, safety: true, timeoutMs: 120000 });
    return String(raw || '').trim();
  }

  /* 按中文原文生成一篇参考译文。 */
  async function composeTranslation(promptText, level) {
    const sys = 'You are a CET-4/6 translation grader. Translate the given Chinese passage into one natural, exam-ready English version. Match the register of a high-scoring CET-4/6 translation. Return ONLY the English translation, no notes.';
    const raw = await chat('Level: CET-' + (level === 6 ? '6' : '4') + '\nChinese passage:\n' + String(promptText || '').slice(0, 2000),
      { system: sys, maxTokens: 1200, safety: true, timeoutMs: 120000 });
    return String(raw || '').trim();
  }

  async function gradeExam(payload) {
    const level = payload && payload.level === 6 ? 'CET-6' : 'CET-4';
    const user = 'Level: ' + level + '\nPayload:\n' + JSON.stringify(payload).slice(0, 12000);
    const raw = await chat(user, { json: true, safety: true, system: GRADE_SYSTEM, temperature: 0 });
    const obj = parseJSON(raw);
    if (!obj) throw new Error('模型返回格式错误');
    return obj;
  }

  CET.AI = { hasKey, setKey, getConfig, setConfig, presets: () => PRESETS.slice(), PRESETS, handwritingOn, gradingOn, setFeature, ocrText, composeEssay, composeTranslation, marks, paper, gradeExam, gradeFromImages, ping, lastCall: () => lastCall };
})();
