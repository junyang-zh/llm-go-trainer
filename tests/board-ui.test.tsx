// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Board } from '../src/Board';
import { replay, newGame } from '../shared/go';
import { boardOverlays } from './fixtures/board';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it.each([9, 13, 19])(
  'keeps candidates visible and clickable alongside ownership on a size %s board',
  async (size) => {
    const overlays = boardOverlays(size);
    const onPlay = vi.fn();
    const render = async (ownership?: number[]) =>
      act(async () =>
        root.render(
          <Board
            size={size}
            position={replay(newGame(size))}
            candidates={overlays.candidates}
            ownership={ownership}
            dead={[]}
            disabled={false}
            scoring={false}
            onPlay={onPlay}
          />,
        ),
      );
    await render();
    const centers = overlays.candidates.map(({ move }, index) => {
      const badge = host.querySelector(
        `[aria-label="候选 ${String.fromCharCode(65 + index)}：${move}"] circle`,
      )!;
      return { x: +badge.getAttribute('cx')!, y: +badge.getAttribute('cy')! };
    });
    await render(overlays.ownership);
    for (const [index, { move }] of overlays.candidates.entries()) {
      const badge = host.querySelector(
        `[aria-label="候选 ${String.fromCharCode(65 + index)}：${move}"] circle`,
      )!;
      expect(badge).not.toBeNull();
      expect(+badge.getAttribute('cx')!).toBe(centers[index].x);
      expect(+badge.getAttribute('cy')!).toBe(centers[index].y);
      // Ownership may touch the badge edge but must clear its centered letter.
      const marker = badge.parentElement!.parentElement!.querySelector('.ownership-marker');
      if (marker) {
        const letter = badge.parentElement!.querySelector('text')!;
        expect(+marker.getAttribute('x')! - 0.6).toBeGreaterThan(
          +letter.getAttribute('x')! + +letter.getAttribute('font-size')! / 2,
        );
        expect(+marker.getAttribute('y')! + +marker.getAttribute('height')! + 0.6).toBeLessThan(
          +letter.getAttribute('y')!,
        );
      }
      await act(async () =>
        host
          .querySelector(`[data-board-point="${move}"]`)!
          .dispatchEvent(new MouseEvent('click', { bubbles: true })),
      );
      expect(onPlay).toHaveBeenLastCalledWith(move);
    }
    await render();
    expect(host.querySelector('.ownership-marker')).toBeNull();
    expect(host.querySelector('[aria-label="候选 A：D4"] circle')!.getAttribute('cx')).toBe(
      String(centers[0].x),
    );
  },
);

it.each(['B', 'W'] as const)(
  'shows clear Black/White ownership without gray uncertainty when %s plays next',
  async (toPlay) => {
    const { ownership } = boardOverlays(9);
    const position = { ...replay(newGame(9)), toPlay };
    await act(async () =>
      root.render(
        <Board
          size={9}
          position={position}
          ownership={ownership}
          dead={[]}
          disabled={false}
          scoring={false}
          onPlay={() => {}}
        />,
      ),
    );
    const marker = (point: string) =>
      host
        .querySelector(`[data-board-point="${point}"]`)!
        .parentElement!.querySelector('.ownership-marker');
    expect(host.querySelectorAll('.ownership-marker')).toHaveLength(4);
    for (const point of ['F4', 'G4']) expect(marker(point)).toBeNull();
    for (const point of ['D4', 'H4']) expect(marker(point)!.getAttribute('fill')).toBe('#10150f');
    for (const point of ['E4', 'J4']) expect(marker(point)!.getAttribute('fill')).toBe('#ffffff');
    for (const element of host.querySelectorAll('.ownership-marker')) {
      expect(element.getAttribute('opacity')).toBeNull();
      expect(element.getAttribute('fill')).not.toBe(element.getAttribute('stroke'));
    }
  },
);
