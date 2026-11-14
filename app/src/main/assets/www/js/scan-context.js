/* Context-aware word identification for scanned text.
   Repairs common OCR splits/confusions against the local dictionary and
   attaches the surrounding sentence to every identified key word. */
(function () {
  'use strict';
  const CET = window.CET;
  if (!CET) return;
  const Dict = CET.Dict;

  function known(w) {
    if (!w) return false;
    const k = String(w).toLowerCase();
    return !!(Dict.lookup(k) || (Dict.isStop && Dict.isStop(k)) || (Dict.known && Dict.known.has(k)) || (Dict.formIndex && Dict.formIndex.has(k)));
  }

  function tryVariants(w) {
    const variants = [
      w.replace(/0/g, 'o'),
      w.replace(/1/g, 'l'),
      w.replace(/5/g, 's'),
      w.replace(/\|/g, 'l'),
      w.replace(/rn/g, 'm'),
      w.replace(/vv/g, 'w')
    ];
    for (const v of variants) if (v !== w && known(v)) return v;
    return null;
  }

  function repair(text) {
    let changes = 0;
    const fixed = String(text || '').replace(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g, (word) => {
      if (!/[A-Za-z]/.test(word)) return word;
      if (word.length < 3 || known(word)) return word;
      const v = tryVariants(word);
      if (v) { changes++; return v; }
      // Split concatenated words only when both sides are dictionary words.
      for (let i = 3; i <= word.length - 2; i++) {
        const a = word.slice(0, i), b = word.slice(i);
        if (known(a) && known(b)) { changes++; return a + ' ' + b; }
      }
      return word;
    });
    return { text: fixed, changes };
  }

  function contextFor(text, word) {
    const raw = String(word || '').trim();
    if (!raw) return '';
    const sentences = Dict.splitSentences(String(text || '')) || [];
    const re = new RegExp('\\b' + raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    for (const s of sentences) {
      if (re.test(s)) {
        const t = s.replace(/\s+/g, ' ').trim();
        return t.length > 150 ? t.slice(0, 147) + '…' : t;
      }
    }
    return '';
  }

  CET.ScanContext = { repair, known, contextFor };
})();
