// Generated SGFs stay in fixtures so import tests can exceed the former limits.
export const largeCommentSgf = (characters = 2_000_001) =>
  '(;SZ[19]C[' + 'a'.repeat(characters) + '])';
export const longTreeSgf = (nodes = 20001) => '(;SZ[19]' + ';C[节点]'.repeat(nodes - 1) + ')';
export const collectionSgf = '(;SZ[9]GN[九路];B[aa](;W[bb])(;W[cc]))(;SZ[13]GN[十三路];W[dd])';
