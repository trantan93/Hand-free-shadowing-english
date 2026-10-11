/* Sentence-segment players for v2 lessons: YouTube IFrame player and local audio/video file.
 * Both expose: load(src) -> Promise, play(start, end, rate, opts) -> Promise<'ok'|'cancel'|'error'|'blocked'|'timeout'>, stop().
 * opts: { isCancelled(): bool, onNeedTap(bool) } */
(function (root) {
'use strict';
function now() { return Date.now(); }

/* ---------------- YouTube ---------------- */
var apiP = null;
function loadYouTubeApi() {
  if (root.YT && root.YT.Player) return Promise.resolve(root.YT);
  if (apiP) return apiP;
  apiP = new Promise(function (resolve, reject) {
    var prev = root.onYouTubeIframeAPIReady;
    root.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) {} resolve(root.YT); };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { apiP = null; reject(err('api')); };
    document.head.appendChild(s);
    setTimeout(function () { if (!(root.YT && root.YT.Player)) { apiP = null; reject(err('api')); } }, 20000);
  });
  return apiP;
}
function err(code, extra) { var e = new Error(code); e.code = code; e.yt = extra; return e; }

function YouTubeSource(box) {
  this.box = box;          // element that will hold the iframe
  this.p = null;
  this.videoId = null;
  this.ready = false;
  this.lastError = null;
  this.timer = null;
}
YouTubeSource.prototype.load = function (videoId) {
  var self = this;
  if (self.p && self.videoId === videoId && self.ready) return Promise.resolve();
  self.destroy();
  self.videoId = videoId;
  return loadYouTubeApi().then(function (YT) {
    return new Promise(function (resolve, reject) {
      var host = document.createElement('div');
      self.box.innerHTML = ''; self.box.appendChild(host);
      var settled = false;
      var to = setTimeout(function () { if (!settled) { settled = true; reject(err('timeout')); } }, 25000);
      self.p = new YT.Player(host, {
        width: '100%', height: '100%', videoId: videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, cc_load_policy: 0, fs: 0, disablekb: 1, controls: 1, origin: location.origin },
        events: {
          onReady: function () { self.ready = true; if (!settled) { settled = true; clearTimeout(to); resolve(); } },
          onError: function (e) {
            self.lastError = e.data;
            if (!settled) { settled = true; clearTimeout(to); reject(err('yt', e.data)); }
          }
        }
      });
    });
  });
};
YouTubeSource.prototype.title = function () {
  try { var d = this.p.getVideoData(); return (d && d.title) || ''; } catch (e) { return ''; }
};
YouTubeSource.prototype.stop = function () {
  if (this.timer) { clearInterval(this.timer); this.timer = null; }
  if (this.finish) this.finish('cancel');
  try { if (this.p && this.p.pauseVideo) this.p.pauseVideo(); } catch (e) {}
};
YouTubeSource.prototype.destroy = function () {
  this.stop();
  try { if (this.p && this.p.destroy) this.p.destroy(); } catch (e) {}
  this.p = null; this.ready = false; this.videoId = null; this.lastError = null;
  if (this.box) this.box.innerHTML = '';
};
YouTubeSource.prototype.play = function (start, end, rate, o) {
  var self = this, p = self.p;
  o = o || {};
  if (!p || !self.ready) return Promise.resolve('error');
  self.stop();
  return new Promise(function (resolve) {
    try { p.unMute(); p.setVolume(100); } catch (e) {}
    try { if (p.setPlaybackRate) p.setPlaybackRate(rate); } catch (e) {}
    self.lastError = null;
    p.seekTo(start, true);
    p.playVideo();
    var t0 = now(), started = false, startedAt = 0, lastCt = -1, needTap = false, reseekAt = 0, mutedSince = 0;
    var playMs = (end - start) / rate * 1000;
    function done(r) {
      if (!self.finish) return;
      self.finish = null;
      clearInterval(self.timer); self.timer = null;
      try { p.pauseVideo(); } catch (e) {}
      if (needTap && o.onNeedTap) o.onNeedTap(false);
      resolve(r);
    }
    self.finish = done;
    self.timer = setInterval(function () {
      if (o.isCancelled && o.isCancelled()) return done('cancel');
      if (self.lastError) return done('error');
      var st, ct, muted;
      try { st = p.getPlayerState(); ct = p.getCurrentTime(); muted = p.isMuted(); } catch (e) { return done('error'); }
      if (!started) {
        var inSeg = ct >= start - 0.6 && ct < end;
        if (st === 1 && muted) {
          // Autoplay with sound was refused and YouTube fell back to muted playback.
          if (!mutedSince) mutedSince = now();
          try { p.unMute(); } catch (e) {}
          if (now() - mutedSince > 1200 && !needTap) { needTap = true; try { p.pauseVideo(); } catch (e) {} if (o.onNeedTap) o.onNeedTap(true); }
        } else if (st === 1 && inSeg) {
          if (lastCt >= 0 && ct > lastCt + 0.01) {
            started = true; startedAt = now();
            if (needTap) { needTap = false; if (o.onNeedTap) o.onNeedTap(false); }
          }
        } else if (st === 1 && !inSeg && now() - reseekAt > 1200) {
          p.seekTo(start, true); reseekAt = now();     // user tapped play and it resumed elsewhere
        } else if (!needTap && st !== 1 && st !== 3 && now() - t0 > 2500) {
          needTap = true; if (o.onNeedTap) o.onNeedTap(true);   // iOS: first play must be a tap on the video
        }
        if (now() - t0 > (needTap ? 300000 : 60000)) return done('timeout');
        lastCt = ct;
        return;
      }
      if (ct >= end - 0.05 || st === 0) return done('ok');
      if (now() - startedAt > playMs + 4000) return done('ok');
      lastCt = ct;
    }, 30);
  });
};

/* ---------------- Local file ---------------- */
function FileSource(audio) {
  this.a = audio;
  this.url = null;
  this.ready = false;
  this.unlocking = null;
  this.timer = null;
  try { audio.preservesPitch = true; audio.webkitPreservesPitch = true; audio.mozPreservesPitch = true; } catch (e) {}
}
FileSource.prototype.load = function (blob) {
  var self = this, a = self.a;
  self.destroy();
  self.url = URL.createObjectURL(blob);
  return new Promise(function (resolve, reject) {
    var to = setTimeout(function () { cleanup(); reject(err('decode')); }, 20000);
    function ok() { cleanup(); self.ready = true; resolve(); }
    function bad() { cleanup(); reject(err('decode')); }
    function cleanup() { clearTimeout(to); a.removeEventListener('loadedmetadata', ok); a.removeEventListener('error', bad); }
    a.addEventListener('loadedmetadata', ok);
    a.addEventListener('error', bad);
    a.preload = 'auto';
    a.src = self.url;
    try { a.load(); } catch (e) {}
  });
};
/** Must be called synchronously inside a tap handler (iOS only allows programmatic play after that). */
FileSource.prototype.unlock = function () {
  var a = this.a, self = this;
  if (!self.url) return;
  try {
    a.muted = true;
    var p = a.play();
    self.unlocking = Promise.resolve(p).then(function () { a.pause(); }, function () {}).then(function () { a.muted = false; self.unlocking = null; });
  } catch (e) { a.muted = false; }
};
FileSource.prototype.stop = function () {
  if (this.timer) { clearInterval(this.timer); this.timer = null; }
  if (this.finish) this.finish('cancel');
  try { this.a.pause(); } catch (e) {}
};
FileSource.prototype.destroy = function () {
  this.stop();
  if (this.url) { try { URL.revokeObjectURL(this.url); } catch (e) {} this.url = null; }
  this.ready = false;
};
FileSource.prototype.play = function (start, end, rate, o) {
  var self = this, a = self.a;
  o = o || {};
  if (!self.ready) return Promise.resolve('error');
  self.stop();
  return Promise.resolve(self.unlocking).then(function () {
    return new Promise(function (resolve) {
      var startedAt = 0;
      function done(r) {
        if (!self.finish) return;
        self.finish = null;
        clearInterval(self.timer); self.timer = null;
        try { a.pause(); } catch (e) {}
        resolve(r);
      }
      self.finish = done;
      if (o.isCancelled && o.isCancelled()) return done('cancel');
      a.muted = false;
      a.playbackRate = rate;
      try { a.currentTime = start; } catch (e) {}
      var pr;
      try { pr = a.play(); } catch (e) { return done('blocked'); }
      Promise.resolve(pr).then(function () { startedAt = now(); }, function (e) { done(e && e.name === 'NotAllowedError' ? 'blocked' : 'error'); });
      var limit = (end - start) / rate * 1000 + 5000;
      self.timer = setInterval(function () {
        if (o.isCancelled && o.isCancelled()) return done('cancel');
        if (a.currentTime >= end - 0.02 || a.ended) return done('ok');
        if (startedAt && now() - startedAt > limit) return done('ok');
      }, 20);
    });
  });
};

/** Decode a media blob to mono PCM at a low sample rate (for boundary refinement). */
function decodeMono(blob, sampleRate) {
  var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
  if (!OAC || !blob.arrayBuffer && !root.FileReader) return Promise.reject(err('nodecode'));
  var bufP = blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function (res, rej) {
    var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsArrayBuffer(blob);
  });
  return bufP.then(function (buf) {
    var ctx = new OAC(1, sampleRate, sampleRate);
    return new Promise(function (res, rej) {
      var p = ctx.decodeAudioData(buf, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }).then(function (ab) {
    var n = ab.length, out = new Float32Array(n), ch = ab.numberOfChannels;
    for (var c = 0; c < ch; c++) { var d = ab.getChannelData(c); for (var i = 0; i < n; i++) out[i] += d[i] / ch; }
    return { samples: out, sampleRate: ab.sampleRate };
  });
}

root.ShadowPlayers = { YouTubeSource: YouTubeSource, FileSource: FileSource, decodeMono: decodeMono };
})(window);
