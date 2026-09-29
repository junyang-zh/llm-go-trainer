const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

// Synthetic records for tests only. No upstream CWI games are stored in the repository.
function writeRecordFixture(directory) {
  mkdirSync(directory, { recursive: true });
  const rows = [],
    entries = {};
  for (let i = 1; i <= 41; i++) {
    const id = `c0000000-0000-4000-8000-${String(i <= 2 ? i : i + 100).padStart(12, '0')}`;
    entries[id] =
      '(;GM[1]FF[4]SZ[19]RU[Japanese]KM[0]PB[Fixture Black]PW[Fixture White]DT[2000-01-01]RE[B+R];B[dd];W[pp])';
    rows.push([
      id,
      `fixture/${i}.sgf`,
      0,
      `Fixture game ${i}`,
      19,
      2,
      '2000-01-01',
      'Synthetic fixture',
      i === 41 ? 'Unsupported fixture' : '',
      [],
    ]);
  }
  writeFileSync(join(directory, '0.json'), JSON.stringify(entries));
  writeFileSync(
    join(directory, 'index.json'),
    JSON.stringify({
      source: 'fixture',
      sourceSha256: 'fixture',
      retrievedAt: '2000-01-01T00:00:00.000Z',
      files: 41,
      count: 41,
      playable: 40,
      rows,
    }),
  );
}
module.exports = { writeRecordFixture };
