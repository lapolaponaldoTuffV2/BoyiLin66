import { useEffect, useId, useRef, useState } from "react";
import { KeyAction, MacroAction, MacroStep, Playback } from "./api";
import { actionName, KEY_OPTIONS, MAX_MACRO_STEPS } from "./keymap";

const PLAYBACK: Record<Playback["type"], string> = {
  once: "Uma vez a cada toque", repeat: "Repetir um número de vezes",
  toggle: "Liga e desliga a cada toque", while_held: "Enquanto a tecla estiver pressionada",
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value) || 0));

/** Playback mode plus the step list, which can be recorded from the keyboard or edited by hand. */
export function MacroFields({ value, onChange }: { value: MacroAction; onChange: (action: KeyAction) => void }) {
  const id = useId();
  const [recording, setRecording] = useState(false);
  const rec = useRef({ held: new Set<number>(), last: 0 });
  const setStep = (index: number, step: MacroStep) =>
    onChange({ ...value, steps: value.steps.map((current, i) => i === index ? step : current) });
  // Keys still held when recording stops get released, so the macro stays valid.
  const stop = () => {
    const releases = [...rec.current.held].map((usage) => ({ usage, down: false, delay_ms: 0 }));
    if (releases.length) onChange({ ...value, steps: [...value.steps, ...releases] });
    setRecording(false);
  };

  useEffect(() => {
    if (!recording) return;
    const record = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || event.isComposing) return;
      // Esc stops, so recording never traps keyboard users; add Esc to a macro by hand.
      if (event.code === "Escape") {
        if (event.type === "keydown") stop();
        return;
      }
      const usage = KEY_OPTIONS.find((key) => key.code === event.code)?.usage;
      const down = event.type === "keydown";
      const { held } = rec.current;
      // Skip unknown keys, and releases of keys pressed before recording started.
      if (!usage || held.has(usage) === down) return;
      // Keep room to release every held key.
      if (down && value.steps.length + held.size + 2 > MAX_MACRO_STEPS) return;
      if (down) held.add(usage); else held.delete(usage);
      const steps = value.steps.slice();
      const last = steps.length - 1;
      if (last >= 0) steps[last] = { ...steps[last], delay_ms: clamp(event.timeStamp - rec.current.last, 0, 65535) };
      rec.current.last = event.timeStamp;
      onChange({ ...value, steps: [...steps, { usage, down, delay_ms: 0 }] });
    };
    window.addEventListener("keydown", record, true);
    window.addEventListener("keyup", record, true);
    return () => {
      window.removeEventListener("keydown", record, true);
      window.removeEventListener("keyup", record, true);
    };
  }, [recording, value, onChange]);

  return <>
    <label><span id={`${id}-playback`}>Reprodução</span>
      <select aria-labelledby={`${id}-playback`} value={value.playback.type} onChange={(e) => {
        const type = e.target.value as Playback["type"];
        onChange({ ...value, playback: type === "repeat" ? { type, count: 2 } : { type } });
      }}>
        {Object.entries(PLAYBACK).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
      </select>
    </label>
    {value.playback.type === "repeat" && <label><span id={`${id}-count`}>Repetições (1–255)</span>
      <input type="number" aria-labelledby={`${id}-count`} min={1} max={255} value={value.playback.count}
        onChange={(e) => onChange({ ...value, playback: { type: "repeat", count: clamp(Number(e.target.value), 1, 255) } })} />
    </label>}
    <div className="actions">
      <button type="button" className="ghost" onClick={() => {
        if (recording) return stop();
        rec.current = { held: new Set(), last: 0 };
        onChange({ ...value, steps: [] });
        setRecording(true);
      }}>{recording ? "Parar gravação" : "Gravar teclas"}</button>
    </div>
    <p className="muted" role="status">{recording
      ? "Gravando: pressione as teclas da macro, com as pausas desejadas. Esc ou Parar gravação termina."
      : `${value.steps.length} de ${MAX_MACRO_STEPS} passos. A pausa depois do último passo separa as repetições.`}</p>
    {value.steps.length > 0 && <div className="macro-steps">
      <div className="macro-step" aria-hidden="true"><span>Tecla</span><span>Ação</span><span>Pausa (ms)</span><span /></div>
      {value.steps.map((step, index) => <div className="macro-step" key={index}>
        <select aria-label={`Tecla do passo ${index + 1}`} value={step.usage} disabled={recording}
          onChange={(e) => setStep(index, { ...step, usage: Number(e.target.value) })}>
          {!KEY_OPTIONS.some((key) => key.usage === step.usage) && <option value={step.usage}>{actionName({ kind: "key", usage: step.usage })}</option>}
          {KEY_OPTIONS.map((key) => <option key={key.usage} value={key.usage}>{key.label}</option>)}
        </select>
        <select aria-label={`Ação do passo ${index + 1}`} value={step.down ? "down" : "up"} disabled={recording}
          onChange={(e) => setStep(index, { ...step, down: e.target.value === "down" })}>
          <option value="down">Pressionar</option>
          <option value="up">Soltar</option>
        </select>
        <input type="number" aria-label={`Pausa depois do passo ${index + 1}, em milissegundos`} min={0} max={65535}
          value={step.delay_ms} disabled={recording}
          onChange={(e) => setStep(index, { ...step, delay_ms: clamp(Number(e.target.value), 0, 65535) })} />
        <button type="button" className="ghost" aria-label={`Remover passo ${index + 1}`} disabled={recording}
          onClick={() => onChange({ ...value, steps: value.steps.filter((_, i) => i !== index) })}>Remover</button>
      </div>)}
    </div>}
    <div className="actions">
      <button type="button" className="ghost" disabled={recording || value.steps.length + 2 > MAX_MACRO_STEPS}
        onClick={() => onChange({ ...value, steps: [...value.steps,
          { usage: 4, down: true, delay_ms: 10 }, { usage: 4, down: false, delay_ms: 10 }] })}>Adicionar toque</button>
    </div>
  </>;
}
