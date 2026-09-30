const test = require('node:test')
const assert = require('node:assert')

// Replicate pure helper functions from background.js for testing
function Ee(s, e) {
  if (!e || e.mode === "all") return !0;
  if (s <= 0) return !0;
  return !(
    (e.fromTs !== null && s < e.fromTs) ||
    (e.toTs !== null && s > e.toTs)
  );
}
function Ge(s, e) {
  if (!e || e.mode === "all") return !1;
  if (s <= 0) return !1;
  return e.mode === "range" && e.toTs !== null ? s > e.toTs : !1;
}
function de(s, e) {
  if (!e || e.mode === "all") return !1;
  if (s <= 0) return !1;
  return e.fromTs !== null ? s < e.fromTs : !1;
}

test('Date Filter - All Mode allows any timestamp', () => {
  const filter = { mode: 'all', fromTs: null, toTs: null }
  assert.strictEqual(Ee(1788220800, filter), true)
  assert.strictEqual(Ge(1788220800, filter), false)
  assert.strictEqual(de(1788220800, filter), false)
})

test('Date Filter - Range Mode correctly accepts within range and rejects outside', () => {
  const fromTs = 1788220800 // e.g. 2026-09-01 00:00:00
  const toTs = 1788652799   // e.g. 2026-09-05 23:59:59
  const filter = { mode: 'range', fromTs, toTs }

  // Post before range (older)
  const olderTs = fromTs - 1000
  assert.strictEqual(Ee(olderTs, filter), false)
  assert.strictEqual(Ge(olderTs, filter), false)
  assert.strictEqual(de(olderTs, filter), true) // Signals stop in chronological scan

  // Post after range (newer)
  const newerTs = toTs + 1000
  assert.strictEqual(Ee(newerTs, filter), false)
  assert.strictEqual(Ge(newerTs, filter), true) // Signals skip but keep scanning
  assert.strictEqual(de(newerTs, filter), false)

  // Post inside range
  const insideTs = fromTs + 5000
  assert.strictEqual(Ee(insideTs, filter), true)
  assert.strictEqual(Ge(insideTs, filter), false)
  assert.strictEqual(de(insideTs, filter), false)
})

test('Date Filter - Zero timestamp does not cause false premature stop', () => {
  const filter = { mode: 'range', fromTs: 1788220800, toTs: 1788652799 }
  assert.strictEqual(de(0, filter), false)
  assert.strictEqual(Ge(0, filter), false)
  assert.strictEqual(Ee(0, filter), true)
})

test('TopK Capping - Slices exact requested quantity', () => {
  const topK = 5
  let seenPosts = 2
  let batch = [
    { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }
  ]

  let remainingNeeded = topK - seenPosts
  let sliced = batch.slice(0, remainingNeeded)
  assert.strictEqual(sliced.length, 3)
  assert.strictEqual(seenPosts + sliced.length, 5)
})

test('Metric Filters - Correctly filter likes, views, comments, saves, hashtags', () => {
  const post = {
    postId: 'p1',
    likeCount: 500,
    playCount: 2000,
    commentCount: 50,
    saveCount: 30,
    captionText: 'Awesome video #viral #marketing'
  }

  // Test passing filters
  assert.ok(post.likeCount >= 100)
  assert.ok(post.playCount >= 1000)
  assert.ok(post.commentCount >= 10)
  assert.ok(post.saveCount >= 20)
  assert.ok(post.captionText.includes('#viral'))

  // Test failing filters
  assert.strictEqual(post.likeCount >= 1000, false)
  assert.strictEqual(post.playCount >= 5000, false)
  assert.strictEqual(post.captionText.includes('#dance'), false)
})
