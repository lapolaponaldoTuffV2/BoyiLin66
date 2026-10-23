import { useId } from "react";
import { Key, posId } from "./api";

const UNIT = 52;
const GAP = 4;

/** Draws the 66-key layout; keys are buttons so selection works with mouse and keyboard. */
export function Keyboard({ keys, selected, onToggle, tint, colorOf, caption, marked }: {
  keys: Key[];
  selected?: Set<string>;
  onToggle?: (key: Key, additive: boolean) => void;
  tint?: string;
  /** A colour per key, shown on its front edge. */
  colorOf?: (key: Key) => string;
  caption?: (key: Key) => string | undefined;
  marked?: Set<string>;
}) {
  const descriptionId = useId();
  const rows = Math.max(0, ...keys.map((k) => k.y)) + 1;
  return (
    <div className="keyboard" style={{ width: 16 * UNIT, aspectRatio: `16 / ${rows}`, ["--tint" as string]: tint }}>
      {keys.map((key) => {
        const id = posId(key.pos);
        const description = caption?.(key);
        return (
          <button
            key={id}
            type="button"
            className={`kb-key ${selected?.has(id) ? "selected" : ""} ${marked?.has(id) ? "remapped" : ""} ${colorOf ? "colored" : ""}`}
            style={{ ["--tint" as string]: colorOf?.(key), left: `${key.x / 16 * 100}%`, top: `${key.y / rows * 100}%`,
              width: `calc(${key.w / 16 * 100}% - ${GAP}px)`, height: `calc(${100 / rows}% - ${GAP}px)` }}
            onClick={(e) => onToggle?.(key, e.shiftKey || e.ctrlKey)}
            disabled={!onToggle}
            aria-pressed={selected ? selected.has(id) : undefined}
            aria-label={key.label || "Espaço"}
            aria-describedby={description ? `${descriptionId}-${id}` : undefined}
            title={description}
          >
            <span>{key.label}</span>
            {description && <small id={`${descriptionId}-${id}`}>{description}</small>}
          </button>
        );
      })}
    </div>
  );
}
