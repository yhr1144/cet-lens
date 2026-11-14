/* CET.ScanPlugin — self-written offline document scanner/enhancer.
   No third-party CV dependency: grayscale, skew estimation, percentile
   contrast, light unsharp mask and a conservative paper crop. */
(function () {
  'use strict';
  const CET = window.CET;
  if (!CET) return;

  function load(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function contrast(gray, w, h) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = w * h;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, (gray[i] - lo) * 255 / span));
  }

  function sharpen(gray, w, h) {
    const src = new Uint8Array(gray);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const v = src[i] * 5 - src[i - 1] - src[i + 1] - src[i - w] - src[i + w];
        gray[i] = Math.max(0, Math.min(255, v));
      }
    }
  }

  async function process(dataUrl, onProgress) {
    const img = await load(dataUrl);
    const maxSide = 1600;
    const sc = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * sc));
    const h = Math.max(1, Math.round(img.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    if (onProgress) onProgress({ status: 'preprocess', label: '分析页边', progress: 0.03 });

    // Estimate skew from dark-pixel projection variance.
    const dw = Math.min(650, w), dh = Math.max(1, Math.round(h * dw / w));
    const ds = document.createElement('canvas'); ds.width = dw; ds.height = dh;
    const dx = ds.getContext('2d', { willReadFrequently: true });
    dx.drawImage(c, 0, 0, dw, dh);
    const dd = dx.getImageData(0, 0, dw, dh).data;
    const pts = [];
    for (let y = 0; y < dh; y += 3) for (let x = 0; x < dw; x += 3) {
      const i = (y * dw + x) * 4;
      if (0.299 * dd[i] + 0.587 * dd[i + 1] + 0.114 * dd[i + 2] < 145) pts.push([x, y]);
    }
    let angle = 0, best = -1;
    for (let a = -5; a <= 5; a++) {
      const r = a * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r);
      const rows = new Float32Array(dh + 40);
      for (const [px, py] of pts) {
        const yy = Math.round(py * ca - px * sa) + 20;
        if (yy >= 0 && yy < rows.length) rows[yy]++;
      }
      let mean = 0; for (const v of rows) mean += v; mean /= rows.length;
      let varsum = 0; for (const v of rows) varsum += (v - mean) * (v - mean);
      if (varsum > best) { best = varsum; angle = a; }
    }
    if (Math.abs(angle) >= 1) {
      const rot = document.createElement('canvas'); rot.width = w; rot.height = h;
      const rx = rot.getContext('2d');
      rx.fillStyle = '#fff'; rx.fillRect(0, 0, w, h);
      rx.translate(w / 2, h / 2); rx.rotate(angle * Math.PI / 180);
      rx.drawImage(c, -w / 2, -h / 2);
      ctx.clearRect(0, 0, w, h); ctx.drawImage(rot, 0, 0);
    }
    if (onProgress) onProgress({ status: 'preprocess', label: '清除横线', progress: 0.06 });

    // Remove only thin, long horizontal rules.  Thick dark bands / shadows
    // must be left alone, otherwise whole text blocks get erased.
    {
      const d = ctx.getImageData(0, 0, w, h);
      const p = d.data;
      const dark = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < p.length; i += 4, j++) {
        const r = p[i], g = p[i + 1], b = p[i + 2];
        const red = r > g * 1.18 && r > b * 1.10 && r > 90;
        if (red) { p[i] = p[i + 1] = p[i + 2] = 255; }
        dark[j] = !red && (0.299 * r + 0.587 * g + 0.114 * b) < 96 ? 1 : 0;
      }
      const minRun = Math.round(w * 0.45);
      const cand = new Uint8Array(h);
      for (let y = 0; y < h; y++) {
        let run = 0, best = 0;
        for (let x = 0; x < w; x++) {
          if (dark[y * w + x]) { run++; if (run > best) best = run; }
          else run = 0;
        }
        if (best >= minRun) cand[y] = 1;
      }
      let y = 0;
      while (y < h) {
        if (!cand[y]) { y++; continue; }
        let e = y;
        while (e < h && cand[e]) e++;
        if (e - y <= 4) {
          for (let yy = y; yy < e; yy++) {
            for (let x = 0; x < w; x++) {
              if (dark[yy * w + x]) {
                const ii = (yy * w + x) * 4;
                p[ii] = p[ii + 1] = p[ii + 2] = 255;
              }
            }
          }
        }
        y = e;
      }
      ctx.putImageData(d, 0, 0);
    }

    if (onProgress) onProgress({ status: 'preprocess', label: '增强文字', progress: 0.08 });

    const data = ctx.getImageData(0, 0, w, h);
    const p = data.data;
    const gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) {
      gray[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    }
    contrast(gray, w, h);
    sharpen(gray, w, h);
    const out = ctx.createImageData(w, h);
    for (let j = 0; j < gray.length; j++) {
      const i = j * 4, v = gray[j];
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    let url = c.toDataURL('image/jpeg', 0.86);
    if (url.length > 700000) url = c.toDataURL('image/jpeg', 0.74);
    if (onProgress) onProgress({ status: 'preprocess', label: '矫正完成', progress: 0.12 });
    return { dataUrl: url, width: w, height: h, angle, quality: 0.8 };
  }

  CET.ScanPlugin = { process };
})();
