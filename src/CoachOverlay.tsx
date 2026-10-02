import { useEffect, useId, useRef, type RefObject } from 'react';

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
  const fogId = `coach-fog-${useId().replace(/:/g, '')}`;
  const clipId = `${fogId}-clip`;
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
      const regions = new Map<
        string,
        { centers: XY[]; cell: number; near: number; light: number }
      >();
      for (const text of log!.querySelectorAll<HTMLElement>('[data-go-point], [data-go-region]')) {
        const region = text.dataset.goRegion;
        const coordinates = region ? region.split(' ').sort() : [text.dataset.goPoint!];
        const targets = coordinates.map((point) => points.get(point));
        if (targets.some((target) => !target)) continue;
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
        const boardRects = targets.map((target) => target!.getBoundingClientRect());
        const boardRect = boardRects[0];
        if (!boardRect.width) continue;
        const xy = center(boardRect);
        // Regions respond only to their text, never to a stone inside the region.
        const near = region
          ? text === document.activeElement
            ? 0
            : pointer
              ? distance(pointer, center(rect))
              : 700
          : pointer
            ? Math.min(distance(pointer, xy), distance(pointer, center(rect)))
            : 700;
        // All marks share a hue; nearer references use a deeper shade.
        const light = 43 + Math.min(1, near / 550) * 38;
        text.style.setProperty('--point-light', `${light}%`);
        painted.push(text);
        if (region) {
          const key = coordinates.join(' ');
          if (!regions.has(key) || near < regions.get(key)!.near)
            regions.set(key, {
              centers: boardRects.map(center),
              cell: boardRect.width,
              near,
              light,
            });
        } else {
          entries.push({
            text,
            rect,
            point: coordinates[0],
            xy,
            radius: boardRect.width * 0.44,
            near,
            light,
          });
        }
      }
      if (regions.size) {
        const defs = document.createElementNS(ns, 'defs');
        const filter = document.createElementNS(ns, 'filter');
        filter.id = fogId;
        // Blur the union once so adjacent stones form one soft patch, without rings
        // or compounded opacity where the individual footprints overlap.
        const blur = document.createElementNS(ns, 'feGaussianBlur');
        blur.setAttribute('stdDeviation', String([...regions.values()][0].cell * 0.2));
        filter.setAttribute('x', '-50%');
        filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%');
        filter.setAttribute('height', '200%');
        filter.append(blur);
        const clipPath = document.createElementNS(ns, 'clipPath');
        clipPath.id = clipId;
        clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
        const boardBounds = board!.getBoundingClientRect();
        const clipRect = document.createElementNS(ns, 'rect');
        clipRect.setAttribute('x', String(boardBounds.left));
        clipRect.setAttribute('y', String(boardBounds.top));
        clipRect.setAttribute('width', String(boardBounds.width));
        clipRect.setAttribute('height', String(boardBounds.height));
        clipPath.append(clipRect);
        defs.append(filter, clipPath);
        layer!.append(defs);
        const fog = document.createElementNS(ns, 'g');
        fog.setAttribute('clip-path', `url(#${clipId})`);
        for (const [key, region] of regions) {
          const patch = document.createElementNS(ns, 'path');
          const radius = region.cell * 0.72;
          patch.setAttribute('class', 'coach-board-region');
          patch.setAttribute('data-points', key);
          patch.setAttribute(
            'd',
            region.centers
              .map(
                ({ x, y }) =>
                  `M ${x - radius},${y} a ${radius},${radius} 0 1,0 ${radius * 2},0 a ${radius},${radius} 0 1,0 ${-radius * 2},0 Z`,
              )
              .join(' '),
          );
          patch.setAttribute('fill', `hsl(174 64% ${region.light}%)`);
          patch.setAttribute('opacity', String(0.16 + (1 - Math.min(1, region.near / 550)) * 0.2));
          patch.setAttribute('filter', `url(#${fogId})`);
          fog.append(patch);
        }
        layer!.append(fog);
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
        // Leave the marker at its lower-right rim, heading diagonally down-right,
        // and enter the visible text's upper-left corner from the left.
        const offset = radius / Math.SQRT2;
        const start = { x: xy.x + offset, y: xy.y + offset };
        const end = { x: rect.left, y: rect.top };
        const handle = Math.min(180, Math.max(32, Math.abs(end.x - start.x) * 0.4));
        const line = document.createElementNS(ns, 'path');
        line.setAttribute('class', 'coach-guide');
        line.setAttribute(
          'd',
          `M ${start.x},${start.y} C ${start.x + handle},${start.y + handle} ${end.x - handle},${end.y} ${end.x},${end.y}`,
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
      attributeFilter: ['open', 'hidden', 'data-go-point', 'data-go-region'],
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
  }, [root, enabled, revision, fogId, clipId]);
  return <svg ref={svg} className="coach-overlay" aria-hidden="true" />;
}
