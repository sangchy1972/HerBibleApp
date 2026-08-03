// Stands in for a bundled image. Metro resolves require('…jpg') to an opaque
// numeric asset id, so a number is the honest shape for a node-environment test
// — anything richer would let a test pass on a value the app never sees.
export default 1;
