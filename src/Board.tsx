import { t } from './i18n';
import { COLUMNS, toIndex, toPoint, type Position } from '../shared/go';
import type { Candidate } from '../shared/types';
import { sgfPoint } from '../shared/sgf';

interface Props {
  size: number;
  position: Position;
  lastPoint?: string;
  ownership?: number[];
  candidates?: Candidate[];
  trialStones?: ReadonlyMap<number, number>;
  dead: number[];
  disabled: boolean;
  scoring: boolean;
  onPlay: (point: string) => void;
  annotations?: Record<string, string[]>;
}
export function Board({
  size,
  position,
  lastPoint,
  ownership,
  candidates = [],
  trialStones = new Map(),
  dead,
  disabled,
  scoring,
  onPlay,
  annotations = {},
}: Props) {
  const step = 32,
    margin = 34,
    span = (size - 1) * step,
    extent = span + margin * 2;
  const stars = size === 19 ? [3, 9, 15] : size === 13 ? [3, 6, 9] : [2, 4, 6];
  const last = lastPoint ? toIndex(lastPoint, size) : -1;
  const marks = new Map<number, { kind: string; text?: string }>();
  for (const [kind, values] of Object.entries(annotations))
    for (const raw of values) {
      try {
        const [coordinate, ...label] = raw.split(':');
        const point = toIndex(sgfPoint(coordinate, size, false), size);
        marks.set(point, { kind, text: label.join(':') });
      } catch {
        /* An invalid annotation does not change the study position. */
      }
    }
  return (
    <svg
      className={`go-board ${disabled ? 'board-disabled' : ''}`}
      viewBox={`0 0 ${extent} ${extent}`}
      aria-label={t('goBoardToPlay', {
        v0: size,
        v1: position.toPlay === 'B' ? t('black') : t('white'),
      })}
    >
      <defs>
        <radialGradient id="black-stone" cx="30%" cy="25%">
          <stop offset="0" stopColor="#53564f" />
          <stop offset="0.7" stopColor="#222620" />
          <stop offset="1" stopColor="#10150f" />
        </radialGradient>
        <radialGradient id="white-stone" cx="32%" cy="25%">
          <stop offset="0" stopColor="#fffefa" />
          <stop offset="0.8" stopColor="#f6f4eb" />
          <stop offset="1" stopColor="#dcd9cd" />
        </radialGradient>
        <filter id="stone-shadow" x="-30%" y="-30%" width="180%" height="180%">
          <feDropShadow dx="0.7" dy="1.3" stdDeviation="0.9" floodOpacity="0.25" />
        </filter>
      </defs>
      <rect width={extent} height={extent} rx="6" fill="#dec291" />
      {Array.from({ length: size }, (_, i) => (
        <g key={i}>
          <path
            d={`M${margin} ${margin + i * step}h${span} M${margin + i * step} ${margin}v${span}`}
            stroke="#766649"
            strokeWidth="0.85"
          />
          <text className="coordinate" x={margin + i * step} y={19}>
            {COLUMNS[i]}
          </text>
          <text className="coordinate" x={margin + i * step} y={extent - 10}>
            {COLUMNS[i]}
          </text>
          <text className="coordinate" x={15} y={margin + i * step + 4}>
            {size - i}
          </text>
          <text className="coordinate" x={extent - 15} y={margin + i * step + 4}>
            {size - i}
          </text>
        </g>
      ))}
      {stars.flatMap((y) =>
        stars.map((x) => (
          <circle
            key={`${x}-${y}`}
            cx={margin + x * step}
            cy={margin + y * step}
            r="2.4"
            fill="#685739"
          />
        )),
      )}
      {position.board.map((color, i) => {
        const x = margin + (i % size) * step,
          y = margin + Math.floor(i / size) * step;
        const candidate = candidates.findIndex((c) => c.move === toPoint(i, size));
        const own = ownership?.[i] ?? 0;
        const trial = trialStones.get(i);
        return (
          <g key={i}>
            {color && (
              <circle
                cx={x}
                cy={y}
                r="14.5"
                fill={
                  trial
                    ? color === 'B'
                      ? '#30352e'
                      : '#eeeadd'
                    : `url(#${color === 'B' ? 'black' : 'white'}-stone)`
                }
                stroke={trial ? (color === 'B' ? '#b8b9a8' : '#666e59') : undefined}
                strokeWidth={trial ? 2 : undefined}
                filter="url(#stone-shadow)"
                opacity={dead.includes(i) ? 0.3 : 1}
              />
            )}
            {Math.abs(own) > 0.15 && (
              <rect
                x={x - 5}
                y={y - 5}
                width="10"
                height="10"
                rx="1"
                fill={own > 0 ? '#19221c' : '#fffdf1'}
                stroke={own > 0 ? '#e8d8b9' : '#777b65'}
                strokeWidth="0.6"
                opacity={Math.abs(own) * 0.85}
              />
            )}
            {color && trial && (
              <text
                className="trial-stone"
                aria-label={t('trialPoint', { v0: toPoint(i, size) })}
                aria-description={t('trialMoveNumber', { v0: trial })}
                x={x}
                y={y}
                dy=".35em"
                textAnchor="middle"
                fontSize={trial >= 100 ? 10 : 13}
                fontWeight="600"
                fill={color === 'B' ? '#fffefa' : '#222620'}
                opacity={dead.includes(i) ? 0.3 : 1}
              >
                {trial}
              </text>
            )}
            {i === last && color && !ownership && !trial && (
              <circle
                cx={x}
                cy={y}
                r="4.2"
                fill="none"
                stroke={color === 'B' ? '#f3f1e5' : '#2c4337'}
                strokeWidth="1.6"
              />
            )}
            {!color && candidate >= 0 && !ownership && (
              <g
                role="img"
                aria-label={t('candidate', {
                  v0: String.fromCharCode(65 + candidate),
                  v1: toPoint(i, size),
                })}
              >
                <circle
                  cx={x}
                  cy={y}
                  r="12"
                  fill={candidate === 0 ? '#2d7965' : '#f3e8ce'}
                  stroke="#2d7965"
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill={candidate === 0 ? '#fff' : '#2d7965'}
                >
                  {String.fromCharCode(65 + candidate)}
                </text>
              </g>
            )}
            {marks.has(i) &&
              (() => {
                const mark = marks.get(i)!;
                const ink = color === 'B' ? '#fff' : '#743d28';
                return (
                  <g pointerEvents="none" stroke={ink} fill="none" strokeWidth="2">
                    {mark.kind === 'TR' && <path d={`M${x} ${y - 8}l8 14h-16z`} />}
                    {mark.kind === 'SQ' && <rect x={x - 7} y={y - 7} width="14" height="14" />}
                    {mark.kind === 'CR' && <circle cx={x} cy={y} r="7" />}
                    {mark.kind === 'MA' && <path d={`M${x - 6} ${y - 6}l12 12m0 -12l-12 12`} />}
                    {mark.kind === 'LB' && (
                      <text
                        x={x}
                        y={y + 5}
                        textAnchor="middle"
                        stroke="none"
                        fill={ink}
                        fontSize="15"
                      >
                        {mark.text}
                      </text>
                    )}
                  </g>
                );
              })()}
            <rect
              className="point-target"
              data-board-point={toPoint(i, size)}
              x={x - 15.5}
              y={y - 15.5}
              width="31"
              height="31"
              rx="15"
              fill="transparent"
              role="button"
              aria-label={`${toPoint(i, size)}${color ? (color === 'B' ? t('blackStone') : t('whiteStone')) : t('emptyPoint')}`}
              aria-disabled={disabled || (!!color && !scoring)}
              tabIndex={!disabled && (!color || scoring) ? 0 : -1}
              onClick={() => !disabled && onPlay(toPoint(i, size))}
              onKeyDown={(e) => {
                if (!disabled && ['Enter', ' '].includes(e.key)) {
                  e.preventDefault();
                  onPlay(toPoint(i, size));
                }
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}
