import { cwiArchiveUrl } from '../shared/presets';

// Only the source manifest is versioned. Archive and generated records are build/runtime data.
export const cwiSource = {
  artifact: {
    name: 'CWI',
    url: cwiArchiveUrl,
    sha256: '935522a59817c12b37227e843cd3b4bc8d702e32e0e6fbc80b66d828dbbffcad',
  },
  count: 96143,
  sizeBytes: 46246395,
};
