import { useEffect, useRef, type RefObject } from 'react';

type XY = { x: number; y: number };
const center = (r: DOMRect): XY => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
// Use each wrapped inline fragment, clipped to the scroll viewport.
export function visibleFragment(rect: DOMRect, clip: DOMRect): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > Math.max(0, clip.left) &&
    rect.left < Math.min(innerWidth, clip.right) &&
    rect.bottom > Math.max(0, clip.top) &&
    rect.top < Math.min(innerHeight, clip.bottom)
  );
}

export function CoachOverlay({
  root,
  enabled,
  revision,
}: {
  root: RefObject<HTMLElement | null>;
  enabled: boolean;
  revision: unknown;
}) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const host = root.current,
      layer = svg.current;
    if (!host || !layer) return;
    const log = host.querySelector<HTMLElement>('.chat-log');
    const board = host.querySelector<SVGSVGElement>('.go-board');
    if (!log || !board || !enabled) return;
    let frame = 0;
    let pointer: XY | undefined;
    let hovered: Element | null = null;
    let painted: HTMLElement[] = [];
    const ns = 'http://www.w3.org/2000/svg';
    function draw() {
      frame = 0;
      for (const text of painted) text.style.removeProperty('--point-light');
      painted = [];
      layer!.replaceChildren();
      if (!log!.getClientRects().length || document.hidden || host!.querySelector('dialog[open]'))
        return;
      const clip = log!.getBoundingClientRect();
      if (pointer)
        hovered =
          document
            .elementFromPoint(pointer.x, pointer.y)
            ?.closest('[data-go-point], [data-board-point]') ?? null;
      const points = new Map(
        [...board!.querySelectorAll<SVGRectElement>('[data-board-point]')].map((el) => [
          el.dataset.boardPoint!,
          el,
        ]),
      );
      const entries: {
        text: HTMLElement;
        rect: DOMRect;
        point: string;
        xy: XY;
        radius: number;
        near: number;
        light: number;
      }[] = [];
      for (const text of log!.querySelectorAll<HTMLElement>('[data-go-point]')) {
        const point = text.dataset.goPoint!;
        const target = points.get(point);
        if (!target) continue;
        let left = Math.max(0, clip.left),
          right = Math.min(innerWidth, clip.right);
        let top = Math.max(0, clip.top),
          bottom = Math.min(innerHeight, clip.bottom);
        // Tables can scroll horizontally inside the conversation's own viewport.
        for (
          let parent = text.parentElement;
          parent && parent !== log;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
            left = Math.max(left, bounds.left);
            right = Math.min(right, bounds.right);
          }
          if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
          }
        }
        if (right <= left || bottom <= top) continue;
        const visible = new DOMRect(left, top, right - left, bottom - top);
        const fragments = [...text.getClientRects()]
          .filter((r) => visibleFragment(r, visible))
          .map((r) => {
            const x = Math.max(r.left, left),
              y = Math.max(r.top, top);
            return new DOMRect(x, y, Math.min(r.right, right) - x, Math.min(r.bottom, bottom) - y);
          });
        if (!fragments.length) continue;
        const rect = fragments.sort((a, b) =>
          pointer ? distance(center(a), pointer) - distance(center(b), pointer) : 0,
        )[0];
        const boardRect = target.getBoundingClientRect();
        if (!boardRect.width) continue;
        const xy = center(boardRect);
        const near = pointer
          ? Math.min(distance(pointer, xy), distance(pointer, center(rect)))
          : 700;
        // All marks share a hue. Luminance follows proximity at either endpoint.
        const light = 43 + Math.min(1, near / 550) * 38;
        text.style.setProperty('--point-light', `${light}%`);
        painted.push(text);
        entries.push({ text, rect, point, xy, radius: boardRect.width * 0.44, near, light });
      }
      // Repeated coordinates share one marker; closest text controls its brightness.
      const byPoint = new Map<string, (typeof entries)[number]>();
      for (const entry of entries)
        if (!byPoint.has(entry.point) || entry.near < byPoint.get(entry.point)!.near)
          byPoint.set(entry.point, entry);
      for (const entry of byPoint.values()) {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('class', 'coach-board-mark');
        circle.setAttribute('data-point', entry.point);
        circle.setAttribute('cx', String(entry.xy.x));
        circle.setAttribute('cy', String(entry.xy.y));
        circle.setAttribute('r', String(entry.radius));
        circle.setAttribute('fill', `hsl(174 64% ${entry.light}% / .24)`);
        circle.setAttribute('stroke', `hsl(174 64% ${entry.light}%)`);
        layer!.append(circle);
      }
      const focus = document.activeElement;
      const active =
        entries.find((e) => e.text === hovered || e.text.contains(hovered) || e.text === focus) ??
        [...byPoint.values()].find(
          (e) => points.get(e.point) === hovered || points.get(e.point) === focus,
        );
      if (active) {
        const { rect, xy, radius } = active;
        // Leave the marker at its upper-right rim and enter the visible text's
        // upper-left corner, with horizontal tangents at both ends.
        const offset = radius / Math.SQRT2;
        const start = { x: xy.x + offset, y: xy.y - offset };
        const end = { x: rect.left, y: rect.top };
        const handle = Math.min(180, Math.max(32, Math.abs(end.x - start.x) * 0.4));
        const line = document.createElementNS(ns, 'path');
        line.setAttribute('class', 'coach-guide');
        line.setAttribute(
          'd',
          `M ${start.x},${start.y} C ${start.x + handle},${start.y} ${end.x - handle},${end.y} ${end.x},${end.y}`,
        );
        layer!.append(line);
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw);
    }
    function move(event: PointerEvent) {
      pointer = { x: event.clientX, y: event.clientY };
      hovered =
        event.target instanceof Element
          ? event.target.closest('[data-go-point], [data-board-point]')
          : null;
      schedule();
    }
    function leave() {
      pointer = undefined;
      hovered = null;
      schedule();
    }
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : undefined;
    resize?.observe(log);
    resize?.observe(board);
    const mutation = new MutationObserver(schedule);
    // Exclude style mutations made by draw itself.
    mutation.observe(log, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'data-go-point'],
    });
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('focusin', schedule);
    window.addEventListener('focusout', schedule);
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('focusin', schedule);
      window.removeEventListener('focusout', schedule);
      document.removeEventListener('visibilitychange', schedule);
      for (const text of painted) text.style.removeProperty('--point-light');
      layer.replaceChildren();
    };
  }, [root, enabled, revision]);
  return <svg ref={svg} className="coach-overlay" aria-hidden="true" />;
}
