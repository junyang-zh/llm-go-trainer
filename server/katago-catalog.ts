import { z } from 'zod';
import artifacts from '../config/katago/artifacts.json';
import recommendations from '../config/katago/models.json';
import type { KataGoModel } from '../shared/models';

export const defaultModels: KataGoModel[] = [
  {
    ...artifacts.main,
    id: artifacts.main.sha256,
    name: 'KataGo B18 · 日常推荐',
    bytes: 97898094,
    role: 'main',
    tier: 'balanced',
    architecture: 'b18c384nbt',
    description: '默认分析模型。适合日常对局与复盘，支持全部棋盘尺寸。',
    boards: [9, 13, 19],
    source: 'https://katagotraining.org/networks/',
  },
  ...(recommendations as KataGoModel[]),
  {
    ...artifacts.human,
    id: artifacts.human.sha256,
    name: 'HumanSL · 人类棋风',
    bytes: 99066230,
    role: 'human',
    tier: 'human',
    architecture: 'b18c384nbt',
    description: '独立的棋风模型，用于按级位 / 段位采样落子；不替代主分析模型。',
    boards: [9, 13, 19],
    source: 'https://katagotraining.org/extra_networks/',
  },
];

export function validateModelUrl(value: string) {
  const url = new URL(value);
  const allowed =
    (url.hostname === 'media.katagotraining.org' &&
      url.pathname.startsWith('/uploaded/networks/')) ||
    (url.hostname === 'katagoarchive.org' && url.pathname.startsWith('/g170/neuralnets/')) ||
    (url.hostname === 'github.com' &&
      url.pathname.startsWith('/lightvector/KataGo/releases/download/'));
  if (
    url.protocol !== 'https:' ||
    !allowed ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/\.(bin|txt)\.gz$/i.test(url.pathname)
  )
    throw new Error(
      '请使用 KataGo 官方训练站、历史模型站或官方 GitHub Release 的 .bin.gz / .txt.gz 链接',
    );
  return url.href;
}
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
export const customModelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .max(2000)
    .transform((value, context) => {
      try {
        return validateModelUrl(value);
      } catch (error) {
        context.addIssue({ code: 'custom', message: (error as Error).message });
        return z.NEVER;
      }
    }),
  sha256: z.string().trim().toLowerCase().pipe(checksum),
  role: z.enum(['main', 'human']).default('main'),
  boards: z
    .array(z.union([z.literal(9), z.literal(13), z.literal(19)]))
    .min(1)
    .max(3)
    .default([9, 13, 19]),
});
export const selectionSchema = z.object({ main: checksum, human: checksum.nullable() });

const networkSchema = z.object({
  name: z.string().max(120),
  network_size: z.string().max(80),
  is_random: z.boolean(),
  model_file: z.string().max(2000),
  model_file_bytes: z.number().int().positive().max(2_000_000_000),
  model_file_sha256: checksum,
});
// Only retain downloadable public metadata; training statistics can be very large.
export async function officialModels(page: number, signal?: AbortSignal): Promise<KataGoModel[]> {
  const response = await fetch(`https://katagotraining.org/api/networks/?page=${page}`, {
    signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`官方模型目录读取失败：HTTP ${response.status}`);
  if (!response.body) throw new Error('官方模型目录内容为空');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32 * 1024 * 1024) throw new Error('官方模型目录过大');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data = z
    .object({ results: z.array(z.unknown()).max(1000) })
    .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  return data.results.flatMap((raw) => {
    const parsed = networkSchema.safeParse(raw);
    if (!parsed.success || parsed.data.is_random) return [];
    const model = parsed.data;
    let url: string;
    try {
      url = validateModelUrl(model.model_file);
    } catch {
      return [];
    }
    return [
      {
        id: model.model_file_sha256,
        sha256: model.model_file_sha256,
        name: model.name,
        url,
        bytes: model.model_file_bytes,
        architecture: model.network_size,
        role: 'main' as const,
        tier: 'other' as const,
        boards: [9, 13, 19],
        description: model.network_size.startsWith('tf')
          ? 'Transformer 网络；OpenCL 可能较慢，请按实际硬件测试。'
          : '官方训练网络；具体速度和资源需求取决于硬件及搜索设置。',
        source: 'https://katagotraining.org/networks/',
      },
    ];
  });
}
