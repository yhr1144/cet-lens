/* Main SPA: scan, dictionary, exam grading, favorites, profile. */
(function () {
  'use strict';
  const CET = window.CET;
  const Dict = CET.Dict;
  const Grader = CET.Grader;
  const OCR = CET.OCR;
  const state = CET.state;
  const $ = CET.$;
  const $$ = CET.$$;
  const esc = CET.esc;

  const TYPE_LABEL = {
    word: '单词', phrase: '词组', sentence: '句子', syn: '同义替换',
    adv: '高级表达', example: '例句', translation: '翻译', essay: '范文',
    feedback: '批改建议', report: '判分报告', pattern: '句式', template: '模板', article: '短文'
  };
  const CAT_LABEL = {
    opinion: '观点', topic: '话题', cause: '原因', effect: '结果',
    contrast: '转折对比', addition: '递进', example: '举例',
    suggestion: '建议', conclusion: '结论', degree: '程度',
    letter: '书信', culture: '文化热点', collocation: '词块'
  };
  const SECTION_LABEL = {
    essayText: '作文', essayPrompt: '作文题目', translationText: '译文',
    translationPrompt: '翻译原文', translationRef: '参考译文',
    translationText: '翻译译文',
    listeningKey: '听力标准答案', listeningMine: '听力我的答案', listeningMarks: '听力对号叉号',
    readingKey: '阅读标准答案', readingMine: '阅读我的答案', readingMarks: '阅读对号叉号'
  };
  const SECTION_OF = {
    essayText: 'writing', essayPrompt: 'writing',
    translationText: 'translation', translationPrompt: 'translation', translationRef: 'translation',
    listeningKey: 'listening', listeningMine: 'listening', listeningMarks: 'listening',
    readingKey: 'reading', readingMine: 'reading', readingMarks: 'reading'
  };
  const SYN_BLOCK = {
    good: ['full', 'goodness'],
    cope: ['header', 'coping'],
    abandon: ['wildness', 'wantonness', 'unconstraint']
  };
  const THEMES = [
    { id: 'study', name: '学习·教育', keys: ['学习', '教育', '学校', '学生', '知识', '课程', '阅读', '写作', '考试', '大学', '教师', '研究', ' academic', 'study', 'learn', 'education'] },
    { id: 'tech', name: '科技·网络', keys: ['技术', '科技', '计算机', '网络', '数据', '数字', '人工智能', '信息', '软件', '手机', '互联网', ' technology', 'digital', 'computer', 'internet', 'data'] },
    { id: 'society', name: '社会·文化', keys: ['社会', '文化', '政府', '国家', '城市', '社区', '传统', '节日', '历史', '法律', '媒体', ' society', 'culture', 'government', 'tradition'] },
    { id: 'economy', name: '经济·工作', keys: ['经济', '商业', '工作', '职业', '公司', '市场', '金融', '就业', '管理', '产业', ' economy', 'business', 'career', 'market', 'finance'] },
    { id: 'environment', name: '环境·健康', keys: ['环境', '自然', '污染', '气候', '能源', '健康', '疾病', '医疗', '运动', '食物', ' environment', 'health', 'climate', 'nature'] },
    { id: 'emotion', name: '情感·评价', keys: ['情感', '喜欢', '爱', '快乐', '悲伤', '害怕', '重要', '好', '坏', '美', '评价', '态度', ' emotion', 'important', 'good', 'bad', 'happy'] },
    { id: 'action', name: '成长·行为', keys: ['认为', '思考', '选择', '决定', '行动', '解决', '帮助', '改变', '发展', '提高', '机会', '挑战', '目标', '未来', '能力', '技能', '经验', '成功', '失败', '进步', ' behavior', 'think', 'choose', 'solve', 'change', 'develop', 'opportunity', 'challenge', 'skill', 'ability'] }
  ];

  let reports = [];
  let scanSaveTimer = null;
  let examSaveTimer = null;
  let favSearchTimer = null;
  let bootDone = false;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    const nativeShell = location.search.indexOf('native=1') >= 0;
    if (nativeShell) {
      document.body.classList.add('native-shell');
      const m = location.hash.match(/tab=(scan|dict|exam|favorites|me)/);
      if (m) state.tab = m[1];
    } else {
      try {
        const lastTab = CET.store.get('cet46:lastTab', 'scan');
        if (['scan', 'dict', 'exam', 'favorites', 'me'].includes(lastTab)) state.tab = lastTab;
      } catch (e) {}
    }
    renderTopbar();
    renderTabbar();
    try {
      await Dict.load(updateBoot);
      CET.FullDict.init();
    } catch (e) {
      console.error(e);
      $('#boot').innerHTML = '<div class="boot-logo">!</div><div class="boot-title">词库加载失败</div><div class="boot-sub">' +
        esc(e && e.message ? e.message : '请重新打开应用') + '</div>';
      return;
    }
    state.daily = pickDaily();
    state.exam = loadExam();
    state.exam.markRule = 'redWrong';
    if (!String(state.exam.essayText || '').trim() && !String(state.exam.translationText || '').trim() && !String(state.exam.paperMarks || '').trim()) {
      state.exam.paperResult = null;
    }
    reports = CET.store.get('cet46:reports', []);
    const last = CET.store.get('cet46:lastscan', null);
    if (last && last.text) {
      state.scan = {
        text: cleanScanText(last.text),
        confidence: last.confidence || 0,
        at: last.at || Date.now(),
        source: '上次扫描',
        tokens: Dict.tokenize(cleanScanText(last.text)),
        showImage: false
      };
    }
    CET.applySettings();
    render();
    bindGlobal();
    setTimeout(() => {
      $('#boot').classList.add('hide');
      bootDone = true;
    }, 180);
  }

  function updateBoot(p, label) {
    const sub = $('#boot .boot-sub');
    if (sub) sub.textContent = label ? label + ' …' : '正在准备离线词库与 OCR …';
  }

  function pickDaily() {
    return Dict.randomDaily() || { head: 'learning', entry: Dict.get('learning') };
  }

  /* ============================================================ shell */
  function renderTopbar() {
    const el = $('#topbar');
    if (!el) return;
    el.innerHTML =
      '<div class="topbar-inner">' +
        '<div class="brand-logo"><img src="favicon.png" alt=""></div>' +
        '<div class="brand-text">' +
          '<div class="brand-name">CET Lens</div>' +
          '<div class="brand-sub">CET-4/6 · LENS</div>' +
        '</div>' +
      '</div>';
  }

  function renderTabbar() {
    const tabs = [
      ['scan', '扫描', 'scan'],
      ['dict', '词库', 'book'],
      ['exam', '判分', 'exam'],
      ['favorites', '收藏', 'star'],
      ['me', '设置', 'user']
    ];
    const el = $('#tabbar');
    if (!el) return;
    el.innerHTML = '<div class="tabbar-inner">' + tabs.map((t) =>
      '<button class="tab-item ' + (state.tab === t[0] ? 'active' : '') + '" data-tab="' + t[0] + '" aria-label="' + t[1] + '">' +
        '<span class="tab-ico">' + CET.icon(t[2]) + '</span><span>' + t[1] + '</span>' +
      '</button>').join('') + '</div>';
  }

  /** Tabs whose content supports the per-screen Chinese mask. */
  function scopeForTab(tab) {
    return ['scan', 'dict', 'favorites', 'reading', 'patterns'].includes(tab) ? tab : '';
  }

  /** Open the view wrapper that carries the mask scope, so list-only re-renders keep it. */
  function viewPageOpen(scope) {
    return '<div class="view-page' + (scope ? ' recite-scope' : '') + '"' +
      (scope ? ' data-recite-scope="' + scope + '"' : '') + '>';
  }

  function render(scroll) {
    renderTopbar();
    renderTabbar();
    const main = $('#main');
    if (!main) return;
    main.innerHTML = viewPageOpen(scopeForTab(state.tab)) + viewFor(state.tab) + '</div>';
    if (scroll !== false) window.scrollTo({ top: 0, behavior: 'auto' });
    if (state.tab === 'exam') afterRenderExam();
    CET.applyReciteScopes();
  }

  function transitionRender(dir, scroll) {
    render(scroll);
    const page = document.querySelector('#main .view-page');
    if (!page || !page.animate) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = dir === 'left' ? -8 : 8;
    page.animate(
      [{ opacity: .55, transform: 'translate3d(' + x + 'px, 6px, 0) scale(.997)' }, { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }],
      { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
  }

  function go(tab) {
    if (!['scan', 'dict', 'exam', 'favorites', 'me', 'patterns', 'reading'].includes(tab)) return;
    if (state.tab === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (tab === 'patterns' && state.tab !== 'patterns') {
      state.patternCat = 'all';
      state.patternLevel = 'all';
      state.patternQuery = '';
    }
    if (!state._navBack) {
      if (!state.navHistory) state.navHistory = [];
      if (state.tab !== tab) state.navHistory.push(state.tab);
      if (state.navHistory.length > 20) state.navHistory.shift();
    }
    const oldTab = state.tab;
    state.tab = tab;
    if (['scan', 'dict', 'exam', 'favorites', 'me'].includes(tab)) {
      try { CET.store.set('cet46:lastTab', tab); } catch (e) {}
    }
    const order = ['scan', 'dict', 'exam', 'favorites', 'me'];
    let dir = state._navDir;
    if (!dir) {
      const a = order.indexOf(oldTab), b = order.indexOf(tab);
      dir = (a >= 0 && b >= 0 && b < a) ? 'left' : 'right';
    }
    state._navDir = null;
    transitionRender(dir, true);
    CET.haptic(6);
  }
  CET.go = go;

  function goBack() {
    if (state.tab === 'reading' && state.articleFolder) {
      state.articleFolder = null;
      state.articleQuery = '';
      transitionRender('left', false);
      CET.haptic(6);
      return true;
    }
    if (!state.navHistory || !state.navHistory.length) return false;
    const prev = state.navHistory.pop();
    if (!prev || prev === state.tab) return false;
    state._navBack = true;
    state._navDir = 'left';
    go(prev);
    state._navBack = false;
    return true;
  }

  CET.goBack = goBack;
  CET.backReadingRoot = function () {
    state.articleFolder = null;
    state.articleQuery = '';
    transitionRender('left', false);
  };

  /* Horizontal swipe: main tabs switch, nested screens go back one level. */
  (function installSwipeTabs() {
    const order = ['scan', 'dict', 'exam', 'favorites', 'me'];
    let sx = 0, sy = 0, st = 0, pid = null, tracking = false, fired = false;
    const ignore = (el) => !!(el && el.closest && el.closest(
      'input,textarea,select,.chip-scroll,.scan-thumbs,.exam-mark-grid,.modal,.sheet,.no-swipe'
    ));
    const finish = (dx, dy) => {
      if (Date.now() - st > 900) return;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      /* 往哪边划就去哪边的页面：左划 = 左边那个 tab，右划 = 右边那个 tab。
         返回只走系统侧边手势 / 左上角返回，不占用滑动。 */
      const idx = order.indexOf(state.tab);
      if (idx < 0) return;
      /* 左划 = 右边那个页面（下一个 tab），右划 = 左边那个页面（上一个 tab）。 */
      const next = dx < 0 ? idx + 1 : idx - 1;
      if (next >= 0 && next < order.length) go(order[next]);
    };
    const move = (x, y, prevent) => {
      if (!tracking || fired) return;
      const dx = x - sx, dy = y - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (prevent) { /* horizontal gesture */ }
      fired = true;
      tracking = false;
      pid = null;
      finish(dx, dy);
    };
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      if (ignore(e.target)) { tracking = false; return; }
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true; fired = false; const m0 = $('#main'); if (m0) m0.style.transform = '';
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', function (e) {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (e.cancelable) e.preventDefault();
        move(t.clientX, t.clientY, true);
      } else if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        const mm = $('#main');
        if (mm) {
          const pull = Math.max(-22, Math.min(22, dx * 0.28));
          mm.style.transform = 'translate3d(' + pull + 'px, 0, 0)';
        }
      }
    }, { passive: false, capture: true });
    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const m1 = $('#main'); if (m1) m1.style.transform = '';
      finish(t.clientX - sx, t.clientY - sy);
    }, { passive: true, capture: true });
    document.addEventListener('touchcancel', function () { tracking = false; fired = false; const mc = $('#main'); if (mc) mc.style.transform = ''; }, { passive: true, capture: true });
  })();

  function viewFor(tab) {
    if (tab === 'reading') return renderReading();
    if (tab === 'patterns') return renderPatterns();
    if (tab === 'dict') return renderDict();
    if (tab === 'exam') return renderExam();
    if (tab === 'favorites') return renderFavorites();
    if (tab === 'me') return renderMe();
    return renderScan();
  }

  /* ============================================================ scan */
  function renderScan() {
    return '' +
      '<section class="hero">' +
        '<button class="hero-mode-note" data-action="mode-help"><b>离线 OCR</b>：不联网·免费<br><b>云端 OCR</b>：联网·按页计费</button>' +
        '<span class="hero-eyebrow">' + CET.icon('sparkles') + ' CET-4/6 · 离线精读</span>' +
        '<h1>拍一下，<br>读懂英文</h1>' +
        '<p>识别重点单词、词组与短语，给出中文释义、同义替换和更高级表达。所有内容可收藏。</p>' +
        '<div class="hero-actions">' +
          '<button class="btn btn-white" data-action="camera">' + CET.icon('camera') + '相机扫描</button>' +
          '<button class="btn btn-ghost-light" data-action="gallery">' + CET.icon('image') + '相册</button>' +
        '</div>' +
        '<div class="hero-meta"><span>' + CET.icon('shield') + ' 本机 OCR</span><span>' + CET.icon('book') + ' 768,610 词库</span></div>' +
      '</section>' +
      '<div class="stats">' +
        '<div class="stat accent"><b>' + (state.stats.scans || 0) + '</b><span>累计扫描</span></div>' +
        '<div class="stat"><b>' + CET.fav.count() + '</b><span>收藏内容</span></div>' +
        '<div class="stat"><b>' + (state.stats.grades || 0) + '</b><span>判分次数</span></div>' +
      '</div>' +
      '<section class="section" id="scan-result-section">' +
        '<div class="section-head"><h2>扫描精读</h2>' +
          '<div class="row">' +
            '<button class="link" data-action="toggle-handwriting" style="' + (state.scanHandwriting ? 'color:var(--blue-700);font-weight:800' : '') + '">' + (state.scanHandwriting ? '云端 OCR' : '离线 OCR') + '</button>' +
            (state.scan ? '<button class="link" data-action="clear-scan">清除</button>' : '') +
          '</div>' +
        '</div>' +
        (state.scan ? (state.scan.status === 'ocr' ? scanProgressHtml() : scanResultHtml()) : scanEmptyHtml()) +
      '</section>' +
      '<section class="section"><button class="card pattern-entry" data-action="patterns" style="width:100%;text-align:left">' +
        '<div class="row"><span class="menu-icon">' + CET.icon('quote') + '</span><div class="grow"><b style="font-size:14px">满分句式库</b>' +
          '<div class="tiny muted mt6">144 个高分句式 · 8 套范文模板 · 可直接搜索查阅</div></div>' + CET.icon('chevronRight') + '</div>' +
      '</button></section>' +
      '<section class="section"><button class="card daily-read" data-action="reading" style="width:100%;text-align:left">' +
        '<div class="row"><span class="menu-icon">' + CET.icon('book') + '</span><div class="grow"><b style="font-size:14px">语境精读</b>' +
          '<div class="tiny muted mt6">' + (state.articles && state.articles.articles ? articles().length + ' 篇' : '短文阅读') + '</div></div>' + CET.icon('chevronRight') + '</div>' +
      '</button></section>' +
      '<section class="section"><details class="fold notice-card">' +
        '<summary>两种 OCR 模式 <span class="cat-count">手写请用云端 OCR</span></summary>' +
        '<div class="fold-body">' +
          '<div class="notice-row"><b>离线 OCR（默认）</b>' +
            '<span>照片只在本机处理：ML Kit，不联网、免费、1–2 秒。印刷体（书页、试卷、屏幕截图）够用；<b>手写连笔容易认错</b>。</span></div>' +
          '<div class="notice-row"><b>云端 OCR</b>' +
            '<span>调用 DeepSeek 的 OCR 接口，需要联网和你自己填的 API Key。手写、连笔、横线纸更稳，一页约 2–3 秒，<b>按页计费约 ¥0.0016</b>。划掉的词会一起转出来，需要自己删。<b>手写作文、翻译、笔记建议用这个。</b></span></div>' +
          '<div class="callout mt10">花费（按 DeepSeek 官方价，¥7.1/$）：<br>' +
          '<b>离线 OCR</b>：¥0，手机本地算。<br>' +
          '<b>云端 OCR</b>：一页约 ¥0.0016；拍作文 + AI 批改一次约 ¥0.007–0.013（谷时更便宜）。<br>' +
          '<b>轻度</b>（每天扫 1 页、每周批改 1 次）≈ ¥0.08/月<br>' +
          '<b>中度</b>（每天扫 3 页、每周批改 3 次）≈ ¥0.24/月<br>' +
          '<b>重度</b>（每天扫 10 页、每天批改 1 次）≈ ¥0.72/月<br>' +
          '充 6 元：中度可用两年左右，重度也能撑 8 个月。App 本身免费，<b>开发者不从识别或批改里拿任何分成或返利</b>，每次调用都走你自己的 Key，费用记在你的账号下，价格以 platform.deepseek.com 为准。</div>' +
        '</div></details></section>';
  }

  function dailyCard(word, entry) {
    const item = {
      type: 'word', term: word, sub: Dict.firstZh(entry), source: '每日一词',
      payload: { word, syn: Array.isArray(entry.y) ? entry.y.slice(0, 10) : [] }
    };
    return '<article class="daily-card">' +
      '<div class="row" style="align-items:flex-start">' +
        '<div class="grow">' +
          '<div class="daily-word">' + esc(word) + '</div>' +
          '<div class="daily-phon">' + esc(entry.p || '') + (Dict.levelLabel(entry) ? ' · ' + Dict.levelLabel(entry) : '') + '</div>' +
        '</div>' +
        '<div class="daily-actions">' +
          '<button class="icon-btn small" data-speak="' + CET.escAttr(word) + '" aria-label="朗读">' + CET.icon('volume') + '</button>' +
          CET.fav.button(item) +
        '</div>' +
      '</div>' +
      '<div class="daily-zh"><span class="zh-mask">' + esc(Dict.firstZh(entry) || '点击查看完整释义') + '</span></div>' +
      '<div class="daily-foot">' +
        '<div class="chips">' + levelBadge(entry) + (entry.o ? '<span class="badge gold">牛津核心</span>' : '') + '</div>' +
        '<button class="btn btn-soft btn-sm" data-open-word="' + CET.escAttr(word) + '">查看详解 ' + CET.icon('chevronRight') + '</button>' +
      '</div>' +
    '</article>';
  }


  function lensMascot(text) {
    return '<div class="lens-buddy"><img class="lens-avatar" src="favicon.png" alt="">' +
      '<div class="lens-bubble">' + esc(text) + '</div></div>';
  }

  function scanEmptyHtml() {
    return '<div class="empty">' +
      lensMascot('把书页交给我，我帮你把长难句拆开。') +
      '<h3>还没有扫描记录</h3>' +
      '<p>对准英文书页、试卷或屏幕拍一张，识别后会自动整理重点词与词组。</p>' +
    '</div>';
  }

  function scanProgressHtml() {
    const p = Math.max(0, Math.min(100, Math.round((state.scan.progress || 0) * 100)));
    return '<div class="scan-progress" id="scan-progress">' +
      '<div class="ring"></div>' +
      '<div class="grow"><b id="ocr-status">' + esc(state.scan.progressLabel || '正在识别') + '</b><span>本机 OCR 识别</span></div>' +
      '<div class="pct" id="ocr-pct">' + p + '%</div>' +
    '</div>' +
    '<div class="card card-tight mt10"><div class="token-text" style="opacity:.55">识别完成后，这里会出现可点击的单词、词组和重点词卡。</div></div>' +
    '<div class="tool-row"><button class="btn btn-outline btn-sm" data-action="cancel-ocr">取消识别</button></div>';
  }

  function scanResultHtml() {
    const scan = state.scan;
    const item = {
      type: 'sentence', term: scan.text.slice(0, 240) + (scan.text.length > 240 ? '…' : ''),
      sub: '扫描全文', source: '扫描精读', payload: { text: scan.text }
    };
    return '' +
      '<div class="result-toolbar">' +
        '<div class="grow"><div class="result-title">识别结果</div><div class="confidence">' +
          (scan.source || '扫描') + ' · 置信度 ' + (scan.confidence || 0) + '%' + (scan.elapsed > 0 ? ' · ' + Number(scan.elapsed).toFixed(1) + ' 秒' : '') + (scan.model ? ' · ' + scan.model : '') + (scan.strips ? ' · 各段 ' + scan.strips + 's' : '') + (scan.passes > 1 ? ' · ' + scan.passes + ' 块' : '') + (scan.pages ? ' · 共 ' + scan.pages.length + ' 页' : '') + (scan.at ? ' · ' + CET.fmtDate(scan.at) : '') +
        (scan.corrections ? '<div class="tiny muted mt2">语境自动纠正 ' + scan.corrections + ' 处</div>' : '') +
        (scan.noise ? '<div class="tiny muted mt2">乱码过滤 ' + scan.noise + ' 行</div>' : '') + '</div></div>' +
        '<button class="link" data-action="cycle-highlight" aria-label="高亮密度">高亮：' + CET.highlightLabel() + '</button>' +
      '</div>' +
      (scan.ocrError ? '<div class="callout warn mb12">' + CET.icon('info') + ' OCR 接口失败：<b>' + esc(scan.ocrError) + '</b>，本次改用视觉模型识别。' + '</div>' : '') +
      (state.scanError ? '<div class="callout warn mb12">' + CET.icon('info') + ' 上次识别失败：<b>' + esc(state.scanError) + '</b>。可重拍一张，或切到离线 OCR。</div>' : '') +
      (scan.risky ? '<div class="callout warn mb12">' + CET.icon('info') + ' 有 <b>' + scan.risky + '</b> 行可能识别不准（多半是被裁掉的半行或接缝处）。重新拍一张会更准。' + '</div>' : '') +
      (scan.image && scan.showImage ? '<div class="image-preview mb12" id="image-preview"><img src="' + scan.image + '" alt="扫描图片"><div class="scan-line"></div></div>' : '') +
      '<article class="card"><div class="token-text" id="scan-token-text">' + Dict.tokensToHtml(scan.tokens || Dict.tokenize(scan.text), { level: state.highlightLevel }) + '</div>' +
        '<div class="tiny muted mt6">点击任意单词查词</div>' +
        (scan.clean && (scan.clean.colored || scan.clean.lines || scan.clean.components) ? '<div class="tiny muted mt6">已先清理笔迹/线条：彩色 ' + (scan.clean.colored || 0) + ' 像素 · 线条 ' + (scan.clean.lines || 0) + ' · 圈线 ' + (scan.clean.components || 0) + '</div>' : '') +
        '<div class="tool-row">' +
        (scan.image ? '<button class="btn btn-ghost btn-sm" data-action="toggle-image">' + (scan.showImage ? '隐藏原图' : '查看原图') + '</button>' : '') +
        '<button class="btn btn-ghost btn-sm" data-action="copy-scan">' + CET.icon('copy') + '复制文本</button>' +
        (scan.image ? '<button class="btn btn-ghost btn-sm" data-action="crop-scan">' + CET.icon('crop') + '调整裁剪</button>' : '') +
        '<span class="right">' + CET.fav.button(item, 'small') + '</span></div>' +
      '</article>';
  }

  function sentencesHtml(text) {
    const sents = Dict.splitSentences(text).slice(0, 6);
    if (!sents.length) return '';
    return '<div class="section-head" style="margin-top:20px"><h2>句子精读</h2><span class="tiny muted">点开逐句看</span></div>' +
      sents.map((s, i) => {
        const item = { type: 'sentence', term: s, sub: '扫描句子', source: '扫描精读', payload: { text: s } };
        return '<article class="sentence-card">' +
          '<div class="s-en">' + Dict.tokensToHtml(Dict.tokenize(s), { level: state.highlightLevel }) + '</div>' +
          '<div class="row mt6"><span class="tiny muted">第 ' + (i + 1) + ' 句</span>' +
            '<div class="right row">' +
              '<button class="icon-btn small" data-speak="' + CET.escAttr(s) + '" aria-label="朗读句子">' + CET.icon('volume') + '</button>' +
              CET.fav.button(item, 'small') +
              '<button class="btn btn-ghost btn-sm" data-open-sentence="' + CET.escAttr(s) + '">精读</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join('');
  }

  function wordRow(head, entry, source, ctx) {
    const pick = Dict.pickSenses(entry, ctx);
    const primary = pick.list[0] || null;
    const zh = primary && primary.zh.length ? primary.zh.slice(0, 3).join('；') : Dict.firstZh(entry);
    const contextual = pick.hit > 0;
    const item = {
      type: 'word', term: head, sub: zh, source: source || '词库',
      payload: { word: head, syn: Array.isArray(entry.y) ? entry.y.slice(0, 10) : [] }
    };
    return '<article class="word-row" data-open-word="' + CET.escAttr(head) + '">' +
      '<div class="word-row-main">' +
        '<div class="word-row-top"><span class="word-en">' + esc(head) + '</span>' + levelBadge(entry) + '</div>' +
        (entry.p ? '<div class="word-phon">' + esc(entry.p) + '</div>' : '') +
        '<div class="word-zh"><span class="zh-mask">' + esc(zh || '点击查看释义') + '</span>' +
          (contextual ? '<span class="badge soft" style="margin-left:6px">本句义</span>' : '') + '</div>' +
      '</div>' +
      '<div class="word-row-side">' +
        '<button class="icon-btn small" data-speak="' + CET.escAttr(head) + '" aria-label="朗读">' + CET.icon('volume') + '</button>' +
        CET.fav.button(item, 'small') +
      '</div>' +
    '</article>';
  }

  function phraseRow(p, source) {
    const item = {
      type: 'phrase', term: p.p, sub: p.zh, source: source || '词组库',
      payload: { phrase: p.p }
    };
    return '<article class="word-row" data-open-phrase="' + CET.escAttr(p.p) + '">' +
      '<div class="word-row-main">' +
        '<div class="word-row-top"><span class="word-en" style="font-size:17px">' + esc(p.p) + '</span><span class="badge soft">' + (p.lvl === 6 ? '六级短语' : p.lvl === 4 ? '四级短语' : esc(CAT_LABEL[p.cat] || '词组')) + '</span></div>' +
        '<div class="word-zh"><span class="zh-mask">' + esc(p.zh) + '</span></div>' +
      '</div>' +
      '<div class="word-row-side">' +
        '<button class="icon-btn small" data-speak="' + CET.escAttr(p.p) + '" aria-label="朗读">' + CET.icon('volume') + '</button>' +
        CET.fav.button(item, 'small') +
      '</div>' +
    '</article>';
  }

  function levelBadge(entry) {
    const text = Dict.levelLabel(entry);
    if (!text) return '<span class="badge lv0">核心词</span>';
    return '<span class="badge ' + Dict.levelClass(entry) + '">' + text + '</span>';
  }

  function reciteButtonHtml() {
    const on = CET.reciteOn('dict');
    return '<button class="btn btn-sm ' + (on ? 'btn-reciting' : 'btn-outline') + '" data-action="toggle-recite" data-scope="dict">' +
      CET.icon(on ? 'eyeOff' : 'eye') + (on ? '遮盖中' : '背诵模式') + '</button>';
  }

  function posName(pos) {
    const p = String(pos || '').toLowerCase();
    if (p.startsWith('v')) return '动词';
    if (p.startsWith('n')) return '名词';
    if (p.startsWith('a')) return '形容词';
    if (p.startsWith('ad')) return '副词';
    return '该词性';
  }

  function synonymContext(head, entry) {
    const senses = Dict.senses(entry);
    const pos = senses.length ? senses[0].pos : '';
    const tag = String(entry.t || '');
    let register = '通用语境';
    if (/gre|toefl|ielts|ky/.test(tag)) register = '学术 / 正式写作';
    else if (/cet6/.test(tag)) register = '正式书面';
    else if (/cet4/.test(tag)) register = '通用书面';
    const zh = Dict.firstZh(entry);
    let domain = '';
    if (/重要|关键|必要|必不可少/.test(zh)) domain = '强调重要性 / 必要性';
    else if (/大量|许多|众多|数量|比例/.test(zh)) domain = '描述数量 / 比例';
    else if (/有益|有利|促进|优势/.test(zh)) domain = '说明益处 / 有利条件';
    else if (/有害|不利|损害|缺点/.test(zh)) domain = '说明危害 / 不利影响';
    else if (/导致|引起|带来|结果|后果/.test(zh)) domain = '分析因果 / 结果';
    else if (/认为|相信|观点|看法|主张/.test(zh)) domain = '议论文观点句';
    else if (/人|社会|技术|教育|环境|经济|文化|健康/.test(zh)) domain = '社会话题讨论';
    return register + '；作' + posName(pos) + '时' + (domain ? '，多用于' + domain : '') + '；替换前确认搭配与褒贬';
  }

  function advContext(head, a) {
    if (a && a.ctx) return a.ctx;
    const zh = String((a && a.zh) || '');
    const tag = String((Dict.get(head) || {}).t || '');
    let domain = '';
    if (/重要|关键|必要| paramount|至关重要/.test(zh)) domain = '强调重要性 / 必要性';
    else if (/大量|许多|众多|数量|比例/.test(zh)) domain = '描述数量 / 比例';
    else if (/有益|有利|促进|优势/.test(zh)) domain = '说明益处 / 有利条件';
    else if (/有害|不利|损害|缺点/.test(zh)) domain = '说明危害 / 不利影响';
    else if (/认为|相信|观点|看法|主张/.test(zh)) domain = '议论文观点句';
    else if (/导致|引起|带来|结果|后果/.test(zh)) domain = '分析因果 / 结果';
    else if (/改善|提升|优化|增加|减少|变化/.test(zh)) domain = '说明变化 / 措施';
    else if (/人|社会|技术|教育|环境|经济|文化|健康/.test(zh)) domain = '社会话题讨论';
    return '正式写作' + (domain ? ' / ' + domain : '') + '；注意词性、搭配与语体';
  }

  function phraseContext(p) {
    const cat = CAT_LABEL[p.cat] || '通用表达';
    return '适用语境：' + cat + ' / 正式书面；注意主语、时态和固定搭配';
  }

  /* ---------------- scan actions ---------------- */
  function cleanScanText(input) {
    const lines = String(input || '').replace(/\r/g, '').split('\n');
    const out = [];
    for (let line of lines) {
      line = line.replace(/[ \t]+/g, ' ').trim();
      if (!line) continue;
      line = line.replace(/\s+([,.;:!?])/g, '$1');
      line = line.replace(/([,.;:!?])(?=[A-Za-z])/g, '$1 ');
      line = mergeBrokenTokens(line);
      out.push(line);
    }
    return out.join('\n').trim();
  }

  /**
   * OCR sometimes splits one word in two ("with t me set aside" = "time").
   * Rejoin a stray single letter with its neighbour when the joined word is in
   * the dictionary — otherwise leave the text exactly as recognised.
   */
  function mergeBrokenTokens(line) {
    return line.replace(/\b([A-Za-z])\s+([A-Za-z]{2,})\b/g, function (all, one, rest) {
      if (!Dict.loaded) return all;
      const joined = (one + rest).toLowerCase();
      if (!Dict.words[joined]) return all;
      if (Dict.words[one.toLowerCase()] && !Dict.isStop(one)) return all;
      return one + rest;
    });
  }

  /** Count lines that look mis-recognised (junk casing or mostly unknown words). */
  function scanRiskyLines(text) {
    const lines = String(text || '').split('\n').filter((l) => l.trim().length > 10);
    if (!Dict.loaded) return 0;
    let risky = 0;
    for (const line of lines) {
      const words = line.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || [];
      if (words.length < 4) continue;
      const junkCase = words.filter((w) => /[a-z][A-Z]/.test(w)).length;
      if (junkCase >= 2) { risky++; continue; }
      /* A stray single letter ("with t me set aside") is almost always a split word. */
      if (words.some((w) => w.length === 1 && !/^[aAiI]$/.test(w))) { risky++; continue; }
      let unknown = 0;
      for (const w of words) {
        if (Dict.isStop(w.toLowerCase())) continue;
        if (!Dict.lookup(w)) unknown++;
      }
      if (unknown / words.length >= 0.45) risky++;
    }
    return risky;
  }

  async function runScanOcr(dataUrl, force) {
    if (!force && state.scan && state.scan.text && state.scan.status !== 'ocr') {
      CET.confirm('覆盖当前扫描？', '当前扫描结果还未清除，继续会覆盖旧结果。', function () {
        runScanOcr(dataUrl, true);
      });
      return;
    }
    state.scanError = '';
    state.scan = {
      status: 'ocr', image: dataUrl, progress: 0,
      progressLabel: '准备识别', source: '相机扫描', tokens: []
    };
    if (state.tab !== 'scan') go('scan'); else render();
    CET.keepAwake(true);
    try {
      const wantsAI = !!state.scanHandwriting;
      const hasKey = !!(CET.AI && CET.AI.hasKey());
      console.log('scan start wantsAI=' + wantsAI + ' hasKey=' + hasKey + ' model=' + (CET.AI ? CET.AI.getConfig().model : ''));
      if (wantsAI && !hasKey) CET.toast('云端 OCR 需要先在「设置 → AI 模型」配置 Key，本次用离线 OCR');
      const res = (wantsAI && hasKey)
        ? await OCR.recognizeScanHandwriting(dataUrl, (p) => updateOcrProgress(p))
        : await OCR.recognizeScan(dataUrl, (p) => updateOcrProgress(p));
      const repaired = CET.ScanContext ? CET.ScanContext.repair(res.text || '') : { text: res.text || '', changes: 0 };
      const text = cleanScanText(repaired.text || res.text || '');
      if (!text) {
        state.scan = null;
        render();
        CET.toast('没有识别到文字，请调整角度或光线');
        return;
      }
      state.scan = {
        text,
        confidence: res.confidence,
        image: dataUrl,
        at: Date.now(),
        source: res.engine === 'ocr-api' ? '云端 OCR' : (res.engine === 'mlkit' ? '离线 OCR' : 'OCR'),
        tokens: Dict.tokenize(text),
        showImage: true,
        elapsed: res.elapsed,
        model: res.model || '',
        ocrError: res.ocrError || '',
        strips: res.strips || '',
        clean: res.clean || null,
        noise: res.noise || 0,
        passes: res.passes || 1,
        risky: scanRiskyLines(text),
        corrections: repaired.changes || 0
      };
      state.stats.scans++;
      CET.saveStats();
      CET.store.set('cet46:lastscan', { text, confidence: res.confidence, at: state.scan.at });
      render();
      CET.toast('识别完成 · ' + text.split(/\s+/).length + ' 词');
      setTimeout(() => {
        const el = $('#scan-result-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (e) {
      console.error(e);
      state.scan = null;
      render();
      state.scanError = (e && e.message) ? e.message : '请重试';
      CET.toast('OCR 失败：' + state.scanError, 'red');
    } finally {
      stopOcrTicker();
      CET.keepAwake(false);
    }
  }

  /* AI 识别等模型要十几秒，进度条不动会像卡死；按秒刷新一行让等待可见。 */
  function startOcrTicker() {
    stopOcrTicker();
    const t0 = Date.now();
    state._ocrTicker = setInterval(() => {
      const b = $('#ocr-status');
      if (!b) return;
      const secs = (Date.now() - t0) / 1000;
      b.textContent = state.scan && state.scan.progressLabel ? state.scan.progressLabel + ' · ' + secs.toFixed(1) + 's' : secs.toFixed(1) + 's';
    }, 200);
  }
  function stopOcrTicker() {
    if (state._ocrTicker) { clearInterval(state._ocrTicker); state._ocrTicker = null; }
  }

  function updateOcrProgress(p) {
    if (!state.scan || state.scan.status !== 'ocr') return;
    state.scan.progress = p.progress || 0;
    state.scan.progressLabel = p.label || '识别中';
    const pct = Math.round(Math.max(0, Math.min(1, p.progress || 0)) * 100);
    const a = $('#ocr-pct'), b = $('#ocr-status');
    if (a) a.textContent = pct + '%';
    if (b) b.textContent = state.scan.progressLabel;
    if (String(p.label || '').indexOf('AI') === 0) startOcrTicker();
  }

  async function runOcrForInsert(dataUrl, target) {
    CET.keepAwake(true);
    CET.sheet.open({
      title: '识别中',
      sub: '正在处理' + (SECTION_LABEL[target] || '图片'),
      html: '<div class="scan-progress"><div class="ring"></div><div class="grow"><b id="insert-status">加载 OCR 引擎</b><span>图片仅在本机处理</span></div><div class="pct" id="insert-pct">0%</div></div>'
    });
    try {
      const res = await OCR.recognizeBest(dataUrl, (p) => {
        const a = $('#insert-pct'), b = $('#insert-status');
        if (a) a.textContent = Math.round(Math.max(0, Math.min(1, p.progress || 0)) * 100) + '%';
        if (b) b.textContent = p.label || '识别中';
      });
      if (!res.text) {
        CET.sheet.close();
        CET.toast('没有识别到文字');
        return;
      }
      openOcrInsertSheet(res.text, target);
    } catch (e) {
      console.error(e);
      CET.sheet.close();
      state.scanError = (e && e.message) ? e.message : '请重试';
      CET.toast('OCR 失败：' + state.scanError, 'red');
    } finally {
      stopOcrTicker();
      CET.keepAwake(false);
    }
  }

  function openOcrInsertSheet(text, target) {
    const label = SECTION_LABEL[target] || '文本';
    CET.sheet.open({
      title: '校对识别结果',
      sub: '确认后填入「' + label + '」',
      html: '<div class="pill-note mb12">OCR 可能有误差，尤其是手写体和复杂排版。请先修改，再填入。</div>' +
        '<textarea class="short" id="ocr-insert-text" style="min-height:240px">' + esc(text) + '</textarea>' +
        '<div class="tool-row"><button class="btn btn-primary btn-block" id="ocr-insert-ok">' + CET.icon('check') + '填入' + esc(label) + '</button></div>',
      onMount(body) {
        const ok = $('#ocr-insert-ok', body);
        if (ok) ok.addEventListener('click', function () {
          const val = $('#ocr-insert-text', body).value;
          state.exam[target] = val;
          const sec = SECTION_OF[target];
          if (sec) state.exam.open[sec] = true;
          saveExamNow();
          CET.sheet.closeAll();
          if (state.tab !== 'exam') go('exam'); else render(false);
          CET.toast('已填入 ' + label);
        });
      }
    });
  }

  function openScanSource(target) {
    CET.sheet.open({
      title: '识别' + (SECTION_LABEL[target] || ''),
      sub: '拍照或从相册选择',
      html: '<div class="grid-2">' +
        '<button class="btn btn-primary" data-scan-source="camera">' + CET.icon('camera') + '拍照</button>' +
        '<button class="btn btn-outline" data-scan-source="gallery">' + CET.icon('image') + '相册</button>' +
      '</div><div class="pill-note mt14">识别后可以校对文字，再决定是否填入。</div>',
      onMount(body) {
        body.querySelectorAll('[data-scan-source]').forEach((b) => {
          b.addEventListener('click', function () {
            const src = b.getAttribute('data-scan-source');
            state.pendingScanTarget = target;
            CET.sheet.close();
            if (src === 'camera') startCamera(); else startGallery();
          });
        });
      }
    });
  }




  function fallbackCamera() {
    if (window.CET46 && window.CET46.captureImage) {
      CET.toast('正在打开系统相机…');
      try { window.CET46.captureImage(); return; } catch (e) {}
    }
    const f = $('#fallback-file');
    if (f) { f.value = ''; f.click(); }
    else CET.toast('当前环境无法调用相机');
  }

  function startCamera() {
    fallbackCamera();
  }

  function startGallery() {
    if (window.CET46 && window.CET46.pickImage) {
      window.CET46.pickImage();
      return;
    }
    const f = $('#fallback-file');
    if (f) { f.removeAttribute('capture'); f.value = ''; f.click(); }
    else CET.toast('当前环境无法打开相册');
  }

  function cropDataUrl(dataUrl, pct) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const sx = Math.round(w * pct.left / 100), sy = Math.round(h * pct.top / 100);
        const sw = Math.max(20, Math.round(w * (1 - (pct.left + pct.right) / 100)));
        const sh = Math.max(20, Math.round(h * (1 - (pct.top + pct.bottom) / 100)));
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        try { resolve(c.toDataURL('image/jpeg', 0.98)); } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function detectPaperRect(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 560;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const d = ctx.getImageData(0, 0, w, h).data;
          const gray = new Uint8Array(w * h);
          const hist = new Uint32Array(256);
          for (let i = 0, j = 0; i < d.length; i += 4, j++) {
            const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            gray[j] = g; hist[g]++;
          }
          const total = w * h;
          let sum = 0;
          for (let t = 0; t < 256; t++) sum += t * hist[t];
          let sumB = 0, wB = 0, best = 0, thr = 175;
          for (let t = 0; t < 256; t++) {
            wB += hist[t]; if (!wB) continue;
            const wF = total - wB; if (!wF) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > best) { best = between; thr = t; }
          }
          thr = Math.max(110, Math.min(235, thr));
          const rowOn = new Float32Array(h), colOn = new Float32Array(w);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (gray[y * w + x] > thr) { rowOn[y]++; colOn[x]++; }
            }
          }
          const span = (arr, need, den) => {
            let a = -1, b = -1;
            for (let i = 0; i < arr.length; i++) {
              if (arr[i] / den > need) { if (a < 0) a = i; b = i; }
            }
            return a < 0 ? null : [a, b + 1];
          };
          const rs = span(rowOn, 0.35, w), cs = span(colOn, 0.35, h);
          if (!rs || !cs) { resolve(null); return; }
          const padX = 0.01, padY = 0.008;
          const top = Math.max(0, rs[0] / h - padY), bottom = Math.min(1, rs[1] / h + padY);
          const left = Math.max(0, cs[0] / w - padX), right = Math.min(1, cs[1] / w + padX);
          if ((right - left) < 0.2 || (bottom - top) < 0.2) { resolve(null); return; }
          resolve({ left: left * 100, right: (1 - right) * 100, top: top * 100, bottom: (1 - bottom) * 100 });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function layoutEngineRect(dataUrl, kind) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 800;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const d = ctx.getImageData(0, 0, w, h).data;
          const gray = new Uint8Array(w * h);
          const hist = new Uint32Array(256);
          for (let i = 0, j = 0; i < d.length; i += 4, j++) {
            const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            gray[j] = g; hist[g]++;
          }
          const total = w * h;
          let sum = 0;
          for (let t = 0; t < 256; t++) sum += t * hist[t];
          let sumB = 0, wB = 0, best = 0, thr = 165;
          for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (!wB) continue;
            const wF = total - wB;
            if (!wF) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > best) { best = between; thr = t; }
          }
          thr = Math.max(65, Math.min(205, thr));
          const ink = new Float32Array(h);
          for (let y = 0; y < h; y++) {
            let n = 0;
            for (let x = 0; x < w; x++) if (gray[y * w + x] < thr) n++;
            ink[y] = n / w;
          }
          const smooth = new Float32Array(h);
          for (let y = 1; y < h - 1; y++) smooth[y] = (ink[y - 1] + ink[y] * 2 + ink[y + 1]) / 4;
          const lines = [];
          let st = -1, last = -1;
          for (let y = 0; y < h; y++) {
            const on = smooth[y] > 0.008;
            if (on) { if (st < 0) st = y; last = y; }
            else if (st >= 0 && y - last > 3) {
              if (last - st > h * 0.004) lines.push([st, last]);
              st = -1;
            }
          }
          if (st >= 0 && last - st > h * 0.004) lines.push([st, last]);
          if (!lines.length) { resolve(null); return; }
          if (kind === 'translation') {
            let y0 = h * 0.70;
            for (const [a] of lines) { if (a > h * 0.58 && a < h * 0.86) { y0 = a; break; } }
            resolve({ left: 0.5, right: 0.5, top: y0 / h * 100, bottom: 1 });
            return;
          }
          const heights = lines.map(([a, b]) => b - a).sort((a, b) => a - b);
          const med = heights[Math.floor(heights.length * 0.55)] || 10;
          const heads = lines.filter(([a, b]) => (b - a) > med * 1.28);
          let startHead = null, endHead = null;
          if (kind === 'writing') {
            for (const ln of heads) {
              const p = ln[0] / h;
              if (p > 0.09 && p < 0.32 && (!startHead || Math.abs(p - 0.22) < Math.abs(startHead[0] / h - 0.22))) startHead = ln;
            }
            if (startHead) {
              for (const ln of heads) {
                const p = ln[0] / h;
                if (p > startHead[0] / h + 0.12 && p < 0.66 && (!endHead || Math.abs(p - 0.35) < Math.abs(endHead[0] / h - 0.35))) endHead = ln;
              }
            }
          }
          let y0 = lines[0][0], y1 = 0;
          if (startHead && endHead && endHead[0] > startHead[0] + h * 0.12) {
            y0 = startHead[0] - h * 0.006;
            y1 = endHead[0] - h * 0.004;
          } else {
            let bestScore = 1e9, target = h * 0.32;
            for (let i = 1; i < lines.length; i++) {
              const gap = lines[i][0] - lines[i - 1][1];
              if (lines[i][0] < h * 0.17 || lines[i][0] > h * 0.60) continue;
              if (gap < h * 0.008) continue;
              const sc = Math.abs(lines[i][0] - target) - Math.min(gap, h * 0.06) * 0.8;
              if (sc < bestScore) { bestScore = sc; y1 = lines[i - 1][1]; }
            }
            if (!y1) y1 = h * 0.36;
          }
          y0 = Math.max(0, y0);
          if (y1 - y0 < h * 0.12) { y0 = h * 0.10; y1 = h * 0.38; }
          resolve({ left: 0.5, right: 0.5, top: y0 / h * 100, bottom: Math.max(0, (1 - y1 / h) * 100) });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function detectLayoutSection(dataUrl, kind) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 520;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const d = ctx.getImageData(0, 0, w, h).data;
          const rowDark = new Array(h).fill(0);
          for (let y = 0; y < h; y++) {
            let n = 0;
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
              if (g < 190) n++;
            }
            rowDark[y] = n;
          }
          const blank = (y) => rowDark[y] < w * 0.012;
          if (kind === 'translation') {
            resolve({ left: 0.5, right: 0.5, top: 70, bottom: 1 });
            return;
          }
          let bands = [], st = null;
          for (let y = Math.round(h * 0.12); y < Math.round(h * 0.58); y++) {
            if (blank(y)) { if (st === null) st = y; }
            else if (st !== null) {
              if (y - st > h * 0.012) bands.push([st, y]);
              st = null;
            }
          }
          let cut = 0;
          const band = bands.find(([a, b]) => a > h * 0.15 && b - a > h * 0.012);
          if (band) cut = band[0] - h * 0.008;
          if (cut < h * 0.2) cut = h * 0.34;
          resolve({ left: 0.5, right: 0.5, top: 0.5, bottom: Math.max(0, (1 - cut / h) * 100) });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function detectSectionRect(dataUrl, kind) {
    return new Promise(async (resolve) => {
      if (kind !== 'writing' && kind !== 'translation') { resolve(null); return; }
      let res = null;
      try { res = await OCR.recognize(dataUrl); } catch (e) { resolve(await detectLayoutSection(dataUrl, kind)); return; }
      const words = (res && res.words) || [];
      if (!words.length) { resolve(await detectLayoutSection(dataUrl, kind)); return; }
      const load = (src) => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = fail; im.src = src; });
      let im;
      try { im = await load(res.processed || dataUrl); } catch (e) { resolve(null); return; }
      const W = im.naturalWidth || im.width, H = im.naturalHeight || im.height;
      if (!W || !H) { resolve(null); return; }
      const clean = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');
      const target = kind;
      const heads = words.map((w) => ({ t: clean(w.text), x: w.bbox ? w.bbox.x0 : 0, y: w.bbox ? w.bbox.y0 : 0, y1: w.bbox ? w.bbox.y1 : 0 })).filter((w) => w.t);
      const nextNames = ['listening', 'reading', 'translation', 'writing'];
      let start = heads.find((w) => w.t === target || w.t.startsWith(target));
      let next = null;
      if (start) {
        for (const w of heads) {
          if (w.y <= start.y + 18) continue;
          if (!nextNames.some((n) => w.t === n || w.t.startsWith(n))) continue;
          if (!next || w.y < next.y) next = w;
        }
      }
      if (!start && kind === 'writing') {
        const listen = heads.find((w) => w.t === 'listening' || w.t.startsWith('listening'));
        if (listen) { start = { y: H * 0.02 }; next = listen; }
      }
      if (!start) { resolve(await detectLayoutSection(dataUrl, kind)); return; }
      let y0 = Math.max(0, start.y - H * 0.045);
      let y1 = next ? Math.max(y0 + H * 0.12, next.y - H * 0.01) : H * 0.98;
      if (kind === 'writing' && (!next || y1 - y0 > H * 0.62)) {
        const layout = await detectLayoutSection(dataUrl, kind);
        if (layout) { resolve(layout); return; }
        y1 = Math.min(y1, H * 0.36);
      }
      if (y1 - y0 < H * 0.1) { resolve(null); return; }
      resolve({ left: 0.5, right: 0.5, top: y0 / H * 100, bottom: Math.max(0, (1 - y1 / H) * 100) });
    });
  }

  function detectContentRect(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const d = ctx.getImageData(0, 0, w, h).data;
          let x0 = w, y0 = h, x1 = 0, y1 = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
              if (g < 218) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            }
          }
          if (x1 > x0 && y1 > y0) {
            const bw = (x1 - x0 + 1) / w, bh = (y1 - y0 + 1) / h;
            if (bw > 0.18 && bh > 0.18 && (bw < 0.96 || bh < 0.96)) {
              const padX = 0.012, padY = 0.012;
              resolve({ left: Math.max(0, x0 / w - padX) * 100, top: Math.max(0, y0 / h - padY) * 100,
                right: Math.max(0, 1 - (x1 + 1) / w - padX) * 100, bottom: Math.max(0, 1 - (y1 + 1) / h - padY) * 100 });
              return;
            }
          }
        } catch (e) {}
        resolve({ left: 1.5, top: 1.5, right: 1.5, bottom: 1.5 });
      };
      img.onerror = () => resolve({ left: 1.5, top: 1.5, right: 1.5, bottom: 1.5 });
      img.src = dataUrl;
    });
  }

  async function autoCropData(dataUrl, kind) {
    let pct = null;
    if (kind) {
      try { pct = await detectSectionRect(dataUrl, kind); } catch (e) {}
    }
    if (!pct) {
      try { pct = await detectContentRect(dataUrl); } catch (e) {}
    }
    if (!pct) return dataUrl;
    return await cropDataUrl(dataUrl, pct);
  }

  function detectQuestionRect(dataUrl) {
    return new Promise(async (resolve) => {
      let res = null;
      try { res = await OCR.recognizeMarks(dataUrl); } catch (e) { resolve(null); return; }
      const words = (res && res.words) || [];
      if (!words.length) { resolve(null); return; }
      const load = (src) => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = fail; im.src = src; });
      let im;
      try { im = await load(res.processed || dataUrl); } catch (e) { resolve(null); return; }
      const H = im.naturalHeight || im.height;
      if (!H) { resolve(null); return; }
      const nums = words.map((w) => {
        const m = String(w.text || '').match(/(?:^|\s)(\d{1,2})(?:\s*[.、:：)]|$)/);
        if (!m || !w.bbox) return null;
        const v = Number(m[1]);
        if (v < 1 || v > 55) return null;
        return { v, top: w.bbox.y0, bottom: w.bbox.y1 };
      }).filter(Boolean).sort((a, b) => a.top - b.top);
      if (!nums.length) { resolve(null); return; }
      const uniq = [];
      for (const n of nums) if (!uniq.some((x) => x.v === n.v && Math.abs(x.top - n.top) < H * 0.01)) uniq.push(n);
      if (!uniq.length) { resolve(null); return; }
      const hs = uniq.map((n) => n.bottom - n.top).sort((a, b) => a - b);
      const lineH = hs[Math.floor(hs.length / 2)] || H * 0.02;
      const y0 = Math.max(0, uniq[0].top - lineH * 1.2);
      const y1 = Math.min(H, uniq[uniq.length - 1].bottom + lineH * 3.2);
      if (y1 - y0 < H * 0.06) { resolve(null); return; }
      resolve({ left: 0.5, right: 0.5, top: y0 / H * 100, bottom: Math.max(0, (1 - y1 / H) * 100) });
    });
  }

  function openCropEditor(dataUrl, onDone, kind) {
    const overlay = document.createElement('div');
    overlay.className = 'crop-screen';
    overlay.innerHTML = '<div class="crop-screen-top"><button class="crop-x" id="crop-close">' + CET.icon('close') + '</button>' +
      '<div class="crop-screen-title"><b>调整识别区域</b><span>已自动选取，可拖动四角</span></div>' +
      '<button class="crop-x crop-rotate" id="crop-rotate" aria-label="旋转">↻</button></div>' +
      '<div class="crop-screen-stage"><div class="crop-frame" id="crop-frame"><img id="crop-img" src="' + dataUrl + '" alt="">' +
        '<div class="crop-box" id="crop-box"><i class="crop-handle nw" data-h="nw"></i><i class="crop-handle ne" data-h="ne"></i><i class="crop-handle sw" data-h="sw"></i><i class="crop-handle se" data-h="se"></i></div></div></div>' +
      '<div class="crop-screen-bottom"><div class="crop-size"><span>框大小</span><input type="range" id="crop-size" min="50" max="160" value="100" step="1"><b id="crop-size-val">100%</b></div>' +
        '<div class="crop-nudge"><button type="button" data-nudge="left" aria-label="左移">←</button><button type="button" data-nudge="up" aria-label="上移">↑</button><button type="button" data-nudge="down" aria-label="下移">↓</button><button type="button" data-nudge="right" aria-label="右移">→</button></div>' +
        '<div class="crop-actions"><button class="btn crop-btn-ghost" id="crop-skip">用整张</button><button class="btn btn-primary crop-btn-main" id="crop-ok">' + CET.icon('check') + '确认裁剪</button></div></div>';
    document.body.appendChild(overlay);
    const img = overlay.querySelector('#crop-img');
    const frame = overlay.querySelector('#crop-frame');
    const box = overlay.querySelector('#crop-box');
    let rect = { x: 0, y: 0, w: 0, h: 0 };
    let drag = null;
    let done = false;
    let touched = false;
    let currentUrl = dataUrl;
    const paint = () => {
      box.style.left = rect.x + 'px'; box.style.top = rect.y + 'px';
      box.style.width = rect.w + 'px'; box.style.height = rect.h + 'px';
    };
    const init = async () => {
      const r = img.getBoundingClientRect();
      if (!r.width || !r.height) { setTimeout(init, 50); return; }
      const pp = await detectPaperRect(currentUrl);
      const lp = pp ? null : (kind ? await layoutEngineRect(currentUrl, kind) : null);
      const use = pp || lp;
      if (use) {
        rect = { x: r.width * use.left / 100, y: r.height * use.top / 100,
          w: Math.max(40, r.width * (1 - (use.left + use.right) / 100)),
          h: Math.max(40, r.height * (1 - (use.top + use.bottom) / 100)) };
      } else {
        rect = { x: 10, y: 10, w: Math.max(40, r.width - 20), h: Math.max(40, r.height - 20) };
      }
      const ix = Math.max(14, Math.round(rect.w * 0.06));
      const iy = Math.max(14, Math.round(rect.h * 0.06));
      rect = {
        x: rect.x + ix, y: rect.y + iy,
        w: Math.max(60, rect.w - ix * 2),
        h: Math.max(60, rect.h - iy * 2)
      };
      paint();
    };
    if (img.complete) setTimeout(init, 0); else img.addEventListener('load', init);
    let touchMode = false;
    const pointOf = (e) => (e.touches && e.touches[0]) ? e.touches[0] : e;
    const start = (e, mode, dir) => {
      e.preventDefault(); e.stopPropagation();
      touched = true;
      const p = pointOf(e);
      drag = { mode, dir, sx: p.clientX, sy: p.clientY, r: Object.assign({}, rect), sw: frame.getBoundingClientRect().width, sh: frame.getBoundingClientRect().height };
      if (touchMode) {
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', end, { once: true });
      } else {
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end, { once: true });
      }
    };
    const move = (e) => {
      if (!drag) return;
      if (e.cancelable) e.preventDefault();
      const p = pointOf(e);
      const dx = p.clientX - drag.sx, dy = p.clientY - drag.sy;
      let { x, y, w, h } = drag.r;
      const min = 36;
      if (drag.mode === 'move') {
        x = Math.max(0, Math.min(drag.sw - w, x + dx));
        y = Math.max(0, Math.min(drag.sh - h, y + dy));
      } else {
        if (drag.dir.includes('w')) { const nx = Math.max(0, Math.min(x + w - min, x + dx)); w += x - nx; x = nx; }
        if (drag.dir.includes('e')) { w = Math.max(min, Math.min(drag.sw - x, w + dx)); }
        if (drag.dir.includes('n')) { const ny = Math.max(0, Math.min(y + h - min, y + dy)); h += y - ny; y = ny; }
        if (drag.dir.includes('s')) { h = Math.max(min, Math.min(drag.sh - y, h + dy)); }
      }
      rect = { x, y, w, h }; paint();
    };
    const end = () => {
      drag = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('touchmove', move);
    };
    const close = () => {
      if (overlay.parentNode) overlay.remove();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('touchmove', move);
    };
    const bindDrag = (el, mode, dir) => {
      el.addEventListener('touchstart', (e) => { touchMode = true; start(e, mode, dir); }, { passive: false });
      el.addEventListener('pointerdown', (e) => { if (touchMode && e.pointerType === 'touch') return; start(e, mode, dir); });
    };
    bindDrag(box, 'move', '');
    box.querySelectorAll('.crop-handle').forEach((h) => bindDrag(h, 'resize', h.getAttribute('data-h')));
    let sizeBase = null;
    const sizeEl = overlay.querySelector('#crop-size');
    const sizeVal = overlay.querySelector('#crop-size-val');
    const applySize = () => {
      if (!sizeEl) return;
      touched = true;
      if (!sizeBase) sizeBase = Object.assign({}, rect);
      const fr = frame.getBoundingClientRect();
      const scale = Math.max(0.5, Math.min(1.6, Number(sizeEl.value) / 100));
      const cx = sizeBase.x + sizeBase.w / 2, cy = sizeBase.y + sizeBase.h / 2;
      let nw = Math.max(60, Math.min(fr.width, sizeBase.w * scale));
      let nh = Math.max(60, Math.min(fr.height, sizeBase.h * scale));
      rect = { x: Math.max(0, Math.min(fr.width - nw, cx - nw / 2)), y: Math.max(0, Math.min(fr.height - nh, cy - nh / 2)), w: nw, h: nh };
      if (sizeVal) sizeVal.textContent = sizeEl.value + '%';
      paint();
    };
    if (sizeEl) {
      sizeEl.addEventListener('pointerdown', () => { sizeBase = Object.assign({}, rect); });
      sizeEl.addEventListener('touchstart', () => { sizeBase = Object.assign({}, rect); }, { passive: true });
      sizeEl.addEventListener('input', applySize);
    }
    let holdTimer = null, holdRepeat = null;
    const moveBy = (dir) => {
      touched = true; sizeBase = null;
      const step = 12;
      const fr = frame.getBoundingClientRect();
      if (dir === 'left') rect.x = Math.max(0, rect.x - step);
      if (dir === 'right') rect.x = Math.min(fr.width - rect.w, rect.x + step);
      if (dir === 'up') rect.y = Math.max(0, rect.y - step);
      if (dir === 'down') rect.y = Math.min(fr.height - rect.h, rect.y + step);
      paint();
    };
    const stopHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (holdRepeat) { clearInterval(holdRepeat); holdRepeat = null; }
    };
    overlay.querySelectorAll('[data-nudge]').forEach((b) => {
      const dir = b.getAttribute('data-nudge');
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        moveBy(dir);
        stopHold();
        holdTimer = setTimeout(() => { holdRepeat = setInterval(() => moveBy(dir), 70); }, 380);
      });
      b.addEventListener('pointerup', stopHold);
      b.addEventListener('pointerleave', stopHold);
      b.addEventListener('pointercancel', stopHold);
      b.addEventListener('click', (e) => e.preventDefault());
    });
    overlay.querySelector('#crop-rotate').addEventListener('click', () => {
      const image = new Image();
      image.onload = () => {
        const c = document.createElement('canvas');
        c.width = image.naturalHeight;
        c.height = image.naturalWidth;
        const ctx = c.getContext('2d');
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
        currentUrl = c.toDataURL('image/jpeg', 0.92);
        touched = false;
        sizeBase = null;
        if (sizeEl) sizeEl.value = '100';
        if (sizeVal) sizeVal.textContent = '100%';
        img.onload = () => { init(); };
        img.src = currentUrl;
      };
      image.src = currentUrl;
    });

    overlay.querySelector('#crop-close').addEventListener('click', close);
    overlay.querySelector('#crop-skip').addEventListener('click', () => { if (done) return; done = true; close(); onDone(currentUrl); });
    overlay.querySelector('#crop-ok').addEventListener('click', async () => {
      if (done) return; done = true;
      const fr = frame.getBoundingClientRect();
      const pct = {
        left: Math.max(0, rect.x / fr.width * 100), top: Math.max(0, rect.y / fr.height * 100),
        right: Math.max(0, (fr.width - rect.x - rect.w) / fr.width * 100),
        bottom: Math.max(0, (fr.height - rect.y - rect.h) / fr.height * 100)
      };
      const cropped = await cropDataUrl(currentUrl, pct);
      close(); onDone(cropped);
    });
  }

  function exifOrientation(dataUrl) {
    try {
      if (!/^data:image\/jpe?g/i.test(dataUrl)) return 1;
      const b64 = dataUrl.split(',')[1];
      const bin = atob(b64);
      const len = Math.min(bin.length, 200000);
      const arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      if (arr[0] !== 0xFF || arr[1] !== 0xD8) return 1;
      let off = 2;
      while (off + 4 < len) {
        if (arr[off] !== 0xFF) { off++; continue; }
        const marker = arr[off + 1];
        const size = (arr[off + 2] << 8) | arr[off + 3];
        if (marker === 0xE1 && off + 10 < len) {
          if (arr[off + 4] === 0x45 && arr[off + 5] === 0x78 && arr[off + 6] === 0x69 && arr[off + 7] === 0x66) {
            const tiff = off + 10;
            const little = arr[tiff] === 0x49 && arr[tiff + 1] === 0x49;
            const u16 = (o) => little ? (arr[o] | (arr[o + 1] << 8)) : ((arr[o] << 8) | arr[o + 1]);
            const u32 = (o) => little ? (arr[o] | (arr[o + 1] << 8) | (arr[o + 2] << 16) | (arr[o + 3] << 24)) : ((arr[o] << 24) | (arr[o + 1] << 16) | (arr[o + 2] << 8) | arr[o + 3]);
            const ifd = tiff + u32(tiff + 4);
            const n = u16(ifd);
            for (let i = 0; i < n; i++) {
              const e = ifd + 2 + i * 12;
              if (u16(e) === 0x0112) return u16(e + 8);
            }
          }
        }
        if (size < 2) break;
        off += size + 2;
      }
    } catch (e) {}
    return 1;
  }

  function normalizeImage(dataUrl) {
    return new Promise((resolve) => {
      const o = exifOrientation(dataUrl);
      if (o <= 1) { resolve(dataUrl); return; }
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas');
        const swap = o >= 5;
        c.width = swap ? h : w; c.height = swap ? w : h;
        const ctx = c.getContext('2d');
        ctx.save();
        if (o === 2) { ctx.translate(w, 0); ctx.scale(-1, 1); }
        else if (o === 3) { ctx.translate(w, h); ctx.rotate(Math.PI); }
        else if (o === 4) { ctx.translate(0, h); ctx.scale(1, -1); }
        else if (o === 5) { ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); }
        else if (o === 6) { ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h); }
        else if (o === 7) { ctx.rotate(-0.5 * Math.PI); ctx.scale(1, -1); ctx.translate(-w, 0); }
        else if (o === 8) { ctx.rotate(-0.5 * Math.PI); ctx.translate(-h, 0); }
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        try { resolve(c.toDataURL('image/jpeg', 0.98)); } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function onImgLoad(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function otsuThreshold(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, bestVar = -1;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > bestVar) { bestVar = between; best = i; }
    }
    return best;
  }

  /**
   * Score how much an image looks like upright text: rows must alternate
   * (text lines) and lines must start at a consistent left margin.
   */
  function textLayoutScore(canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    let data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return -1; }
    const gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    const thr = otsuThreshold(gray);
    const rowInk = new Float32Array(h);
    const firstInk = new Int16Array(h).fill(-1);
    let ink = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (gray[y * w + x] < thr) {
          rowInk[y]++;
          ink++;
          if (firstInk[y] < 0) firstInk[y] = x;
        }
      }
    }
    const inkRatio = ink / (w * h);
    if (inkRatio < 0.015 || inkRatio > 0.6) return -1;
    let mean = 0;
    for (let y = 0; y < h; y++) mean += rowInk[y];
    mean /= h;
    let variance = 0;
    for (let y = 0; y < h; y++) { const d = rowInk[y] - mean; variance += d * d; }
    const rowContrast = Math.sqrt(variance / h) / (mean + 1e-6);
    /* group rows into lines and check the left edge consistency */
    const peak = Math.max.apply(null, Array.from(rowInk)) || 1;
    const starts = [];
    for (let y = 0; y < h; y++) {
      if (rowInk[y] < peak * 0.3) continue;
      let from = y;
      while (y + 1 < h && rowInk[y + 1] >= peak * 0.3) y++;
      let first = -1;
      for (let yy = from; yy <= y; yy++) if (firstInk[yy] >= 0) { first = firstInk[yy]; break; }
      if (first >= 0) starts.push(first);
    }
    if (starts.length < 2) return -1;
    const avgStart = starts.reduce((a, b) => a + b, 0) / starts.length;
    let spread = 0;
    for (const s of starts) spread += (s - avgStart) * (s - avgStart);
    spread = Math.sqrt(spread / starts.length) / w;
    return { contrast: rowContrast, leftMargin: avgStart / w, spread, lines: starts.length };
  }

  function rotateCanvas(img, w, h, rot) {
    const swap = Math.abs(rot) % 180 !== 0;
    const c = document.createElement('canvas');
    c.width = swap ? h : w;
    c.height = swap ? w : h;
    const ctx = c.getContext('2d');
    ctx.save();
    if (rot === 90) { ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); }
    else if (rot === -90) { ctx.translate(0, c.height); ctx.rotate(-Math.PI / 2); }
    else if (rot === 180) { ctx.translate(c.width, c.height); ctx.rotate(Math.PI); }
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
    return c;
  }

  /**
   * Photos taken sideways carry no EXIF flag, so guess the upright rotation from
   * the text layout. Only rotates when one orientation is clearly better.
   */
  async function autoOrient(dataUrl) {
    try {
      const img = await onImgLoad(dataUrl);
      const long = 260;
      const scale = long / Math.max(img.naturalWidth, img.naturalHeight);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const options = [0, 90, -90, 180].map((rot) => {
        const s = textLayoutScore(rotateCanvas(img, w, h, rot));
        return { rot, s };
      }).filter((o) => o.s && o.s !== -1);
      if (!options.length) return dataUrl;
      const scoreOf = (o) => {
        const s = o.s;
        if (!s) return -9;
        return s.contrast * 2 + (1 - Math.min(1, s.spread * 6)) + (s.leftMargin < 0.3 ? 1 : 0);
      };
      const base = options.find((o) => o.rot === 0);
      let best = options[0];
      for (const o of options) if (scoreOf(o) > scoreOf(best)) best = o;
      if (!best || best.rot === 0) return dataUrl;
      /* Require a clear win over the untouched orientation. */
      if (base && scoreOf(best) < scoreOf(base) * 1.25) return dataUrl;
      const full = rotateCanvas(img, img.naturalWidth, img.naturalHeight, best.rot);
      CET.toast('已按文字方向自动转正');
      return full.toDataURL('image/jpeg', 0.96);
    } catch (e) {
      return dataUrl;
    }
  }

  async function onNativeImage(dataUrl) {
    dataUrl = await normalizeImage(dataUrl);
    if (!dataUrl) { CET.toast('没有读取到图片'); return; }
    dataUrl = await autoOrient(dataUrl);
    /*
     * 批改向导或扫描都通过「待处理角色」认领图片。没有角色的图片一律丢弃，
     * 否则连点两次拍照时，第二张会被当成普通扫描图，界面被拉到扫描页，
     * 而批改向导那一步还空着，看起来就像「没跳下一步」。
     */
    const expectsImage = state.pendingExamPhoto || state.pendingExamPage || state.pendingScanTarget;
    if (!expectsImage) {
      CET.toast('多余的图片已忽略，请重新拍');
      return;
    }
    if (state.pendingExamPhoto) {
      const kind = state.pendingExamPhoto;
      const role = state.pendingExamRole || 'answer';
      state.pendingExamPhoto = null;
      state.pendingExamRole = null;
      if (role === 'prompt') {
        openCropEditor(dataUrl, (cropped) => {
          state.examPromptKind = kind;
          state.examPromptImage = cropped;
          saveExamNow();
          examPhotoCapture(kind);
          ocrStep(kind, 'prompt');
        }, kind);
        return;
      }
      if (!(state.examPromptKind === kind && state.examPromptImage)) {
        CET.toast('先拍题目', 'red');
        setTimeout(() => examPhotoCapture(kind), 60);
        return;
      }
      openCropEditor(dataUrl, (cropped) => {
        state.examAnswerImage = cropped;
        state.examAnswerKind = kind;
        saveExamNow();
        examPhotoCapture(kind);
        ocrStep(kind, 'answer');
      }, kind);
      return;
    }
    if (state.pendingExamPage) {
      const mode = state.pendingExamPage;
      state.pendingExamPage = null;
      if (mode === 'ai') { openCropEditor(dataUrl, (cropped) => runExamPaperAI(cropped)); return; }
      if (!state.examPages) state.examPages = [];
      if (state.examPages.length >= 12) { CET.toast('一次最多 12 页'); openExamPaperScan(); return; }
      openCropEditor(dataUrl, (cropped) => {
        state.examPages.push({ id: 'ep' + Date.now() + Math.random().toString(36).slice(2, 5), dataUrl: cropped, mode });
        openExamPaperScan();
      });
      return;
    }
    if (state.pendingScanTarget) {
      const target = state.pendingScanTarget;
      state.pendingScanTarget = null;
      openCropEditor(dataUrl, (cropped) => runOcrForInsert(cropped, target));
    } else {
      openCropEditor(dataUrl, (cropped) => runScanOcr(cropped, true));
    }
  }
  window.onNativeImage = onNativeImage;
  window.onNativeCancel = function () {
    if (state.pendingExamPhoto) {
      state.pendingExamPhoto = null;
      state.pendingExamRole = null;
      setTimeout(() => examPhotoCapture(state.examPhotoKind || 'writing'), 80);
      return;
    }
    if (state.pendingExamPage) {
      state.pendingExamPage = null;
      setTimeout(openExamPaperScan, 80);
      return;
    }
    if (state.pendingScanTarget) {
      state.pendingScanTarget = null;
      CET.toast('已取消识别');
    }
  };

  /* ============================================================ dict */
  function renderDict() {
    const cetWords = Dict.order ? Dict.order.filter((w) => { const e = Dict.words[w]; return e && (e.l === 4 || e.l === 6 || e.l === 46) && w.length > 3 && !Dict.isStop(w); }) : [];
    const cetCount = cetWords.length.toLocaleString();
    const phraseCount = (Dict.cetPhraseBank || Dict.phraseBank || []).length.toLocaleString();
    const mode = dictMode();
    return '<section class="section" style="margin-top:0">' +
      '<div class="section-head"><div><h1 style="font-size:24px;letter-spacing:-.7px">离线词库 <span class="badge green" style="vertical-align:middle">离线</span></h1>' +
        '<p class="tiny muted dict-count" style="margin-top:3px">四六级 ' + cetCount + ' 词 · ' + phraseCount + ' 短语</p></div>' +
        '<div class="row wrap" style="justify-content:flex-end">' + reciteButtonHtml() + '</div></div>' +
      '<div class="search-box"><span>' + CET.icon('search') + '</span><input id="dict-search" type="search" placeholder="' + (mode === 'phrase' ? '搜索短语或中文' : '搜索单词或中文') + '" autocomplete="off" spellcheck="false">' +
        '<button class="clear" data-action="clear-dict-search" aria-label="清空">' + CET.icon('close') + '</button></div>' +
      '<div class="dict-tabs"><button class="chip ' + (mode === 'word' ? 'active' : '') + '" data-dict-mode="word">单词</button>' +
        '<button class="chip ' + (mode === 'phrase' ? 'active' : '') + '" data-dict-mode="phrase">短语</button></div>' +
    '</section>' +
    '<section class="section dict-compact" id="dict-list">' + renderDictListHtml() + '</section>';
  }

  function recommendedWords() {
    const out = [];
    const recent = state.recentSearches;
    for (const w of recent) {
      const h = Dict.lookup(w) || (CET.FullDict.available ? CET.FullDict.lookupAny(w) : null);
      if (h) out.push(h);
    }
    const pool = [];
    for (let i = 0; i < Dict.order.length && pool.length < 900; i++) {
      const w = Dict.order[i];
      const e = Dict.words[w];
      if (!e || w.length < 4) continue;
      if (e.l === 4 || e.l === 6 || e.l === 46) pool.push(w);
    }
    const start = Math.floor(Math.random() * Math.max(1, pool.length - 25));
    for (let i = 0; i < 25 && pool.length; i++) {
      const w = pool[(start + i) % pool.length];
      if (!out.some((x) => x.head === w)) out.push({ head: w, entry: Dict.words[w] });
    }
    const seen = new Set();
    return out.filter((x) => {
      if (!x || seen.has(x.head)) return false;
      seen.add(x.head);
      return true;
    }).slice(0, 8);
  }

  function cookieGet(key, fallback) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(key) + '=([^;]*)'));
      if (m) return JSON.parse(decodeURIComponent(m[1]));
    } catch (e) {}
    return fallback;
  }

  function cookieSet(key, value) {
    try {
      document.cookie = encodeURIComponent(key) + '=' + encodeURIComponent(JSON.stringify(value)) + '; Max-Age=31536000; Path=/; SameSite=Lax';
    } catch (e) {}
  }

  function persistentGet(key, fallback) {
    const fromCookie = cookieGet(key, null);
    if (fromCookie != null) return fromCookie;
    return CET.store.get(key, fallback);
  }

  function persistentSet(key, value) {
    cookieSet(key, value);
    try { CET.store.set(key, value); } catch (e) {}
  }

  function dictMode() {
    if (state.dictMode !== 'phrase' && state.dictMode !== 'word') {
      const saved = persistentGet('cet46:dictMode', 'word');
      state.dictMode = saved === 'phrase' ? 'phrase' : 'word';
    }
    return state.dictMode;
  }

  function dictPageKey(mode) { return mode === 'phrase' ? 'cet46:dictPage:phrase' : 'cet46:dictPage:word'; }

  function readDictMemory(mode) {
    let raw = persistentGet(dictPageKey(mode), null);
    if (raw == null && mode === 'word') raw = persistentGet('cet46:dictPage', null);
    if (typeof raw === 'number') return { page: raw, y: 0 };
    if (raw && typeof raw === 'object') return { page: Number(raw.page) || 0, y: Number(raw.y) || 0 };
    return { page: 0, y: 0 };
  }

  function saveDictPage(y, mode) {
    persistentSet(dictPageKey(mode || dictMode()), { page: Number(state.dictPage) || 0, y: y == null ? (window.scrollY || 0) : y });
  }

  function dictAllBookmarks() {
    let list = persistentGet('cet46:dictBookmarks:v2', null);
    if (!Array.isArray(list)) {
      const old = persistentGet('cet46:dictBookmarks', []);
      list = Array.isArray(old) ? old.map((x) => Object.assign({}, x, { mode: 'word' })) : [];
    }
    return Array.isArray(list) ? list.filter((x) => x && Number.isFinite(Number(x.page)) && (x.mode === 'word' || x.mode === 'phrase')) : [];
  }

  function dictBookmarkList(mode) {
    const m = mode || dictMode();
    return dictAllBookmarks().filter((x) => x.mode === m).slice(0, 4);
  }

  function saveDictBookmarks(list, mode) {
    const m = mode || dictMode();
    const other = dictAllBookmarks().filter((x) => x.mode !== m);
    persistentSet('cet46:dictBookmarks:v2', other.concat((list || []).slice(0, 4).map((x) => Object.assign({}, x, { mode: m }))));
  }

  function dictBookmarkChipHtml(b) {
    const page = Number(b.page) || 0;
    return '<span class="dict-bm"><button data-dict-bm="' + page + '">第 ' + (page + 1) + ' 页</button><button class="x" data-dict-bm-remove="' + page + '" aria-label="删除书签">×</button></span>';
  }

  function refreshDictBookmarkTools() {
    const list = dictBookmarkList();
    let bar = document.querySelector('.dict-bm-bar');
    if (!list.length) { if (bar) bar.remove(); }
    else {
      if (!bar) {
        bar = document.createElement('div'); bar.className = 'dict-bm-bar';
        const jump = document.querySelector('.dict-jump');
        if (jump && jump.parentNode) jump.parentNode.insertBefore(bar, jump.nextSibling); else return;
      }
      bar.innerHTML = '<span class="tiny muted">书签</span>' + list.map(dictBookmarkChipHtml).join('');
    }
    const add = document.querySelector('[data-dict-bm-add]');
    if (add) {
      const marked = list.some((x) => Number(x.page) === (Number(state.dictPage) || 0));
      const full = list.length >= 4 && !marked;
      add.textContent = marked ? '已书签' : full ? '书签已满' : '书签本页';
      add.disabled = marked || full;
    }
  }

  function dictPagerHtml(total, page, tools) {
    let html = '';
    if (!tools) {
      html += '<div class="dict-pager">' +
        '<button class="btn btn-soft btn-sm" data-dict-page="prev"' + (page <= 0 ? ' disabled' : '') + '>上一页</button>' +
        '<span class="tiny muted">第 ' + (page + 1) + ' / ' + total + ' 页</span>' +
        '<button class="btn btn-soft btn-sm" data-dict-page="next"' + (page >= total - 1 ? ' disabled' : '') + '>下一页</button>' +
        '</div>';
      return html;
    }
    const bms = dictBookmarkList();
    const marked = bms.some((x) => Number(x.page) === page);
    const full = bms.length >= 4 && !marked;
    html += '<div class="dict-jump"><input id="dict-jump" type="number" inputmode="numeric" min="1" max="' + total + '" placeholder="页码">' +
      '<button class="btn btn-soft btn-sm" data-dict-jump-go>跳转</button>' +
      '<button class="btn btn-soft btn-sm' + (marked ? ' active' : '') + '" data-dict-bm-add' + (marked || full ? ' disabled' : '') + '>' + (marked ? '已书签' : full ? '书签已满' : '书签本页') + '</button></div>';
    if (bms.length) html += '<div class="dict-bm-bar"><span class="tiny muted">书签</span>' + bms.map(dictBookmarkChipHtml).join('') + '</div>';
    return html;
  }

  function phraseRowHtml(p) {
    return phraseRow(p, '四六级短语');
  }

  function phraseSeed() {
    if (state.dictPhraseSeed == null) {
      let seed = Number(persistentGet('cet46:phraseSeed', 0)) || 0;
      if (!seed) {
        seed = (Date.now() % 2147483647) || 1;
        persistentSet('cet46:phraseSeed', seed);
      }
      state.dictPhraseSeed = seed;
    }
    return state.dictPhraseSeed;
  }

  function phraseHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function shuffledPhrases(list) {
    const seed = phraseSeed();
    if (!seed) return list;
    return list.slice().sort((a, b) => phraseHash(a.p + ':' + seed) - phraseHash(b.p + ':' + seed));
  }

  function renderDictListHtml() {
    const q = (state.dictQuery || '').trim();
    const mode = dictMode();
    const bank = shuffledPhrases(Dict.cetPhraseBank || Dict.phraseBank || []);
    if (q) {
      if (mode === 'phrase') {
        const low = q.toLowerCase();
        let hits = bank.filter((p) => String(p.p || '').toLowerCase().includes(low) || String(p.zh || '').includes(q)).slice(0, 30);
        if (CET.FullDict.available) {
          const seen = new Set(hits.map((p) => String(p.p).toLowerCase()));
          const full = CET.FullDict.searchAny(q, 40).filter((x) => x.head && x.head.indexOf(' ') > 0);
          for (const x of full) {
            const k = String(x.head).toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k); hits.push({ p: x.head, zh: Dict.firstZh(x.entry), cat: 'dictionary' });
          }
        }
        if (!hits.length) return '<div class="empty"><div class="empty-icon">' + CET.icon('search') + '</div><h3>没有找到匹配短语</h3></div>';
        return '<div class="row mb8"><span class="tiny muted">短语 ' + hits.length + ' 条匹配</span></div><div class="word-list">' + hits.map(phraseRowHtml).join('') + '</div>';
      }
      let items = Dict.search(q, 50).map((x) => ({ head: x.head, entry: x.entry, core: true }));
      let fullItems = [];
      if (CET.FullDict.available) {
        const coreSet = new Set(items.map((x) => x.head.toLowerCase()));
        fullItems = CET.FullDict.searchAny(q, 40).filter((x) => !coreSet.has(x.head.toLowerCase()));
      }
      if (!items.length && !fullItems.length) return '<div class="empty"><div class="empty-icon">' + CET.icon('search') + '</div><h3>没有找到匹配词</h3></div>';
      let html = '<div class="row mb8"><span class="tiny muted">核心 ' + items.length + ' 个结果' + (fullItems.length ? ' · 完整词库 ' + fullItems.length + ' 个' : '') + '</span></div>';
      if (items.length) html += '<div class="word-list">' + items.map((x) => wordRow(x.head, x.entry, '核心词库')).join('') + '</div>';
      if (fullItems.length) html += '<div class="section-head" style="margin-top:18px"><h2 style="font-size:14px">完整词库</h2><span class="tiny muted">' + CET.FullDict.count.toLocaleString() + ' 词</span></div><div class="word-list">' + fullItems.map((x) => wordRow(x.head, x.entry, '完整词库')).join('') + '</div>';
      return html;
    }
    const list = mode === 'phrase' ? bank : (function () {
      const arr = [];
      for (const w of Dict.order) {
        const e = Dict.words[w];
        if (e && (e.l === 4 || e.l === 6 || e.l === 46) && w.length > 3 && !Dict.isStop(w)) arr.push({ head: w, entry: e });
      }
      return arr;
    })();
    const size = mode === 'phrase' ? 6 : 8;
    const total = Math.max(1, Math.ceil(list.length / size));
    state.dictTotalPages = total;
    if (state.dictPage == null) {
      const mem = readDictMemory(mode);
      state.dictPage = mem.page; state._dictRestoreY = mem.y;
    }
    state.dictPage = Math.max(0, Math.min(Number(state.dictPage) || 0, total - 1));
    const page = state.dictPage;
    const slice = list.slice(page * size, page * size + size);
    let html = dictPagerHtml(total, page, true);
    html += '<div class="row mb8"><span class="tiny muted">' + (mode === 'phrase' ? '四六级短语 ' + list.length.toLocaleString() + ' 条' : '四六级词汇 ' + list.length.toLocaleString() + ' 个') + '</span></div>';
    html += '<div class="section-head" style="margin-top:6px"><h2 style="font-size:14px">' + (mode === 'phrase' ? '四六级短语' : '四六级词汇') + '</h2></div>';
    html += '<div class="word-list">' + (mode === 'phrase' ? slice.map(phraseRowHtml).join('') : slice.map((x) => wordRow(x.head, x.entry, '四六级词汇')).join('')) + '</div>';
    html += dictPagerHtml(total, page, false);
    if (state._dictRestoreY != null) {
      const y = Number(state._dictRestoreY) || 0; state._dictRestoreY = null;
      setTimeout(function () { window.scrollTo(0, y); }, 30);
    }
    return html;
  }

  function renderDictListOnly() {
    const el = $('#dict-list');
    if (!el) return;
    el.innerHTML = renderDictListHtml();
  }

  /* ============================================================ reading */
  function articles() {
    return (state.articles && state.articles.articles) || [];
  }

  const READ_KEY = 'cet46:read';
  let readCache = null;
  function readSet() {
    if (!readCache) readCache = new Set(CET.store.get(READ_KEY, []));
    return readCache;
  }
  function isRead(id) { return readSet().has(id); }
  function markRead(id) {
    const s = readSet();
    if (!s.has(id)) { s.add(id); CET.store.set(READ_KEY, Array.from(s)); }
  }

  const REPORT_MEDIA = new Set(['WHO', 'WHO/PAHO', 'UNESCO', 'OECD', 'World Bank', 'Bank of England', 'UNEP', 'NHS']);
  const WEB_MEDIA = new Set(['BBC Future', 'BBC Worklife', 'BBC News', 'BBC Culture', 'BBC Learning English', 'NPR', 'The Conversation', 'Reuters Institute', 'World Economic Forum', 'KEDM', 'UnHerd', 'Salon', 'Our World in Data']);
  function sourceKind(a) {
    const m = a && a.ref ? a.ref.media : '';
    if (REPORT_MEDIA.has(m)) return 'report';
    if (WEB_MEDIA.has(m)) return 'web';
    return 'paper';
  }
  function sourceKindLabel(k) {
    return k === 'paper' ? '报刊/杂志' : k === 'web' ? '网站/广播' : k === 'report' ? '报告/机构' : '全部来源';
  }

  function articleMixLabel() {
    return articles().length + ' 篇';
  }

  function articleDifficulty(a) {
    const text = String(a.text || '');
    const words = text.split(/\s+/).filter(Boolean);
    const sents = Dict.splitSentences(text);
    const avg = sents.length ? words.length / sents.length : 0;
    const longRatio = words.length ? words.filter((w) => w.replace(/[^A-Za-z]/g, '').length >= 8).length / words.length : 0;
    const clauses = (text.match(/\b(which|that|because|although|while|whereas|unless|provided|not only|rather than|in spite of)\b/gi) || []).length;
    return avg * 1.3 + longRatio * 55 + clauses * 1.2 + words.length * 0.06;
  }

  function dailyArticle(level) {
    const list = articles().filter((a) => a.level === level);
    if (!list.length) return null;
    const ranked = list.slice().sort((a, b) => String(b.text).length - String(a.text).length).slice(0, 6);
    const day = Math.floor(Date.now() / 86400000);
    return ranked[0];
  }

  function articleFoldersHtml() {
    const topics = Array.from(new Set(articles().map((a) => a.topic)));
    const items = [{ id: 'all', name: '全部文章', count: articles().length }].concat(
      topics.map((t) => ({ id: t, name: t, count: articles().filter((a) => a.topic === t).length }))
    );
    return '<div class="grid-2 folder-grid">' + items.map((f) =>
      '<button class="card folder-card" data-article-folder="' + CET.escAttr(f.id) + '">' +
        '<div class="row"><span class="menu-icon">' + CET.icon(f.id === 'all' ? 'book' : 'grid') + '</span>' +
          '<div class="grow"><b style="font-size:14px">' + esc(f.name) + '</b><div class="tiny muted mt6">' + f.count + ' 篇</div></div>' +
          CET.icon('chevronRight') + '</div></button>').join('') + '</div>';
  }

  function renderReading() {
    const folder = state.articleFolder;
    if (folder) {
      const name = folder === 'all' ? '全部文章' : folder;
      const count = articles().filter((a) => folder === 'all' || a.topic === folder).length;
      return '<section class="section" style="margin-top:0">' +
        '<div class="section-head"><div><button class="link" data-action="article-folders">' + CET.icon('arrowLeft') + ' 分类</button>' +
          '<h1 style="font-size:24px;letter-spacing:-.7px;margin-top:4px">' + esc(name) + '</h1>' +
          '<p class="tiny muted" style="margin-top:3px">' + count + ' 篇 · 每篇 2 道阅读题</p></div>' +
          '<button class="btn btn-soft btn-sm" data-tab="scan">返回</button></div>' +
        '<div class="search-box"><span>' + CET.icon('search') + '</span><input id="article-search" type="search" placeholder="在' + esc(name) + '中搜索" autocomplete="off" value="' + CET.escAttr(state.articleQuery || '') + '">' +
          '<button class="clear" data-action="article-clear" aria-label="清空">' + CET.icon('close') + '</button></div>' +
        '<div class="pill-note mt10">' + CET.icon('info') + ' 只显示「' + esc(name) + '」下的文章。点左上角「分类」返回文件夹。</div>' +
        '</section><section class="section" id="article-list">' + articleListHtml() + '</section>';
    }
    return '<section class="section" style="margin-top:0">' +
      '<div class="section-head"><div><h1 style="font-size:24px;letter-spacing:-.7px">语境精读</h1>' +
        '<p class="tiny muted" style="margin-top:3px">' + articleMixLabel() + ' · 已读 ' + readSet().size + ' / ' + articles().length + '</p></div>' +
        '<button class="btn btn-soft btn-sm" data-tab="scan">' + CET.icon('arrowLeft') + '返回</button></div>' +
      '<div class="search-box mt14"><span>' + CET.icon('search') + '</span><input id="article-search" type="search" placeholder="搜索文章标题、主题，如 教育 / 科技" autocomplete="off">' +
        '<button class="clear" data-action="article-clear" aria-label="清空">' + CET.icon('close') + '</button></div>' +
      '<div class="pill-note mt10">' + CET.icon('info') + ' 按主题进入文件夹，只看该主题文章；不再用筛选标签。</div>' +
      '</section>' +
      '<section class="section"><div class="section-head"><h2>文章分类</h2><span class="tiny muted">点文件夹进入</span></div>' +
        articleFoldersHtml() + '</section>' +
      '<section class="section" id="article-search-results">' + (state.articleQuery ? articleListHtml() : '') + '</section>';
  }

  /** Shared pager for the long lists (短文 / 句式 / 收藏). */
  function listPagerHtml(page, pages, action) {
    if (pages <= 1) return '';
    return '<div class="pager">' +
      '<button class="btn btn-outline btn-sm" data-action="' + action + '" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="pager-info">第 ' + page + ' / ' + pages + ' 页</span>' +
      '<button class="btn btn-outline btn-sm" data-action="' + action + '" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
      '</div>';
  }

  function articleListHtml() {
    const q = String(state.articleQuery || '').trim().toLowerCase();
    const folder = state.articleFolder || 'all';
    const list = articles().filter((a) => {
      if (folder !== 'all' && a.topic !== folder) return false;
      if (!q) return true;
      return (a.title + ' ' + a.source + ' ' + a.topic + ' ' + a.summary + ' ' + a.text).toLowerCase().includes(q);
    });
    if (!list.length) return '<div class="empty">' + lensMascot('这个文件夹里没有找到，换个关键词？') + '<h3>没有匹配文章</h3><p>换个关键词试试。</p></div>';
    const size = 10;
    const pages = Math.max(1, Math.ceil(list.length / size));
    const sig = folder + '|' + q;
    if (state._articleSig !== sig) { state._articleSig = sig; state.articlePage = 1; }
    const page = Math.min(pages, Math.max(1, state.articlePage || 1));
    state.articlePage = page;
    const slice = list.slice((page - 1) * size, page * size);
    return '<div class="section-head" style="margin-top:0"><h2>' + (folder === 'all' ? '全部文章' : esc(folder)) + '</h2>' +
      '<span class="tiny muted">共 ' + list.length + ' 篇 · 第 ' + page + ' / ' + pages + ' 页</span></div>' +
      '<div class="word-list">' + slice.map(articleCard).join('') + '</div>' +
      listPagerHtml(page, pages, 'article-page');
  }

  function articleCard(a) {
    const item = { type: 'article', term: a.title, sub: a.summary, source: '语境精读', payload: { id: a.id } };
    const adapted = a.sourceType === 'adapted';
    return '<article class="card article-card" data-open-article="' + a.id + '">' +
      '<div class="row wrap" style="gap:5px"><span class="badge ' + (a.level === 4 ? 'lv4' : 'lv6') + '">CET-' + a.level + '</span>' +
        '<span class="badge soft">' + esc(a.topic) + '</span>' +         (isRead(a.id) ? '<span class="badge gray read-badge">已读</span>' : '') +
        '<span class="tiny muted right">' + a.text.split(/\s+/).length + ' 词</span></div>' +
      '<div class="article-title">' + esc(a.title) + '</div>' +
      '<div class="article-summary"><span class="zh-mask">' + esc(a.summary) + '</span></div>' +
      '<div class="article-meta"><span>' + esc(a.source) + '</span><span>2 道题</span>' +
        '<span class="right">' + CET.fav.button(item, 'small') + '</span></div>' +
    '</article>';
  }

  function openArticle(a) {
    if (!a) return;
    markRead(a.id);
    const card = document.querySelector('[data-open-article="' + a.id + '"]');
    if (card && !card.querySelector('.read-badge')) {
      const row = card.querySelector('.row.wrap');
      if (row) row.insertAdjacentHTML('beforeend', '<span class="badge gray read-badge">已读</span>');
    }
    const stat = document.querySelector('#main .section-head p');
    if (stat && stat.textContent.includes('已读')) {
      stat.textContent = articleMixLabel() + ' · 已读 ' + readSet().size + ' / ' + articles().length;
    }
    const item = { type: 'article', term: a.title, sub: a.summary, source: '语境精读', payload: { id: a.id } };
    const tokens = Dict.tokenize(a.text);
    const key = Dict.keyItems(tokens, 12);
    const words = a.text.split(/\s+/).length;
    let html = '<div class="card card-hero-soft"><div class="row wrap"><span class="badge ' + (a.level === 4 ? 'lv4' : 'lv6') + '">CET-' + a.level + '</span>' +
      '<span class="badge soft">' + esc(a.topic) + '</span>' + '<span class="badge gray">' + words + ' 词</span><span class="tiny muted right">' + esc(a.source) + '</span></div>' +
      '<div class="token-text mt14" style="font-size:15.5px">' + Dict.tokensToHtml(tokens, { level: state.highlightLevel }) + '</div>' +
      '<div class="row mt10"><button class="btn btn-ghost btn-sm" data-copy="' + CET.escAttr(a.text) + '">' + CET.icon('copy') + '复制</button>' +
        '<span class="right">' + CET.fav.button(item) + '</span></div></div>';

    if (a.sourceType === 'adapted' && a.ref) {
      html += '<div class="detail-block"><div class="detail-title"><h3>话题来源</h3><span>非本文原文</span></div>' +
        '<div class="ref-box"><div class="ref-head"><span class="tiny muted">' + esc(a.ref.media || '') + (a.ref.date ? ' · ' + esc(a.ref.date) : '') + '</span></div>' +
          '<div class="ref-title">' + esc(a.ref.title || '') + '</div>' +
          '<a class="ref-link" href="' + CET.escAttr(a.ref.url) + '" target="_blank" rel="noopener">打开原文 ↗</a>' +
          '<p class="tiny muted" style="line-height:1.65;margin-top:8px">' + esc(a.adaptationNote || '基于原文核心观点重写，不是逐句翻译。') + '</p>' +
        '</div></div>';
    }

    if (key.words.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>重点词汇</h3><span>' + key.words.length + ' 个</span></div><div class="syn-grid">' +
        key.words.map((x) => '<button class="chip" data-open-word="' + CET.escAttr(x.head) + '">' + esc(x.head) + '<small class="muted">' + esc(Dict.firstZh(x.entry).slice(0, 8)) + '</small></button>').join('') + '</div></div>';
    }
    html += '<details class="fold"><summary>中文摘要 <span class="cat-count">读完再看</span></summary><div class="fold-body"><div class="article-summary"><span class="zh-mask">' + esc(a.summary) + '</span></div></div></details>';

    html += '<div class="detail-block"><div class="detail-title"><h3>阅读理解</h3><span>2 题</span></div><div class="quiz" id="article-quiz">' +
      a.questions.map((q, qi) => '<div class="quiz-q" data-q="' + qi + '"><div class="quiz-question">' + (qi + 1) + '. ' + esc(q.q) + '</div>' +
        '<div class="quiz-options">' + q.options.map((op, oi) =>
          '<button class="quiz-option" data-q="' + qi + '" data-o="' + oi + '"><span class="opt-letter">' + 'ABCD'[oi] + '</span>' + esc(op) + '</button>').join('') + '</div></div>').join('') +
      '<button class="btn btn-primary btn-block mt10" id="quiz-submit">' + CET.icon('check') + '提交答案</button><div id="quiz-result" class="mt10"></div></div></div>';

    CET.sheet.open({
      title: a.title,
      sub: a.topic + ' · CET-' + a.level + ' · ' + words + ' 词',
      html,
      onMount(body) {
        const selected = {};
        body.querySelectorAll('.quiz-option').forEach((btn) => {
          btn.addEventListener('click', function () {
            const q = btn.getAttribute('data-q');
            body.querySelectorAll('.quiz-option[data-q="' + q + '"]').forEach((x) => x.classList.remove('selected'));
            btn.classList.add('selected');
            selected[q] = Number(btn.getAttribute('data-o'));
          });
        });
        const submit = body.querySelector('#quiz-submit');
        if (submit) submit.addEventListener('click', function () {
          let correct = 0;
          a.questions.forEach((q, qi) => {
            const chosen = selected[qi];
            const opts = body.querySelectorAll('.quiz-option[data-q="' + qi + '"]');
            opts.forEach((op) => {
              const oi = Number(op.getAttribute('data-o'));
              op.classList.remove('correct', 'wrong');
              if (oi === q.answer) op.classList.add('correct');
              if (oi === chosen && chosen !== q.answer) op.classList.add('wrong');
            });
            if (chosen === q.answer) correct++;
            const holder = body.querySelector('.quiz-q[data-q="' + qi + '"]');
            let exp = holder.querySelector('.quiz-explain');
            if (!exp) { exp = document.createElement('div'); exp.className = 'quiz-explain'; holder.appendChild(exp); }
            exp.textContent = (chosen === q.answer ? '正确。' : '正确答案：' + 'ABCD'[q.answer] + '。') + q.explain;
          });
          const result = body.querySelector('#quiz-result');
          if (result) result.innerHTML = '<div class="feedback-item ' + (correct === a.questions.length ? 'good' : 'warn') + '"><span class="dot"></span><div class="fb-main"><b>答对 ' + correct + ' / ' + a.questions.length + ' 题</b><p>回到原文定位同义替换，比单纯记答案更有效。</p></div></div>';
        });
      }
    });
  }

  /* ============================================================ patterns */
  function renderPatterns() {
    const data = state.patterns || {};
    return '<section class="section" style="margin-top:0">' +
      '<div class="section-head"><div><h1 style="font-size:24px;letter-spacing:-.7px">满分句式库</h1>' +
        '<p class="tiny muted" style="margin-top:3px">' + (data.patterns ? data.patterns.length : 144) + ' 个高分句式 · ' + (data.templates ? data.templates.length : 8) + ' 套范文模板 · 可直接查阅</p></div>' +
        '<button class="btn btn-soft btn-sm" data-tab="scan">' + CET.icon('arrowLeft') + '返回</button></div>' +
      '<div class="search-box"><span>' + CET.icon('search') + '</span><input id="pattern-search" type="search" placeholder="搜索句式、中文、用途，如 开头 / 建议 / chart" autocomplete="off">' +
        '<button class="clear" data-action="pattern-clear" aria-label="清空">' + CET.icon('close') + '</button></div>' +
      '<div class="chip-scroll mt10">' +
        '<button class="chip ' + (!state.patternCat || state.patternCat === 'all' ? 'active' : '') + '" data-pattern-cat="all">全部</button>' +
        (data.categories || []).map((c) => '<button class="chip ' + (state.patternCat === c.id ? 'active' : '') + '" data-pattern-cat="' + c.id + '">' + esc(c.name) + '</button>').join('') +
      '</div>' +
      '<div class="chip-scroll mt6">' +
        ['all', '四级', '六级', '四六级'].map((lv) => '<button class="chip ' + ((state.patternLevel || 'all') === lv ? 'active' : '') + '" data-pattern-level="' + lv + '">' + (lv === 'all' ? '全部级别' : lv) + '</button>').join('') +
      '</div>' +
      '<div class="pill-note mt10">' + CET.icon('info') + ' 句式来自四六级高分作文常见写法整理，已改写为可套用模板；使用时替换省略号内容，并结合题目语境调整。</div>' +
    '</section>' +
    '<section class="section" id="pattern-list">' + patternListHtml() + '</section>';
  }

  function patternListHtml() {
    const data = state.patterns || {};
    const q = String(state.patternQuery || '').trim().toLowerCase();
    const cat = state.patternCat || 'all';
    const level = state.patternLevel || 'all';
    const list = (data.patterns || []).filter((p) => {
      if (cat !== 'all' && p.cat !== cat) return false;
      if (level !== 'all' && p.level !== level) return false;
      if (!q) return true;
      return (p.en + ' ' + p.zh + ' ' + p.use + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q);
    });
    const templates = (data.templates || []).filter((t) => {
      if (level !== 'all' && t.level !== level) return false;
      if (!q) return true;
      return (t.name + ' ' + t.use + ' ' + t.zh + ' ' + t.paragraphs.join(' ')).toLowerCase().includes(q);
    });
    let html = '<div class="row mb8"><span class="tiny muted">句式 ' + list.length + ' 条 · 模板 ' + templates.length + ' 套</span></div>';
    if (!list.length && !templates.length) {
      return html + '<div class="empty"><div class="empty-icon">' + CET.icon('quote') + '</div><h3>没有找到匹配句式</h3><p>试试「开头」「建议」「图表」「书信」或更短的关键词。</p></div>';
    }
    if (list.length) {
      const size = 10;
      const pages = Math.max(1, Math.ceil(list.length / size));
      const sig = cat + '|' + level + '|' + q;
      if (state._patternSig !== sig) { state._patternSig = sig; state.patternPage = 1; }
      const page = Math.min(pages, Math.max(1, state.patternPage || 1));
      state.patternPage = page;
      const slice = list.slice((page - 1) * size, page * size);
      html += '<div class="word-list">' + slice.map(patternCard).join('') + '</div>';
      html += listPagerHtml(page, pages, 'pattern-page');
    } else {
      html += '<div class="empty" style="padding:16px"><p>句式区暂无匹配，看看下方模板。</p></div>';
    }
    if (templates.length) {
      html += '<details class="fold fav-cat mt14" open><summary><h2>' + CET.icon('book') + ' 范文模板</h2><span class="cat-count">' + templates.length + ' 套</span></summary><div class="fold-body"><div class="word-list">' +
        templates.map(templateCard).join('') + '</div></div></details>';
    }
    return html;
  }

  function patternCard(p) {
    const item = { type: 'pattern', term: p.en, sub: p.zh, note: p.use, source: '满分句式库', payload: { id: p.id } };
    return '<article class="card card-tight pattern-card" data-open-pattern="' + p.id + '">' +
      '<div class="row wrap" style="gap:5px"><span class="badge soft">' + esc(patternCatName(p.cat)) + '</span>' +
        '<span class="badge gray">' + esc(p.level) + '</span><span class="right">' +
        CET.fav.button(item, 'small') + '</span></div>' +
      '<div class="pattern-en">' + esc(p.en) + '</div>' +
      '<div class="pattern-zh"><span class="zh-mask">' + esc(p.zh) + '</span></div>' +
      '<div class="pattern-use">' + CET.icon('info') + ' 适用：' + esc(p.use) + '</div>' +
    '</article>';
  }

  function templateCard(t) {
    const item = { type: 'template', term: t.name, sub: t.use, note: t.paragraphs[0][0], source: '范文模板', payload: { id: t.id } };
    return '<article class="card card-tight pattern-card" data-open-template="' + t.id + '">' +
      '<div class="row wrap" style="gap:5px"><span class="badge gold">' + CET.icon('award') + '模板</span><span class="badge gray">' + esc(t.level) + '</span><span class="right">' +
        CET.fav.button(item, 'small') + '</span></div>' +
      '<div class="pattern-en" style="font-size:17px">' + esc(t.name) + '</div>' +
      '<div class="pattern-zh"><span class="zh-mask">' + esc(t.use) + '</span></div>' +
      '<div class="pattern-use">' + CET.icon('list') + ' ' + t.structure.map(esc).join(' → ') + '</div>' +
    '</article>';
  }

  function patternCatName(id) {
    const c = ((state.patterns && state.patterns.categories) || []).find((x) => x.id === id);
    return c ? c.name : id;
  }

  function renderPatternListOnly() {
    const el = $('#pattern-list');
    if (el) el.innerHTML = patternListHtml();
  }

  function openPattern(p) {
    if (!p) return;
    const item = { type: 'pattern', term: p.en, sub: p.zh, note: p.use, source: '满分句式库', payload: { id: p.id } };
    CET.sheet.open({
      title: p.en,
      sub: patternCatName(p.cat) + ' · ' + p.level,
      html: '<div class="card card-hero-soft"><div class="pattern-en" style="font-size:17px">' + esc(p.en) + '</div>' +
        '<div class="pattern-zh mt10"><span class="zh-mask" style="font-size:13px">' + esc(p.zh) + '</span></div>' +
        '<div class="pattern-use mt10">' + CET.icon('info') + ' 适用：' + esc(p.use) + '</div>' +
        '<div class="row mt14"><button class="btn btn-outline btn-sm" data-copy="' + CET.escAttr(p.en) + '">' + CET.icon('copy') + '复制</button>' +
          CET.fav.button(item) + '</div></div>' +
        '<div class="pill-note mt14">用法：把省略号替换成题目中的具体对象；句式只是骨架，内容和逻辑仍要扣题。</div>',
      onMount() {}
    });
  }

  function openTemplate(t) {
    if (!t) return;
    const item = { type: 'template', term: t.name, sub: t.use, note: t.paragraphs[0][0], source: '范文模板', payload: { id: t.id } };
    let html = '<div class="card card-hero-soft"><span class="badge gold">' + CET.icon('award') + '范文模板</span>' +
      '<div class="pattern-en mt10" style="font-size:21px">' + esc(t.name) + '</div>' +
      '<div class="pattern-zh mt6"><span class="zh-mask">' + esc(t.use) + '</span></div></div>';
    t.paragraphs.forEach((para, i) => {
      html += '<div class="detail-block"><div class="detail-title"><h3>第 ' + (i + 1) + ' 段 · ' + esc(t.structure[i] || '') + '</h3></div>' +
        para.map((s) => '<div class="example-card"><div class="ex-en">' + esc(s) + '</div>' +
          '<div class="row mt6"><button class="btn btn-ghost btn-sm" data-copy="' + CET.escAttr(s) + '">' + CET.icon('copy') + '复制</button></div></div>').join('') + '</div>';
    });
    html += '<div class="detail-block"><div class="detail-title"><h3>使用提示</h3></div><div class="feedback-list">' +
      t.tips.map((x) => '<div class="feedback-item good"><span class="dot"></span><div class="fb-main"><p>' + esc(x) + '</p></div></div>').join('') + '</div></div>' +
      '<div class="row mt14">' + CET.fav.button(item, 'lg') + '</div>';
    CET.sheet.open({
      title: t.name,
      sub: '范文模板 · ' + t.level,
      html,
      onMount() {}
    });
  }


  /* ============================================================ exam */
  function defaultExam() {
    return {
      level: 4,
      essayPrompt: '',
      essayText: '',
      translationPrompt: '',
      translationText: '',
      translationRef: '',
      listeningKey: '',
      listeningMine: '',
      listeningMarks: '',
      readingKey: '',
      readingMine: '',
      readingMarks: '',
      modes: { listening: 'answers', reading: 'answers' },
      open: { writing: true, listening: false, reading: false, translation: false },
      paperMarks: '',
      paperResult: null,
      markRule: 'redWrong',
      redHasTick: false,
      result: null
    };
  }

  function loadExam() {
    const saved = CET.store.get('cet46:exam:v1', null);
    const base = defaultExam();
    if (saved && typeof saved === 'object') {
      const merged = Object.assign(base, saved);
      merged.open = Object.assign(base.open, saved.open || {});
      merged.modes = Object.assign(base.modes, saved.modes || {});
      merged.level = saved.level === 6 ? 6 : 4;
      if (saved.result) merged.result = saved.result;
      return merged;
    }
    return base;
  }

  function saveExamNow() {
    try { CET.store.set('cet46:exam:v1', state.exam); } catch (e) {}
  }
  function saveExamDebounced() {
    clearTimeout(examSaveTimer);
    examSaveTimer = setTimeout(saveExamNow, 350);
  }

  function paperModuleHtml(m, label) {
    return '<div class="card" style="padding:14px"><div class="row"><b style="font-size:14px">' + label + '</b>' +
      '<span class="right" style="font-weight:800">' + m.score + ' / ' + m.max + '</span></div>' +
      '<div class="tiny muted mt6">答对 ' + m.correct + ' / ' + m.total + ' 题 · 正确率 ' + m.pct + '%</div>' +
      '<div class="score-bar mt8"><i style="width:' + m.pct + '%"></i></div>' +
      '<div class="chips mt10">' + m.parts.map((p) => '<span class="chip">' + p.name + ' ' + p.correct + '/' + p.total + '</span>').join('') + '</div></div>';
  }

  function stepLine(no, title, done, detail) {
    return '<div class="tiny" style="margin:-4px 0 10px;line-height:1.6;' + (done ? '' : 'color:var(--muted)') + '">' +
      no + ' ' + title + '：' + (done ? '<b style="color:var(--blue-700)">完成</b>' : '待完成') +
      (detail ? '<span class="muted"> · ' + esc(detail) + '</span>' : '') + '</div>';
  }

  /* 严格四步：拍题目 -> 识别题目 -> 拍内容 -> 识别内容 -> 批改。上一步没完成，下一步不出现。 */
  async function ocrStep(kind, role) {
    const isW = kind === 'writing';
    const img = role === 'prompt' ? state.examPromptImage : state.examAnswerImage;
    if (!img) return;
    const key = role === 'prompt' ? (isW ? 'essayPrompt' : 'translationPrompt') : (isW ? 'essayText' : 'translationText');
    state[role === 'prompt' ? 'examPromptBusy' : 'examAnswerBusy'] = true;
    examPhotoCapture(kind);
    try {
      const r = await CET.AI.ocrText(img, { filename: role === 'prompt' ? 'prompt.jpg' : 'answer.jpg' });
      let t = (r.text || '').trim();
      if (role === 'answer') t = collapseStruckOut(t).text;
      state.exam[key] = t;
      saveExamNow();
      if (!t) CET.toast(role === 'prompt' ? '题目没读到文字，请重拍' : '内容没读到文字，请重拍', 'red');
    } catch (e) {
      CET.toast('识别失败：' + ((e && e.message) || '未知'), 'red');
    } finally {
      state[role === 'prompt' ? 'examPromptBusy' : 'examAnswerBusy'] = false;
      state[role === 'prompt' ? 'examPromptTried' : 'examAnswerTried'] = true;
      saveExamNow();
      examPhotoCapture(kind);
    }
  }

  function examPhotoCapture(kind) {
    state.examPhotoKind = kind;
    const isW = kind === 'writing';
    const label = isW ? '作文' : '翻译';
    const promptImg = state.examPromptKind === kind ? state.examPromptImage : null;
    const answerImg = state.examAnswerKind === kind ? state.examAnswerImage : null;
    const promptText = String((isW ? state.exam.essayPrompt : state.exam.translationPrompt) || '').trim();
    const contentText = String((isW ? state.exam.essayText : state.exam.translationText) || '').trim();
    const busyP = !!state.examPromptBusy, busyA = !!state.examAnswerBusy;

    let step = 0, title = '', actions = '';
    const pTried = !!state.examPromptTried, aTried = !!state.examAnswerTried;
    if (!promptImg) {
      step = 1; title = '拍' + label + '题目';
      actions = '<button class="btn btn-primary btn-block" data-exam-role="prompt" data-source="camera">' + CET.icon('camera') + '拍照</button>' +
        '<button class="btn btn-outline btn-block mt8" data-exam-role="prompt" data-source="gallery">' + CET.icon('image') + '从相册选</button>';
    } else if (!pTried) {
      step = 2; title = '识别题目';
      actions = '<div class="tiny muted">正在识别题目…</div>';
    } else if (!answerImg) {
      step = 3; title = '拍' + label + '内容';
      actions = '<button class="btn btn-primary btn-block" data-exam-role="answer" data-source="camera">' + CET.icon('camera') + '拍照</button>' +
        '<button class="btn btn-outline btn-block mt8" data-exam-role="answer" data-source="gallery">' + CET.icon('image') + '从相册选</button>';
    } else if (!aTried) {
      step = 4; title = '识别' + label;
      actions = '<div class="tiny muted">正在识别' + label + '…</div>';
    } else {
      step = 5; title = '开始批改';
      actions = '<button class="btn btn-primary btn-block" id="exam-photo-regrade">' + CET.icon('sparkles') + '开始批改</button>';
    }

    const done = [];
    if (promptText) done.push('题目 ' + promptText.length + ' 字');
    if (contentText) done.push('内容 ' + contentText.split(/\s+/).filter(Boolean).length + ' 词');

    CET.sheet.open({
      title: '第 ' + step + ' 步 · ' + title,
      sub: done.length ? '已完成：' + done.join(' · ') : (label + '批改'),
      html: '<div class="card card-tight" style="padding:16px">' + actions + '</div>',
      onMount(body) {
        body.querySelectorAll('[data-exam-role]').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.pendingExamPhoto = kind;
            state.pendingExamRole = btn.getAttribute('data-exam-role') || 'answer';
            const source = btn.getAttribute('data-source');
            CET.sheet.close();
            if (source === 'gallery') startGallery(); else startCamera();
          });
        });
        const go = body.querySelector('#exam-photo-regrade');
        if (go) go.addEventListener('click', () => {
          CET.sheet.closeAll();
          aiGradePaper(kind === 'translation' ? 'translation' : 'writing');
        });
      }
    });
  }

  function afterExamPhoto(kind, role) {
    examPhotoCapture(kind);
    ocrStep(kind, role);
  }

  function openExamTextEditor(kind, text) {
    const isW = kind === 'writing';
    const promptKey = isW ? 'essayPrompt' : 'translationPrompt';
    const textKey = isW ? 'essayText' : 'translationText';
    CET.sheet.open({
      title: isW ? '修改作文' : '修改翻译',
      sub: '题目与内容都可改，保存后重新算分',
      html: '<div class="field"><div class="field-label">' + (isW ? '题目 / 要求' : '原文（中文）') +
          ' <span class="hint">批改需要对照</span></div>' +
          '<textarea class="short" id="exam-photo-prompt">' + esc(state.exam[promptKey] || '') + '</textarea></div>' +
        '<div class="field"><div class="field-label">' + (isW ? '作文' : '译文') + '</div>' +
          '<textarea id="exam-photo-text" style="width:100%;min-height:240px">' + esc(text || state.exam[textKey] || '') + '</textarea></div>' +
        '<button class="btn btn-primary btn-block mt14" id="exam-photo-save">' + CET.icon('check') + '保存并算分</button>',
      onMount(body) {
        const btn = body.querySelector('#exam-photo-save');
        if (!btn) return;
        btn.addEventListener('click', () => {
          const val = collapseStruckOut((body.querySelector('#exam-photo-text') || {}).value || '');
          const prompt = (body.querySelector('#exam-photo-prompt') || {}).value || '';
          state.exam[promptKey] = prompt.trim();
          state.exam[textKey] = val.text.trim();
          saveExamNow();
          CET.sheet.closeAll();
          /* 改过题目或正文就得重跑 AI 批改，否则分数还是旧的。 */
          if (CET.AI && CET.AI.hasKey && CET.AI.hasKey()) {
            aiGradePaper(kind === 'translation' ? 'translation' : 'writing');
            return;
          }
          gradePaper();
          if (state.exam.paperResult) setTimeout(() => showExamReport(kind), 120);
        });
      }
    });
  }

  /**
   * Handwriting strike-outs come back from OCR as the same word twice
   * ("undoubtedly undoubtedly"); collapse them so they are not scored as a
   * repetition error. Legitimate English repeats are left alone.
   */
  const KEEP_REPEATS = new Set(['had', 'that', 'is', 'was', 'very', 'no', 'so', 'ha', 'bye']);
  function collapseStruckOut(text, quiet) {
    let n = 0;
    const out = String(text || '').replace(/\b([A-Za-z]{2,})(\s+)\1\b/gi, (all, w, ws) => {
      if (KEEP_REPEATS.has(w.toLowerCase())) return all;
      n++;
      return w;
    });
    if (n && !quiet) CET.toast('已合并 ' + n + ' 处重复词（多为手写涂改）');
    return { text: out, n };
  }

  function sentenceCorrections(kind) {
    const text = kind === 'writing' ? state.exam.essayText : state.exam.translationText;
    const all = state.exam.paperResult;
    const e = all && (kind === 'writing' ? all.essay : all.translation);
    if (!text || !e) return [];
    const errs = (e.analysis && e.analysis.errors) || [];
    const ups = e.upgrades || [];
    const sents = String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [String(text)];
    const out = [];
    sents.forEach((raw, idx) => {
      const original = raw.trim();
      if (!original) return;
      const low = original.toLowerCase();
      const localErrs = errs.filter((x) => x.excerpt && low.includes(String(x.excerpt).toLowerCase()));
      const localUps = ups.filter((x) => x.from && low.includes(String(x.from).toLowerCase()));
      let fixed = original;
      for (const x of localErrs) {
        if (!x.suggestion) continue;
        const re = new RegExp(CET.escapeRegExp(x.excerpt), 'i');
        fixed = fixed.replace(re, x.suggestion);
      }
      for (const x of localUps) {
        if (!x.to) continue;
        const re = new RegExp(CET.escapeRegExp(x.from), 'i');
        fixed = fixed.replace(re, x.to);
      }
      const tips = [];
      for (const x of localErrs) if (x.message) tips.push(x.type + '：' + x.message);
      for (const x of localUps) if (x.why) tips.push('推荐表达：' + x.from + ' → ' + x.to + '（' + x.why + '）');
      if (fixed === original && !tips.length) return;
      out.push({ id: out.length, original, fixed, tips, errs: localErrs, ups: localUps, index: idx + 1 });
    });
    return out;
  }

  function highlightSentence(sentence, fixes) {
    let html = esc(sentence);
    const needles = [];
    for (const x of fixes.errs || []) if (x.excerpt) needles.push(x.excerpt);
    for (const x of fixes.ups || []) if (x.from) needles.push(x.from);
    const uniq = [...new Set(needles)].sort((a, b) => b.length - a.length);
    for (const n of uniq) {
      const safe = esc(n);
      if (!safe) continue;
      const re = new RegExp(safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      html = html.replace(re, '<mark>$&</mark>');
    }
    return html;
  }

  function applySentenceFix(kind, index) {
    const list = state._sentenceFixes || [];
    const fix = list.find((x) => x.id === Number(index));
    if (!fix) return;
    const key = kind === 'writing' ? 'essayText' : 'translationText';
    const text = state.exam[key] || '';
    state.exam[key] = text.replace(fix.original, fix.fixed);
    saveExamNow();
    CET.sheet.closeAll();
    gradePaper();
    setTimeout(() => showExamReport(kind), 120);
  }

  function showExamReport(kind) {
    /* 报告是弹层：先把可能还开着的「拍作文」弹层关掉，否则新弹层会被压在下面。 */
    try { CET.sheet.closeAll(); } catch (e) {}
    try {
      showExamReportInner(kind);
    } catch (err) {
      CET.toast('报告打开失败：' + ((err && err.message) || '未知错误'), 'red');
      console.error('showExamReport failed', err);
    }
  }

  function showExamReportInner(kind) {
    const all = state.exam.paperResult;
    const e = all && (kind === 'writing' ? all.essay : all.translation);
    if (!e) { CET.toast('还没有批改结果'); return; }
    const label = kind === 'writing' ? '作文' : '翻译';
    const rubric = (e.rubric || []).map((x) =>
      '<div class="card card-tight" style="padding:12px"><div class="row"><b style="font-size:13px">' + esc(x.name) + '</b><span class="right" style="font-weight:800">' + x.score + ' / ' + x.max + '</span></div>' +
      (x.why ? '<div class="tiny muted mt6" style="line-height:1.6">' + esc(x.why) + '</div>' : '') + '</div>'
    ).join('');
    const deductions = (e.deductions || []).map((d) =>
      '<div class="tiny" style="line-height:1.7">· ' + esc(d.item || '') + ' <b style="color:#c0392b">−' + (d.lost || 0) + '</b>' + (d.why ? '：' + esc(d.why) : '') + '</div>'
    ).join('');
    const aiSentences = (e.sentences || []).map((x) =>
      '<div class="card card-tight" style="padding:12px;margin-top:8px"><div class="tiny muted">第 ' + (x.index || '?') + ' 句</div>' +
      '<div style="font-size:14px;line-height:1.7;margin-top:6px">' + esc(x.original || '') + '</div>' +
      (x.fixed ? '<div style="font-size:14px;line-height:1.7;margin-top:6px;color:var(--blue-700)">→ ' + esc(x.fixed) + '</div>' : '') +
      ((x.notes || []).length ? '<div class="tiny muted mt6" style="line-height:1.6">' + x.notes.map(esc).join('<br>') + '</div>' : '') + '</div>'
    ).join('');
    const nextSteps = (e.nextSteps || []).map((t) => '<li>' + esc(t) + '</li>').join('');
    const issues = (e.issues || []).map((x) =>
      '<div class="feedback-item bad" style="margin-top:8px"><span class="dot"></span><div class="fb-main"><b>' + esc(x.title || x.type || '问题') + '</b><p>' + esc(x.detail || '') + '</p></div></div>'
    ).join('');
    const strengths = (e.strengths || []).map((x) => '<li>' + esc(x) + '</li>').join('');
    const upgrades = (e.upgrades || []).slice(0, 8).map((u) =>
      '<div class="card card-tight" style="padding:11px;margin-top:7px"><div class="tiny muted">' + esc(u.from) + ' →</div><div style="font-weight:700;font-size:13px">' + esc(u.to) + '</div>' + (u.why ? '<div class="tiny muted mt6">' + esc(u.why) + '</div>' : '') + '</div>'
    ).join('');
    const sentenceFixes = sentenceCorrections(kind);
    state._sentenceFixes = sentenceFixes;
    const sentenceHtml = sentenceFixes.map((f) =>
      '<div class="card" style="padding:14px;margin-top:9px"><div class="row"><span class="badge soft">第 ' + f.index + ' 句</span>' +
        (f.fixed !== f.original ? '<button class="btn btn-soft btn-sm right" data-sentence-fix="' + f.id + '">修改</button>' : '') + '</div>' +
        '<div style="font-size:15px;line-height:1.7;margin-top:8px">' + highlightSentence(f.original, f) + '</div>' +
        (f.fixed !== f.original ? '<div class="feedback-item good mt8"><span class="dot"></span><div class="fb-main"><b>建议改为</b><p>' + esc(f.fixed) + '</p></div></div>' : '') +
        (f.tips.length ? '<div class="tiny muted mt8" style="line-height:1.7">' + f.tips.map(esc).join('<br>') + '</div>' : '') +
      '</div>'
    ).join('');
    CET.sheet.open({
      title: label + '批改',
      sub: (e.band ? e.band.label + ' · ' + e.raw + '/15' : '') + aiCallLabel(),
      html: '<div class="card" style="padding:18px"><div class="row"><div class="grow"><b style="font-size:26px">' + e.raw + ' / 15</b>' +
        '<div class="tiny muted mt6">折合 ' + e.converted + ' / 106.5 · ' + esc(e.band ? e.band.label : '') + '</div></div>' +
        '<span class="badge soft">' + esc(e.band ? e.band.label : '') + '</span></div>' +
        '<div class="tiny muted mt8">' + e.wordCount + ' 词 · ' + esc(e.expected || '') + '</div></div>' +
        (e.bandReason ? '<div class="callout mt12">' + esc(e.bandReason) + '</div>' : '') +
        '<div class="section-head mt14"><h2>评分项</h2></div>' + rubric +
        (deductions ? '<div class="section-head mt14"><h2>扣分说明</h2></div>' + deductions : '') +
        (issues ? '<div class="section-head mt14"><h2>主要问题</h2></div>' + issues : '') +
        (strengths ? '<div class="section-head mt14"><h2>做得好的地方</h2></div><ul class="tiny" style="padding-left:18px;line-height:1.9">' + strengths + '</ul>' : '') +
        (upgrades ? '<div class="section-head mt14"><h2>可升级表达</h2></div>' + upgrades : '') +
        (nextSteps ? '<div class="section-head mt14"><h2>下一步</h2></div><ul class="tiny" style="padding-left:18px;line-height:1.9">' + nextSteps + '</ul>' : '') +
        '<button class="btn btn-ghost btn-block mt14" data-sheet-close>关闭</button>',
      onMount(body) {
        body.querySelectorAll('[data-sentence-fix]').forEach((b) => {
          b.addEventListener('click', () => applySentenceFix(kind, b.getAttribute('data-sentence-fix')));
        });
      }
    });
  }

  /* 把最近一次批改的真实调用信息写出来：有没有真的调接口、耗时、token 数。 */
  function aiCallLabel() {
    const m = state.exam && state.exam.aiMeta;
    if (!m) return '';
    const tok = '';
    const t = new Date(m.at);
    const hh = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    return ' · ' + (m.ms / 1000).toFixed(1) + 's · ' + hh;
  }

  async function genSample(kind) {
    const isW = kind !== 'translation';
    const promptText = String((isW ? state.exam.essayPrompt : state.exam.translationPrompt) || '').trim();
    if (!promptText) { CET.toast('还没有题目文字，先拍照识别题目', 'red'); return; }
    const sid = 'g' + Date.now();
    CET.sheet.open({ title: '生成中', sub: isW ? '正在写范文' : '正在写参考译文',
      html: '<div class="scan-progress"><div class="ring"></div><div class="grow"><b>生成中…</b><span>通常 5–15 秒</span></div></div>' });
    try {
      const text = isW ? await CET.AI.composeEssay(promptText, state.exam.level)
        : await CET.AI.composeTranslation(promptText, state.exam.level);
      CET.sheet.open({
        title: isW ? '范文（AI 生成）' : '参考译文（AI 生成）',
        sub: (state.exam.level === 6 ? 'CET-6' : 'CET-4') + ' · ' + text.split(/\s+/).filter(Boolean).length + ' 词',
        html: '<button class="btn btn-ghost btn-block" data-fold-target="sam-body-' + sid + '">▸ ' + (isW ? '范文正文' : '参考译文正文') + ' · ' + text.split(/\s+/).filter(Boolean).length + ' 词</button>' +
          '<div id="sam-body-' + sid + '" style="display:none"><div class="token-text" style="font-size:15px;line-height:1.8">' + esc(text) + '</div></div>' +
          '<div class="row mt12"><button class="btn btn-ghost btn-sm" data-copy="' + CET.escAttr(text) + '">' + CET.icon('copy') + '复制</button>' +
          CET.fav.button({ type: isW ? 'essay' : 'translation', term: text, sub: isW ? 'AI 范文' : 'AI 参考译文', note: promptText.slice(0, 40), source: isW ? 'AI 范文' : 'AI 参考译文', payload: { text: text } }) + '</div>'
      });
    } catch (e) {
      CET.toast('生成失败：' + ((e && e.message) || '未知'), 'red');
    }
  }

  function paperSubjectCard(kind, r) {
    const isW = kind === 'writing';
    const label = isW ? '写作' : '翻译';
    const text = isW ? state.exam.essayText : state.exam.translationText;
    const hasText = !!(text && text.trim());
    const showScore = !!(r && hasText);
    const score = showScore ? (r.raw + ' / 15 → ' + r.converted + ' / 106.5') : (hasText ? '待算分' : '未拍');
    const band = showScore && r.band ? r.band.label : '';
    const callMeta = showScore ? aiCallLabel() : '';
    const hasAnyData = hasText || showScore || (state.examPromptKind === kind && !!state.examPromptImage) || (state.examAnswerKind === kind && !!state.examAnswerImage);
    return '<div class="card paper-subject-card"><div class="row"><b class="paper-subject-title">' + label + '</b>' +
      '<span class="right paper-subject-score">' + score + '</span>' +
      (hasAnyData ? '<button class="btn btn-ghost btn-sm" data-action="paper-clear-subject" data-subject="' + kind + '">清除</button>' : '') + '</div>' +
      '<div class="tiny muted mt6">' + (band || (hasText ? '已识别，可查看/修改' : (state.examPromptKind === kind && state.examPromptImage ? '题目已拍，接着拍内容' : '先拍题目，再拍内容'))) + (callMeta ? '<span class="muted"> · ' + callMeta.replace(/^ · /, '') + '</span>' : '') + '</div>' +
      '<div class="mt10">' + (showScore ? '' : '<button class="btn ' + (hasText ? 'btn-outline' : 'btn-primary') + ' btn-block paper-subject-btn" data-action="exam-photo-' + kind + '">' + CET.icon('camera') + '拍照</button>') +
        (text && text.trim() ? '<button class="btn btn-soft btn-block mt6" data-action="exam-edit-' + kind + '">' + CET.icon('writing') + '查看/修改</button>' : '') +
        ((isW && state.examAnswerKind === kind && state.examAnswerImage) ? '<button class="btn btn-ghost btn-block mt6" data-action="exam-crop-' + kind + '">' + CET.icon('scan') + '调整裁剪</button>' : '') +
        (showScore ? '<button class="btn btn-soft btn-block mt8" data-action="exam-report-' + kind + '">' + CET.icon('award') + (isW ? '查看作文批改' : '查看翻译批改') + '</button>' : '') +
        (showScore ? '<button class="btn btn-outline btn-block mt6" data-action="exam-sample-' + kind + '">' + CET.icon('writing') + (isW ? '生成范文' : '生成参考译文') + '</button>' : '') +
      '</div></div>';
  }

  function renderExam() {
    const r = state.exam.paperResult;
    const map = examMarksStats(state.exam.paperMarks || '').map;
    const hasObjective = !!(String(state.exam.paperMarks || '').trim());
    const hasAny = !!(r && ((r.essay && String(state.exam.essayText || '').trim()) || (r.translation && String(state.exam.translationText || '').trim())));
    const hasSubjectText = !!(String(state.exam.essayText || '').trim() || String(state.exam.translationText || '').trim());
    const rule = 'redWrong';
    return '' +
      '<section class="section" style="margin-top:0">' +
        '<div class="exam-head"><div class="grow"><h1>拍照判分<span class="exam-ai-hint">AI 批改</span></h1><p>整卷勾叉 · 写作 · 翻译</p></div>' +
          '<div class="level-switch">' +
            '<button class="' + (state.exam.level === 4 ? 'active' : '') + '" data-level="4">CET-4</button>' +
            '<button class="' + (state.exam.level === 6 ? 'active' : '') + '" data-level="6">CET-6</button>' +
          '</div></div>' +
        '<div class="row mt8" style="justify-content:flex-end;gap:10px">' +
            '<button class="link" data-action="paper-clear">清除全部</button>' +
        '</div>' +
      '</section>' +
      '<section class="section" style="margin-top:0">' +
        '<div class="card paper-hero">' +
          '<div class="row"><span class="paper-hero-icon">' + CET.icon('camera') + '</span>' +
            '<div class="grow"><b class="paper-hero-title">整套试卷</b><div class="tiny muted mt6">整卷勾叉 · 自动算听力 / 阅读</div></div>' +
            '<span class="badge soft">整卷</span><button class="btn btn-ghost btn-sm" data-action="paper-clear-objective">清除</button></div>' +
          '<button class="btn btn-primary btn-block paper-scan-btn mt8" data-action="paper-review" style="margin-top:16px">' + CET.icon('grid') + '核对勾叉</button>' +
          '<div class="row wrap mt8"><button class="btn btn-ghost btn-sm" data-action="paper-grade">' + CET.icon('check') + '重新算分</button></div>' +
          (hasObjective ? '<div class="paper-result mt14" id="exam-result"><div class="row"><div class="grow"><b style="font-size:24px">' + r.listening.correct + ' + ' + r.reading.correct + ' 题</b>' +
            '<div class="tiny muted mt6">听力 ' + r.listening.correct + '/25 · 阅读 ' + r.reading.correct + '/30 · 客观题 ' + r.score + ' / 497</div></div></div>' +
            '<div class="grid-2 mt10">' + paperModuleHtml(r.listening, '听力') + paperModuleHtml(r.reading, '阅读') + '</div></div>' : '') +
        '</div>' +
      '</section>' +
      '<section class="section"><div class="section-head"><h2>写作 / 翻译</h2><span class="tiny muted">题目 + 内容两张照片</span></div>' +
        paperSubjectCard('writing', r && r.essay) +
        paperSubjectCard('translation', r && r.translation) +
      '</section>' +
      (hasAny ? '<section class="section"><div class="card" id="exam-result" style="padding:18px"><div class="row"><div class="grow"><b style="font-size:24px">' + (Math.round((((r.essay && state.exam.essayText) ? r.essay.converted : 0) + ((r.translation && state.exam.translationText) ? r.translation.converted : 0)) * 10) / 10) + ' / ' + ((106.5 * (((r.essay && state.exam.essayText) ? 1 : 0) + ((r.translation && state.exam.translationText) ? 1 : 0))) || 213) + '</b>' +
        '<div class="tiny muted mt6">写作 + 翻译合计</div></div><div class="right"><span class="badge soft">主观题</span></div></div></div></section>' : '') +
      (hasObjective ? '<section class="section"><div class="card" style="padding:18px"><div class="row"><div class="grow"><b style="font-size:24px">' + (Math.round((r.score || 0) * 10) / 10) + ' / 497</b>' +
      '<div class="tiny muted mt6">听力 + 阅读（按勾叉）</div></div><div class="right"><span class="badge gray">客观题</span></div></div></div></section>' : '') +
      (hasAny ? '<section class="section"><div class="card" style="padding:18px"><div class="row"><div class="grow"><b style="font-size:26px">' +
      (Math.round(((r.score || 0) + ((r.essay && state.exam.essayText) ? r.essay.converted : 0) + ((r.translation && state.exam.translationText) ? r.translation.converted : 0)) * 10) / 10) + ' / ' +
      (497 + 106.5 * (((r.essay && state.exam.essayText) ? 1 : 0) + ((r.translation && state.exam.translationText) ? 1 : 0))) + '</b>' +
      '<div class="tiny muted mt6">客观题 + 写作 + 翻译</div></div><div class="right"><span class="badge soft">总分</span></div></div></div></section>' : '') +
      '<div class="pill-note mt14">' + CET.icon('info') + ' 写作、翻译分别拍照识别后自动批改；识别结果可点「查看/修改」调整文字后重新算分。</div>' +
      '<section class="section"><details class="card paper-disclaimer"><summary>写作 / 翻译评分免责声明</summary>' +
        '<div class="fold-body"><p>本功能使用本机规则、词频统计和 OCR 识别结果自动估算写作与翻译分数，不是官方阅卷，不代表四六级真实成绩，也不构成任何考试评价依据。</p>' +
        '<p>题目、作文、译文和参考译文可能存在识别错误；分数、批改建议和修改示例仅供学习参考。请以官方考试成绩和人工评分为准。</p></div>' +
      '</details></section>';
  }

  function examPages() {
    if (!state.examPages) state.examPages = [];
    return state.examPages;
  }

  function examPageListHtml(pages) {
    if (!pages.length) return '<div class="empty" style="padding:18px 8px"><div class="empty-icon">' + CET.icon('camera') + '</div><h3>还没有试卷照片</h3><p>先拍一页，或从相册选择。</p></div>';
    return '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' + pages.map((p, i) =>
      '<div style="position:relative"><img src="' + p.dataUrl + '" alt="第 ' + (i + 1) + ' 页" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:9px;border:1px solid #dbe6f5">' +
        '<button class="btn btn-ghost btn-sm" data-exam-page-remove="' + p.id + '" style="position:absolute;right:2px;top:2px;padding:2px 6px;min-height:0;background:rgba(255,255,255,.9)">' + CET.icon('close') + '</button>' +
        '<div class="tiny muted" style="text-align:center;margin-top:2px">第 ' + (i + 1) + ' 页</div></div>').join('') + '</div>';
  }

  function openExamPaperScan() {
    const pages = examPages();
    CET.sheet.open({
      title: '拍整套试卷',
      sub: '勾叉识别 · 可连续拍多页',
      html: '<div class="pill-note mb12">' + CET.icon('info') + ' 把整张试卷的题号和 √ / × 拍清楚，一次拍一页或多页都可以。听力 1–25、阅读 26–55 分开统计，不需要使用 A/B/C/D 答案。</div>' +
        '<div class="tiny muted mb12" style="line-height:1.65">拍摄建议：试卷占满画面、光线均匀、勾叉用深色笔；一页 10–15 题比整页远拍更准。</div>' +
        '<div id="exam-page-list">' + examPageListHtml(pages) + '</div>' +
        '<div class="row wrap mt14"><button class="btn btn-primary" id="exam-page-camera">' + CET.icon('camera') + '拍一页</button>' +
          '<button class="btn btn-outline" id="exam-page-gallery">' + CET.icon('image') + '从相册选</button></div>' +
        (pages.length ? '<button class="btn btn-primary btn-block mt10" id="exam-page-run">' + CET.icon('scan') + '识别 ' + pages.length + ' 页并判分</button>' : '') +
        '<div class="tiny muted mt10" style="line-height:1.6">识别在本机完成，不上传。勾叉是手写符号，OCR 可能误读，下一步会让你核对。</div>',
      onMount(body) {
        const cam = body.querySelector('#exam-page-camera');
        const gal = body.querySelector('#exam-page-gallery');
        const run = body.querySelector('#exam-page-run');
        if (cam) cam.addEventListener('click', () => {
          state.pendingExamPage = 'camera';
          CET.sheet.close();
          startCamera();
        });
        if (gal) gal.addEventListener('click', () => {
          state.pendingExamPage = 'gallery';
          CET.sheet.close();
          startGallery();
        });
        body.querySelectorAll('[data-exam-page-remove]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-exam-page-remove');
            state.examPages = examPages().filter((p) => p.id !== id);
            openExamPaperScan();
          });
        });
        if (run) run.addEventListener('click', runExamPaperOcr);
      }
    });
  }

  function detectRedMarks(dataUrl, words) {
    return new Promise((resolve) => {
      if (!dataUrl || !Array.isArray(words)) { resolve([]); return; }
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const seen = new Set();
        const out = [];
        for (const w of words) {
          const m = String(w.text || '').match(/\d{1,2}/);
          if (!m || !w.bbox) continue;
          const q = parseInt(m[0], 10);
          if (q < 1 || q > 55 || seen.has(q)) continue;
          const b = w.bbox, bh = Math.max(10, b.y1 - b.y0);
          const x0 = Math.max(0, b.x0 - bh * 0.3);
          const x1 = Math.min(W, b.x1 + bh * 2.0);
          const y0 = Math.max(0, b.y0 - bh * 1.5);
          const y1 = Math.min(H, b.y1 + bh * 1.0);
          const rw = Math.max(2, Math.round(x1 - x0)), rh = Math.max(2, Math.round(y1 - y0));
          canvas.width = rw; canvas.height = rh;
          ctx.clearRect(0, 0, rw, rh);
          ctx.drawImage(img, x0, y0, rw, rh, 0, 0, rw, rh);
          const d = ctx.getImageData(0, 0, rw, rh).data;
          const pts = [];
          for (let i = 0; i < d.length; i += 4) {
            const rr = d[i], gg = d[i + 1], bb = d[i + 2];
            if (rr > 85 && rr > gg + 28 && rr > bb + 18) {
              const idx = i / 4;
              pts.push([idx % rw, Math.floor(idx / rw)]);
            }
          }
          if (pts.length < 8) continue;
          let minX = rw, maxX = 0, minY = rh, maxY = 0;
          for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
          const bw = Math.max(1, maxX - minX + 1), bhh = Math.max(1, maxY - minY + 1);
          let tl = 0, tr = 0, bl = 0, br = 0, bc = 0;
          for (const [x, y] of pts) {
            const nx = (x - minX) / bw, ny = (y - minY) / bhh;
            if (nx < .5 && ny < .5) tl++;
            if (nx >= .5 && ny < .5) tr++;
            if (nx < .5 && ny >= .5) bl++;
            if (nx >= .5 && ny >= .5) br++;
            if (nx > .3 && nx < .7 && ny > .6) bc++;
          }
          const n = pts.length;
          tl /= n; tr /= n; bl /= n; br /= n; bc /= n;
          let mark = '×';
          if (bw / bhh <= 2.2 && tr > 0.18 && bl > 0.18 && br < 0.28 && bc > 0.12) mark = '√';
          out.push({ q, mark });
          seen.add(q);
        }
        resolve(out);
      };
      img.onerror = () => resolve([]);
      img.src = dataUrl;
    });
  }

  CET.detectRedMarks = detectRedMarks;

  function detectSimpleMarks(dataUrl, words) {
    return new Promise((resolve) => {
      if (!dataUrl || !Array.isArray(words)) { resolve([]); return; }
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const seen = new Set();
        const out = [];
        for (const w of words) {
          const m = String(w.text || '').match(/\d{1,2}/);
          if (!m || !w.bbox) continue;
          const q = parseInt(m[0], 10);
          if (q < 1 || q > 55 || seen.has(q)) continue;
          const b = w.bbox, bh = Math.max(10, b.y1 - b.y0), bw = Math.max(8, b.x1 - b.x0);
          const x0 = Math.min(W - 2, b.x1 + 2);
          const x1 = Math.min(W, b.x1 + Math.max(24, bh * 1.5));
          const y0 = Math.max(0, b.y0 - bh * 0.2);
          const y1 = Math.min(H, b.y1 + bh * 0.75);
          const rw = Math.max(2, Math.round(x1 - x0)), rh = Math.max(2, Math.round(y1 - y0));
          canvas.width = rw; canvas.height = rh;
          ctx.clearRect(0, 0, rw, rh);
          ctx.drawImage(img, x0, y0, rw, rh, 0, 0, rw, rh);
          const d = ctx.getImageData(0, 0, rw, rh).data;
          let dark = 0;
          for (let i = 0; i < d.length; i += 4) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (g < 135) dark++;
          }
          if (dark >= 14) { out.push(q); seen.add(q); }
        }
        resolve(out);
      };
      img.onerror = () => resolve([]);
      img.src = dataUrl;
    });
  }

  async function runExamPaperAI(dataUrl) {
    if (!CET.AI || !CET.AI.hasKey()) { go('me'); openDeepSeekSetup('hand'); return; }
    if (state.examOcrBusy) return;
    state.examOcrBusy = true;
    CET.keepAwake(true);
    CET.sheet.open({
      title: 'AI 整卷批改',
      sub: '勾叉 + 作文 + 翻译',
      html: '<div class="scan-progress"><div class="ring"></div><div class="grow"><b>正在识别整卷</b><span>AI 读取红勾、作文和翻译，请稍候</span></div></div>'
    });
    try {
      const res = await CET.AI.paper(dataUrl, state.exam.level);
      const marks = String(res.marks || '').trim();
      if (marks) state.exam.paperMarks = [state.exam.paperMarks, marks].filter(Boolean).join(' ');
      let hasEssay = false, hasTranslation = false;
      if (res.essay && typeof res.essay === 'object') {
        if (res.essay.text) state.exam.essayText = String(res.essay.text).trim();
        if (res.essay.prompt) state.exam.essayPrompt = String(res.essay.prompt).trim();
        hasEssay = !!state.exam.essayText;
      }
      if (res.translation && typeof res.translation === 'object') {
        if (res.translation.text) state.exam.translationText = String(res.translation.text).trim();
        if (res.translation.prompt) state.exam.translationPrompt = String(res.translation.prompt).trim();
        hasTranslation = !!state.exam.translationText;
      }
      saveExamNow();
      CET.sheet.closeAll();
      if (!marks && !hasEssay && !hasTranslation) { CET.toast('没有识别到勾叉、作文或翻译'); return; }
      if (!state.exam.paperResult || hasEssay || hasTranslation) gradePaper();
      if (hasEssay) setTimeout(() => showExamReport('writing'), 180);
      else if (hasTranslation) setTimeout(() => showExamReport('translation'), 180);
      CET.toast('AI 整卷批改完成');
    } catch (e) {
      console.error(e);
      CET.sheet.closeAll();
      CET.toast('AI 整卷批改失败：' + (e && e.message ? e.message : '请检查网络/Key'), 'red');
    } finally {
      state.examOcrBusy = false;
      CET.keepAwake(false);
    }
  }

  async function runExamPaperOcr() {
    const pages = examPages().slice();
    if (!pages.length) { CET.toast('先拍至少一页试卷'); return; }
    if (state.examOcrBusy) return;
    state.examOcrBusy = true;
    state.exam.redHasTick = false;
    CET.sheet.open({
      title: '识别整套试卷',
      sub: pages.length + ' 页 · 本机 OCR',
      html: '<div class="scan-progress"><div class="ring"></div><div class="grow"><b id="exam-ocr-status">准备识别</b><span>逐页识别勾叉，请稍候</span></div><div class="pct" id="exam-ocr-pct">0%</div></div>' +
        '<div class="pill-note mt14">' + CET.icon('info') + ' 识别完成后会先给你核对，不会直接计分。</div>'
    });
    CET.keepAwake(true);
    const out = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const res = await OCR.recognizeMarks(pages[i].dataUrl, (p) => {
          const pct = Math.round(((i + (p.progress || 0)) / pages.length) * 100);
          const a = $('#exam-ocr-pct'), b = $('#exam-ocr-status');
          if (a) a.textContent = pct + '%';
          if (b) b.textContent = '第 ' + (i + 1) + ' / ' + pages.length + ' 页 · ' + (p.label || '识别中');
        });
        let detectedText = '';
        if (res.processed && res.words && res.words.length && CET.MarkDetect) {
          const b = $('#exam-ocr-status');
          if (b) b.textContent = '第 ' + (i + 1) + ' / ' + pages.length + ' 页 · 检测勾叉';
          const marks = await CET.MarkDetect.detect(res.processed, res.words);
          const known = examMarksStats(res.text).map;
          const parts = [];
          Object.keys(marks).forEach((q) => {
            const item = marks[q];
            const qn = Number(q);
            if (!known.has(qn)) { parts.push(q + '.' + item.mark); return; }
            const m = res.text.match(new RegExp('(?:^|\\s)' + q + '\\s*[.)、:：-]?\\s*([VXvx¥￥*√×17])'));
            if (m && /[¥*]/.test(m[1]) && item.conf >= 0.62) parts.push(q + '.' + item.mark);
          });
          detectedText = parts.join(' ');
        }
        if (state.exam.markRule === 'wrongOnly' && res.processed && res.words && res.words.length) {
          const marked = await detectSimpleMarks(res.processed, res.words);
          if (marked.length) detectedText += ' ' + marked.map((q) => q + '.×').join(' ');
        }
        if (state.exam.markRule === 'redWrong' && res.source && res.words && res.words.length) {
          const marked = await detectRedMarks(res.source, res.words);
          
          detectedText = marked.map((m) => m.q + '.' + m.mark).join(' ');
        }
        let body = state.exam.markRule === 'redWrong' ? detectedText : (res.text ? res.text + '\n' : '') + detectedText;
        if (!res.words || !res.words.length) body = (res.text || '').trim() || body;
        out.push({ text: body, words: res.words || [] });
      }
      const text = out.map((r, i) => '【第 ' + (i + 1) + ' 页】\n' + (r.text || '').trim()).join('\n\n');
      CET.sheet.closeAll();
      if (examMarksStats(text).total === 0) {
        reviewExamMarks(text);
      } else {
        state.exam.paperMarks = text;
        state.exam.paperResult = null;
        state.examPages = [];
        gradePaper();
      }
    } catch (e) {
      console.error(e);
      CET.toast('识别失败：' + (e && e.message ? e.message : '请重试'), 'red');
      CET.sheet.closeAll();
      openExamPaperScan();
    } finally {
      state.examOcrBusy = false;
      CET.keepAwake(false);
    }
  }

  function examMarksStats(text) {
    // OCR often reads a handwritten tick as "1" or "7" right after a question number.
    const src = String(text || '').replace(/(\d{1,2})\s*[.)、:：\-]\s*([17])(?=\s|$)/g, '$1.√');
    const map = Grader.parseMarks(src, 1).map;
    let l = 0, r = 0;
    map.forEach((v, q) => { if (q >= 1 && q <= 25) l++; else if (q >= 26 && q <= 55) r++; });
    return { map, l, r, total: map.size };
  }

  function examMarkGridHtml(map, prefix) {
    const attr = (prefix || 'mark') + '-q';
    const cell = (q) => {
      const st = map.has(q) ? (map.get(q) ? 'correct' : 'wrong') : 'unset';
      return '<button type="button" class="exam-mark ' + st + '" data-' + attr + '="' + q + '"><b>' + q + '</b><span>' +
        (st === 'correct' ? '√' : st === 'wrong' ? '×' : '·') + '</span></button>';
    };
    const group = (from, to, title) => {
      let cells = '';
      for (let q = from; q <= to; q++) cells += cell(q);
      return '<div class="mark-group-head"><b>' + title + '</b><span class="tiny muted">' + from + '–' + to + ' 题</span></div>' +
        '<div class="exam-mark-grid">' + cells + '</div>';
    };
    return '<div id="' + (prefix === 'paper' ? 'paper-grid' : 'exam-mark-grid') + '">' +
      group(1, 25, '听力') + group(26, 55, '阅读') + '</div>';
  }

  function serializeMarks(map) {
    return Array.from(map.keys()).sort((a, b) => a - b).map((q) => q + '.' + (map.get(q) ? '√' : '×')).join(' ');
  }

  function reviewExamMarks(text) {
    const s = examMarksStats(text);
    /* Nothing recognised: start from "all correct" so the usual case (a few
       wrong answers) costs one tap per wrong question instead of 55 taps. */
    const seed = new Map(s.map);
    if (!seed.size) { for (let q = 1; q <= 55; q++) seed.set(q, true); }
    const wrongOf = (m) => { let n = 0; m.forEach((v) => { if (!v) n++; }); return n; };
    CET.sheet.open({
      title: '核对勾叉',
      sub: s.total ? '识别到 ' + s.total + ' 个题号' : '默认全对，点掉错的',
      html: '<div class="row">' +
          '<span class="tiny muted" id="exam-mark-count">√ ' + (seed.size - wrongOf(seed)) + ' · × ' + wrongOf(seed) + '</span>' +
          '<span class="right"><button class="btn btn-ghost btn-sm" id="exam-mark-all">全对</button>' +
          '<button class="btn btn-ghost btn-sm" id="exam-mark-clear">清空</button></span></div>' +
        examMarkGridHtml(seed) +
        '<button class="btn btn-primary btn-block mt14" id="exam-marks-grade">' + CET.icon('check') + '按勾叉判分</button>',
      onMount(body) {
        const map = new Map(seed);
        const count = body.querySelector('#exam-mark-count');
        const sync = () => {
          if (count) count.textContent = '√ ' + (map.size - wrongOf(map)) + ' · × ' + wrongOf(map);
        };
        sync();
        body.querySelectorAll('[data-mark-q]').forEach((btn) => {
          btn.addEventListener('click', () => {
            /* Tapping a focused button makes Chromium scroll it into view; keep the
               grid still so a mis-tap does not shift everything. */
            const scroller = document.getElementById('sheet-body') || body;
            const keep = scroller.scrollTop;
            const q = Number(btn.getAttribute('data-mark-q'));
            map.set(q, map.get(q) ? false : true);
            const st = map.get(q) ? 'correct' : 'wrong';
            btn.className = 'exam-mark ' + st;
            btn.querySelector('span').textContent = st === 'correct' ? '√' : '×';
            sync();
            requestAnimationFrame(() => { scroller.scrollTop = keep; });
          });
        });
        const all = body.querySelector('#exam-mark-all');
        if (all) all.addEventListener('click', () => {
          for (let q = 1; q <= 55; q++) map.set(q, true);
          body.querySelectorAll('[data-mark-q]').forEach((btn) => {
            btn.className = 'exam-mark correct';
            btn.querySelector('span').textContent = '√';
          });
          sync();
        });
        const clear = body.querySelector('#exam-mark-clear');
        if (clear) clear.addEventListener('click', () => {
          map.clear();
          body.querySelectorAll('[data-mark-q]').forEach((btn) => {
            btn.className = 'exam-mark unset';
            btn.querySelector('span').textContent = '·';
          });
          sync();
        });
        const btn = body.querySelector('#exam-marks-grade');
        if (!btn) return;
        btn.addEventListener('click', () => {
          const val = serializeMarks(map);
          const st = examMarksStats(val);
          if (!st.total) { CET.toast('没有识别到勾叉，请手动补充'); return; }
          const ex = state.exam;
          ex.paperMarks = val;
          ex.paperResult = null;
          state.examPages = [];
          CET.sheet.closeAll();
          gradePaper();
        });
      }
    });
  }

  function examCard(id, icon, title, sub, body, result) {
    const open = state.exam.open[id] ? ' open' : '';
    return '<article class="exam-card card' + open + '" data-exam-card="' + id + '">' +
      '<div class="card-head" data-toggle-exam="' + id + '">' +
        '<div class="exam-icon ' + (id === 'translation' ? 'green' : id === 'writing' ? 'gold' : id === 'reading' ? 'purple' : '') + '">' + icon + '</div>' +
        '<div class="card-title"><h3>' + title + '</h3><p>' + sub + (result ? ' · 已判 ' + scoreOf(result) : '') + '</p></div>' +
        '<span class="chevron">' + CET.icon('chevronDown') + '</span>' +
      '</div>' +
      '<div class="card-body">' + body + (result ? examFeedback(result) : '') + '</div>' +
    '</article>';
  }

  function scoreOf(r) {
    if (!r) return '';
    if (r.kind === 'objective' || r.kind === 'marks') return r.score + '/' + r.max;
    return r.converted + '/106.5';
  }

  function writingBody(ex) {
    const n = (ex.essayText.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || []).length;
    return '<div class="field"><div class="field-label">题目 / 要求 <span class="hint">可选，用于判断切题度</span></div>' +
      '<textarea class="short" data-exam-field="essayPrompt" placeholder="粘贴作文题目或写作要求…">' + esc(ex.essayPrompt) + '</textarea></div>' +
      '<div class="field"><div class="field-label">作文 <span class="hint" id="essay-count">' + n + ' 词 · 建议 ' + (ex.level === 6 ? '150–200' : '120–180') + '</span></div>' +
      '<textarea class="essay" data-exam-field="essayText" placeholder="输入或拍照识别作文…">' + esc(ex.essayText) + '</textarea></div>' +
      '<div class="tool-row"><button class="btn btn-outline btn-sm" data-scan-target="essayText">' + CET.icon('camera') + '拍照识别</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="sample-essay">填入示例</button>' +
        '<button class="btn btn-ghost btn-sm" data-clear-field="essayText">清空</button></div>' +
      '<button class="btn btn-primary btn-block mt14" data-grade="writing">' + CET.icon('sparkles') + '批改作文' + '（AI）' + '</button>';
  }

  function objectiveBody(kind, ex) {
    const mode = (ex.modes && ex.modes[kind]) || 'answers';
    const marks = mode === 'marks';
    const keyF = kind === 'listening' ? 'listeningKey' : 'readingKey';
    const mineF = kind === 'listening' ? 'listeningMine' : 'readingMine';
    const markF = kind === 'listening' ? 'listeningMarks' : 'readingMarks';
    const start = kind === 'listening' ? 1 : 26;
    const end = kind === 'listening' ? 25 : 55;
    const key = ex[keyF] || '', mine = ex[mineF] || '', markText = ex[markF] || '';
    const k = Grader.parseAnswers(key, start).count;
    const m = marks ? Grader.parseMarks(markText, start).count : Grader.parseAnswers(mine, start).count;
    const switchHtml = '<div class="mode-switch">' +
      '<button class="' + (marks ? '' : 'active') + '" data-obj-mode="answers" data-obj-kind="' + kind + '">按 A/B/C/D 答案</button>' +
      '<button class="' + (marks ? 'active' : '') + '" data-obj-mode="marks" data-obj-kind="' + kind + '">按对号 / 叉号</button>' +
      '</div>';
    if (marks) {
      return switchHtml +
        '<div class="field"><div class="field-label">对号 / 叉号判分 <span class="hint">题号 ' + start + '–' + end + '；√ 对、× 错</span></div>' +
          '<div class="answer-grid">' +
            '<div><div class="field-label">标准答案（可选） <span class="hint">' + k + ' 题</span></div><textarea class="mono short" data-exam-field="' + keyF + '" placeholder="可选：1.A 2.B 3.C …">' + esc(key) + '</textarea></div>' +
            '<div><div class="field-label">我的对号 / 叉号 <span class="hint">' + m + ' 题</span></div><textarea class="mono short" data-exam-field="' + markF + '" placeholder="1.√ 2.× 3.√ …">' + esc(markText) + '</textarea></div>' +
          '</div>' +
          '<div class="parse-hint" id="hint-' + kind + '">支持 √ ✓ 对/正确、× ✗ 错/叉，以及 V/X；可写成 1.√ 2.× 或 1-5 √×√√×。空白按错计。</div></div>' +
          '<div class="tool-row"><button class="btn btn-outline btn-sm" data-scan-target="' + markF + '">' + CET.icon('camera') + '扫描对号叉号</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="sample-objective">填入示例</button>' +
            '<button class="btn btn-ghost btn-sm" data-clear-field="' + markF + '">清空勾叉</button></div>' +
          '<button class="btn btn-primary btn-block mt14" data-grade="' + kind + '">' + CET.icon('check') + '按勾叉判分</button>';
    }
    return switchHtml +
      '<div class="field"><div class="field-label">客观题答案 <span class="hint">题号 ' + start + '–' + end + '，支持 1.A 2.B 或 1-5 ABCDA</span></div>' +
      '<div class="answer-grid">' +
        '<div><div class="field-label">标准答案 <span class="hint">' + k + ' 题</span></div><textarea class="mono short" data-exam-field="' + keyF + '" placeholder="1.A 2.B 3.C …">' + esc(key) + '</textarea></div>' +
        '<div><div class="field-label">我的答案 <span class="hint">' + m + ' 题</span></div><textarea class="mono short" data-exam-field="' + mineF + '" placeholder="1.A 2.B 3.C …">' + esc(mine) + '</textarea></div>' +
      '</div>' +
      '<div class="parse-hint" id="hint-' + kind + '">' + (k && m ? '已识别：标准 ' + k + ' 题 / 我的 ' + m + ' 题' : '两侧都填入后可判分；空白题按错误计。') + '</div></div>' +
      '<div class="tool-row"><button class="btn btn-outline btn-sm" data-scan-target="' + mineF + '">' + CET.icon('camera') + '扫描我的答案</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="sample-objective">填入示例</button>' +
        '<button class="btn btn-ghost btn-sm" data-clear-field="' + keyF + '">清空答案</button></div>' +
      '<button class="btn btn-primary btn-block mt14" data-grade="' + kind + '">' + CET.icon('check') + '按答案判分</button>';
  }

  function translationBody(ex) {
    return '<div class="field"><div class="field-label">中文原文 / 题目要求 <span class="hint">可选</span></div>' +
      '<textarea class="short" data-exam-field="translationPrompt" placeholder="粘贴翻译题的中文段落…">' + esc(ex.translationPrompt) + '</textarea></div>' +
      '<div class="field"><div class="field-label">我的译文 <span class="hint">建议 100–180 词</span></div>' +
      '<textarea class="essay" data-exam-field="translationText" placeholder="输入或拍照识别译文…">' + esc(ex.translationText) + '</textarea></div>' +
      '<div class="tool-row"><button class="btn btn-outline btn-sm" data-scan-target="translationText">' + CET.icon('camera') + '拍照识别</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="sample-translation">填入示例</button>' +
        '<button class="btn btn-ghost btn-sm" data-clear-field="translationText">清空</button></div>' +
      '<div class="field"><div class="field-label">参考译文 <span class="hint">建议填写，用于计算信息覆盖度</span></div>' +
        '<textarea class="short" data-exam-field="translationRef" placeholder="粘贴参考译文，评分会更准确…">' + esc(ex.translationRef) + '</textarea></div>' +
      '<button class="btn btn-primary btn-block mt14" data-grade="translation">' + CET.icon('sparkles') + '批改翻译' + '（AI）' + '</button>';
  }

  function scoreSummaryHtml(total, cfg) {
    const p = Math.max(0, Math.min(100, total.projected / 710 * 100));
    const parts = [
      ['写作', total.parts.writing, 106.5],
      ['听力', total.parts.listening, 248.5],
      ['阅读', total.parts.reading, 248.5],
      ['翻译', total.parts.translation, 106.5]
    ];
    return '<section class="section" id="score-summary"><div class="score-hero">' +
      '<div class="donut" style="--p:' + p.toFixed(1) + '"><div class="donut-inner"><b>' + (total.complete ? Math.round(total.score) : Math.round(total.projected)) + '</b><span>' + (total.complete ? '总分 / 710' : '折算 / 710') + '</span></div></div>' +
      '<div class="score-meta"><h2>' + (total.complete ? (total.pass ? '稳过 425' : '继续冲 425') : '已判 ' + total.max + ' / 710') + '</h2>' +
        '<p>' + (total.complete ? '按四六级官方题型权重合成总分。' : '未判部分不计入；折算分按已判部分等比例估算，仅作参考。') + '</p>' +
        '<div class="score-tags"><span class="badge ' + (total.pass ? 'green' : 'gold') + '">' + (total.pass ? '达到 425 及格线' : '未达 425') + '</span>' +
          '<span class="badge soft">CET-' + state.exam.level + '</span>' +
          '<span class="badge gray">已判 ' + Math.round(total.max) + ' 分</span></div>' +
        '<div class="score-parts">' + parts.map((x) => '<div class="score-part"><b>' + (x[1] == null ? '—' : Math.round(x[1])) + '</b><span>' + x[0] + '</span></div>').join('') + '</div>' +
      '</div></div>' +
      '<div class="tool-row mt10"><button class="btn btn-outline btn-sm" data-action="share-report">' + CET.icon('share') + '分享报告</button>' +
        '<button class="btn btn-outline btn-sm" data-action="save-report">' + CET.icon('download') + '保存报告</button>' +
        favouriteReportButton(total) + '</div></section>';
  }

  function favouriteReportButton(total) {
    const item = {
      type: 'report', term: 'CET-' + state.exam.level + ' 判分报告 · ' + Math.round(total.complete ? total.score : total.projected) + ' 分',
      sub: '写作 ' + (total.parts.writing == null ? '—' : total.parts.writing) + ' · 听力 ' + (total.parts.listening == null ? '—' : total.parts.listening) +
        ' · 阅读 ' + (total.parts.reading == null ? '—' : total.parts.reading) + ' · 翻译 ' + (total.parts.translation == null ? '—' : total.parts.translation),
      source: '判分报告', payload: { at: Date.now() }
    };
    return CET.fav.button(item, 'lg');
  }

  function reportHistoryHtml() {
    if (!reports.length) return '';
    return '<section class="section"><div class="section-head"><h2>最近报告</h2><span class="tiny muted">' + reports.length + ' 份</span></div>' +
      reports.slice(0, 5).map((r, i) => '<article class="card card-tight" data-report-open="' + i + '" style="cursor:pointer">' +
        '<div class="row"><div class="grow"><b style="font-size:13px">CET-' + r.level + ' · ' + Math.round(r.projected) + ' 分</b>' +
          '<div class="tiny muted mt6">' + CET.fmtDate(r.at) + ' · 已判 ' + Math.round(r.max) + ' / 710</div></div>' +
          '<span class="badge ' + (r.projected >= 425 ? 'green' : 'gold') + '">' + (r.projected >= 425 ? '达线' : '待提升') + '</span>' +
          CET.icon('chevronRight', 'menu-arrow') + '</div></article>').join('') + '</section>';
  }

  function examFeedback(r) {
    if (r.kind === 'objective') return objectiveFeedback(r);
    if (r.kind === 'marks') return marksFeedback(r);
    if (r.kind === 'essay') return essayFeedback(r);
    if (r.kind === 'translation') return translationFeedback(r);
    return '';
  }

  function marksFeedback(r) {
    const correct = r.sections.reduce((a, b) => a + b.correct, 0);
    return '<div class="divider"></div>' +
      '<div class="row"><div class="grow"><b style="font-size:15px">' + r.score + ' / ' + r.max + '</b>' +
        '<div class="tiny muted mt6">勾选 ' + r.answered + ' / ' + r.totalQuestions + ' 题 · 对 ' + correct + ' · 错/未勾 ' + r.wrongCount + '</div></div>' +
        '<span class="badge green">对号/叉号</span></div>' +
      '<div class="rubric">' + r.sections.map((s) => '<div class="rubric-row"><span class="name">' + esc(s.name) + '</span><span class="rubric-bar"><i style="width:' + Math.round(s.correct / s.total * 100) + '%"></i></span><span class="val">' + s.correct + '/' + s.total + '</span></div>').join('') + '</div>' +
      (r.wrong.length ? '<div class="detail-block"><div class="detail-title"><h3>错题与未勾</h3><span>' + r.wrongCount + ' 题</span></div><div class="chips">' +
        r.wrong.slice(0, 40).map((x) => '<span class="chip">' + x.q + '：' + (x.mark === '×' ? '<b style="color:#e5484d">×</b>' : '<span class="muted">未勾</span>') + '</span>').join('') + '</div></div>' :
        '<div class="feedback-item good mt10"><span class="dot"></span><div class="fb-main"><p>全部勾为正确，保持手感。</p></div></div>') +
      '<div class="pill-note mt10">对号叉号模式按你勾选的对/错直接计分：√ 计为对，× 或空白计为错；无需标准答案，适合快速估分。</div>';
  }

  function rubricHtml(rubric) {
    if (!rubric || !rubric.length) return '';
    return '<div class="rubric">' + rubric.map((x) =>
      '<div class="rubric-row"><span class="name">' + esc(x.name) + '</span><span class="rubric-bar"><i style="width:' + Math.round(x.score / x.max * 100) + '%"></i></span><span class="val">' + x.score + '/' + x.max + '</span></div>'
    ).join('') + '</div>';
  }

  function rewriteCards(list, kind) {
    return list.map((x, idx) => {
      const versions = x.versions || [];
      return '<div class="rewrite-card" data-rewrite-index="' + idx + '">' +
        '<div class="old"><span class="tag">原句</span>' + esc(x.original) + '</div>' +
        '<div class="rewrite-versions">' + versions.map((v, vi) => {
          const item = { type: 'sentence', term: v.text, sub: v.why, note: '原句：' + x.original, source: kind === 'essay' ? '作文升级' : '翻译升级', payload: { text: v.text } };
          return '<div class="rewrite-version">' +
            '<div class="row wrap"><span class="badge ' + (vi === 0 ? 'gray' : vi === 1 ? 'soft' : 'gold') + '">' + esc(v.label) + '</span>' +
              '<span class="cat-count">' + esc(v.why) + '</span></div>' +
            '<div class="rw-text">' + esc(v.text) + '</div>' +
            '<div class="row">' +
              '<button class="btn btn-ghost btn-sm" data-speak="' + CET.escAttr(v.text) + '">' + CET.icon('volume') + '朗读</button>' +
              '<button class="btn btn-ghost btn-sm" data-copy="' + CET.escAttr(v.text) + '">' + CET.icon('copy') + '复制</button>' +
              '<span class="right">' + CET.fav.button(item, 'small') + '</span>' +
            '</div></div>';
        }).join('') + '</div>' +
        '<button class="btn btn-outline btn-sm" data-frame-picker="' + idx + '" data-frame-kind="' + kind + '">' + CET.icon('quote') + '套用句式模板</button>' +
      '</div>';
    }).join('');
  }

  function openFramePicker(kind, idx) {
    const result = state.exam.result && state.exam.result[kind];
    const item = result && result.rewrites && result.rewrites[idx];
    if (!item) return;
    const frames = Grader.frames();
    const html = '<div class="pill-note mb12">为这句原句选择一个高分框架。模板只替换第一个省略号，套用后请检查语法与搭配。</div>' +
      '<div class="card card-tight mb12"><div class="tiny muted">原句</div><div class="pattern-en" style="font-size:14px">' + esc(item.original) + '</div></div>' +
      '<div class="word-list">' + frames.map((f) =>
        '<button class="card card-tight pattern-card" data-frame-apply="' + f.id + '" style="text-align:left">' +
          '<div class="pattern-en" style="font-size:14px">' + esc(f.en) + '</div>' +
          '<div class="pattern-zh"><span class="zh-mask">' + esc(f.zh || '') + '</span></div>' +
          '<div class="pattern-use">' + CET.icon('info') + ' ' + esc(f.use || '适用语境：正式写作') + '</div>' +
        '</button>').join('') + '</div>';
    CET.sheet.open({
      title: '选择句式模板',
      sub: '套用到第 ' + (idx + 1) + ' 句',
      html,
      onMount(body) {
        body.querySelectorAll('[data-frame-apply]').forEach((btn) => {
          btn.addEventListener('click', function () {
            const f = frames.find((x) => x.id === btn.getAttribute('data-frame-apply'));
            if (!f) return;
            const lexical = Grader.applyWordUpgrades(item.original);
            const applied = Grader.applyFrame(f, lexical.text || item.original);
            item.versions[2] = { label: '高分', level: 3, text: applied, why: '套用句式：' + f.en, pattern: f.en };
            saveExamNow();
            CET.sheet.closeAll();
            render(false);
            setTimeout(() => {
              const el = document.querySelector('[data-rewrite-index="' + idx + '"]');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 120);
            CET.toast('已套用句式模板');
          });
        });
      }
    });
  }

  function essayFeedback(r) {
    const item = { type: 'report', term: '作文批改 · ' + r.band.label + ' ' + r.raw + '/15', sub: r.band.desc, source: '判分报告', payload: {} };
    return '<div class="divider"></div>' +
      '<div class="row"><div class="grow"><div class="row"><span class="badge ' + (r.raw >= 10 ? 'green' : r.raw >= 7 ? 'gold' : 'red') + '">' + r.band.label + '</span>' +
        '<b style="font-size:15px">' + r.raw + ' / 15</b><span class="tiny muted">折合 ' + r.converted + ' / 106.5</span></div>' +
        '<div class="tiny muted mt6">' + r.wordCount + ' 词 · ' + r.analysis.paragraphCount + ' 段 · ' + r.analysis.sentenceCount + ' 句 · 错误 ' + r.analysis.errors.length + ' 处</div></div>' +
        CET.fav.button(item) + '</div>' +
      rubricHtml(r.rubric) +
      '<div class="detail-block"><div class="detail-title"><h3>做得好的地方</h3></div><div class="feedback-list">' +
        r.strengths.map((s) => '<div class="feedback-item good"><span class="dot"></span><div class="fb-main"><p>' + esc(s) + '</p></div></div>').join('') + '</div></div>' +
      (r.issues.length ? '<div class="detail-block"><div class="detail-title"><h3>需要修改</h3><span>' + r.issues.length + ' 条</span></div><div class="feedback-list">' +
        r.issues.slice(0, 10).map((x) => {
          const fi = { type: 'feedback', term: x.title, sub: x.detail, note: x.fix || '', source: '作文批改', payload: {} };
          return '<div class="feedback-item ' + (x.severity >= 2 ? 'bad' : 'warn') + '"><span class="dot"></span><div class="fb-main">' +
            '<div class="row"><b>' + esc(x.title) + '</b><span class="right">' + CET.fav.button(fi, 'small') + '</span></div>' +
            '<p>' + esc(x.detail) + '</p>' + (x.fix ? '<div class="fb-fix">建议：<ins>' + esc(x.fix) + '</ins></div>' : '') + '</div></div>';
        }).join('') + '</div></div>' : '') +
      (r.upgrades.length ? '<div class="detail-block"><div class="detail-title"><h3>高级替换</h3><span>点击星标收藏</span></div><div class="syn-context">' + CET.icon('info') + ' 适用语境：正式写作 / 议论文；替换时保留原句时态、主谓一致与搭配。</div><div class="upgrade-list">' +
        r.upgrades.map((u) => {
          const ui = { type: 'adv', term: u.from + ' → ' + u.to, sub: u.why, source: '作文升级', payload: {} };
          return '<div class="upgrade-row"><span class="from">' + esc(u.from) + '</span><span class="arrow">→</span><span class="to">' + esc(u.to) + '</span>' +
            '<span class="why">' + esc(u.why) + '</span>' + CET.fav.button(ui, 'small') + '</div>';
        }).join('') + '</div></div>' : '') +
      (r.rewrites.length ? '<div class="detail-block"><div class="detail-title"><h3>逐句升级建议</h3><span>' + r.rewrites.length + ' 句 · 由低到高</span></div>' + rewriteCards(r.rewrites, 'essay') + '</div>' : '') +
      '<div class="detail-block"><div class="detail-title"><h3>可套用的高分句</h3></div>' +
        r.models.map((s) => '<div class="example-card"><div class="ex-en">' + esc(s) + '</div><div class="row mt6">' +
          '<button class="btn btn-ghost btn-sm" data-speak="' + CET.escAttr(s) + '">' + CET.icon('volume') + '朗读</button>' +
          CET.fav.button({ type: 'sentence', term: s, sub: '高分句型', source: '判分报告', payload: { text: s } }, 'small') + '</div></div>').join('') + '</div>' +
      '<div class="pill-note mt14">作文按 15 分制给分，再折合 106.5 分。评分参考内容切题、结构连贯、语言准确、词汇丰富、句式多样五个维度；自动批改不能替代人工阅卷。</div>';
  }

  function translationFeedback(r) {
    const item = { type: 'report', term: '翻译批改 · ' + r.band.label + ' ' + r.raw + '/15', sub: r.band.desc, source: '判分报告', payload: {} };
    return '<div class="divider"></div>' +
      '<div class="row"><div class="grow"><div class="row"><span class="badge ' + (r.raw >= 10 ? 'green' : r.raw >= 7 ? 'gold' : 'red') + '">' + r.band.label + '</span>' +
        '<b style="font-size:15px">' + r.raw + ' / 15</b><span class="tiny muted">折合 ' + r.converted + ' / 106.5</span></div>' +
        '<div class="tiny muted mt6">' + r.wordCount + ' 词 · 信息覆盖 ' + Math.round((r.coverage || 0) * 100) + '% · 错误 ' + r.analysis.errors.length + ' 处</div></div>' +
        CET.fav.button(item) + '</div>' +
      rubricHtml(r.rubric) +
      (r.warning ? '<div class="pill-note mt10">' + CET.icon('info') + ' ' + esc(r.warning) + '</div>' : '') +
      '<div class="detail-block"><div class="detail-title"><h3>做得好的地方</h3></div><div class="feedback-list">' +
        r.strengths.map((s) => '<div class="feedback-item good"><span class="dot"></span><div class="fb-main"><p>' + esc(s) + '</p></div></div>').join('') + '</div></div>' +
      (r.missing && r.missing.length ? '<div class="detail-block"><div class="detail-title"><h3>可能漏译的关键词</h3></div><div class="chips">' +
        r.missing.map((w) => '<button class="chip" data-open-word="' + CET.escAttr(w) + '">' + esc(w) + '</button>').join('') + '</div></div>' : '') +
      (r.issues.length ? '<div class="detail-block"><div class="detail-title"><h3>需要修改</h3><span>' + r.issues.length + ' 条</span></div><div class="feedback-list">' +
        r.issues.slice(0, 10).map((x) => {
          const fi = { type: 'feedback', term: x.title, sub: x.detail, note: x.fix || '', source: '翻译批改', payload: {} };
          return '<div class="feedback-item ' + (x.severity >= 2 ? 'bad' : 'warn') + '"><span class="dot"></span><div class="fb-main">' +
            '<div class="row"><b>' + esc(x.title) + '</b><span class="right">' + CET.fav.button(fi, 'small') + '</span></div>' +
            '<p>' + esc(x.detail) + '</p>' + (x.fix ? '<div class="fb-fix">建议：<ins>' + esc(x.fix) + '</ins></div>' : '') + '</div></div>';
        }).join('') + '</div></div>' : '') +
      (r.upgrades.length ? '<div class="detail-block"><div class="detail-title"><h3>高级替换</h3></div><div class="syn-context">' + CET.icon('info') + ' 适用语境：正式写作 / 翻译书面语；替换时保留原句时态、主谓一致与搭配。</div><div class="upgrade-list">' +
        r.upgrades.map((u) => '<div class="upgrade-row"><span class="from">' + esc(u.from) + '</span><span class="arrow">→</span><span class="to">' + esc(u.to) + '</span><span class="why">' + esc(u.why) + '</span>' +
          CET.fav.button({ type: 'adv', term: u.from + ' → ' + u.to, sub: u.why, source: '翻译升级', payload: {} }, 'small') + '</div>').join('') + '</div></div>' : '') +
      (r.rewrites.length ? '<div class="detail-block"><div class="detail-title"><h3>逐句升级建议</h3><span>' + r.rewrites.length + ' 句 · 由低到高</span></div>' + rewriteCards(r.rewrites, 'translation') + '</div>' : '') +
      '<div class="pill-note mt14">翻译按 15 分制给分，再折合 106.5 分。填写参考译文后，内容分会按关键信息覆盖度计算；否则按篇幅与题目关键词估算。</div>';
  }

  function objectiveFeedback(r) {
    return '<div class="divider"></div>' +
      '<div class="row"><div class="grow"><b style="font-size:15px">' + r.score + ' / ' + r.max + '</b>' +
        '<div class="tiny muted mt6">作答 ' + r.answered + ' / ' + r.totalQuestions + ' 题 · 答错/未答 ' + r.wrongCount + ' 题</div></div>' +
        (!r.completeKey ? '<span class="badge gold">标准答案不完整</span>' : '') + '</div>' +
      '<div class="rubric">' + r.sections.map((s) => '<div class="rubric-row"><span class="name">' + esc(s.name) + '</span><span class="rubric-bar"><i style="width:' + Math.round(s.correct / s.total * 100) + '%"></i></span><span class="val">' + s.correct + '/' + s.total + '</span></div>').join('') + '</div>' +
      (r.wrong.length ? '<div class="detail-block"><div class="detail-title"><h3>错题与未答</h3><span>' + r.wrongCount + ' 题</span></div><div class="chips">' +
        r.wrong.slice(0, 40).map((x) => '<span class="chip">' + x.q + '：<b style="color:#0b57d0">' + x.key + '</b>' + (x.mine ? ' / 你 ' + x.mine : ' / 未答') + '</span>').join('') + '</div></div>' : '<div class="feedback-item good mt10"><span class="dot"></span><div class="fb-main"><p>全部正确，保持手感。</p></div></div>') +
      '<div class="pill-note mt10">客观题按题型权重计分：听力 248.5 / 阅读 248.5。未作答按错误计，标准答案缺题时会在上方提示。</div>';
  }

  function afterRenderExam() {
    const rule = $('#paper-rule');
    if (rule) rule.addEventListener('change', () => {
      state.exam.markRule = 'redWrong';
      saveExamNow();
      if (state.exam.paperResult || state.exam.paperMarks) gradePaper(); else render(false);
    });
    const grid = $('#paper-grid');
    if (!grid) return;
    const area = $('#paper-text');
    const count = $('#paper-count');
    const map = new Map(examMarksStats(state.exam.paperMarks || '').map);
    const sync = () => {
      state.exam.paperMarks = serializeMarks(map);
      if (area) area.value = state.exam.paperMarks;
      if (count) count.textContent = '已勾 ' + map.size + ' 题';
      saveExamDebounced();
    };
    grid.querySelectorAll('[data-paper-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = Number(btn.getAttribute('data-paper-q'));
        if (!map.has(q)) map.set(q, true);
        else if (map.get(q) === true) map.set(q, false);
        else map.delete(q);
        const st = map.has(q) ? (map.get(q) ? 'correct' : 'wrong') : 'unset';
        btn.className = 'exam-mark ' + st;
        btn.querySelector('span').textContent = st === 'correct' ? '√' : st === 'wrong' ? '×' : '·';
        if (count) count.textContent = '已勾 ' + map.size + ' 题';
        state.exam.paperMarks = serializeMarks(map);
        if (area) area.value = state.exam.paperMarks;
        saveExamDebounced();
      });
    });
    if (area) area.addEventListener('input', () => {
      state.exam.paperMarks = area.value;
      saveExamDebounced();
    });
  }

  function openDeepSeekSetup(kind) {
    kind = kind === 'grade' ? 'grade' : (kind === 'model' ? 'model' : 'hand');
    const isModel = kind === 'model';
    const isHand = kind === 'hand';
    const cfg = CET.AI.getConfig();
    const configured = CET.AI.hasKey();
    const presets = (CET.AI.presets ? CET.AI.presets() : []);
    const cur = presets.find((p) => p.id === cfg.preset) || presets[0] || {};
    CET.sheet.open({
      title: isModel ? 'AI 模型' : (isHand ? '云端 OCR' : 'AI 批改'),
      sub: isModel ? (configured ? '已配置 · ' + (cfg.model || '') : '未配置') : (configured ? '' : '未配置 Key'),
      html: (isModel
        ? '<div class="field"><div class="field-label">API Key<span class="key-state' + (configured ? ' on' : '') + '">' + (configured ? '已配置' : '未配置') + '</span></div>' +
          '<div class="key-row"><input id="deepseek-key" type="password" placeholder="粘贴 API Key" value="" autocomplete="off" spellcheck="false">' +
          '<button class="btn btn-outline btn-sm" id="ai-key-copy">申请地址</button></div>' +
          '<div class="tiny muted mt6">Key 只保存在本机，不会上传。当前模型：' + esc(cfg.model || 'deepseek-flash') + '</div>' +
          '<button class="btn btn-ghost btn-sm mt6" id="ai-key-help">怎么获取 Key？</button></div>'
        : '') +
        '<div class="tool-row"><button class="btn btn-primary" id="deepseek-save">' + (isModel ? '保存' : '开启') + '</button>' +
        (isModel ? '<button class="btn btn-ghost" id="ai-selftest">测试连接</button>' : '') +
        (isModel ? '' : '<button class="btn btn-ghost" id="deepseek-off">关闭</button>') +
        (isModel ? '<button class="btn btn-ghost" id="deepseek-clear">清除 Key</button>' : '') + '</div>',
      onMount(body) {
        const input = body.querySelector('#deepseek-key');
        const site = cur.site || '';
        const copy = (text, btn) => {
          const label = btn.textContent;
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try { ok = document.execCommand('copy'); } catch (e) {}
          ta.remove();
          btn.textContent = ok ? '已复制' : '复制失败';
          setTimeout(() => { btn.textContent = label; }, 1600);
          if (!ok) CET.toast('复制失败：' + text);
        };
        const copyBtn = body.querySelector('#ai-key-copy');
        if (copyBtn) copyBtn.addEventListener('click', () => {
          const url = site || 'https://platform.deepseek.com/api_keys';
          copy(url, copyBtn);
        });
        const helpBtn = body.querySelector('#ai-key-help');
        if (helpBtn) helpBtn.addEventListener('click', () => {
          CET.sheet.open({
            title: '怎么获取 Key',
            sub: '手机上几分钟搞定',
            html: '<div class="field"><div class="field-label">四步</div>' +
              '<p class="tiny muted">1. 手机浏览器打开 platform.deepseek.com，注册并登录</p>' +
              '<p class="tiny muted">2. 进「充值」，用支付宝或微信付款。API 是预付费，几块钱能用很久</p>' +
              '<p class="tiny muted">3. 左侧「API keys」→ 创建 → 复制 sk- 开头的那串</p>' +
              '<p class="tiny muted">4. 返回上一页，粘进输入框，点保存</p></div>' +
              '<div class="tool-row"><button class="btn btn-outline btn-sm" id="ai-help-copy">复制网址</button></div>',
            onMount(b) {
              const btn = b.querySelector('#ai-help-copy');
              if (btn) btn.addEventListener('click', () => copy('https://platform.deepseek.com', btn));
            }
          });
        });
        body.querySelector('#deepseek-save').addEventListener('click', () => {
          const v = input ? input.value.replace(/[\s\u200b-\u200d\ufeff]/g, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '') : '';
          if (v) CET.AI.setKey(v);
          if (!CET.AI.hasKey()) { CET.toast(isModel ? '请输入 API Key' : '请先在「AI 模型」里配置 Key'); return; }
          if (!isModel) CET.AI.setFeature(kind, true);
          CET.sheet.closeAll();
          render(false);
          CET.toast(isModel ? 'AI 模型已保存' : (isHand ? '云端 OCR' : 'AI 批改') + ' 已开启');
        });
        const testBtn = body.querySelector('#ai-selftest');
        if (testBtn) testBtn.addEventListener('click', () => {
          testBtn.disabled = true;
          testBtn.textContent = '测试中…';
          CET.AI.ping().then((r) => {
            testBtn.textContent = '可用 ' + r.ms + 'ms';
            CET.sheet.open({
              title: '连接正常', sub: r.ms + ' 毫秒',
              html: '<div class="callout">Key 有效，接口可访问。模型：' + esc((r.models || []).join(' / ') || '未知') + '</div>'
            });
          }).catch((e) => {
            testBtn.textContent = '失败';
            CET.sheet.open({
              title: '连接失败', sub: 'Key 或网络的问题',
              html: '<div class="callout warn">' + esc((e && e.message) || '未知错误') + '</div>'
            });
          }).then(() => setTimeout(() => { testBtn.disabled = false; testBtn.textContent = '测试连接'; }, 2600));
        });
        const clearBtn = body.querySelector('#deepseek-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => {
          CET.AI.setKey('');
          CET.sheet.closeAll();
          render(false);
          CET.toast('已清除 API Key');
        });
        const offBtn = body.querySelector('#deepseek-off');
        if (offBtn) offBtn.addEventListener('click', () => {
          CET.AI.setFeature(kind, false);
          CET.sheet.closeAll();
          render(false);
          CET.toast((isHand ? '云端 OCR' : 'AI 批改') + ' 已关闭');
        });
      }
    });
  }

  async function aiGradePaper(kind) {
    const keyOk = !!(CET.AI && CET.AI.getConfig && String(CET.AI.getConfig().key || '').trim());
    if (!keyOk) {
      CET.toast('批改需要 API Key：设置 → AI 模型', 'red');
      return;
    }
    const imgKind = kind === 'translation' ? 'translation' : 'writing';
    const hasPromptImg = state.examPromptKind === imgKind && !!state.examPromptImage;
    const hasAnswerImg = state.examAnswerKind === imgKind && !!state.examAnswerImage;
    const hasEssay = !!(state.exam.essayText && state.exam.essayText.trim());
    if (!hasPromptImg && !hasEssay) { CET.toast('先拍题目', 'red'); setTimeout(() => examPhotoCapture(imgKind), 60); return; }
    if (!hasAnswerImg && !hasEssay) { CET.toast('先拍作文内容', 'red'); setTimeout(() => examPhotoCapture(imgKind), 60); return; }
    const hasTranslation = !!(state.exam.translationText && state.exam.translationText.trim());
    if (hasTranslation && !String(state.exam.translationPrompt || '').trim()) { CET.toast('翻译需要先填写或拍摄原文'); return; }
    if (!hasEssay && !hasTranslation) { CET.toast('先输入或拍照识别作文 / 翻译'); return; }
    CET.keepAwake(true);
    if (state.gradeTimer) clearInterval(state.gradeTimer);
    const startedAt = Date.now();
    CET.sheet.open({
      title: '批改中',
      sub: '模型正在看两张图',
      html: '<div class="scan-progress"><div class="ring"></div><div class="grow"><b id="grade-status">批改中…</b><span>转写、评分、逐句批注一次完成</span></div><div class="pct" id="grade-pct">0s</div></div>' +
        '<div class="tiny muted mt12" style="line-height:1.6">通常 20–40 秒。期间可以离开这个页面，结果会保存下来。</div>'
    });
    state.gradeTimer = setInterval(() => {
      const el = document.getElementById('grade-pct');
      if (el) el.textContent = Math.round((Date.now() - startedAt) / 1000) + 's';
    }, 500);
    try {
      const isWriting = kind !== 'translation';
      const promptImg = state.examPromptKind && state.examPromptImage ? state.examPromptImage : '';
      const answerImg = state.examAnswerImage || '';
      if (promptImg && answerImg) {
        /* 只走整模型：两张图直接交给它转写并批改，不做本地 OCR。 */
        const obj = await CET.AI.gradeFromImages({ kind: kind === 'translation' ? 'translation' : 'writing', promptImage: promptImg, answerImage: answerImg });
        const head = isWriting ? (obj.essay || {}) : (obj.translation || {});
        const text = String(obj.text || head.text || '').trim();
        if (text) {
          if (isWriting) state.exam.essayText = text; else state.exam.translationText = text;
          saveExamNow();
        }
        if (!state.exam.paperResult) gradePaper();
        const rr = state.exam.paperResult;
        const key = isWriting ? 'essay' : 'translation';
        const base = rr[key] || {};
        const rawScore = Math.max(0, Math.min(15, Number(head.raw) || 0));
        rr[key] = Object.assign({}, base, {
          raw: rawScore,
          converted: Math.round(rawScore / 15 * 106.5 * 10) / 10,
          band: { label: head.band || 'AI 评估' },
          bandReason: head.bandReason || '',
          rubric: Array.isArray(head.rubric) ? head.rubric : (base.rubric || []),
          deductions: Array.isArray(head.deductions) ? head.deductions : [],
          issues: Array.isArray(head.issues) ? head.issues : (base.issues || []),
          sentences: Array.isArray(head.sentences) ? head.sentences : [],
          strengths: Array.isArray(head.strengths) ? head.strengths : (base.strengths || []),
          upgrades: Array.isArray(head.upgrades) ? head.upgrades : (base.upgrades || []),
          nextSteps: Array.isArray(head.nextSteps) ? head.nextSteps : [],
          wordCount: head.wordCount || (text ? text.split(/\s+/).filter(Boolean).length : 0),
          expected: head.expected || '',
          ai: true
        });
        const meta = (CET.AI && CET.AI.lastCall) ? CET.AI.lastCall() : null;
        if (meta) state.exam.aiMeta = { at: meta.at, ms: meta.ms, usage: meta.usage };
        rr.totalScore = Math.round(((rr.score || 0) + (rr.essay ? rr.essay.converted : 0) + (rr.translation ? rr.translation.converted : 0)) * 10) / 10;
        rr.at = Date.now();
        saveExamNow(); render(false);
        CET.toast('AI 批改完成');
        showExamReport(kind === 'translation' ? 'translation' : 'writing');
        return;
      }
      const payload = {
        level: state.exam.level,
        essay: hasEssay ? { text: state.exam.essayText, prompt: state.exam.essayPrompt } : null,
        translation: hasTranslation ? { text: state.exam.translationText, prompt: state.exam.translationPrompt, reference: state.exam.translationRef } : null
      };
      const ai = await CET.AI.gradeExam(payload);
      if (!state.exam.paperResult) gradePaper();
      const r = state.exam.paperResult;
      const apply = (kind, obj) => {
        if (!obj) return;
        const base = r[kind] || {};
        const raw = Math.max(0, Math.min(15, Number(obj.raw) || 0));
        r[kind] = Object.assign({}, base, {
          raw,
          converted: Math.round(raw / 15 * 106.5 * 10) / 10,
          band: { label: obj.band || base.band && base.band.label || 'AI 评估' },
          rubric: Array.isArray(obj.rubric) ? obj.rubric : (base.rubric || []),
          issues: Array.isArray(obj.issues) ? obj.issues : (base.issues || []),
          strengths: Array.isArray(obj.strengths) ? obj.strengths : (base.strengths || []),
          upgrades: Array.isArray(obj.upgrades) ? obj.upgrades : (base.upgrades || []),
          wordCount: obj.wordCount || base.wordCount || 0,
          expected: obj.expected || base.expected || '',
          ai: true
        });
      };
      apply('essay', ai.essay);
      apply('translation', ai.translation);
      const meta = (CET.AI && CET.AI.lastCall) ? CET.AI.lastCall() : null;
      if (meta) state.exam.aiMeta = { at: meta.at, ms: meta.ms, usage: meta.usage };
      r.totalScore = Math.round(((r.score || 0) + (r.essay ? r.essay.converted : 0) + (r.translation ? r.translation.converted : 0)) * 10) / 10;
      r.at = Date.now();
      if (state.gradeTimer) { clearInterval(state.gradeTimer); state.gradeTimer = null; }
      saveExamNow(); render(false);
      CET.toast('AI 批改完成');
      if (kind === 'writing' || kind === 'translation') {
        showExamReport(kind);
      }
    } catch (e) {
      CET.toast('AI 批改失败：' + (e && e.message ? e.message : '请检查网络/Key'), 'red');
    } finally { CET.keepAwake(false); }
  }

  /* 拿「可升级表达」里最可疑的两条去联网查证，报告里给出来源链接。 */
  /* 拿「可升级表达」或问题里引用的短语去联网查证，报告里给出来源链接。 */
  function gradePaper() {
    /* Handwriting strike-outs come back as duplicated words; never score them as repeats. */
    state.exam.essayText = collapseStruckOut(state.exam.essayText || '', true).text;
    state.exam.translationText = collapseStruckOut(state.exam.translationText || '', true).text;
    if (state.tab !== 'exam') state.tab = 'exam';
    state.navHistory = [];
    const st = examMarksStats(state.exam.paperMarks || '');
    const rule = 'redWrong';
    const isCorrect = (q) => rule === 'redWrong' ? (!st.map.has(q) || st.map.get(q) === true) : rule === 'wrongOnly' ? !st.map.has(q) : st.map.get(q) === true;
    const hasSubjective = !!(state.exam.essayText && state.exam.essayText.trim()) || !!(state.exam.translationText && state.exam.translationText.trim());
    if (!st.total && !hasSubjective) { CET.toast('先拍试卷或点题号填入勾叉'); return; }
    const cfg = Grader.weights(state.exam.level);
    const calc = (section) => {
      const parts = section.sections.map((sec) => {
        let correct = 0;
        for (let q = sec.start; q <= sec.end; q++) if (isCorrect(q)) correct++;
        const total = sec.end - sec.start + 1;
        return {
          id: sec.id, name: sec.name, start: sec.start, end: sec.end,
          correct, total, max: sec.max,
          score: Math.round(correct / total * sec.max * 10) / 10,
          pct: Math.round(correct / total * 100)
        };
      });
      return {
        max: section.max,
        correct: parts.reduce((a, b) => a + b.correct, 0),
        total: parts.reduce((a, b) => a + b.total, 0),
        score: Math.round(parts.reduce((a, b) => a + b.score, 0) * 10) / 10,
        pct: Math.round(parts.reduce((a, b) => a + b.correct, 0) / parts.reduce((a, b) => a + b.total, 0) * 100),
        parts
      };
    };
    const listening = calc(cfg.listening);
    const reading = calc(cfg.reading);
    const correct = listening.correct + reading.correct;
    const essayText = String(state.exam.essayText || '').trim();
    const essayPrompt = String(state.exam.essayPrompt || '').trim();
    const translationText = String(state.exam.translationText || '').trim();
    const translationPrompt = String(state.exam.translationPrompt || '').trim();
    if (translationText && !translationPrompt && !st.total && !essayText) {
      state.exam.paperResult = null;
      saveExamNow(); render(false);
      CET.toast('翻译需要先填写或拍摄原文');
      return;
    }
    if (translationText && !translationPrompt) CET.toast('翻译缺少原文，本次不评翻译');
    if (essayText && !essayPrompt && !st.total && !translationText) {
      state.exam.paperResult = null;
      saveExamNow(); render(false);
      CET.toast('作文需要先填写或拍摄题目');
      return;
    }
    if (essayText && !essayPrompt) CET.toast('作文缺少题目，本次不评作文');
    const essay = essayText && essayPrompt
      ? Grader.scoreEssay({ text: essayText, prompt: essayPrompt, level: state.exam.level })
      : null;
    const translation = translationText && translationPrompt
      ? Grader.scoreTranslation({ text: translationText, reference: state.exam.translationRef, prompt: translationPrompt, level: state.exam.level })
      : null;
    const objectiveScore = st.total ? Math.round((listening.score + reading.score) * 10) / 10 : 0;
    const subjectiveScore = (essay ? essay.converted : 0) + (translation ? translation.converted : 0);
    const totalMax = (st.total ? 497 : 0) + (essay ? 106.5 : 0) + (translation ? 106.5 : 0);
    state.exam.paperResult = {
      correct,
      total: 55,
      score: objectiveScore,
      max: 497,
      pct: st.total ? Math.round(correct / 55 * 100) : 0,
      listening, reading, essay, translation,
      totalScore: Math.round((objectiveScore + subjectiveScore) * 10) / 10,
      totalMax: Math.round(totalMax * 10) / 10,
      at: Date.now()
    };
    state.stats.grades = (state.stats.grades || 0) + 1;
    CET.saveStats();
    saveExamNow();
    render(false);
    CET.toast(st.total ? '判分完成 · 答对 ' + correct + ' 题' : '批改完成 · 写作 / 翻译');
  }

  function setExamField(field, value) {
    state.exam[field] = value;
    saveExamDebounced();
  }

  function updateEssayCount() {
    const n = (state.exam.essayText.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || []).length;
    const el = $('#essay-count');
    if (el) el.textContent = n + ' 词 · 建议 ' + (state.exam.level === 6 ? '150–200' : '120–180');
  }

  function updateAnswerHint(kind) {
    const keyF = kind === 'listening' ? 'listeningKey' : 'readingKey';
    const mineF = kind === 'listening' ? 'listeningMine' : 'readingMine';
    const markF = kind === 'listening' ? 'listeningMarks' : 'readingMarks';
    const start = kind === 'listening' ? 1 : 26;
    const marks = ((state.exam.modes && state.exam.modes[kind]) || 'answers') === 'marks';
    const k = Grader.parseAnswers(state.exam[keyF] || '', start).count;
    const m = marks ? Grader.parseMarks(state.exam[markF] || '', start).count : Grader.parseAnswers(state.exam[mineF] || '', start).count;
    const el = $('#hint-' + kind);
    if (el) {
      if (marks) {
        el.textContent = '已识别 ' + m + ' 个勾/叉；无标准答案也可按勾叉估分。';
        el.className = 'parse-hint' + (m ? ' ok' : '');
      } else {
        el.textContent = k && m ? '已识别：标准 ' + k + ' 题 / 我的 ' + m + ' 题' : '两侧都填入后可判分；空白题按错误计。';
        el.className = 'parse-hint' + (k && m ? ' ok' : '');
      }
    }
  }

  function gradeSection(section) {
    const ex = state.exam;
    if (section === 'writing') {
      if (!ex.essayText.trim()) { CET.toast('先输入或识别作文'); return false; }
      if (!ex.essayPrompt.trim()) { CET.toast('先填写或拍摄作文题目'); return false; }
      ex.result = ex.result || {};
      ex.result.essay = Grader.scoreEssay({ text: ex.essayText, prompt: ex.essayPrompt, level: ex.level });
      ex.open.writing = true;
    } else if (section === 'translation') {
      if (!ex.translationText.trim()) { CET.toast('先输入或识别译文'); return false; }
      if (!ex.translationPrompt.trim()) { CET.toast('先填写或拍摄翻译原文'); return false; }
      ex.result = ex.result || {};
      ex.result.translation = Grader.scoreTranslation({
        text: ex.translationText, reference: ex.translationRef, prompt: ex.translationPrompt, level: ex.level
      });
      ex.open.translation = true;
    } else if (section === 'listening' || section === 'reading') {
      const keyF = section === 'listening' ? 'listeningKey' : 'readingKey';
      const mineF = section === 'listening' ? 'listeningMine' : 'readingMine';
      const markF = section === 'listening' ? 'listeningMarks' : 'readingMarks';
      const mode = (ex.modes && ex.modes[section]) || 'answers';
      if (mode === 'marks') {
        if (!String(ex[markF] || '').trim()) { CET.toast('先填入或扫描对号 / 叉号'); return false; }
        ex.result = ex.result || {};
        ex.result[section] = Grader.gradeMarks(ex[markF], section, ex.level);
      } else {
        if (!ex[keyF].trim()) { CET.toast('先填入' + (section === 'listening' ? '听力' : '阅读') + '标准答案'); return false; }
        if (!ex[mineF].trim()) { CET.toast('先填入你的答案'); return false; }
        ex.result = ex.result || {};
        ex.result[section] = Grader.gradeObjective(ex[keyF], ex[mineF], section, ex.level);
      }
      ex.open[section] = true;
    }
    return true;
  }

  function finishGrade(silent) {
    const ex = state.exam;
    /* Grading always belongs to the exam tab — never leave the user on another tab,
       and don't let a stray back-swipe after grading jump to another module. */
    if (state.tab !== 'exam') state.tab = 'exam';
    state.navHistory = [];
    ex.result = ex.result || {};
    const total = Grader.total(ex.result);
    ex.result.total = total;
    ex.result.at = Date.now();
    ex.result.level = ex.level;
    if (!total.max) { CET.toast('还没有可判分的内容'); return; }
    state.stats.grades = (state.stats.grades || 0) + 1;
    CET.saveStats();
    saveExamNow();
    addReport(total);
    render(false);
    if (!silent) CET.toast('判分完成 · 折算 ' + Math.round(total.projected) + ' / 710');
    setTimeout(() => {
      const el = $('#score-summary');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function addReport(total) {
    const report = {
      at: Date.now(),
      level: state.exam.level,
      score: total.score, max: total.max, projected: total.projected,
      parts: total.parts,
      result: state.exam.result
    };
    reports.unshift(report);
    reports = reports.slice(0, 8);
    CET.store.set('cet46:reports', reports);
  }

  function reportText() {
    const ex = state.exam;
    const r = ex.result;
    if (!r) return '';
    const total = r.total || Grader.total(r);
    const lines = [];
    lines.push('CET Lens · 判分报告');
    lines.push('级别：CET-' + ex.level + '　时间：' + new Date().toLocaleString('zh-CN'));
    lines.push('');
    if (r.essay) lines.push('写作：' + r.essay.raw + '/15 → ' + r.essay.converted + '/106.5（' + r.essay.band.label + '）');
    if (r.listening) lines.push('听力：' + r.listening.score + '/248.5（答对 ' + r.listening.sections.reduce((a, b) => a + b.correct, 0) + '/' + r.listening.totalQuestions + '）');
    if (r.reading) lines.push('阅读：' + r.reading.score + '/248.5（答对 ' + r.reading.sections.reduce((a, b) => a + b.correct, 0) + '/' + r.reading.totalQuestions + '）');
    if (r.translation) lines.push('翻译：' + r.translation.raw + '/15 → ' + r.translation.converted + '/106.5（' + r.translation.band.label + '）');
    lines.push('');
    lines.push('已判得分：' + total.score + ' / ' + total.max);
    lines.push('折算总分：' + total.projected + ' / 710' + (total.projected >= 425 ? '（达到 425 及格线）' : '（未达 425）'));
    lines.push('');
    if (r.essay && r.essay.upgrades && r.essay.upgrades.length) {
      lines.push('作文高级替换：');
      r.essay.upgrades.slice(0, 6).forEach((u) => lines.push('  ' + u.from + ' → ' + u.to + '（' + u.why + '）'));
    }
    if (r.translation && r.translation.missing && r.translation.missing.length) {
      lines.push('翻译可能漏译：' + r.translation.missing.join(', '));
    }
    lines.push('');
    lines.push('说明：自动判分为学习辅助，不是官方成绩。');
    return lines.join('\n');
  }

  /* ============================================================ favorites */
  function renderFavorites() {
    return '<section class="section" style="margin-top:0">' +
      '<div class="section-head"><div><h1 style="font-size:24px;letter-spacing:-.7px">收藏夹</h1>' +
        '<p class="tiny muted" style="margin-top:3px">点击卡片展开 · 搜索 · 背诵</p></div>' +
        '<span class="badge cet">' + CET.fav.count() + '</span></div>' +
      '<div class="search-box"><span>' + CET.icon('search') + '</span><input id="fav-search" type="search" placeholder="搜索收藏内容…" value="' + CET.escAttr(state.favoritesQuery) + '" autocomplete="off">' +
        '<button class="clear" data-action="clear-fav-search" aria-label="清空">' + CET.icon('close') + '</button></div>' +
      favFilterChipsHtml() +
      '<div class="row wrap mt10">' +
        '<button class="btn btn-sm ' + (CET.reciteOn('favorites') ? 'btn-reciting' : 'btn-outline') + '" data-action="toggle-recite" data-scope="favorites">' + CET.icon(CET.reciteOn('favorites') ? 'eyeOff' : 'eye') + (CET.reciteOn('favorites') ? '中文已遮盖' : '背诵模式') + '</button>' +
      '</div>' +
      (CET.reciteOn('favorites') ? '<div class="recite-note mt6">' + CET.icon('eyeOff') + ' 点击模糊中文可临时显示。</div>' : '') +
    '</section>' +
    '<section class="section" id="fav-list">' + favListHtml() + '</section>';
  }

  /** Bucket a saved item into 单词 / 词组 / 句式 / 短文（外加按需出现的句子、其他）。 */
  function favBucket(type) {
    if (type === 'word' || type === 'syn' || type === 'adv' || type === 'example') return 'word';
    if (type === 'phrase') return 'phrase';
    if (type === 'pattern' || type === 'template') return 'pattern';
    if (type === 'article') return 'reading';
    if (type === 'sentence') return 'sentence';
    if (type === 'essay') return 'essay';
    if (type === 'translation') return 'translation';
    return 'other';
  }

  const FAV_BUCKETS = [
    ['all', '全部'], ['word', '单词'], ['phrase', '词组'],
    ['pattern', '句式'], ['reading', '短文'], ['sentence', '句子'],
      ['essay', '范文'], ['translation', '翻译'], ['other', '其他']
  ];

  function favCounts() {
    const counts = { all: 0 };
    for (const x of CET.fav.list()) {
      counts.all++;
      const b = favBucket(x.type);
      counts[b] = (counts[b] || 0) + 1;
    }
    return counts;
  }

  function favFilterChipsHtml() {
    const counts = favCounts();
    const active = state.favoritesFilter || 'all';
    const chips = FAV_BUCKETS.filter(([id]) => id === 'all' || counts[id]).map(([id, label]) =>
      '<button class="chip' + (active === id ? ' active' : '') + '" data-fav-filter="' + id + '">' +
        label + '<span class="cat-count">' + (counts[id] || 0) + '</span></button>').join('');
    return chips ? '<div class="chips mt10">' + chips + '</div>' : '';
  }

  function entryForFav(x) {
    if (!x) return null;
    const core = Dict.get(x.term);
    if (core) return core;
    if (CET.FullDict.available) {
      const full = CET.FullDict.lookupAny(x.term);
      if (full) return full.entry;
    }
    return null;
  }

  function relatedForFav(x) {
    if (!x) return [];
    if (Array.isArray(x.related) && x.related.length) return x.related.slice(0, 12);
    if (x.payload && Array.isArray(x.payload.syn) && x.payload.syn.length) return x.payload.syn.slice(0, 12);
    const e = entryForFav(x);
    if (e && Array.isArray(e.y)) return e.y.slice(0, 12);
    return [];
  }

  function wordTheme(entry, head) {
    if (!entry) return THEMES[THEMES.length - 1];
    const text = (Dict.allZh(entry) + ' ' + (entry.d || '') + ' ' + (head || '')).toLowerCase();
    let best = null;
    let bestScore = 0;
    for (const t of THEMES) {
      let score = 0;
      for (const k of t.keys) {
        if (text.includes(k.toLowerCase())) score++;
      }
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return best || { id: 'other', name: '其他主题' };
  }

  function buildSynGroups(list) {
    const words = list.filter((x) => x.type === 'word');
    if (!words.length) return [];
    const data = words.map((x) => ({ x, rel: relatedForFav(x).map((s) => s.toLowerCase()) }));
    const parent = data.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    const synTo = new Map();
    data.forEach((d, i) => {
      for (const s of d.rel) {
        if (!synTo.has(s)) synTo.set(s, []);
        synTo.get(s).push(i);
      }
    });
    for (const ids of synTo.values()) {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }
    // A favorite word that is itself in another favorite's synonym list joins
    // that group (e.g. important + crucial).
    data.forEach((d, i) => {
      const t = d.x.term.toLowerCase();
      data.forEach((other, j) => {
        if (i !== j && other.rel.includes(t)) union(i, j);
      });
    });
    const groups = new Map();
    data.forEach((d, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(i);
    });
    const out = [];
    for (const ids of groups.values()) {
      const members = ids.map((i) => data[i].x);
      const memberTerms = new Set(members.map((x) => x.term.toLowerCase()));
      const related = [];
      for (const i of ids) {
        for (const s of data[i].rel) {
          if (!memberTerms.has(s) && !related.includes(s)) related.push(s);
        }
      }
      if (members.length >= 2 || related.length >= 3) {
        out.push({ members, related: related.slice(0, 12) });
      }
    }
    out.sort((a, b) => b.members.length - a.members.length || b.related.length - a.related.length);
    return out;
  }

  function synGroupCard(g) {
    return '<article class="card syn-group">' +
      '<div class="syn-group-head"><span class="badge soft">' + CET.icon('sparkles') + '同义相似词</span>' +
        '<b>' + g.members.length + ' 个收藏词</b><span class="cat-count">' + (g.related.length ? g.related.length + ' 个关联' : '') + '</span></div>' +
      '<div class="syn-group-members">' + g.members.map((x) =>
        '<button class="syn-member" data-open-word="' + CET.escAttr(x.term) + '">' + esc(x.term) + '</button>').join('') + '</div>' +
      (g.related.length ? '<div class="fav-related"><span class="rel-label">同义 / 近义</span>' +
        g.related.map((s) => '<button class="rel-chip" data-open-word="' + CET.escAttr(s) + '">' + esc(s) + '</button>').join('') + '</div>' : '') +
    '</article>';
  }

  function autoFavSections(list) {
    const groups = buildSynGroups(list);
    const grouped = new Set();
    groups.forEach((g) => g.members.forEach((x) => grouped.add(x.id)));
    const rest = list.filter((x) => !grouped.has(x.id));
    const words = rest.filter((x) => x.type === 'word');
    const themeBuckets = new Map();
    for (const x of words) {
      const e = entryForFav(x);
      const t = wordTheme(e, x.term);
      if (!themeBuckets.has(t.id)) themeBuckets.set(t.id, { theme: t, items: [] });
      themeBuckets.get(t.id).items.push(x);
    }
    const sections = [];
    if (groups.length) sections.push({ id: 'syn', title: '同义相似词', icon: 'sparkles', count: groups.length, html: groups.map(synGroupCard).join('') });
    const themeOrder = THEMES.concat([{ id: 'other', name: '其他主题' }]);
    for (const t of themeOrder) {
      const bucket = themeBuckets.get(t.id);
      if (bucket && bucket.items.length) {
        sections.push({ id: 'theme-' + t.id, title: t.name, icon: 'book', count: bucket.items.length, html: wordListCards(bucket.items) });
      }
    }
    const phrases = rest.filter((x) => x.type === 'phrase');
    if (phrases.length) sections.push({ id: 'phrase', title: '词组短语', icon: 'message', count: phrases.length, html: wordListCards(phrases) });
    const sentences = rest.filter((x) => x.type === 'sentence' || x.type === 'example');
    if (sentences.length) sections.push({ id: 'sentence', title: '句子与例句', icon: 'writing', count: sentences.length, html: wordListCards(sentences) });
    const expr = rest.filter((x) => x.type === 'syn' || x.type === 'adv');
    if (expr.length) sections.push({ id: 'expr', title: '同义与写作升级', icon: 'sparkles', count: expr.length, html: wordListCards(expr) });
    const patterns = rest.filter((x) => x.type === 'pattern' || x.type === 'template');
    if (patterns.length) sections.push({ id: 'pattern', title: '句式与模板', icon: 'quote', count: patterns.length, html: wordListCards(patterns) });
    const reads = rest.filter((x) => x.type === 'article');
    if (reads.length) sections.push({ id: 'reading', title: '短文阅读', icon: 'book', count: reads.length, html: wordListCards(reads) });
    const trans = rest.filter((x) => x.type === 'translation');
    if (trans.length) sections.push({ id: 'trans', title: '翻译与批改', icon: 'translate', count: trans.length, html: wordListCards(trans) });
    const feedback = rest.filter((x) => x.type === 'feedback' || x.type === 'report');
    if (feedback.length) sections.push({ id: 'feedback', title: '批改与报告', icon: 'award', count: feedback.length, html: wordListCards(feedback) });
    return sections;
  }

  function wordListCards(items) {
    return '<div class="word-list">' + items.map(favCard).join('') + '</div>';
  }

  function favListHtml() {
    const filter = state.favoritesFilter || 'all';
    let list = CET.fav.list();
    if (filter !== 'all') list = list.filter((x) => favBucket(x.type) === filter);
    const q = (state.favoritesQuery || '').trim().toLowerCase();
    if (q) list = list.filter((x) => (x.term + ' ' + x.sub + ' ' + (x.note || '') + ' ' + relatedForFav(x).join(' ')).toLowerCase().includes(q));
    if (!list.length) {
      const label = (FAV_BUCKETS.find(([id]) => id === filter) || [])[1] || '';
      return '<div class="empty">' + lensMascot(q ? '这个关键词没找到，换一个试试？' : (filter !== 'all' ? '这一类还没有收藏。' : '遇到好句子，点一下星标，我替你收好。')) + '<h3>' +
        (q ? '没有匹配的收藏' : (filter !== 'all' ? '还没有收藏的' + label : '收藏夹还是空的')) + '</h3><p>' +
        (q ? '换个关键词试试。' : (filter !== 'all' ? '在扫描结果或词条详情里点 ☆，单词、词组、句子都会保存到这里。' : '在扫描结果或词条详情里点 ☆，单词、词组和句子都会保存到这里。')) + '</p>' +
        (filter !== 'all' ? '<button class="btn btn-soft btn-sm" data-fav-filter="all">看全部收藏</button>' : '<button class="btn btn-soft btn-sm" data-tab="scan">去扫描</button>') + '</div>';
    }
    const size = 14;
    const pages = Math.max(1, Math.ceil(list.length / size));
    let page = Math.min(pages, Math.max(1, state.favoritesPage || 1));
    state.favoritesPage = page;
    const pageItems = list.slice((page - 1) * size, page * size);
    let html = '<div class="fav-flat">' + pageItems.map(favCard).join('') + '</div>';
    if (pages > 1) {
      html += '<div class="pager"><button class="btn btn-outline btn-sm" data-action="fav-page" data-page="' + (page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button>' +
        '<span class="pager-info">第 ' + page + ' / ' + pages + ' 页</span>' +
        '<button class="btn btn-outline btn-sm" data-action="fav-page" data-page="' + (page + 1) + '" ' + (page >= pages ? 'disabled' : '') + '>下一页</button></div>';
    }
    return html;
  }

  function favCard(x) {
    // Anything saved as "phrase" without a space is a single word: label it that way.
    const type = (x.type === 'phrase' && !/\s/.test(x.term)) ? 'word' : x.type;
    const t = TYPE_LABEL[type] || type;
    const isSentence = x.type === 'sentence' || x.term.length > 50;
    const isSample = x.type === 'essay' || x.type === 'translation';
    const term = isSample ? x.term.split(/\s+/).slice(0, 18).join(' ') + ' …' : x.term;
    const entry = entryForFav(x);
    const senses = entry ? Dict.senses(entry) : [];
    const rel = relatedForFav(x);
    const other = senses.slice(1).map((s) => (s.pos ? s.pos + ' ' : '') + s.zh.join('；')).filter(Boolean);
    const extra = [];
    if (other.length) extra.push('<div class="fav-more-block"><b>其他释义</b><div class="tiny muted zh-mask">' + other.map(esc).join(' / ') + '</div></div>');
    if (rel.length) extra.push('<div class="fav-more-block"><b>同义词 / 相关词</b><div class="chips">' + rel.slice(0, 8).map((s) => '<button class="chip" data-open-word="' + CET.escAttr(s) + '">' + esc(s) + '</button>').join('') + '</div></div>');
    return '<details class="fold fav-item">' +
      '<summary class="fav-summary">' +
        '<span class="fav-main">' +
          '<span class="fav-term ' + ((isSentence && !isSample) ? 'sentence' : '') + '"' + (isSample ? ' style="font-size:13px;font-weight:600;line-height:1.5"' : '') + '>' + esc(term) + '</span>' +
          (x.sub ? '<span class="fav-zh zh-mask">' + esc(x.sub) + '</span>' : '') +
        '</span>' +
        '<span class="badge gray">' + esc(t) + '</span></summary>' +
      '<div class="fold-body">' +
        (x.note ? '<div class="fav-sub zh-mask" style="color:var(--blue-700)">' + esc(x.note) + '</div>' : '') +
        (extra.length ? '<details class="fav-more"><summary>其他释义 / 同义词</summary><div class="fav-more-body">' + extra.join('') + '</div></details>' : '') +
        '<div class="tool-row">' +
          '<button class="btn btn-soft btn-sm" data-fav-open="' + CET.escAttr(x.id) + '">查看</button>' +
          (isSentence || /^[A-Za-z]/.test(x.term) ? '<button class="icon-btn small" data-speak="' + CET.escAttr(x.term) + '" aria-label="朗读">' + CET.icon('volume') + '</button>' : '') +
          '<button class="icon-btn small" data-copy="' + CET.escAttr(x.term + (x.sub ? '\n' + x.sub : '')) + '" aria-label="复制">' + CET.icon('copy') + '</button>' +
          '<button class="icon-btn small" data-fav-remove="' + CET.escAttr(x.id) + '" aria-label="删除">' + CET.icon('trash') + '</button>' +
        '</div>' +
      '</div></details>';
  }

  function renderFavListOnly() {
    const el = $('#fav-list');
    if (el) el.innerHTML = favListHtml();
    CET.applyReciteScopes();
  }

  function openFavWord(x) {
    let hit = Dict.lookup(x.term);
    let fromFull = false;
    if (!hit && CET.FullDict.available) { hit = CET.FullDict.lookupAny(x.term); fromFull = !!hit; }
    if (!hit) return openWord(x.term, x.source);
    const head = hit.head;
    const entry = hit.entry;
    const senses = Dict.senses(entry);
    const forms = Dict.forms(entry);
    const syn = (Array.isArray(entry.y) && entry.y.length ? entry.y : Dict.synonyms(head, 12)).slice(0, 16);
    const adv = Dict.advanced(head);
    const examples = Dict.examples(head);
    const theme = wordTheme(entry, head);
    const item = { type: 'word', term: head, sub: Dict.firstZh(entry), source: x.source || '收藏', payload: { word: head, syn: syn.slice(0, 10) } };
    let html = '<div class="word-hero"><div class="word-hero-top"><div class="grow"><h1>' + esc(head) + '</h1>' +
      '<div class="phon-row"><span class="phon">' + esc(entry.p || '') + '</span>' +
        '<button class="icon-btn small" data-speak="' + CET.escAttr(head) + '" aria-label="朗读">' + CET.icon('volume') + '</button></div>' +
      '<div class="badge-row"><span class="badge soft">' + esc(theme.name) + '</span>' + levelBadge(entry) +
        (fromFull ? '<span class="badge gray">完整词库</span>' : '') + '</div></div>' +
      '<div class="word-hero-actions"><button class="icon-btn small" data-action="toggle-recite" data-scope="detail" aria-label="遮盖中文">' + CET.icon(CET.reciteOn('detail') ? 'eyeOff' : 'eye') + '</button>' +
        CET.fav.button(item, 'lg') + '</div></div></div>';

    html += '<div class="detail-block"><div class="detail-title"><h3>其他形式</h3><span>' + forms.length + ' 个</span></div>' +
      (forms.length ? '<div class="chips">' + forms.map((f) => '<span class="chip">' + esc(f[0]) + '<small class="muted">' + esc(f[1]) + '</small></span>').join('') + '</div>' : '<p class="tiny muted">暂无词形变化。</p>') + '</div>';

    html += '<div class="detail-block"><div class="detail-title"><h3>高级替换</h3><span>' + (adv.length ? '显示 ' + Math.min(3, adv.length) + ' / ' + adv.length : '暂无') + '</span></div>' +
      '<div class="syn-context">' + CET.icon('info') + ' 适用语境：正式写作；替换前确认词性、搭配与褒贬。</div>' +
      (adv.length ? '<div class="upgrade-list">' + adv.slice(0, 3).map((a) => {
        const ai = { type: 'adv', term: a.t, sub: a.zh, note: a.ex || '', source: '收藏扩展', payload: { word: head } };
        return '<div class="adv-card"><div class="adv-top"><div class="grow"><b>' + esc(a.t) + '</b><div class="adv-zh"><span class="zh-mask">' + esc(a.zh || '') + '</span></div><div class="adv-ctx">适用语境：' + esc(advContext(head, a)) + '</div></div>' +
          '<button class="icon-btn small" data-speak="' + CET.escAttr(a.t) + '">' + CET.icon('volume') + '</button>' + CET.fav.button(ai, 'small') + '</div></div>';
      }).join('') + '</div>' : '<p class="tiny muted">暂无高级替换，查看同义词与完整词条。</p>') +
      (adv.length > 3 ? '<details class="fold"><summary>更多高级替换 <span class="cat-count">' + (adv.length - 3) + ' 个</span></summary><div class="fold-body"><div class="upgrade-list">' +
        adv.slice(3).map((a) => {
          const ai = { type: 'adv', term: a.t, sub: a.zh, note: a.ex || '', source: '收藏扩展', payload: { word: head } };
          return '<div class="adv-card"><div class="adv-top"><div class="grow"><b>' + esc(a.t) + '</b><div class="adv-zh"><span class="zh-mask">' + esc(a.zh || '') + '</span></div><div class="adv-ctx">适用语境：' + esc(advContext(head, a)) + '</div></div>' + CET.fav.button(ai, 'small') + '</div></div>';
        }).join('') + '</div></div></details>' : '') + '</div>';

    html += '<div class="detail-block"><div class="detail-title"><h3>同义词 / 近义词</h3><span>' + syn.length + ' 个</span></div>' +
      (syn.length ? '<div class="syn-grid">' + syn.slice(0, 6).map((s) => '<button class="chip" data-open-word="' + CET.escAttr(s) + '">' + esc(s) + '</button>').join('') + '</div>' : '<p class="tiny muted">暂无同义词。</p>') +
      (syn.length > 6 ? '<details class="fold"><summary>更多同义词 <span class="cat-count">' + (syn.length - 6) + ' 个</span></summary><div class="fold-body"><div class="syn-grid">' +
        syn.slice(6).map((s) => '<button class="chip" data-open-word="' + CET.escAttr(s) + '">' + esc(s) + '</button>').join('') + '</div></div></details>' : '') + '</div>';

    html += '<details class="fold"><summary>完整释义 <span class="cat-count">' + senses.length + ' 组</span></summary><div class="fold-body">' +
      senses.map((s) => '<div class="sense"><span class="pos">' + esc(s.pos || '—') + '</span><div><div class="zh"><span class="zh-mask">' + esc(s.zh.join('；')) + '</span></div>' +
        (s.en && s.en.length ? '<div class="en">' + esc(s.en.join('; ')) + '</div>' : '') + '</div></div>').join('') + '</div></details>';

    if (examples.length) {
      html += '<details class="fold"><summary>双语例句 <span class="cat-count">' + examples.length + ' 句</span></summary><div class="fold-body">' +
        examples.map((ex) => '<div class="example-card"><div class="ex-en">' + Dict.tokensToHtml(Dict.tokenize(ex[0])) + '</div>' + (ex[1] ? '<div class="ex-zh"><span class="zh-mask">' + esc(ex[1]) + '</span></div>' : '') + '</div>').join('') + '</div></details>';
    }
    html += '<div class="tool-row"><button class="btn btn-primary btn-sm" data-open-word="' + CET.escAttr(head) + '">查看完整词条</button>' +
      '<button class="btn btn-outline btn-sm" data-speak="' + CET.escAttr(head) + '">' + CET.icon('volume') + '朗读单词</button></div>';

    CET.sheet.open({ title: head, sub: theme.name + ' · ' + Dict.levelLabel(entry), html });
  }

  function openFavItem(id) {
    const x = CET.fav.get(id);
    if (!x) return;
    if (x.type === 'word') return openFavWord(x);
    if (x.type === 'syn' || x.type === 'adv' || x.type === 'example') {
      return openWord((x.payload && x.payload.word) || x.term, x.source);
    }
    if (x.type === 'phrase') {
      return openPhrase((x.payload && x.payload.phrase) || x.term, x.source);
    }
    if (x.type === 'sentence') return openSentence((x.payload && x.payload.text) || x.term);
    if (x.type === 'pattern') {
      const p = ((state.patterns && state.patterns.patterns) || []).find((q) => q.id === (x.payload && x.payload.id));
      return p ? openPattern(p) : openTextSheet(x.term, x.sub, x.note);
    }
    if (x.type === 'template') {
      const t = ((state.patterns && state.patterns.templates) || []).find((q) => q.id === (x.payload && x.payload.id));
      return t ? openTemplate(t) : openTextSheet(x.term, x.sub, x.note);
    }
    if (x.type === 'article') {
      const a = articles().find((q) => q.id === (x.payload && x.payload.id));
      return a ? openArticle(a) : openTextSheet(x.term, x.sub, x.note);
    }
    if (x.type === 'essay' || x.type === 'translation') {
      const body = (x.payload && x.payload.text) || x.term || '';
      const isEssay = x.type === 'essay';
      const sid = 'f' + Date.now();
      CET.sheet.open({
        title: isEssay ? '范文（AI 生成）' : '参考译文（AI 生成）',
        sub: (x.note ? x.note + ' · ' : '') + body.split(/\s+/).filter(Boolean).length + ' 词',
        html: '<button class="btn btn-ghost btn-block" data-fold-target="fav-body-' + sid + '">▸ ' + (isEssay ? '范文正文' : '参考译文正文') + ' · ' + body.split(/\s+/).filter(Boolean).length + ' 词</button>' +
          '<div id="fav-body-' + sid + '" style="display:none"><div class="token-text" style="font-size:15px;line-height:1.8">' + esc(body) + '</div></div>' +
          '<div class="row mt12"><button class="btn btn-ghost btn-sm" data-copy="' + CET.escAttr(body) + '">' + CET.icon('copy') + '复制</button></div>'
      });
      return;
    }
    if (x.type === 'translation') return openTextSheet(x.term, x.sub, x.note);
    if (x.type === 'report') return openTextSheet(x.term, x.sub, '收藏于 ' + CET.fmtDate(x.ts));
    return openTextSheet(x.term, x.sub, x.note);
  }

  /* ============================================================ me */
  function renderMe() {
    const info = (window.CET46 && window.CET46.getInfo) ? (() => { try { return JSON.parse(window.CET46.getInfo()); } catch (e) { return {}; } })() : {};
    return '<section class="section" style="margin-top:0">' +
      '<div class="profile-card"><div class="profile-avatar"><img src="favicon.png" alt=""></div><h1>备考搭子</h1>' +
        '<p>CET-4 / CET-6 · 离线精读与判分 · v' + (CET.APP_VERSION || info.version || '') + '</p>' +
        '<div class="profile-stats">' +
          '<div class="profile-stat"><b>' + (state.stats.scans || 0) + '</b><span>扫描</span></div>' +
          '<div class="profile-stat"><b>' + (state.stats.lookups || 0) + '</b><span>查词</span></div>' +
          '<div class="profile-stat"><b>' + CET.fav.count() + '</b><span>收藏</span></div>' +
          '<div class="profile-stat"><b>' + (state.stats.grades || 0) + '</b><span>判分</span></div>' +
        '</div>' +
      '</div></section>' +
      '<section class="section"><div class="section-head"><h2>学习设置</h2></div><div class="menu">' +
        menuItem('volume', '语音朗读', '系统语音引擎 / 在线发音', 'tts-help') +
        menuItem('sparkles', '云端 OCR', (CET.AI && CET.AI.handwritingOn() ? '已开启 · 扫描走云端' : '未开启 · 用本机离线识别'), 'handwriting-settings') +
        '<div class="menu-item" style="pointer-events:none"><span class="menu-icon">' + CET.icon('award') + '</span>' +
      '<div class="menu-main"><b>作文 / 翻译批改</b><span>' + (CET.AI && CET.AI.hasKey() ? '由模型直接看图批改' : '需配置 AI 模型') + '</span></div></div>' +
        menuItem('info', 'AI 模型', (CET.AI && CET.AI.getConfig ? (CET.AI.getConfig().model || '未选模型') : '未配置'), 'ai-model-settings') +
      '</div></section>' +
      '<section class="section"><div class="section-head"><h2>学习工具</h2></div><div class="menu">' +
        menuItem('book', '语境精读', articleMixLabel(), 'reading') +
        menuItem('quote', '满分句式库', '高分句式、范文模板与套用框架', 'patterns') +
        menuItem('award', '评分标准', '四六级题型权重与 15 分制档位', 'rubric') +
      '</div></section>' +
      '<section class="section"><div class="section-head"><h2>关于</h2></div><div class="menu">' +
        menuItem('shield', '隐私说明', '图片只在本机处理，不上传', 'privacy') +
        menuItem('info', '关于 CET Lens', '版本、数据来源与许可', 'about') +
        menuItem('trash', '清空全部数据', '收藏、历史与设置将不可恢复', 'clear-data') +
      '</div></section>' +
      '<section class="section"><details class="fold thanks">' +
      '<summary>感谢 <span class="cat-count">数据与工具来源</span></summary>' +
      '<div class="fold-body">' +
        '<div class="notice-row"><b>词库</b><span>ECDICT（MIT 许可），四六级 6,793 词与 1,486 条短语，全量 768,610 条词条随包离线。</span></div>' +
        '<div class="notice-row"><b>例句与同义词</b><span>Tatoeba（CC BY 2.0 FR）提供例句，Princeton WordNet 3.0 提供同义词关系。</span></div>' +
        '<div class="notice-row"><b>识别</b><span>离线走 Google ML Kit（本机识别），云端走 DeepSeek 的 OCR 接口。</span></div>' +
        '<div class="notice-row"><b>批改</b><span>作文与翻译的评分、问题清单和改写建议由 DeepSeek 文本模型生成。</span></div>' +
        '<div class="callout mt10">没有这些开放数据与接口，这个工具做不出来。也谢谢你用你自己的 Key 和额度，让它能一直免费地停在你的手机上。</div>' +
      '</div></details></section>' +
    '<div class="center tiny muted mt18" style="line-height:1.8">CET Lens · 离线优先</div>';
  }

  function menuItem(icon, title, sub, action) {
    return '<div class="menu-item" data-action="' + action + '"><span class="menu-icon">' + CET.icon(icon) + '</span>' +
      '<div class="menu-main"><b>' + title + '</b><span>' + sub + '</span></div>' +
      '<span class="menu-arrow">' + CET.icon('chevronRight') + '</span></div>';
  }

  /* ============================================================ word / phrase sheets */
  function openWord(word, source) {
    let hit = Dict.lookup(word);
    let fromFull = false;
    if (!hit && CET.FullDict.available) {
      hit = CET.FullDict.lookupAny(word);
      fromFull = !!hit;
    }
    if (!hit) return openUnknown(word);
    const head = hit.head;
    const entry = hit.entry;
    state.stats.lookups = (state.stats.lookups || 0) + 1;
    CET.saveStats();
    addRecent(head);
    const senses = Dict.senses(entry);
    let syn = Array.isArray(entry.y) && entry.y.length ? entry.y.slice(0, 12) : Dict.synonyms(head, 12);
    const blocked = SYN_BLOCK[head] || [];
    if (blocked.length) syn = syn.filter((s) => !blocked.includes(s.toLowerCase()));
    const adv = Dict.advanced(head);
    if (syn.length < 4 && adv.length) {
      for (const a of adv) {
        if (a.t && !a.t.includes(' ') && !syn.some((x) => x.toLowerCase() === a.t.toLowerCase())) syn.push(a.t);
        if (syn.length >= 6) break;
      }
    }
    const phrases = Dict.phrasesForWord(head);
    const examples = Dict.examples(head);
    const forms = Dict.forms(entry);
    const synCtx = synonymContext(head, entry);
    const item = { type: 'word', term: head, sub: Dict.firstZh(entry), source: source || '词典', payload: { word: head, syn: syn.slice(0, 10) } };

    let html = '<div class="word-hero"><div class="word-hero-top"><div class="grow"><h1>' + esc(head) + '</h1>' +
      '<div class="phon-row"><span class="phon">' + esc(entry.p || '') + '</span>' +
        '<button class="icon-btn small" data-speak="' + CET.escAttr(head) + '" aria-label="朗读">' + CET.icon('volume') + '</button>' +
        '<button class="icon-btn small" data-copy="' + CET.escAttr(head) + '" aria-label="复制">' + CET.icon('copy') + '</button></div>' +
      '<div class="badge-row">' + levelBadge(entry) + (entry.c ? '<span class="badge gray">柯林斯 ' + entry.c + ' 星</span>' : '') + (entry.o ? '<span class="badge gold">牛津核心</span>' : '') + '</div></div>' +
      '<div class="word-hero-actions">' +
        '<button class="icon-btn small" data-action="toggle-recite" data-scope="detail" aria-label="遮盖中文">' + CET.icon(CET.reciteOn('detail') ? 'eyeOff' : 'eye') + '</button>' +
        CET.fav.button(item, 'lg') + '</div></div></div>';

    if (hit.matchedBy !== 'head') {
      html += '<div class="pill-note mt10">原词形 “' + esc(word) + '” 已还原为 ' + esc(head) + '。</div>';
    }
    if (fromFull) {
      html += '<div class="pill-note mt10">' + CET.icon('book') + ' 来自完整词库（' + CET.FullDict.count.toLocaleString() + ' 词）· 核心词库暂无此词条。</div>';
    }

    html += '<div class="detail-block"><div class="detail-title"><h3>释义</h3><span>' + senses.length + ' 组</span></div>' +
      (senses.length ? senses.map((s) => '<div class="sense"><span class="pos">' + esc(s.pos || '—') + '</span><div>' +
        '<div class="zh"><span class="zh-mask">' + esc(s.zh.join('；')) + '</span></div>' +
        (s.en && s.en.length ? '<div class="en">' + esc(s.en.join('; ')) + '</div>' : '') + '</div></div>').join('') : '<p class="tiny muted">暂无中文释义。</p>') +
      '</div>';

    if (syn.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>同义替换</h3><span>点击查词 · 星标收藏</span></div>' +
        '<div class="syn-context">' + CET.icon('info') + ' 适用语境：' + esc(synCtx) + '</div><div class="syn-grid">' +
        syn.map((s) => {
          const si = { type: 'syn', term: s, sub: '同义替换：' + head, source: '同义词', payload: { word: s } };
          const sid = CET.fav.register(si);
          const on = CET.fav.has(sid);
          const attr = s.includes(' ') ? 'data-open-phrase' : 'data-open-word';
          return '<span class="syn-chip"><button type="button" class="s-star ' + (on ? 'on' : '') + '" data-fav-toggle="' + CET.escAttr(sid) + '" aria-label="收藏">' +
            CET.icon(on ? 'starFill' : 'star') + '</button><button class="chip-word" ' + attr + '="' + CET.escAttr(s) + '" title="适用语境：' + CET.escAttr(synCtx) + '">' + esc(s) + '</button></span>';
        }).join('') + '</div></div>';
    }

    if (adv.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>更高级表达</h3><span>' + adv.length + ' 个</span></div>' +
        adv.map((a) => {
          const ai = { type: 'adv', term: a.t, sub: a.zh, note: a.ex || '', source: '高级表达', payload: { word: head } };
          return '<div class="adv-card"><div class="adv-top"><div class="grow"><b>' + esc(a.t) + '</b><div class="adv-zh"><span class="zh-mask">' + esc(a.zh || '') + '</span></div><div class="adv-ctx">适用语境：' + esc(advContext(typeof head !== 'undefined' ? head : p.p, a)) + '</div></div>' +
            '<button class="icon-btn small" data-speak="' + CET.escAttr(a.t) + '" aria-label="朗读">' + CET.icon('volume') + '</button>' + CET.fav.button(ai, 'small') + '</div>' +
            (a.ex ? '<div class="adv-ex">' + esc(a.ex) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    }

    if (phrases.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>相关词组</h3><span>含 “' + esc(head) + '”</span></div><div class="word-list">' +
        phrases.map((p) => phraseRow(p, '词条关联')).join('') + '</div></div>';
    }

    if (examples.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>双语例句</h3><span>' + examples.length + ' 句</span></div>' +
        examples.map((ex) => {
          const ei = { type: 'example', term: ex[0], sub: ex[1] || '', source: '例句', payload: { word: head } };
          return '<div class="example-card"><div class="ex-en">' + Dict.tokensToHtml(Dict.tokenize(ex[0])) + '</div>' + (ex[1] ? '<div class="ex-zh"><span class="zh-mask">' + esc(ex[1]) + '</span></div>' : '') +
            '<div class="row mt6"><button class="btn btn-ghost btn-sm" data-speak="' + CET.escAttr(ex[0]) + '">' + CET.icon('volume') + '朗读</button>' + CET.fav.button(ei, 'small') + '</div></div>';
        }).join('') + '</div>';
    }

    if (forms.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>词形变化</h3></div><div class="chips">' +
        forms.map((f) => '<span class="chip">' + esc(f[0]) + '<small class="muted">' + esc(f[1]) + '</small></span>').join('') + '</div></div>';
    }

    html += '<div class="detail-block"><div class="detail-title"><h3>更多</h3></div><div class="link-row">' +
      '<button class="text-link" data-open-word="' + CET.escAttr(head) + '">在词库中搜索</button>' +
      '<a class="text-link" href="https://dictionary.cambridge.org/dictionary/english-chinese-simplified/' + encodeURIComponent(head) + '" target="_blank" rel="noopener">剑桥词典</a>' +
      '<a class="text-link" href="https://dict.youdao.com/result?word=' + encodeURIComponent(head) + '&lang=en" target="_blank" rel="noopener">有道词典</a>' +
      '</div></div>';

    CET.sheet.open({
      title: head,
      sub: [entry.p, Dict.levelLabel(entry)].filter(Boolean).join(' · '),
      html
    });
  }

  function openUnknown(word) {
    const w = String(word || '').trim();
    if (!w) return;
    const item = { type: 'word', term: w, sub: '词库暂未收录', source: '手动查词', payload: { word: w } };
    CET.sheet.open({
      title: w,
      sub: '词库暂未收录',
      html: '<div class="empty" style="margin-top:4px"><div class="empty-icon">' + CET.icon('search') + '</div><h3>没有找到这个词</h3>' +
        '<p>它可能是专有名词、生僻词或 OCR 误识别。可以朗读、复制，或在外部词典继续查。</p></div>' +
        '<div class="tool-row mt14"><button class="btn btn-primary btn-sm" data-speak="' + CET.escAttr(w) + '">' + CET.icon('volume') + '朗读</button>' +
        '<button class="btn btn-outline btn-sm" data-copy="' + CET.escAttr(w) + '">' + CET.icon('copy') + '复制</button>' +
        CET.fav.button(item) + '</div>' +
        '<div class="link-row"><a class="text-link" href="https://dictionary.cambridge.org/dictionary/english-chinese-simplified/' + encodeURIComponent(w) + '" target="_blank" rel="noopener">剑桥词典</a>' +
        '<a class="text-link" href="https://dict.youdao.com/result?word=' + encodeURIComponent(w) + '&lang=en" target="_blank" rel="noopener">有道词典</a></div>'
    });
  }

  function findPhraseByText(text) {
    const key = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    let hit = Dict.phraseByText(key);
    if (hit) return hit;
    hit = (Dict.cetPhraseBank || []).find((x) => String(x.p || '').toLowerCase() === key);
    if (hit) return hit;
    return (Dict.phraseBank || []).find((x) => String(x.p || '').toLowerCase() === key) || null;
  }

  function openPhrase(p, source) {
    if (!p) return;
    if (typeof p === 'string') {
      p = findPhraseByText(p) || {
        p: p, zh: '同义表达 / 词组（词库未收录详细释义）', cat: 'opinion',
        syn: [], adv: [], ex: ''
      };
    }
    const item = { type: 'phrase', term: p.p, sub: p.zh, source: source || '词组库', payload: { phrase: p.p } };
    let html = '<div class="word-hero"><div class="word-hero-top"><div class="grow"><h1 style="font-family:var(--font);font-size:25px;line-height:1.3">' + esc(p.p) + '</h1>' +
      '<div class="phon-row"><span class="badge soft">' + esc(CAT_LABEL[p.cat] || '词组') + '</span>' +
        '<button class="icon-btn small" data-speak="' + CET.escAttr(p.p) + '" aria-label="朗读">' + CET.icon('volume') + '</button></div></div>' +
      '<div class="word-hero-actions">' +
        '<button class="icon-btn small" data-action="toggle-recite" data-scope="detail" aria-label="遮盖中文">' + CET.icon(CET.reciteOn('detail') ? 'eyeOff' : 'eye') + '</button>' +
        CET.fav.button(item, 'lg') + '</div></div></div>' +
      '<div class="detail-block"><div class="detail-title"><h3>中文意思</h3></div><div style="font-size:16px;line-height:1.7"><span class="zh-mask">' + esc(p.zh) + '</span></div></div>';
    if (p.syn && p.syn.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>同义表达</h3><span>点击搜索</span></div>' +
        '<div class="syn-context">' + CET.icon('info') + ' ' + esc(phraseContext(p)) + '</div><div class="syn-grid">' +
        p.syn.map((s) => {
          const si = { type: 'phrase', term: s, sub: '同义于：' + p.p, source: '词组同义', payload: { phrase: s } };
          const sid = CET.fav.register(si);
          const on = CET.fav.has(sid);
          return '<span class="syn-chip"><button class="s-star ' + (on ? 'on' : '') + '" data-fav-toggle="' + CET.escAttr(sid) + '" aria-label="收藏">' + CET.icon(on ? 'starFill' : 'star') + '</button>' +
            '<button class="chip-word" data-open-phrase="' + CET.escAttr(s) + '">' + esc(s) + '</button></span>';
        }).join('') + '</div></div>';
    }
    if (p.adv && p.adv.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>更高级表达</h3></div>' +
        p.adv.map((a) => {
          const ai = { type: 'adv', term: a.t, sub: a.zh, note: a.ex || '', source: '词组升级', payload: { phrase: p.p } };
          return '<div class="adv-card"><div class="adv-top"><div class="grow"><b>' + esc(a.t) + '</b><div class="adv-zh"><span class="zh-mask">' + esc(a.zh || '') + '</span></div><div class="adv-ctx">适用语境：' + esc(advContext(typeof head !== 'undefined' ? head : p.p, a)) + '</div></div>' +
            '<button class="icon-btn small" data-speak="' + CET.escAttr(a.t) + '">' + CET.icon('volume') + '</button>' + CET.fav.button(ai, 'small') + '</div>' +
            (a.ex ? '<div class="adv-ex">' + esc(a.ex) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    }
    if (p.ex) {
      const si = { type: 'sentence', term: p.ex, sub: '短语例句：' + p.p, source: '词组例句', payload: { text: p.ex } };
      html += '<div class="detail-block"><div class="detail-title"><h3>例句</h3></div><div class="example-card"><div class="ex-en">' + Dict.tokensToHtml(Dict.tokenize(p.ex)) + '</div>' +
        '<div class="row mt6"><button class="btn btn-ghost btn-sm" data-speak="' + CET.escAttr(p.ex) + '">' + CET.icon('volume') + '朗读</button>' + CET.fav.button(si, 'small') + '</div></div></div>';
    }
    html += '<div class="detail-block"><div class="link-row"><button class="text-link" data-open-word="' + CET.escAttr(p.p.split(/\s+/).filter((x) => x.length > 3)[0] || p.p) + '">查关键词</button></div></div>';
    CET.sheet.open({ title: p.p, sub: '词组 · ' + (CAT_LABEL[p.cat] || '表达'), html });
  }

  function openSentence(text) {
    const s = String(text || '').trim();
    if (!s) return;
    const tokens = Dict.tokenize(s);
    const items = Dict.keyItems(tokens, 8);
    const issues = Grader.grammarIssues(s);
    const item = { type: 'sentence', term: s, sub: '句子精读', source: '句子', payload: { text: s } };
    let html = '<div class="card card-hero-soft"><div class="token-text" style="font-size:17px">' + Dict.tokensToHtml(tokens) + '</div>' +
      '<div class="row mt10"><button class="btn btn-soft btn-sm" data-speak="' + CET.escAttr(s) + '">' + CET.icon('volume') + '朗读</button>' +
        '<button class="btn btn-ghost btn-sm" data-copy="' + CET.escAttr(s) + '">' + CET.icon('copy') + '复制</button>' +
        CET.fav.button(item) + '</div></div>';
    if (items.words.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>句中重点词</h3></div><div class="chips">' +
        items.words.map((x) => '<button class="chip" data-open-word="' + CET.escAttr(x.head) + '">' + esc(x.head) + '<small class="muted">' + esc(Dict.firstZh(x.entry).slice(0, 8)) + '</small></button>').join('') + '</div></div>';
    }
    if (items.phrases.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>句中词组</h3></div><div class="chips">' +
        items.phrases.map((p) => '<button class="chip" data-open-phrase="' + CET.escAttr(p.p) + '">' + esc(p.p) + '</button>').join('') + '</div></div>';
    }
    if (issues.length) {
      html += '<div class="detail-block"><div class="detail-title"><h3>语法提示</h3><span>' + issues.length + ' 条</span></div><div class="feedback-list">' +
        issues.slice(0, 6).map((x) => '<div class="feedback-item warn"><span class="dot"></span><div class="fb-main"><b>' + esc(x.type) + '：' + esc(x.excerpt) + '</b><p>' + esc(x.message) + '</p>' +
          (x.suggestion ? '<div class="fb-fix">建议：<ins>' + esc(x.suggestion) + '</ins></div>' : '') + '</div></div>').join('') + '</div></div>';
    }
    CET.sheet.open({ title: '句子精读', sub: s.length > 42 ? s.slice(0, 42) + '…' : s, html });
  }

  function openTextSheet(title, sub, note) {
    CET.sheet.open({
      title: title || '详情',
      sub: sub || '',
      html: '<div class="card"><div style="font-size:14px;line-height:1.8;white-space:pre-wrap">' + esc(sub || '') + '</div>' +
        (note ? '<div class="pill-note mt14">' + esc(note) + '</div>' : '') + '</div>' +
        '<div class="tool-row"><button class="btn btn-outline btn-sm" data-copy="' + CET.escAttr((title || '') + '\n' + (sub || '') + '\n' + (note || '')) + '">' + CET.icon('copy') + '复制</button>' +
        '<button class="btn btn-primary btn-sm" data-speak="' + CET.escAttr(sub || title || '') + '">' + CET.icon('volume') + '朗读</button></div>'
    });
  }

  /* ============================================================ search */
  function addRecent(q) {
    const term = String(q || '').trim();
    if (!term) return;
    state.recentSearches = [term].concat(state.recentSearches.filter((x) => x.toLowerCase() !== term.toLowerCase())).slice(0, 8);
    CET.store.set('cet46:recent', state.recentSearches);
  }

  function openSearch() {
    CET.sheet.open({
      title: '查词',
      sub: '英文单词或中文释义',
      html: '<div class="search-box"><span>' + CET.icon('search') + '</span><input id="global-search" type="search" placeholder="输入英文或中文…" autocomplete="off" spellcheck="false">' +
        '<button class="clear" data-action="clear-global-search">' + CET.icon('close') + '</button></div>' +
        '<div id="global-results" class="mt14"></div>',
      onMount(body) {
        const input = $('#global-search', body);
        const results = $('#global-results', body);
        const renderResults = () => {
          const q = input.value.trim();
          if (!q) {
            results.innerHTML = '<div class="detail-title"><h3>最近查过</h3></div>' +
              (state.recentSearches.length ? '<div class="chips">' + state.recentSearches.map((x) => '<button class="chip" data-search-fill="' + CET.escAttr(x) + '">' + esc(x) + '</button>').join('') + '</div>' :
                '<div class="empty" style="padding:18px"><p>输入单词开始查词。所有释义来自离线词库。</p></div>');
            return;
          }
          const res = Dict.search(q, 30);
          let full = [];
          if (CET.FullDict.available) {
            const coreSet = new Set(res.map((x) => x.head.toLowerCase()));
            full = CET.FullDict.searchAny(q, 20).filter((x) => !coreSet.has(x.head.toLowerCase()));
          }
          if (!res.length && !full.length) {
            results.innerHTML = '<div class="empty" style="padding:18px"><h3>没有找到</h3><p>试试词根、较短拼写，或中文关键词。</p></div>';
            return;
          }
          let html = '<div class="tiny muted mb8">核心 ' + res.length + ' 个结果' +
            (full.length ? ' · 完整词库 ' + full.length + ' 个' : '') + '</div>';
          if (res.length) {
            html += '<div class="word-list">' + res.map((x) => wordRow(x.head, x.entry, '搜索')).join('') + '</div>';
          }
          if (full.length) {
            html += '<div class="section-head" style="margin-top:16px"><h2 style="font-size:13px">完整词库</h2><span class="tiny muted">' +
              Number(CET.FullDict.count).toLocaleString() + ' 词</span></div><div class="word-list">' +
              full.map((x) => wordRow(x.head, x.entry, '完整词库')).join('') + '</div>';
          }
          results.innerHTML = html;
        };
        input.addEventListener('input', CET.debounce(renderResults, 160));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); addRecent(input.value); renderResults(); }
        });
        body.addEventListener('click', (e) => {
          const fill = e.target.closest('[data-search-fill]');
          if (fill) { input.value = fill.getAttribute('data-search-fill'); renderResults(); }
        });
        renderResults();
        setTimeout(() => { try { input.focus(); } catch (err) {} }, 120);
      }
    });
  }

  /* ============================================================ rubric / about / privacy */
  function showRubric() {
    const w4 = Grader.weights(4), w6 = Grader.weights(6);
    const row = (name, a, b) => '<tr><td>' + name + '</td><td>' + a + '</td><td>' + b + '</td></tr>';
    CET.modal.open(
      '<h3>四六级评分标准</h3>' +
      '<p>总分 710 分。写作与翻译各占 15%，听力与阅读各占 35%。</p>' +
      '<div style="overflow:auto;margin-top:10px"><table style="width:100%;border-collapse:collapse;font-size:11px">' +
        '<thead><tr style="color:#6b7c96;text-align:left"><th style="padding:6px 4px">项目</th><th>CET-4</th><th>CET-6</th></tr></thead><tbody>' +
        row('写作', '106.5（15%）', '106.5（15%）') +
        row('听力', '248.5（35%）', '248.5（35%）') +
        row('阅读', '248.5（35%）', '248.5（35%）') +
        row('翻译', '106.5（15%）', '106.5（15%）') +
        row('总分', '710', '710') +
      '</tbody></table></div>' +
      '<div class="pill-note mt14">写作 / 翻译采用 15 分制：13–15 优秀，10–12 良好，7–9 及格，4–6 较弱，1–3 较差，0 未作答。系统按内容、结构、语言、词汇、句式等维度估算后折合 106.5 分。</div>' +
      '<div class="pill-note mt8">听力与阅读按题型分段计分：CET-4 听力为短篇新闻 7 题 49.7 分、长对话 8 题 56.8 分、听力篇章 10 题 142 分；CET-6 长对话 8 题 56.8 分、听力篇章 7 题 49.7 分、讲座 10 题 142 分。阅读统一为选词填空 10 题 35.5 分、长篇阅读 10 题 71 分、仔细阅读 10 题 142 分。</div>' +
      '<div class="pill-note mt8">客观题支持两种判分方式：① 按 A/B/C/D 答案与标准答案比对；② 按答题卡上的 √/× 对号叉号直接估分（无需标准答案，√ 计对、× 或空白计错）。扫描后可手动校对符号。</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-modal-close>知道了</button></div>'
    );
  }

  function showTtsHelp() {
    const online = state.settings.ttsMode === 'online';
    CET.sheet.open({
      title: '语音朗读',
      sub: online ? '当前：在线发音' : '当前：系统语音引擎',
      html: '<div class="pill-note mb12">' + CET.icon('info') + ' 如果手机没有语音引擎，朗读会没有声音。可以启用系统 TTS，或改用在线发音。</div>' +
        '<div class="setting-row"><div class="setting-main"><b>使用在线发音</b><span>需要网络；只发送当前朗读的英文文本</span></div>' +
          '<button class="btn ' + (online ? 'btn-primary' : 'btn-outline') + ' btn-sm" id="tts-online-toggle">' + (online ? '已开启' : '开启') + '</button></div>' +
        '',
      onMount(body) {
        const toggle = body.querySelector('#tts-online-toggle');
        if (toggle) toggle.addEventListener('click', () => {
          state.settings.ttsMode = state.settings.ttsMode === 'online' ? 'system' : 'online';
          CET.saveSettings();
          const on = state.settings.ttsMode === 'online';
          toggle.textContent = on ? '已开启' : '开启';
          toggle.className = 'btn ' + (on ? 'btn-primary' : 'btn-outline') + ' btn-sm';
          CET.toast(on ? '已开启在线语音' : '已关闭在线语音');
        });

      }
    });
  }

  function showAbout() {
    CET.modal.open(
      '<h3>关于 CET Lens</h3><p>一个离线优先的四六级精读与判分工具：相机 OCR、重点词/词组扩展、同义替换、高级表达、收藏夹，以及写作 / 翻译 / 客观题判分。</p>' +
      '<div class="callout mt10">词库：ECDICT（MIT）20,499 核心 + 768,610 完整词条 · 例句：Tatoeba（CC BY 2.0 FR）· 同义词：Princeton WordNet 3.0 · OCR：优先系统 ML Kit（离线），不支持时回退内置 Tesseract.js（Apache-2.0）。<br>所有词条与例句仅用于语言学习。</div>' +
      '<div class="callout mt8">自动判分是学习辅助，不等同于官方阅卷；正式考试请以官方评分与成绩为准。</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-modal-close>关闭</button></div>'
    );
  }

  function showPrivacy() {
    CET.modal.open(
      '<h3>隐私说明</h3><p>相机与相册图片只在本机 WebView 处理，OCR 模型与词库随 APK 离线打包，不上传。</p>' +
      '<div class="pill-note mt10">收藏、设置、判分记录保存在本机 WebView 的 localStorage。卸载应用或清除应用数据会删除这些内容。应用没有账号系统，也不收集个人信息。</div>' +
      '<div class="pill-note mt8">OCR 不上传图片。语音朗读可在「语音朗读」里切换在线/本机。</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-modal-close>知道了</button></div>'
    );
  }

  function clearAllData() {
    CET.confirm('清空全部数据', '收藏、判分记录、设置和上次扫描都会被删除，且不可恢复。', function () {
      ['cet46:favs:v1', 'cet46:settings', 'cet46:stats', 'cet46:recent', 'cet46:lastscan', 'cet46:exam:v1', 'cet46:reports'].forEach((k) => CET.store.remove(k));
      CET.toast('已清空，正在重载…');
      setTimeout(() => location.reload(), 500);
    }, '清空');
  }

  /* ============================================================ event handling */
  function bindGlobal() {
    let dictScrollTimer = null;
    window.addEventListener('scroll', function () {
      if (state.tab !== 'dict' || state.dictQuery) return;
      clearTimeout(dictScrollTimer);
      dictScrollTimer = setTimeout(function () { saveDictPage(window.scrollY || 0); }, 120);
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'dict-jump' && e.key === 'Enter') {
        const n = Number(e.target.value);
        const total = Number(state.dictTotalPages) || 1;
        if (n >= 1 && n <= total) {
          e.preventDefault();
          state.dictPage = n - 1;
          saveDictPage(0);
          window.scrollTo(0, 0);
          renderDictSection();
          window.scrollTo(0, 0);
        }
      }
    });

    document.addEventListener('change', function (e) {
      const pw = e.target.closest('[data-dict-pw]');
      const pp = e.target.closest('[data-dict-pp]');
      if (!pw && !pp) return;
      if (pw) state.dictPageWords = Number(pw.value) || 10;
      if (pp) state.dictPagePhrases = Number(pp.value) || 10;
      state.dictPage = 0;
      renderDictSection();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-fav-toggle]')) return;
      const wordEl = e.target.closest('[data-open-word]');
      if (wordEl) {
        e.preventDefault();
        openWord(wordEl.getAttribute('data-open-word'), '词典');
        return;
      }
      const tokWord = e.target.closest('.tok[data-word]');
      if (tokWord) {
        e.preventDefault();
        openWord(tokWord.getAttribute('data-word'), '扫描精读');
        return;
      }
      const phraseEl = e.target.closest('[data-open-phrase]');
      if (phraseEl) {
        e.preventDefault();
        openPhrase(phraseEl.getAttribute('data-open-phrase'), '词组库');
        return;
      }
      const tokPhrase = e.target.closest('.tok[data-phrase]');
      if (tokPhrase) {
        e.preventDefault();
        openPhrase(tokPhrase.getAttribute('data-phrase'), '扫描精读');
        return;
      }
      const sent = e.target.closest('[data-open-sentence]');
      if (sent) { e.preventDefault(); openSentence(sent.getAttribute('data-open-sentence')); return; }
      const art = e.target.closest('[data-open-article]');
      if (art) {
        e.preventDefault();
        const id = art.getAttribute('data-open-article');
        const a = articles().find((x) => x.id === id);
        if (a) openArticle(a);
        return;
      }
      const pat = e.target.closest('[data-open-pattern]');
      if (pat) {
        e.preventDefault();
        const id = pat.getAttribute('data-open-pattern');
        const p = ((state.patterns && state.patterns.patterns) || []).find((x) => x.id === id);
        if (p) openPattern(p);
        return;
      }
      const tpl = e.target.closest('[data-open-template]');
      if (tpl) {
        e.preventDefault();
        const id = tpl.getAttribute('data-open-template');
        const t = ((state.patterns && state.patterns.templates) || []).find((x) => x.id === id);
        if (t) openTemplate(t);
        return;
      }
      const pcat = e.target.closest('[data-pattern-cat]');
      if (pcat) {
        e.preventDefault();
        state.patternCat = pcat.getAttribute('data-pattern-cat');
        render(false);
        return;
      }
      const plv = e.target.closest('[data-pattern-level]');
      if (plv) {
        e.preventDefault();
        state.patternLevel = plv.getAttribute('data-pattern-level');
        render(false);
        return;
      }
      const af = e.target.closest('[data-article-folder]');
      if (af) {
        e.preventDefault();
        state.articleFolder = af.getAttribute('data-article-folder');
        state.articleQuery = '';
        transitionRender('right', false);
        return;
      }
      const alv = e.target.closest('[data-article-level]');
      if (alv) {
        e.preventDefault();
        state.articleLevel = alv.getAttribute('data-article-level');
        render(false);
        return;
      }
      const atp = e.target.closest('[data-article-topic]');
      if (atp) {
        e.preventDefault();
        const t = atp.getAttribute('data-article-topic');
        state.articleTopic = state.articleTopic === t ? 'all' : t;
        render(false);
        return;
      }
      const aty = e.target.closest('[data-article-type]');
      if (aty) {
        e.preventDefault();
        state.articleType = state.articleType === 'adapted' ? 'all' : 'adapted';
        render(false);
        return;
      }
      const akd = e.target.closest('[data-article-kind]');
      if (akd) {
        e.preventDefault();
        state.articleKind = akd.getAttribute('data-article-kind');
        render(false);
        return;
      }
      const favOpen = e.target.closest('[data-fav-open]');
      if (favOpen) { e.preventDefault(); openFavItem(favOpen.getAttribute('data-fav-open')); return; }
      const favRemove = e.target.closest('[data-fav-remove]');
      if (favRemove) {
        e.preventDefault();
        const id = favRemove.getAttribute('data-fav-remove');
        const item = CET.fav.get(id);
        CET.fav.remove(id);
        CET.toast((item && item.type === 'phrase' ? '已删除词组' : '已删除收藏'));
        renderFavListOnly();
        return;
      }
      const tab = e.target.closest('[data-tab]');
      if (tab) { e.preventDefault(); go(tab.getAttribute('data-tab')); return; }
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) { e.preventDefault(); handleAction(actionEl.getAttribute('data-action'), actionEl); return; }
      const framePicker = e.target.closest('[data-frame-picker]');
      if (framePicker) {
        e.preventDefault();
        openFramePicker(framePicker.getAttribute('data-frame-kind'), Number(framePicker.getAttribute('data-frame-picker')));
        return;
      }
      const objMode = e.target.closest('[data-obj-mode]');
      if (objMode) {
        e.preventDefault();
        const kind = objMode.getAttribute('data-obj-kind');
        const mode = objMode.getAttribute('data-obj-mode');
        state.exam.modes = state.exam.modes || {};
        state.exam.modes[kind] = mode;
        saveExamNow();
        render(false);
        return;
      }
      const level = e.target.closest('[data-level]');
      if (level) {
        e.preventDefault();
        const lv = Number(level.getAttribute('data-level')) === 6 ? 6 : 4;
        if (state.exam.level !== lv) {
          state.exam.level = lv;
          state.exam.result = null;
          saveExamNow();
          render(false);
        }
        return;
      }
      const toggleExam = e.target.closest('[data-toggle-exam]');
      if (toggleExam) {
        const id = toggleExam.getAttribute('data-toggle-exam');
        state.exam.open[id] = !state.exam.open[id];
        render(false);
        return;
      }
      const scanTarget = e.target.closest('[data-scan-target]');
      if (scanTarget) { e.preventDefault(); openScanSource(scanTarget.getAttribute('data-scan-target')); return; }
      const clearField = e.target.closest('[data-clear-field]');
      if (clearField) {
        e.preventDefault();
        const f = clearField.getAttribute('data-clear-field');
        state.exam[f] = '';
        saveExamNow();
        render(false);
        return;
      }
      const grade = e.target.closest('[data-grade]');
      if (grade) {
        e.preventDefault();
        const sec = grade.getAttribute('data-grade');
        /* AI grading is turned on → the per-section button runs the AI pass. */
        const ai = CET.AI && CET.AI.hasKey && CET.AI.hasKey();
        if (ai && (sec === 'writing' || sec === 'translation')) { aiGradePaper(sec); return; }
        if (gradeSection(sec)) finishGrade(false);
        return;
      }
      const dictModeBtn = e.target.closest('[data-dict-mode]');
      if (dictModeBtn) {
        e.preventDefault();
        saveDictPage(window.scrollY || 0);
        state.dictMode = dictModeBtn.getAttribute('data-dict-mode') === 'phrase' ? 'phrase' : 'word';
        persistentSet('cet46:dictMode', state.dictMode);
        state.dictPage = null;
        state.dictQuery = '';
        renderDictSection();
        window.scrollTo(0, 0);
        return;
      }
      const dictFilter = e.target.closest('[data-dict-filter]');
      if (dictFilter) {
        e.preventDefault();
        state.dictFilter = dictFilter.getAttribute('data-dict-filter');
        state.dictQuery = '';
        state.dictPage = 0;
        renderDictSection();
        return;
      }
      const dictPage = e.target.closest('[data-dict-page]');
      if (dictPage) {
        e.preventDefault();
        const dir = dictPage.getAttribute('data-dict-page');
        state.dictPage = Math.max(0, (Number(state.dictPage) || 0) + (dir === 'next' ? 1 : -1));
        saveDictPage(0);
        window.scrollTo(0, 0);
        renderDictSection();
        window.scrollTo(0, 0);
        return;
      }
      const jumpGo = e.target.closest('[data-dict-jump-go]');
      if (jumpGo) {
        e.preventDefault();
        const input = $('#dict-jump');
        const n = Number(input && input.value);
        const total = Number(state.dictTotalPages) || 1;
        if (n >= 1 && n <= total) {
          state.dictPage = n - 1;
          saveDictPage(0);
          window.scrollTo(0, 0);
          renderDictSection();
          window.scrollTo(0, 0);
        }
        return;
      }
      const bmRemove = e.target.closest('[data-dict-bm-remove]');
      if (bmRemove) {
        e.preventDefault();
        e.stopPropagation();
        const page = Number(bmRemove.getAttribute('data-dict-bm-remove'));
        saveDictBookmarks(dictBookmarkList().filter((x) => Number(x.page) !== page));
        refreshDictBookmarkTools();
        return;
      }
      const bm = e.target.closest('[data-dict-bm]');
      if (bm) {
        e.preventDefault();
        state.dictPage = Math.max(0, Number(bm.getAttribute('data-dict-bm')) || 0);
        const target = dictBookmarkList().find((x) => Number(x.page) === state.dictPage);
        state._dictRestoreY = target ? (Number(target.y) || 0) : 0;
        saveDictPage(state._dictRestoreY);
        window.scrollTo(0, 0);
        renderDictSection();
        window.scrollTo(0, 0);
        return;
      }
      const bmAdd = e.target.closest('[data-dict-bm-add]');
      if (bmAdd) {
        e.preventDefault();
        const page = Number(state.dictPage) || 0;
        const list = dictBookmarkList().filter((x) => Number(x.page) !== page);
        if (list.length >= 4 && !list.some((x) => Number(x.page) === page)) {
          CET.toast('最多 4 个书签');
          return;
        }
        list.unshift({ page: page, y: window.scrollY || 0, at: Date.now() });
        saveDictBookmarks(list.slice(0, 4));
        saveDictPage(window.scrollY || 0);
        refreshDictBookmarkTools();
        return;
      }
      const foldBtn = e.target.closest('[data-fold-target]');
      if (foldBtn) {
        e.preventDefault();
        const t = document.getElementById(foldBtn.getAttribute('data-fold-target'));
        if (t) {
          const open = t.style.display !== 'none';
          t.style.display = open ? 'none' : 'block';
          foldBtn.classList.toggle('open', !open);
        }
        return;
      }
      const favFilter = e.target.closest('[data-fav-filter]');
      if (favFilter) {
        e.preventDefault();
        state.favoritesFilter = favFilter.getAttribute('data-fav-filter');
        state.favoritesPage = 1;
        $$('[data-fav-filter]').forEach((b) => b.classList.toggle('active', b === favFilter));
        renderFavListOnly();
        return;
      }
      const reportOpen = e.target.closest('[data-report-open]');
      if (reportOpen) {
        const idx = Number(reportOpen.getAttribute('data-report-open'));
        const rep = reports[idx];
        if (rep) {
          state.exam.result = rep.result;
          state.exam.level = rep.level;
          state.exam.result.total = Grader.total(rep.result);
          render(false);
          setTimeout(() => { const el = $('#score-summary'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 80);
        }
        return;
      }
    });

    document.addEventListener('input', function (e) {
      const examField = e.target.closest('[data-exam-field]');
      if (examField) {
        const f = examField.getAttribute('data-exam-field');
        setExamField(f, examField.value);
        if (f === 'essayText') updateEssayCount();
        if (f === 'listeningKey' || f === 'listeningMine' || f === 'listeningMarks') updateAnswerHint('listening');
        if (f === 'readingKey' || f === 'readingMine' || f === 'readingMarks') updateAnswerHint('reading');
        return;
      }
      if (e.target.id === 'dict-search') {
        state.dictQuery = e.target.value;
        renderDictListOnly();
        return;
      }
      if (e.target.id === 'fav-search') {
        state.favoritesQuery = e.target.value;
        state.favoritesPage = 1;
        clearTimeout(favSearchTimer);
        favSearchTimer = setTimeout(renderFavListOnly, 120);
        return;
      }
      if (e.target.id === 'pattern-search') {
        state.patternQuery = e.target.value;
        renderPatternListOnly();
        return;
      }
      if (e.target.id === 'article-search') {
        state.articleQuery = e.target.value;
        if (!state.articleFolder) {
          const box = $('#article-search-results');
          if (box) box.innerHTML = state.articleQuery.trim() ? articleListHtml() : '';
          return;
        }
        const el = $('#article-list');
        if (el) el.innerHTML = articleListHtml();
        return;
      }
      if (e.target.id === 'font-range') {
        state.settings.fontSize = Number(e.target.value);
        const v = $('#font-val');
        if (v) v.textContent = Math.round(state.settings.fontSize * 100) + '%';
        CET.saveSettings();
        return;
      }
    });

    $('#fallback-file').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => onNativeImage(String(reader.result));
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    CET.onFavChanged = function () {
      if (state.tab === 'favorites') renderFavListOnly();
      const badge = $('#fav-count-badge');
      if (badge) badge.textContent = CET.fav.count();
    };
  }

  function handleAction(action, el) {
    switch (action) {
      case 'camera':
        startCamera();
        break;
      case 'gallery':
        startGallery();
        break;
      case 'search': openSearch(); break;
      case 'patterns': go('patterns'); break;
      case 'reading': go('reading'); break;
      case 'article-clear':
        state.articleQuery = '';
        { const i = $('#article-search'); if (i) i.value = ''; }
        { const el = $('#article-list'); if (el) el.innerHTML = articleListHtml(); }
        break;
      case 'article-folders':
        state.articleFolder = null;
        state.articleQuery = '';
        transitionRender('left', false);
        break;
      case 'article-page':
        state.articlePage = Math.max(1, Number(el.getAttribute('data-page')) || 1);
        render(false);
        break;
      case 'pattern-page':
        state.patternPage = Math.max(1, Number(el.getAttribute('data-page')) || 1);
        renderPatternListOnly();
        break;
      case 'pattern-clear':
        state.patternQuery = '';
        { const i = $('#pattern-search'); if (i) i.value = ''; }
        renderPatternListOnly();
        break;
      case 'settings': go('me'); break;
      case 'sample-scan': loadSampleScan(); break;
      case 'fav-page':
        state.favoritesPage = Math.max(1, Number(el.getAttribute('data-page')) || 1);
        renderFavListOnly();
        break;
      case 'toggle-handwriting':
        if (!CET.AI || !CET.AI.handwritingOn()) { go('me'); openDeepSeekSetup('hand'); break; }
        state.scanHandwriting = !state.scanHandwriting;
        render(false);
        CET.toast(state.scanHandwriting ? '云端 OCR：联网识别，按页计费' : '离线 OCR：不联网，免费');
        break;
      case 'mode-help':
        CET.sheet.open({
          title: '离线 OCR / 云端 OCR',
          sub: '两种识别怎么选',
          html: '<div class="detail-block"><div class="detail-title"><h3>离线 OCR</h3></div>' +
            '<div class="callout">手机本地识别（ML Kit），不联网、免费、1–2 秒。印刷体够用：书页、试卷、屏幕截图。手写连笔容易认错。</div></div>' +
            '<div class="detail-block"><div class="detail-title"><h3>云端 OCR</h3></div>' +
            '<div class="callout">调用 DeepSeek 的 OCR 接口，需要联网和你的 API Key。手写、连笔、横线纸都更稳，一页约 2–3 秒。</div>' +
            '<div class="callout mt10">费用按页计：$0.225 / 1000 页，约 ¥0.0016 一页。失败不计费。价格以 platform.deepseek.com 为准。</div></div>' +
            '<div class="tiny muted mt10">建议：打印材料用离线 OCR；手写作文、翻译、笔记用云端 OCR。</div>',
          onMount() {}
        });
        break;
      case 'clear-scan':
        CET.confirm('清空扫描', '当前扫描结果会被清除，收藏不受影响。', function () {
          state.scan = null;
          CET.store.remove('cet46:lastscan');
          render(false);
        });
        break;
      case 'speak-scan': if (state.scan) CET.speak(state.scan.text); break;
      case 'copy-scan': if (state.scan) CET.copy(state.scan.text); break;
      case 'toggle-image':
        if (state.scan) { state.scan.showImage = !state.scan.showImage; render(false); }
        break;
      case 'cancel-ocr':
        OCR.cancel();
        state.scan = null;
        render(false);
        CET.toast('已取消识别');
        break;
      case 'daily':
        state.daily = (function () {
          const pool = [];
          for (let i = 0; i < Math.min(Dict.order.length, 3000); i++) {
            const w = Dict.order[i];
            const e = Dict.words[w];
            if (e && (e.l === 4 || e.l === 6 || e.l === 46) && w.length > 3) pool.push(w);
          }
          const w = pool[Math.floor(Math.random() * pool.length)] || Dict.order[0];
          return { head: w, entry: Dict.words[w] };
        })();
        render(false);
        break;
      case 'clear-dict-search':
        state.dictQuery = '';
        { const i = $('#dict-search'); if (i) i.value = ''; }
        renderDictListOnly();
        break;
      case 'shuffle-dict':
        state.dictFilter = 'all';
        state.dictQuery = '';
        state.phrasePage = (state.phrasePage || 0) + 1;
        renderDictSection();
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        break;
      case 'rubric': showRubric(); break;
      case 'sample-exam': loadSampleExam(); break;
      case 'sample-essay': loadSampleEssay(); break;
      case 'sample-translation': loadSampleTranslation(); break;
      case 'sample-objective': loadSampleObjective(); break;
      case 'grade-all': gradeAll(); break;
      case 'paper-grade': gradePaper(); break;
      case 'paper-review': reviewExamMarks(state.exam.paperMarks || ''); break;
      case 'exam-photo-writing': examPhotoCapture('writing'); break;
      case 'exam-photo-translation': examPhotoCapture('translation'); break;
      case 'exam-edit-writing': openExamTextEditor('writing', state.exam.essayText || ''); break;
      case 'exam-edit-translation': openExamTextEditor('translation', state.exam.translationText || ''); break;
      case 'crop-scan':
        if (state.scan && state.scan.image) openCropEditor(state.scan.image, (c) => runScanOcr(c, true));
        break;
      case 'exam-report-writing': showExamReport('writing'); break;
      case 'exam-sample-writing': genSample('writing'); break;
      case 'exam-sample-translation': genSample('translation'); break;
      case 'exam-report-translation': showExamReport('translation'); break;
      case 'exam-crop-writing':
        if (state.examAnswerKind === 'writing' && state.examAnswerImage) openCropEditor(state.examAnswerImage, (c) => { state.examAnswerImage = c; }, 'writing');
        break;
      case 'paper-clear-objective':
        state.exam.paperMarks = '';
        state.exam.paperResult = null;
        if ((state.exam.essayText && state.exam.essayText.trim()) || (state.exam.translationText && state.exam.translationText.trim())) gradePaper();
        else { saveExamNow(); render(false); }
        CET.toast('整卷勾叉已清除');
        break;
      case 'paper-clear-subject': {
        const kind = (el && el.closest('[data-subject]') ? el.closest('[data-subject]').getAttribute('data-subject') : 'writing') === 'translation' ? 'translation' : 'writing';
        if (kind === 'writing') {
          state.exam.essayText = '';
          state.exam.essayPrompt = '';
        } else {
          state.exam.translationText = '';
          state.exam.translationPrompt = '';
          state.exam.translationRef = '';
        }
        if (state.examPromptKind === kind) { state.examPromptImage = null; state.examPromptKind = ''; }
        if (state.examAnswerKind === kind) { state.examAnswerImage = null; state.examAnswerKind = ''; }
        if (state.exam.paperResult) state.exam.paperResult[kind === 'writing' ? 'essay' : 'translation'] = null;
        const hasOther = (state.exam.essayText && state.exam.essayText.trim()) || (state.exam.translationText && state.exam.translationText.trim());
        if (state.exam.paperMarks || hasOther) gradePaper();
        else { state.exam.paperResult = null; saveExamNow(); render(false); }
        CET.toast(kind === 'writing' ? '作文已清除' : '翻译已清除');
        break;
      }
      case 'deepseek-setup': openDeepSeekSetup('hand'); break;
      case 'handwriting-settings': openDeepSeekSetup('hand'); break;
      case 'ai-model-settings': openDeepSeekSetup('model'); break;
      case 'ai-grade': aiGradePaper(); break;
      case 'paper-clear':
        CET.confirm('清除判分', '将清空整卷勾叉、写作、翻译、答案图片和判分结果。', function () {
          state.exam.paperMarks = '';
          state.exam.paperResult = null;
          state.exam.essayText = '';
          state.exam.translationText = '';
          state.examPromptImage = null;
          state.examPromptKind = '';
          state.examAnswerImage = null;
          state.examAnswerKind = '';
          state.examPages = [];
          state.exam.redHasTick = false;
          saveExamNow();
          render(false);
          CET.toast('判分已清除');
        }, '清除');
        break;
      case 'exam-paper-ai':
        if (!CET.AI || !CET.AI.hasKey()) { go('me'); openDeepSeekSetup('hand'); break; }
        state.pendingExamPage = 'ai';
        CET.sheet.closeAll();
        startCamera();
        break;
      case 'exam-paper-scan': openExamPaperScan(); break;
      case 'tts-help': showTtsHelp(); break;
      case 'share-report': if (state.exam.result) CET.share(reportText()); break;
      case 'save-report':
        if (state.exam.result) {
          if (window.CET46 && window.CET46.saveText) window.CET46.saveText('CET46_report.txt', reportText());
          else CET.copy(reportText());
          CET.toast('报告已准备保存');
        }
        break;
      case 'fav-export': CET.share(CET.fav.exportText()); break;
      case 'fav-fold-all': $$('#fav-list details.fold').forEach((d) => { d.open = false; }); break;
      case 'fav-expand-all': $$('#fav-list details.fold').forEach((d) => { d.open = true; }); break;
      case 'toggle-fav-auto':
        CET.setFavAuto(!state.favAuto);
        render(false);
        CET.toast(state.favAuto ? '已开启自动分类' : '已关闭自动分类');
        break;
      case 'toggle-recite': {
        const scope = el.getAttribute('data-scope') || 'scan';
        const on = CET.toggleRecite(scope);
        if (scope === 'detail') {
          CET.applyReciteScopes();
          $$('[data-scope="detail"]').forEach((b) => {
            if (b.classList.contains('icon-btn')) b.innerHTML = CET.icon(on ? 'eyeOff' : 'eye');
          });
        } else {
          render(false);
        }
        CET.toast(on ? '背诵模式：中文已遮盖' : '已显示中文');
        break;
      }
      case 'cycle-highlight': {
        const next = (state.highlightLevel + 1) % 3;
        CET.setHighlightLevel(next);
        render(false);
        CET.toast('高亮密度：' + CET.highlightLabel());
        break;
      }
      case 'exam-scroll-report': {
        const el = $('#exam-result');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else CET.toast('还没有批改结果');
        break;
      }
      case 'fav-save':
        if (window.CET46 && window.CET46.saveText) window.CET46.saveText('CET46_favorites.txt', CET.fav.exportText());
        else CET.copy(CET.fav.exportText());
        break;
      case 'privacy': showPrivacy(); break;
      case 'about': showAbout(); break;
      case 'clear-data': clearAllData(); break;
      case 'clear-fav-search':
        state.favoritesQuery = '';
        state.favoritesPage = 1;
        { const i = $('#fav-search'); if (i) i.value = ''; }
        renderFavListOnly();
        break;
      case 'clear-global-search':
        { const i = $('#global-search'); if (i) { i.value = ''; i.dispatchEvent(new Event('input')); } }
        break;
      default: break;
    }
  }

  function renderDictSection() {
    // re-render just the chips + list without losing shell
    const main = $('#main');
    if (!main) return;
    main.innerHTML = viewPageOpen(scopeForTab('dict')) + renderDict() + '</div>';
    CET.applyReciteScopes();
    const input = $('#dict-search');
    if (input) { input.value = state.dictQuery || ''; }
  }

  function loadSampleScan() {
    const s = Dict.samples;
    if (!s) return;
    state.scan = {
      text: s.scan_text,
      confidence: 100,
      at: Date.now(),
      source: '示例文本',
      tokens: Dict.tokenize(s.scan_text),
      showImage: false
    };
    CET.toast('已载入示例文本');
    render(false);
    setTimeout(() => {
      const el = $('#scan-result-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function loadSampleEssay() {
    const s = Dict.samples;
    state.exam.essayPrompt = s.essay_prompt;
    state.exam.essayText = s.essay;
    state.exam.open.writing = true;
    saveExamNow();
    render(false);
    CET.toast('已填入示例作文，可直接批改');
  }

  function loadSampleTranslation() {
    const s = Dict.samples;
    state.exam.translationPrompt = s.translation_zh;
    state.exam.translationText = s.translation_demo || 'China\'s high-speed railway develops very fast and has become an important way for people to go out.';
    state.exam.translationRef = s.translation_ref;
    state.exam.open.translation = true;
    saveExamNow();
    render(false);
    CET.toast('已填入示例翻译，可直接批改');
  }

  function loadSampleObjective() {
    const s = Dict.samples;
    state.exam.listeningKey = s.listening_key;
    state.exam.listeningMine = s.listening_mine;
    state.exam.listeningMarks = s.listening_marks || '';
    state.exam.readingKey = s.reading_key;
    state.exam.readingMine = s.reading_mine;
    state.exam.readingMarks = s.reading_marks || '';
    state.exam.open.listening = true;
    state.exam.open.reading = true;
    saveExamNow();
    render(false);
    CET.toast('已填入示例答案');
  }

  function loadSampleExam() {
    loadSampleEssay();
    loadSampleTranslation();
    loadSampleObjective();
    state.exam.open = { writing: true, listening: true, reading: true, translation: true };
    saveExamNow();
    render(false);
    CET.toast('示例已填入：作文 / 翻译 / 客观题');
  }

  function gradeAll() {
    const ex = state.exam;
    let any = false;
    if (ex.essayText.trim()) { any = true; gradeSection('writing'); }
    if (ex.translationText.trim()) { any = true; gradeSection('translation'); }
    if (ex.listeningKey.trim() && ex.listeningMine.trim()) { any = true; gradeSection('listening'); }
    if (ex.readingKey.trim() && ex.readingMine.trim()) { any = true; gradeSection('reading'); }
    if (ex.modes && ex.modes.listening === 'marks' && String(ex.listeningMarks || '').trim()) { any = true; gradeSection('listening'); }
    if (ex.modes && ex.modes.reading === 'marks' && String(ex.readingMarks || '').trim()) { any = true; gradeSection('reading'); }
    if (!any) { CET.toast('先填写至少一个题型的内容'); return; }
    finishGrade(false);
  }


  /* ============================================================ boot */
  window.addEventListener('error', function (e) {
    if (!bootDone) return;
    console.error('window error', e.error || e.message);
  });
})();
