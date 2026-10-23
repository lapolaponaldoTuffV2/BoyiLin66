import { Key, posId } from "./api";

const UNIT = 52;
const GAP = 4;

/** Draws the 66-key layout; keys are buttons so selection works with mouse and keyboard. */
export function Keyboard({ keys, selected, onToggle, tint, caption }: {
  keys: Key[];
  selected?: Set<string>;
  onToggle?: (key: Key, additive: boolean) => void;
  tint?: string;
  caption?: (key: Key) => string | undefined;
}) {
  const rows = Math.max(0, ...keys.map((k) => k.y)) + 1;
  return (
    <div className="keyboard" style={{ width: 16 * UNIT, aspectRatio: `16 / ${rows}`, ["--tint" as string]: tint }}>
      {keys.map((key) => {
        const id = posId(key.pos);
        return (
          <button
            key={id}
            type="button"
            className={`kb-key ${selected?.has(id) ? "selected" : ""}`}
            style={{ left: `${key.x / 16 * 100}%`, top: `${key.y / rows * 100}%`,
              width: `calc(${key.w / 16 * 100}% - ${GAP}px)`, height: `calc(${100 / rows}% - ${GAP}px)` }}
            onClick={(e) => onToggle?.(key, e.shiftKey || e.ctrlKey)}
            disabled={!onToggle}
            aria-pressed={selected ? selected.has(id) : undefined}
            aria-label={key.label || "Espaço"}
          >
            <span>{key.label}</span>
            {caption?.(key) && <small>{caption(key)}</small>}
          </button>
        );
      })}
    </div>
  );
}
