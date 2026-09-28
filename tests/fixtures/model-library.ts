import { createHash } from 'node:crypto';
import type { KataGoModel } from '../../shared/models';

function fixture(name: string, role: 'main' | 'human', tier: KataGoModel['tier']) {
  const bytes = Buffer.from(`test model payload: ${name}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const model: KataGoModel = {
    id: sha256,
    sha256,
    name,
    role,
    tier,
    bytes: bytes.length,
    boards: [9, 13, 19],
    url: `https://media.katagotraining.org/uploaded/networks/models_extra/${name}.bin.gz`,
    architecture: 'fixture',
    description: 'Test fixture only',
    source: 'https://katagotraining.org/extra_networks/',
  };
  return { model, bytes };
}
export const modelFixtures = [
  fixture('default', 'main', 'balanced'),
  fixture('light', 'main', 'light'),
  fixture('human', 'human', 'human'),
];
export const fixtureCatalog = modelFixtures.map(({ model }) => model);
