// Stands in for a bundled image. Metro resolves require('…jpg') to an opaque
// NUMERIC asset id, and PuzzleBoard branches on `typeof src === 'number'` to
// decide whether a source can ever fire onError — so the stub has to be a real
// number, not an ES module wrapping one. Hence CommonJS: under esModuleInterop
// a `export default 1` would arrive as `{ default: 1 }` and the branch under
// test would take the wrong path while still passing on reference equality.
module.exports = 1;
