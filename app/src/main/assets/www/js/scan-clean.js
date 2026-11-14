/* ScanClean: distinguish colored handwriting from printed text and remove
   long ruled lines / circled annotations before OCR.  Runs entirely locally. */
(function () {
  'use strict';
  const CET = window.CET;
  if (!CET) return;

  function isInk(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // Be deliberately strict: colour cast on a phone photo must not erase
    // black printed text.  Only clearly saturated pen ink is removed.
    if (mx - mn < 58 || mx < 95) return false;
    const red = r > g * 1.30 && r > b * 1.22;
    const blue = b > r * 1.30 && b > g * 1.18;
    const green = g > r * 1.34 && g > b * 1.20;
    const magenta = r > g * 1.30 && b > g * 1.22;
    return red || blue || green || magenta;
  }

  function clean(data, w, h) {
    const p = data.data;
    const dark = new Uint8Array(w * h);
    let colored = 0;
    for (let i = 0, j = 0; i < p.length; i += 4, j++) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      if (isInk(r, g, b)) {
        p[i] = p[i + 1] = p[i + 2] = 255;
        dark[j] = 0;
        colored++;
      } else {
        dark[j] = (0.299 * r + 0.587 * g + 0.114 * b) < 105 ? 1 : 0;
      }
    }

    // Long horizontal / vertical strokes: rulers, underlines, table borders.
    let linePixels = 0;
    const minH = Math.max(80, Math.round(w * 0.92));
    for (let y = 0; y < h; y++) {
      let run = 0;
      for (let x = 0; x <= w; x++) {
        const on = x < w && dark[y * w + x];
        if (on) run++;
        else {
          if (run >= minH) {
            for (let k = x - run; k < x; k++) {
              const j = y * w + k;
              if (dark[j]) { dark[j] = 0; linePixels++; const ii = j * 4; p[ii] = p[ii + 1] = p[ii + 2] = 255; }
            }
          }
          run = 0;
        }
      }
    }
    const minV = Math.max(80, Math.round(h * 0.92));
    for (let x = 0; x < w; x++) {
      let run = 0;
      for (let y = 0; y <= h; y++) {
        const on = y < h && dark[y * w + x];
        if (on) run++;
        else {
          if (run >= minV) {
            for (let k = y - run; k < y; k++) {
              const j = k * w + x;
              if (dark[j]) { dark[j] = 0; linePixels++; const ii = j * 4; p[ii] = p[ii + 1] = p[ii + 2] = 255; }
            }
          }
          run = 0;
        }
      }
    }

    // Connected components at half resolution.  Large sparse components are
    // usually hand-drawn circles or long annotation strokes.
    const step = 2;
    const mw = Math.ceil(w / step), mh = Math.ceil(h / step);
    const mask = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        mask[y * mw + x] = dark[(y * step) * w + x * step] ? 1 : 0;
      }
    }
    const seen = new Uint8Array(mw * mh);
    const q = new Int32Array(mw * mh);
    let components = 0;
    for (let sy = 0; sy < mh; sy++) {
      for (let sx = 0; sx < mw; sx++) {
        const si = sy * mw + sx;
        if (!mask[si] || seen[si]) continue;
        let head = 0, tail = 0, count = 0;
        let minx = sx, maxx = sx, miny = sy, maxy = sy;
        q[tail++] = si; seen[si] = 1;
        while (head < tail) {
          const idx = q[head++]; count++;
          const x = idx % mw, y = (idx / mw) | 0;
          if (x < minx) minx = x; if (x > maxx) maxx = x;
          if (y < miny) miny = y; if (y > maxy) maxy = y;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
              const ni = ny * mw + nx;
              if (mask[ni] && !seen[ni]) { seen[ni] = 1; q[tail++] = ni; }
            }
          }
        }
        const bw = maxx - minx + 1, bh = maxy - miny + 1;
        const density = count / Math.max(1, bw * bh);
        const huge = (bw > mw * 0.82 || bh > mh * 0.82) && density < 0.08;
        const sparse = bw * bh > mw * mh * 0.15 && density < 0.035;
        if (huge || sparse) {
          components++;
          for (let k = 0; k < tail; k++) {
            const idx = q[k], x = idx % mw, y = (idx / mw) | 0;
            for (let yy = 0; yy < step; yy++) {
              for (let xx = 0; xx < step; xx++) {
                const fx = x * step + xx, fy = y * step + yy;
                if (fx < w && fy < h && dark[fy * w + fx]) {
                  const j = fy * w + fx; dark[j] = 0; const ii = j * 4; p[ii] = p[ii + 1] = p[ii + 2] = 255;
                }
              }
            }
          }
        }
      }
    }

    return { colored, lines: linePixels, components };
  }

  CET.ScanClean = { clean, isInk };
})();
