/* On-device OCR via Tesseract.js (English, bundled). */
(function () {
  'use strict';
  const CET = window.CET;

  const STATUS = {
    'loading tesseract core': '加载 OCR 引擎',
    'initializing tesseract': '初始化识别引擎',
    'loading language traineddata': '加载英语识别模型',
    'initializing api': '准备识别接口',
    'recognizing text': '识别文字中'
  };

  const OCR = CET.OCR = {
    worker: null,
    workerPromise: null,
    ready: false,
    busy: false,
    lastProgress: 0,

    abs(path) {
      try { return new URL(path, window.location.href).href; } catch (e) { return path; }
    },

    async getWorker(onProgress) {
      if (this.worker) return this.worker;
      if (this.workerPromise) return this.workerPromise;
      if (typeof Tesseract === 'undefined') throw new Error('OCR 引擎未加载');
      const self = this;
      this.workerPromise = (async () => {
        const worker = await Tesseract.createWorker('eng', 1, {
          workerPath: self.abs('vendor/worker.min.js'),
          corePath: self.abs('vendor/tesseract-core-lstm.wasm.js'),
          langPath: self.abs('vendor/lang-best'),
          workerBlobURL: true,
          gzip: true,
          cacheMethod: 'write',
          logger: (m) => {
            if (!m) return;
            const p = typeof m.progress === 'number' ? m.progress : 0;
            self.lastProgress = p;
            if (typeof onProgress === 'function') {
              onProgress({
                status: m.status || '',
                label: STATUS[m.status] || '处理中',
                progress: p
              });
            }
          },
          errorHandler: (e) => console.error('Tesseract worker error', e)
        });
        await worker.setParameters({
          tessedit_pageseg_mode: '3',
          preserve_interword_spaces: '1',
          user_defined_dpi: '300'
        });
        self.worker = worker;
        self.ready = true;
        return worker;
      })();
      try {
        return await this.workerPromise;
      } catch (e) {
        this.workerPromise = null;
        this.worker = null;
        this.ready = false;
        throw e;
      }
    },

    async preprocess(dataUrl, opts) {
      const marks = !!(opts && opts.marks);
      const self = this;
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
          const max = marks ? 3600 : 3200;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) { resolve(dataUrl); return; }
          const scale = Math.min(1, max / Math.max(w, h));
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          try {
            const data = ctx.getImageData(0, 0, w, h);
            self.lastClean = (!marks && CET.ScanClean) ? CET.ScanClean.clean(data, w, h) : null;
            const p = data.data;
            const contrast = marks ? 1.32 : 1.18;
            const intercept = 128 * (1 - contrast);
            const gray = new Uint8ClampedArray(w * h);
            for (let i = 0, j = 0; i < p.length; i += 4, j++) {
              let r = p[i], g = p[i + 1], b = p[i + 2];
              // Remove red/blue/green pen marks before OCR.  Printed black text
              // is achromatic, so saturation is a reliable handwriting signal.
              if (!marks) {
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                if (mx - mn > 40 && mx > 85) {
                  const red = r > g * 1.16 && r > b * 1.08;
                  const blue = b > r * 1.16 && b > g * 1.06;
                  const green = g > r * 1.18 && g > b * 1.08;
                  if (red || blue || green) {
                    p[i] = p[i + 1] = p[i + 2] = 255;
                    gray[j] = 255;
                    continue;
                  }
                }
              }
              const v = Math.max(0, Math.min(255,
                0.299 * r + 0.587 * g + 0.114 * b) * contrast + intercept);
              gray[j] = v;
            }
            if (marks) {
              // Otsu threshold: turn the page into clean black marks on white.
              const hist = new Array(256).fill(0);
              for (let j = 0; j < gray.length; j++) hist[gray[j]]++;
              const total = gray.length;
              let sum = 0;
              for (let t = 0; t < 256; t++) sum += t * hist[t];
              let sumB = 0, wB = 0, best = 0, thr = 160;
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
              for (let j = 0; j < gray.length; j++) gray[j] = gray[j] < thr ? 0 : 255;
            }
            for (let i = 0, j = 0; i < p.length; i += 4, j++) {
              p[i] = p[i + 1] = p[i + 2] = gray[j];
            }
            ctx.putImageData(data, 0, 0);
            if (false && !marks && !(opts && opts._cropped)) {
              let left = w, right = -1, top = h, bottom = -1;
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  if (gray[y * w + x] < 205) {
                    if (x < left) left = x;
                    if (x > right) right = x;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                  }
                }
              }
              if (right > left && bottom > top) {
                const bw = right - left + 1, bh = bottom - top + 1;
                if (bw < w * 0.94 || bh < h * 0.94) {
                  const pad = Math.max(8, Math.round(Math.min(w, h) * 0.018));
                  const sx = Math.max(0, left - pad), sy = Math.max(0, top - pad);
                  const sw = Math.min(w - sx, bw + pad * 2), sh = Math.min(h - sy, bh + pad * 2);
                  const cropped = document.createElement('canvas');
                  cropped.width = sw; cropped.height = sh;
                  cropped.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
                  try { resolve(cropped.toDataURL('image/jpeg', 0.92)); return; } catch (e) {}
                }
              }
            }
          } catch (e) {
            // canvas tainted or unsupported: use the original frame
          }
          try { resolve(canvas.toDataURL('image/jpeg', marks ? 0.95 : 0.9)); }
          catch (e) { resolve(dataUrl); }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      });
    },

    postprocess(raw, lines) {
      let noise = 0;
      const fix = (x) => String(x || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .trim();
      const cleanLine = (x) => {
        let s = fix(x).replace(/[^\x20-\x7E]/g, ' ');
        s = s.replace(/[|_`^{}\\]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!s) return null;
        const letters = (s.match(/[A-Za-z]/g) || []).length;
        const weird = (s.match(/[^A-Za-z0-9 .,;:!?'"()&%$#@+\-\/]/g) || []).length;
        if (letters < 2) return null;
        if (letters / Math.max(1, s.length) < 0.32) return null;
        if (weird > letters * 0.35) return null;
        if (s.length > 10 && !/\s/.test(s) && !/[aeiouy]/i.test(s)) return null;
        if (/(.)\1{8,}/.test(s)) return null;
        if (/[%^#@|\\[\]{}<>]/.test(s) && !/[a-z]{4}/.test(s)) return null;
        return s;
      };
      if (Array.isArray(lines) && lines.length) {
        const items = [];
        for (const ln of lines) {
          const b = ln && ln.bbox ? ln.bbox : null;
          let t = cleanLine(ln && ln.text);
          if (!t && ln && Array.isArray(ln.words)) t = cleanLine(ln.words.map((w) => w.text || '').join(' '));
          if (!t) { noise++; continue; }
          items.push({ t, top: b ? Number(b.y0) || 0 : 0, bottom: b ? Number(b.y1) || 0 : 0, h: b ? (Number(b.y1) - Number(b.y0)) || 0 : 0 });
        }
        if (items.length) {
          const hs = items.map((x) => x.h).filter((x) => x > 0).sort((a, b) => a - b);
          const med = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
          const out = [];
          let prevBottom = null;
          for (const it of items) {
            if (prevBottom != null && med && it.top - prevBottom > Math.max(10, med * 0.7)) out.push('');
            out.push(it.t);
            prevBottom = it.bottom || it.top;
          }
          this.lastNoise = noise;
          return out.join('\n').trim();
        }
      }
      // No line boxes: preserve the OCR's own line breaks instead of flattening
      // everything into one paragraph.
      const rawLines = String(raw || '').replace(/\r/g, '').split('\n');
      const out = [];
      for (const line of rawLines) {
        const t = cleanLine(line);
        if (!t) { if (line.trim()) noise++; if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
        out.push(t);
      }
      this.lastNoise = noise;
      return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    },

    confidence(words) {
      if (!Array.isArray(words) || !words.length) return 0;
      let sum = 0, n = 0;
      for (const w of words) {
        if (typeof w.confidence === 'number' && w.confidence > 0) { sum += w.confidence; n++; }
      }
      return n ? Math.round(sum / n) : 0;
    },

    async recognize(dataUrl, onProgress) {
      if (CET.AI && CET.AI.hasKey()) {
        if (typeof onProgress === 'function') onProgress({ status: 'online', label: 'OCR 识别', progress: 0.3 });
        const r = await CET.AI.ocrText(dataUrl, { filename: 'page.jpg' });
        const text = (r.text || '').trim();
        if (text) return { text, words: [], confidence: 92, elapsed: 0, engine: 'ocr-api', noise: 0 };
      }
      if (window.CET46ML) return await this.recognizeMLKit(dataUrl);
      throw new Error('请先在「设置 → AI 模型」里配置 Key');
    },

    async recognizeMLKit(dataUrl) {
      if (!window.CET46ML) throw new Error('ML Kit bridge unavailable');
      const raw = window.CET46ML.recognize(dataUrl);
      const obj = JSON.parse(raw || '{}');
      if (obj.error) throw new Error(obj.error);
      const text = this.postprocess(obj.text || '');
      if (!text) throw new Error('ML Kit returned no text');
      return { text, words: [], lines: obj.lines || [], confidence: 90, elapsed: 0, engine: 'mlkit', noise: this.lastNoise || 0 };
    },

    async preprocessScan(dataUrl, onProgress) {
      if (CET.ScanPlugin) return await CET.ScanPlugin.process(dataUrl, onProgress);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      const maxSide = 1600;
      const sc = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      let w = Math.max(1, Math.round(img.naturalWidth * sc));
      let h = Math.max(1, Math.round(img.naturalHeight * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.drawImage(img, 0, 0, w, h);
      // Estimate skew from a small grayscale projection.
      const dw = Math.min(650, w), dh = Math.max(1, Math.round(h * dw / w));
      const ds = document.createElement('canvas'); ds.width = dw; ds.height = dh;
      const dx = ds.getContext('2d', { willReadFrequently: true });
      dx.drawImage(c, 0, 0, dw, dh);
      const dd = dx.getImageData(0, 0, dw, dh).data;
      const pts = [];
      for (let y = 0; y < dh; y += 2) for (let xx = 0; xx < dw; xx += 2) {
        const i = (y * dw + xx) * 4;
        if (0.299 * dd[i] + 0.587 * dd[i + 1] + 0.114 * dd[i + 2] < 145) pts.push([xx, y]);
      }
      let angle = 0, best = -1;
      for (let a = -6; a <= 6; a += 1) {
        const r = a * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r);
        const rows = new Float32Array(dh + 40);
        for (const [px, py] of pts) {
          const yy = Math.round(py * ca - px * sa) + 20;
          if (yy >= 0 && yy < rows.length) rows[yy]++;
        }
        let mean = 0;
        for (const v of rows) mean += v;
        mean /= rows.length;
        let varSum = 0;
        for (const v of rows) varSum += (v - mean) * (v - mean);
        if (varSum > best) { best = varSum; angle = a; }
      }
      if (Math.abs(angle) >= 0.5) {
        const rot = document.createElement('canvas'); rot.width = w; rot.height = h;
        const rx = rot.getContext('2d');
        rx.fillStyle = '#fff'; rx.fillRect(0, 0, w, h);
        rx.translate(w / 2, h / 2); rx.rotate(angle * Math.PI / 180);
        rx.drawImage(c, -w / 2, -h / 2);
        x.clearRect(0, 0, w, h); x.drawImage(rot, 0, 0);
      }
      // Grayscale + percentile contrast stretch.  Keep the page as grayscale:
      // this removes colour cast and improves OCR without destroying thin text.
      const data = x.getImageData(0, 0, w, h);
      const p = data.data;
      const gray = new Uint8Array(w * h);
      const hist = new Uint32Array(256);
      for (let i = 0, j = 0; i < p.length; i += 4, j++) {
        const v = Math.max(0, Math.min(255, 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]));
        gray[j] = v; hist[v]++;
      }
      let lo = 0, hi = 255, acc = 0;
      const total = w * h;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
      acc = 0;
      for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
      const span = Math.max(1, hi - lo);
      const out = x.createImageData(w, h);
      for (let j = 0; j < gray.length; j++) {
        let v = (gray[j] - lo) * 255 / span;
        v = Math.max(0, Math.min(255, v));
        const i = j * 4;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
      }
      x.putImageData(out, 0, 0);
      let url = c.toDataURL('image/jpeg', 0.86);
      if (url.length > 700000) url = c.toDataURL('image/jpeg', 0.74);
      if (typeof onProgress === 'function') onProgress({ status: 'preprocess', label: '矫正完成', progress: 0.12 });
      return { dataUrl: url, width: w, height: h, angle };
    },

    /* AI requests are dominated by upload size, so re-encode tighter than the on-screen image. */
    async shrinkForAI(dataUrl, maxSide, quality) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      const side = Math.min(maxSide || 1280, Math.max(img.naturalWidth, img.naturalHeight));
      const sc = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * sc));
      const h = Math.max(1, Math.round(img.naturalHeight * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: false });
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.drawImage(img, 0, 0, w, h);
      const out = c.toDataURL('image/jpeg', quality || 0.8);
      return { dataUrl: out, width: w, height: h, bytes: Math.round(out.length * 0.75) };
    },


    async recognizeScanHandwriting(dataUrl, onProgress) {
      if (!CET.AI || !CET.AI.hasKey()) throw new Error('手写识别需要先在「设置 → AI 模型」里配置 Key');
      if (typeof onProgress === 'function') onProgress({ status: 'online', label: 'OCR 识别', progress: 0.35 });
      /* OCR 接口按页计费、与分辨率无关，这里给足清晰度。 */
      let payload = { dataUrl, width: 0, height: 0, bytes: 0 };
      try { payload = await this.shrinkForAI(dataUrl, 2000, 0.9); } catch (e) { payload = { dataUrl, width: 0, height: 0, bytes: 0 }; }
      const started = Date.now();
      const r = await CET.AI.ocrText(payload.dataUrl, { filename: 'scan.jpg' });
      const text = (r.text || '').trim();
      const elapsed = (Date.now() - started) / 1000;
      if (!text) throw new Error('这次没读到文字：可重拍一张，或换普通模式');
      return { text, words: [], confidence: 92, elapsed: elapsed, engine: 'ocr-api', model: (CET.AI ? CET.AI.getConfig().model : ''), passes: r.pages || 1, bytes: payload.bytes || 0, preprocess: { angle: 0, width: payload.width, height: payload.height } };
    },

    async recognizeScan(dataUrl, onProgress) {
      let prep;
      try { prep = await this.preprocessScan(dataUrl, onProgress); }
      catch (e) {
        const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
        prep = { dataUrl, width: im.naturalWidth, height: im.naturalHeight, angle: 0 };
      }
      if (window.CET46ML) {
        try {
          const ml = await this.recognizeMLKit(prep.dataUrl);
          ml.preprocess = { angle: prep.angle, width: prep.width, height: prep.height };
          ml.passes = 1;
          return ml;
        } catch (e) { /* fall back to DeepSeek */ }
      }
      if (CET.AI && CET.AI.hasKey()) {
        if (typeof onProgress === 'function') onProgress({ status: 'online', label: 'OCR 识别', progress: 0.45 });
        const r = await CET.AI.ocrText(prep.dataUrl, { filename: 'page.jpg' });
        const text = (r.text || '').trim();
        if (text) return { text, words: [], confidence: 92, elapsed: 0, engine: 'ocr-api', passes: r.pages || 1, preprocess: { angle: prep.angle, width: prep.width, height: prep.height } };
      }
      throw new Error('印刷体识别失败，且未配置 AI 模型');
    },

    async recognizeBest(dataUrl, onProgress, lang) {
      return await this.recognize(dataUrl, onProgress);
    },

    async recognizeMarks(dataUrl, onProgress) {
      if (!CET.AI || !CET.AI.hasKey()) throw new Error('请先在「AI 模型」里配置 Key');
      if (typeof onProgress === 'function') onProgress({ status: 'online', label: 'AI 读取批改标记', progress: 0.4 });
      const text = await CET.AI.marks(dataUrl);
      return { text, words: [], processed: dataUrl, source: dataUrl, confidence: 88, elapsed: 0, engine: 'ai-marks' };
    },

    async cancel() {
      if (!this.worker) return;
      try { await this.worker.terminate(); } catch (e) {}
      this.worker = null;
      this.workerPromise = null;
      this.ready = false;
      this.busy = false;
      CET.keepAwake(false);
    }
  };
})();
