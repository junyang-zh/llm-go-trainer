import { COLUMNS, toIndex, toPoint, type Position } from '../shared/go';
import type { Candidate } from '../shared/types';

interface Props {
  size: number;
  position: Position;
  lastPoint?: string;
  ownership?: number[];
  candidates?: Candidate[];
  dead: number[];
  disabled: boolean;
  scoring: boolean;
  onPlay: (point: string) => void;
}
export function Board({
  size,
  position,
  lastPoint,
  ownership,
  candidates = [],
  dead,
  disabled,
  scoring,
  onPlay,
}: Props) {
  const step = 32,
    margin = 34,
    span = (size - 1) * step,
    extent = span + margin * 2;
  const stars = size === 19 ? [3, 9, 15] : size === 13 ? [3, 6, 9] : [2, 4, 6];
  const last = lastPoint ? toIndex(lastPoint, size) : -1;
  return (
    <svg
      className={`go-board ${disabled ? 'board-disabled' : ''}`}
      viewBox={`0 0 ${extent} ${extent}`}
      aria-label={`${size} 路围棋棋盘，${position.toPlay === 'B' ? '黑' : '白'}方行棋`}
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
        return (
          <g key={i}>
            {color && (
              <circle
                cx={x}
                cy={y}
                r="14.5"
                fill={`url(#${color === 'B' ? 'black' : 'white'}-stone)`}
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
            {i === last && color && !ownership && (
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
                aria-label={`候选 ${String.fromCharCode(65 + candidate)}：${toPoint(i, size)}`}
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
            <rect
              className="point-target"
              x={x - 15.5}
              y={y - 15.5}
              width="31"
              height="31"
              rx="15"
              fill="transparent"
              role="button"
              aria-label={`${toPoint(i, size)}${color ? (color === 'B' ? ' 黑子' : ' 白子') : ' 空点'}`}
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
