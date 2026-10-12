#!/usr/bin/env node
/* Build a lesson JSON from a YouTube link + subtitle file and add it to lessons/index.json.
 *
 *   node tools/build-lesson.js --youtube <url-or-id> --subs <file.srt|.vtt> --id <slug> --title "<title>"
 *        [--speaker "<name>"] [--offset <sec>] [--audio <file>] [--note "<text>"]
 *
 * --offset  seconds added to every subtitle time (when the subtitle file comes from another copy of the video)
 * --audio   audio of the same video on the YouTube timeline; boundaries are snapped to real pauses (needs ffmpeg)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var L = require('../js/lesson.js');

function args() {
  var a = process.argv.slice(2), o = {};
  for (var i = 0; i < a.length; i++) if (a[i].indexOf('--') === 0) o[a[i].slice(2)] = a[i + 1] && a[i + 1].indexOf('--') !== 0 ? a[++i] : true;
  return o;
}
var o = args();
var vid = L.parseYouTubeId(o.youtube);
if (!vid || !o.subs || !o.id || !o.title) {
  console.error('usage: node tools/build-lesson.js --youtube <url> --subs <file> --id <slug> --title "<title>" [--speaker ..] [--offset s] [--audio file]');
  process.exit(1);
}
var offset = parseFloat(o.offset || 0) || 0;
var cues = L.parseSubtitles(fs.readFileSync(o.subs, 'utf8')).map(function (c) {
  return { start: c.start + offset, end: c.end + offset, text: c.text };
});
var sentences = L.buildSentences(cues);
var refined = false;
if (o.audio) {
  var sr = 16000;
  var pcm = cp.execFileSync('ffmpeg', ['-v', 'error', '-i', o.audio, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  var samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  sentences = L.refineWithAudio(sentences, samples, sr);
  refined = true;
}

var root = path.join(__dirname, '..');
var lesson = {
  version: 1,
  id: o.id,
  title: o.title,
  speaker: o.speaker || '',
  youtube: vid,
  note: o.note || '',
  timing: refined ? 'subtitles + audio pauses' : 'subtitles',
  sentences: sentences
};
var file = 'lessons/' + o.id + '.json';
fs.mkdirSync(path.join(root, 'lessons'), { recursive: true });
var head = JSON.stringify(Object.assign({}, lesson, { sentences: [] }), null, 1).replace(/\[\]\n\}$/, '[\n');
var body = sentences.map(function (s) { return '  ' + JSON.stringify(s); }).join(',\n');
fs.writeFileSync(path.join(root, file), head + body + '\n ]\n}\n');

var idxPath = path.join(root, 'lessons/index.json');
var index = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { lessons: [] };
index.lessons = index.lessons.filter(function (l) { return l.id !== o.id; });
index.lessons.push({ id: o.id, title: o.title, speaker: lesson.speaker, youtube: vid, count: sentences.length, file: file });
fs.writeFileSync(idxPath, JSON.stringify(index, null, 1) + '\n');
console.log('wrote ' + file + ' (' + sentences.length + ' sentences' + (refined ? ', refined with audio' : '') + ')');
