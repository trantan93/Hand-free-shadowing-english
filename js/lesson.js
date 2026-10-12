/* Subtitle parsing + sentence building for v2 lessons.
 * Shared by the browser app (window.ShadowLesson) and tools/build-lesson.js (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShadowLesson = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var DEFAULTS = { maxWords: 20, maxSec: 8, minPart: 4, gapSplit: 2.0, padStart: 0.12, padEnd: 0.25 };

/* ---------------- time helpers ---------------- */
function parseTime(s) {
  var parts = String(s).trim().replace(',', '.').split(':');
  var sec = 0;
  for (var i = 0; i < parts.length; i++) sec = sec * 60 + parseFloat(parts[i]);
  return sec;
}
function round2(x) { return Math.round(x * 100) / 100; }
var TS = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?';
var ARROW = new RegExp('(' + TS + ')\\s*-->\\s*(' + TS + ')');
var LEAD_TS = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(.*)$/;

/* ---------------- text cleanup ---------------- */
function decodeEntities(t) {
  return t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
    .replace(/&amp;/g, '&');
}
function cleanLine(t) {
  t = decodeEntities(String(t).replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, ''));
  t = t.replace(/\[[^\]]*\]/g, ' ')                       // [Music], [Applause]
       .replace(/\(\s*[^()]{0,40}\)/g, function (m) {      // (Laughter), (Applause), (Video) ...
         return m.split(/\s+/).length <= 4 ? ' ' : m;
       })
       .replace(/[♪♫]+/g, ' ')
       .replace(/^\s*(?:>>|[-–—])\s*/, '')                  // dialog dash / speaker change
       .replace(/^\s*[A-Z][A-Z .'-]{1,24}:\s+/, '');         // "NARRATOR: "
  return t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();
}

/* ---------------- subtitle formats ---------------- */
function parseArrowCues(text) {
  var blocks = text.split(/\n[ \t]*\n/), cues = [];
  blocks.forEach(function (b) {
    var lines = b.split('\n'), at = -1, m = null;
    for (var i = 0; i < lines.length; i++) { m = ARROW.exec(lines[i]); if (m) { at = i; break; } }
    if (at < 0) return;
    cues.push({ start: parseTime(m[1]), end: parseTime(m[2]), lines: lines.slice(at + 1) });
  });
  return cues;
}
function parseTranscript(text) {
  // "Show transcript" copy from YouTube: timestamp lines ("0:05" or "0:05 text") followed by text.
  var cues = [], cur = null;
  text.split('\n').forEach(function (line) {
    if (!line.trim()) return;
    if (/^\s*\d+\s+(?:giây|phút|giờ|seconds?|minutes?|hours?)\b/i.test(line)) return; // screen-reader duplicates
    var m = LEAD_TS.exec(line);
    if (m) { cur = { start: parseTime(m[1]), end: null, lines: m[2] ? [m[2]] : [] }; cues.push(cur); }
    else if (cur) cur.lines.push(line);
  });
  for (var i = 0; i < cues.length; i++) {
    var words = cues[i].lines.join(' ').split(/\s+/).length;
    var est = cues[i].start + Math.max(1.2, words * 0.42);
    cues[i].end = i + 1 < cues.length ? Math.min(cues[i + 1].start, Math.max(est, cues[i].start + 0.5)) : est;
  }
  return cues;
}
function parseJson3(obj) {
  return (obj.events || []).filter(function (e) { return e.segs; }).map(function (e) {
    var s = (e.tStartMs || 0) / 1000;
    return { start: s, end: s + (e.dDurationMs || 0) / 1000, lines: [e.segs.map(function (g) { return g.utf8 || ''; }).join('')] };
  });
}

/** Parse SRT / WebVTT / YouTube json3 / pasted transcript into cleaned cues [{start,end,text}]. */
function parseSubtitles(raw) {
  var text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  var cues;
  var trimmed = text.trim();
  if (trimmed.charAt(0) === '{') {
    try { cues = parseJson3(JSON.parse(trimmed)); } catch (e) { cues = []; }
  } else if (ARROW.test(text)) cues = parseArrowCues(text);
  else cues = parseTranscript(text);

  cues.sort(function (a, b) { return a.start - b.start; });
  // Drop lines repeated from the previous cue (YouTube "rolling" captions repeat the last line).
  var out = [], prevLines = [];
  cues.forEach(function (c) {
    var lines = c.lines.map(cleanLine).filter(Boolean);
    while (lines.length && prevLines.indexOf(lines[0]) >= 0) lines.shift();
    if (lines.length) prevLines = lines.slice(-2);
    var t = lines.join(' ').trim();
    if (!t || !(c.end > c.start)) return;
    out.push({ start: c.start, end: c.end, text: t });
  });
  for (var i = 0; i + 1 < out.length; i++) {
    if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + 0.2, out[i + 1].start);
  }
  return out;
}

/* ---------------- words with estimated timing ---------------- */
function pauseWeight(w) {
  if (/[.!?…]["')\]]*$/.test(w)) return 6;
  if (/[;:—]$|--$/.test(w)) return 4;
  if (/,["')\]]*$/.test(w)) return 3;
  return 0;
}
function speakWeight(w) { // ~syllables: spoken duration tracks vowel groups better than letters
  var core = w.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^\d+$/.test(core)) return 2 + core.length * 1.5;
  var syl = (core.replace(/e$/, '').match(/[aeiouy]+/g) || []).length;
  return 1.5 + Math.max(1, syl) * 2.5;
}
function cuesToWords(cues) {
  var words = [];
  cues.forEach(function (c, ci) {
    var ws = c.text.split(/\s+/).filter(Boolean);
    if (!ws.length) return;
    var weights = ws.map(function (w) { return { speak: speakWeight(w), pause: pauseWeight(w) }; });
    var last = weights[weights.length - 1]; last.pause = 0; // the pause after the cue is real time, not estimated
    var total = weights.reduce(function (s, x) { return s + x.speak + x.pause; }, 0);
    var u = (c.end - c.start) / total, t = c.start;
    ws.forEach(function (w, i) {
      var t0 = t, sEnd = t + weights[i].speak * u;
      t = sEnd + weights[i].pause * u;
      words.push({ w: w, t0: t0, speechEnd: sEnd, t1: t, cue: ci, cueStart: i === 0, cueEnd: i === ws.length - 1 });
    });
    words[words.length - 1].t1 = c.end;
    words[words.length - 1].speechEnd = c.end;
  });
  return words;
}

/* ---------------- sentence boundaries ---------------- */
var ABBR = /^(?:mr|mrs|ms|dr|prof|st|jr|sr|vs|etc|e\.g|i\.e|u\.s|u\.k|a\.m|p\.m|no|inc|ltd|co|mt|ft|approx|dept|est|fig|gen|gov|lt|sgt|vol)\.$/i;
function startsLower(w) { return !!w && /^["'(\[]*[a-z]/.test(w); }
function endsSentence(word, next) {
  var w = word.w;
  if (!/[.!?…]["')\]]*$/.test(w)) return false;
  if (next && startsLower(next.w)) return false;
  var core = w.replace(/^["'(\[]+/, '').replace(/["')\]]+$/, '');
  if (/[!?…]$/.test(core)) return true;
  if (ABBR.test(core)) return false;
  if (/^[A-Z]\.$/.test(core) || /^(?:[A-Za-z]\.){2,}$/.test(core)) return !next; // initials, U.S.A.
  return true;
}
var CONJ = /^(?:and|but|or|so|because|which|who|when|where|while|if|that|then|although|though|unless|until|since|whether)$/i;
function breakScore(ws, k) { // split between ws[k-1] and ws[k]
  var a = ws[k - 1], b = ws[k], s = 0;
  if (/[;:—]$|--$/.test(a.w)) s += 4; else if (/,["')\]]*$/.test(a.w)) s += 3;
  if (a.cueEnd) s += 2;
  if (CONJ.test(b.w.replace(/[^A-Za-z]/g, ''))) s += 1.5;
  s += Math.min(2, (b.t0 - a.speechEnd) * 4);
  return s - 5 * Math.abs(k / ws.length - 0.5);
}
function splitLong(ws, o) {
  var dur = ws[ws.length - 1].t1 - ws[0].t0;
  if ((ws.length <= o.maxWords && dur <= o.maxSec) || ws.length < o.minPart * 2) return [ws];
  var best = -1, bestScore = -Infinity;
  for (var k = o.minPart; k <= ws.length - o.minPart; k++) {
    var sc = breakScore(ws, k);
    if (sc > bestScore) { bestScore = sc; best = k; }
  }
  if (best < 0) return [ws];
  return splitLong(ws.slice(0, best), o).concat(splitLong(ws.slice(best), o));
}

/** Merge caption cues into full sentences [{text,start,end}] with estimated timings. */
function buildSentences(cues, opts) {
  var o = {}, k;
  for (k in DEFAULTS) o[k] = DEFAULTS[k];
  for (k in (opts || {})) o[k] = opts[k];
  var words = cuesToWords(cues);
  var groups = [], cur = [];
  words.forEach(function (w, i) {
    var next = words[i + 1];
    cur.push(w);
    var gap = next ? next.t0 - w.t1 : 0;
    if (!next || endsSentence(w, next) || (gap >= o.gapSplit && cur.length >= 3)) { groups.push(cur); cur = []; }
  });
  if (cur.length) groups.push(cur);

  // One-word sentences ("So.", "Okay.") join the following sentence when it starts right away.
  var merged = [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (g.length === 1 && i + 1 < groups.length && groups[i + 1][0].t0 - g[0].t1 < 1.2) { groups[i + 1] = g.concat(groups[i + 1]); continue; }
    merged.push(g);
  }
  var parts = [];
  merged.forEach(function (g) { parts = parts.concat(splitLong(g, o)); });

  var sents = parts.map(function (ws) {
    return { text: ws.map(function (w) { return w.w; }).join(' '), words: ws };
  });
  // Boundary times: exact at cue edges, interpolated (middle of the estimated pause) inside a cue.
  sents.forEach(function (s, i) {
    var first = s.words[0], last = s.words[s.words.length - 1];
    var prev = sents[i - 1], next = sents[i + 1];
    if (first.cueStart || !prev) s.start = first.t0;
    else { var pl = prev.words[prev.words.length - 1]; s.start = (pl.speechEnd + first.t0) / 2; s.cut = true; }
    if (last.cueEnd || !next) s.end = last.t1;
    else s.end = (last.speechEnd + next.words[0].t0) / 2;
  });
  sents.forEach(function (s, i) {
    var prevEnd = i ? sents[i - 1].end : 0, nextStart = i + 1 < sents.length ? sents[i + 1].start : Infinity;
    s.start = Math.max(0, s.start - Math.min(o.padStart, Math.max(0, s.start - prevEnd) / 2));
    s.end = s.end + Math.min(o.padEnd, Math.max(0, nextStart - s.end) / 2);
  });
  return sents.map(function (s) {
    var r = { text: s.text, start: round2(s.start), end: round2(s.end) };
    if (s.cut) r.cut = true; // start was estimated inside a caption cue
    return r;
  });
}

/* ---------------- optional audio refinement ---------------- */
/** Snap boundaries that were estimated inside a caption cue to real pauses, using mono PCM samples.
 * Boundaries at cue edges come from the subtitle author and are left alone. Returns a new array. */
function refineWithAudio(sentences, samples, sampleRate) {
  var hop = Math.round(sampleRate * 0.01), n = Math.floor(samples.length / hop);
  if (n < 10) return sentences.slice();
  var env = new Float32Array(n), i, j;
  for (i = 0; i < n; i++) {
    var sum = 0, off = i * hop;
    for (j = 0; j < hop; j++) { var x = samples[off + j]; sum += x * x; }
    env[i] = Math.sqrt(sum / hop);
  }
  var sm = new Float32Array(n);
  for (i = 0; i < n; i++) { var a = 0, c = 0; for (j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { a += env[j]; c++; } sm[i] = a / c; }
  var sorted = Array.prototype.slice.call(sm).sort(function (p, q) { return p - q; });
  var floor = sorted[Math.floor(n * 0.1)], loud = sorted[Math.floor(n * 0.9)];
  var thr = floor + 0.12 * (loud - floor);
  function fr(t) { return Math.max(0, Math.min(n - 1, Math.round(t * 100))); }
  function tm(f) { return f / 100; }

  var out = sentences.map(function (s) { var r = {}; for (var k in s) r[k] = s[k]; return r; });
  for (i = 0; i + 1 < out.length; i++) {
    var A = out[i], B = out[i + 1];
    if (!B.cut) continue;
    var mid = (A.end + B.start) / 2;
    var lo = fr(Math.max(mid - 0.9, A.start + 0.5)), hi = fr(Math.min(mid + 0.9, B.end - 0.5));
    if (hi <= lo) continue;
    // longest quiet run inside the window, ties broken by distance to the estimate
    var bestS = -1, bestE = -1, bestScore = -Infinity, runS = -1;
    for (j = lo; j <= hi + 1; j++) {
      var quiet = j <= hi && sm[j] < thr;
      if (quiet && runS < 0) runS = j;
      if (!quiet && runS >= 0) {
        var len = j - runS, center = (runS + j - 1) / 2;
        var score = Math.min(len, 40) - Math.abs(center - fr(mid)) * 0.4;
        if (score > bestScore) { bestScore = score; bestS = runS; bestE = j - 1; }
        runS = -1;
      }
    }
    if (bestS < 0) { // no pause: cut at the quietest frame
      var minV = Infinity; for (j = lo; j <= hi; j++) if (sm[j] < minV) { minV = sm[j]; bestS = bestE = j; }
    }
    // Both sentences may include part of the pause; overlapping in silence is harmless.
    var qS = tm(bestS), qE = tm(bestE + 1);
    A.end = round2(Math.min(qE, qS + 0.25));
    B.start = round2(Math.max(qS, qE - 0.25));
  }
  return out;
}

/* ---------------- YouTube link ---------------- */
function parseYouTubeId(url) {
  url = String(url || '').trim();
  if (/^[\w-]{11}$/.test(url)) return url;
  var m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/i.exec(url);
  return m ? m[1] : null;
}

function fromSubtitles(raw, opts) { return buildSentences(parseSubtitles(raw), opts); }

return { parseSubtitles: parseSubtitles, buildSentences: buildSentences, fromSubtitles: fromSubtitles,
         refineWithAudio: refineWithAudio, parseYouTubeId: parseYouTubeId, cleanLine: cleanLine, DEFAULTS: DEFAULTS };
});
