import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newGame } from '../shared/go';
import {
  importSgfDiagramPath,
  parseSgf,
  serializeSgf,
  sgfPoint,
  type SgfNode,
} from '../shared/sgf';
import type { RecordTreePage } from '../shared/record-tree';
import type { SavedGame } from '../shared/library';

interface IndexedTree {
  roots: SgfNode[];
  nodes: SgfNode[];
  parents: number[];
  indices: WeakMap<SgfNode, number>;
}
function index(text: string): IndexedTree {
  const roots = parseSgf(text);
  const root = roots.length === 1 ? roots[0] : { properties: {}, children: roots };
  const tree: IndexedTree = { roots, nodes: [], parents: [], indices: new WeakMap() };
  const stack = [{ node: root, parent: -1 }];
  while (stack.length) {
    const { node, parent } = stack.pop()!;
    const cursor = tree.nodes.length;
    tree.nodes.push(node);
    tree.parents.push(parent);
    tree.indices.set(node, cursor);
    for (const child of [...node.children].reverse()) stack.push({ node: child, parent: cursor });
  }
  return tree;
}
const nodeId = (rootId: string, node: number) =>
  rootId.slice(0, 24) + String(node).padStart(12, '0');
export function treeRootFor(records: SavedGame[], id: string) {
  if (!/^.{24}\d{12}$/.test(id)) return undefined;
  return records.find((item) => item.tree && item.id.slice(0, 24) === id.slice(0, 24));
}
function label(node: SgfNode, size = 19) {
  const name = node.properties.N?.[0] || node.properties.GN?.[0];
  const color = node.properties.B ? 'B' : node.properties.W ? 'W' : undefined;
  const raw = color && node.properties[color][0];
  let move = '';
  try {
    if (color && raw !== undefined) move = color + ' ' + sgfPoint(raw, size);
  } catch {
    move = color + '[' + raw + ']';
  }
  return name || move || node.properties.C?.[0]?.split(/\r?\n/)[0]?.slice(0, 80) || '·';
}

// Original SGFs live beside the JSON history, never inside library API snapshots.
export class RecordTrees {
  private cache = new Map<string, IndexedTree>();
  private memory = new Map<string, string>();
  constructor(private directory?: string) {
    if (directory) mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  import(text: string, filename: string): SavedGame {
    const tree = index(text);
    const game = tree.roots.length === 1 ? importSgfDiagramPath([tree.roots[0]]).game : newGame(19);
    const title = (
      (tree.roots.length === 1 && tree.roots[0].properties.GN?.[0]) ||
      filename.replace(/\.sgf$/i, '') ||
      'SGF'
    ).slice(0, 200);
    const id = randomUUID().slice(0, 24) + '000000000000';
    game.metadata.GN = title;
    const record: SavedGame = {
      id,
      title,
      updatedAt: new Date().toISOString(),
      game,
      tree: true,
      treeNodes: tree.nodes.length,
    };
    if (this.directory) {
      const path = join(this.directory, `${id}.sgf`);
      writeFileSync(`${path}.tmp`, text, { mode: 0o600 });
      renameSync(`${path}.tmp`, path);
    } else this.memory.set(id, text);
    this.remember(id, tree);
    return record;
  }
  private remember(id: string, tree: IndexedTree) {
    if (this.cache.size >= 2) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(id, tree);
  }
  private load(root: SavedGame) {
    let tree = this.cache.get(root.id);
    if (!tree) {
      const text = this.directory
        ? readFileSync(join(this.directory, `${root.id}.sgf`), 'utf8')
        : this.memory.get(root.id);
      if (text === undefined) throw new Error('找不到历史棋局');
      tree = index(text);
      this.remember(root.id, tree);
    }
    return tree;
  }
  page(root: SavedGame, id: string): RecordTreePage | undefined {
    const tree = this.load(root);
    const cursor = Number(id.slice(24));
    const node = tree.nodes[cursor];
    if (!node) return undefined;
    const indices: number[] = [];
    for (let i = cursor; i >= 0; i = tree.parents[i]) indices.push(i);
    indices.reverse();
    const path = indices.map((i) => tree.nodes[i]);
    const effectivePath = tree.roots.length > 1 ? path.slice(1) : path;
    const named = path
      .slice(1)
      .map((node) => node.properties.N?.[0] || node.properties.GN?.[0])
      .filter(Boolean);
    const title = [root.title, ...named].join(' · ').slice(0, 200);
    const size = Number(effectivePath[0]?.properties.SZ?.[0] ?? root.game.size);
    const page: RecordTreePage = {
      id,
      rootId: root.id,
      title,
      breadcrumbs: indices.map((i) => ({
        id: nodeId(root.id, i),
        title: i === 0 ? root.title : label(tree.nodes[i], size),
      })),
      children: node.children.map((child) => {
        let point: string | undefined;
        try {
          const raw = child.properties.B?.[0] ?? child.properties.W?.[0];
          if (raw !== undefined) point = sgfPoint(raw, size);
        } catch {
          /* Keep unsupported branches browseable/exportable. */
        }
        return { id: nodeId(root.id, tree.indices.get(child)!), title: label(child, size), point };
      }),
      comment: node.properties.C?.[0] ?? '',
      annotations: Object.fromEntries(
        Object.entries(node.properties).filter(([key]) =>
          ['TR', 'SQ', 'CR', 'MA', 'LB'].includes(key),
        ),
      ),
      warnings: [],
    };
    try {
      const { game, warnings } = effectivePath.length
        ? importSgfDiagramPath(effectivePath)
        : { game: newGame(19), warnings: [] };
      game.metadata.GN = title;
      page.record = {
        id,
        title,
        updatedAt: root.updatedAt,
        game,
        tree: true,
        treeNodes: root.treeNodes,
        treeRootId: root.id,
        ...(cursor ? { groupId: root.id } : {}),
      };
      page.warnings = warnings;
    } catch (error) {
      page.unavailable = (error as Error).message;
    }
    return page;
  }
  export(root: SavedGame, id: string): string | undefined {
    const tree = this.load(root);
    const cursor = Number(id.slice(24));
    if (!tree.nodes[cursor]) return undefined;
    if (cursor === 0) {
      const roots = tree.roots.map((node) => ({
        ...node,
        properties: {
          ...node.properties,
          CA: ['UTF-8'],
          ...(tree.roots.length === 1 ? { GN: [root.title] } : {}),
        },
      }));
      return serializeSgf(roots);
    }
    const indices: number[] = [];
    for (let i = cursor; i >= 0; i = tree.parents[i]) indices.push(i);
    indices.reverse();
    if (tree.roots.length > 1) indices.shift();
    let tail: SgfNode | undefined;
    for (const i of [...indices].reverse())
      tail = { properties: tree.nodes[i].properties, children: tail ? [tail] : [] };
    tail!.properties = { ...tail!.properties, CA: ['UTF-8'], GN: [this.page(root, id)!.title] };
    return serializeSgf([tail!]);
  }
}
