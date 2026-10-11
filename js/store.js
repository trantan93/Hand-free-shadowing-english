/* Tiny IndexedDB blob store for user-supplied audio/video files (they are too big for localStorage). */
(function (root) {
'use strict';
var dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise(function (resolve, reject) {
    if (!root.indexedDB) return reject(new Error('noidb'));
    var req = root.indexedDB.open('shadowing', 1);
    req.onupgradeneeded = function () { req.result.createObjectStore('media'); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { dbP = null; reject(req.error); };
  });
  return dbP;
}
function tx(mode, fn) {
  return db().then(function (d) {
    return new Promise(function (resolve, reject) {
      var t = d.transaction('media', mode), st = t.objectStore('media'), out;
      var r = fn(st);
      if (r) r.onsuccess = function () { out = r.result; };
      t.oncomplete = function () { resolve(out); };
      t.onerror = t.onabort = function () { reject(t.error); };
    });
  });
}
root.ShadowStore = {
  put: function (key, blob) { return tx('readwrite', function (s) { return s.put(blob, key); }); },
  get: function (key) { return tx('readonly', function (s) { return s.get(key); }); },
  del: function (key) { return tx('readwrite', function (s) { return s.delete(key); }); }
};
})(window);
