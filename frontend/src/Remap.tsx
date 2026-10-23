import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { AdvancedKey, api, DksBinding, DksPoints, Key, KeyAction, Keymap, KeyStroke, MediaKey, MouseAction, posId, StageAction } from "./api";
import { Keyboard } from "./Keyboard";
import {
  actionName, ADVANCED_SLOTS, DKS_STAGES, KEY_OPTIONS, keyIndex, keymapProblem, MACRO_SLOTS, MEDIA_NAMES, MODIFIERS,
  modifierCount, MOUSE_NAMES, sameAction, STAGE_NAMES,
} from "./keymap";
import { MacroFields } from "./Macro";
import { Icon, mm, Panel, Slider } from "./ui";

/** 1,5 / 3,6 / 3,6 / 1,5 mm, the protocol crate's `DksPoints::DEFAULT`. */
const DKS_DEFAULT: DksPoints = { press: 15, bottom: 36, bottom_release: 36, release: 15 };

export function Remap({ keys, onError, onDirtyChange }: {
  keys: Key[]; onError: (e: unknown) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [map, setMap] = useState<Keymap | null>(null);
  const [saved, setSaved] = useState<Keymap | null>(null);
  const [factory, setFactory] = useState<Keymap | null>(null);
  const [selected, setSelected] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState("Carregando cópia local…");
  const request = useRef(0);
  const fieldId = useId();
  const action = map && selected ? map[keyIndex(selected.pos)] : null;
  const problem = map ? keymapProblem(map, keys) : null;
  const advancedCount = map ? map.filter((value) => value.kind === "advanced").length : 0;
  const advancedFull = advancedCount >= ADVANCED_SLOTS && action?.kind !== "advanced";
  const macroCount = map ? map.filter((value) => value.kind === "macro").length : 0;
  const macroFull = macroCount >= MACRO_SLOTS && action?.kind !== "macro";
  const dirty = !!(map && saved && map.some((action, index) => !sameAction(action, saved[index])));
  const remapped = new Set(keys.filter((key) => map && factory
    && !sameAction(map[keyIndex(key.pos)], factory[keyIndex(key.pos)])).map((key) => posId(key.pos)));

  const load = async () => {
    const id = ++request.current;
    setBusy(true);
    setStatus("Carregando cópia local…");
    try {
      const [local, defaults] = await Promise.all([api.getKeymap(), api.factoryKeymap()]);
      const error = keymapProblem(local, keys) || keymapProblem(defaults, keys);
      if (error) throw new Error(error);
      if (id !== request.current) return;
      setMap(local);
      setSaved(local);
      setFactory(defaults);
      setStatus("Cópia local carregada. Selecione uma tecla para editar.");
      onError(null);
    } catch (e) {
      if (id !== request.current) return;
      setStatus("Não foi possível carregar a cópia local. Tente novamente ou restaure o padrão.");
      onError(e);
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { request.current++; };
  }, [keys]);
  useEffect(() => {
    onDirtyChange(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const update = (next: KeyAction) => {
    if (!map || !selected || busy || action?.kind === "fn" || next.kind === "fn") return;
    setMap(map.map((value, index) => index === keyIndex(selected.pos) ? next : value));
    setStatus("Alteração local. Use Aplicar para gravar o mapa inteiro no teclado.");
  };

  useEffect(() => {
    if (!capturing) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || event.isComposing) return;
      if (event.code === "Escape") {
        setCapturing(false);
        setStatus("Captura cancelada.");
        return;
      }
      const key = KEY_OPTIONS.find((option) => option.code === event.code);
      if (!key) {
        setStatus("Tecla não reconhecida. Tente outra tecla ou pressione Esc para cancelar.");
        return;
      }
      update({ kind: "key", usage: key.usage });
      setCapturing(false);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturing, map, selected, busy]);

  const apply = async (restore: boolean) => {
    if (busy || (!restore && (!map || problem))) return;
    if (restore && !window.confirm("Restaurar o mapa de fábrica? Todas as atribuições da camada base serão substituídas no teclado.")) return;
    const id = ++request.current;
    setCapturing(false);
    setBusy(true);
    setStatus(restore ? "Restaurando padrão…" : "Aplicando mapa inteiro…");
    try {
      const next = restore ? await api.factoryKeymap() : map!;
      if (id !== request.current) return;
      const error = keymapProblem(next, keys);
      if (error) throw new Error(error);
      await api.setKeymap(next);
      if (id !== request.current) return;
      setMap(next);
      setSaved(next);
      if (restore) setFactory(next);
      setStatus(restore ? "Padrão restaurado e cópia local salva." : "Mapa aplicado e cópia local salva.");
      onError(null);
    } catch (e) {
      if (id !== request.current) return;
      setStatus("Falha ao gravar. O teclado pode ter sido alterado parcialmente e a cópia salva pode estar desatualizada. Revise o mapa antes de tentar novamente.");
      onError(e);
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  const changeType = (kind: string) => {
    setCapturing(false);
    const own: KeyStroke = { kind: "key", usage: selected?.usage ?? 4 };
    switch (kind) {
      case "key": update({ kind, usage: selected?.usage ?? 4 }); break;
      case "shortcut": update({ kind, modifiers: 1, usage: 6 }); break;
      case "media": update({ kind, key: "VolumeUp" }); break;
      case "mouse": update({ kind, action: "Left" }); break;
      case "disabled": update({ kind }); break;
      case "macro": update({ kind, playback: { type: "once" }, steps: [
        { usage: own.usage, down: true, delay_ms: 10 }, { usage: own.usage, down: false, delay_ms: 10 }] }); break;
      case "mod_tap": update({ kind: "advanced", key: { type: kind, tap: own, hold: { kind: "key", usage: 0xe0 }, hold_ms: 200 } }); break;
      case "toggle": update({ kind: "advanced", key: { type: kind, key: own } }); break;
      case "dks": update({ kind: "advanced", key: { type: kind, points: DKS_DEFAULT,
        bindings: [{ key: own, stages: ["tap", "none", "none", "none"] }, null, null, null] } }); break;
    }
  };

  return (
    <div className="page">
      <p className="notice">O teclado não informa o próprio mapa. Esta é a última cópia salva pelo app,
        ou o padrão de fábrica quando ainda não há cópia. As edições são locais até aplicar. Apenas a camada base é alterada.</p>
      <p className="muted" role="status">{status}</p>
      {!map && !busy && <button type="button" className="ghost read-button" onClick={load}>Tentar novamente</button>}
      <Panel title="Teclas" actions={
        <div className="actions">
          <button type="button" className="ghost" disabled={busy} onClick={() => void apply(true)}>Restaurar padrão</button>
          <button type="button" className="primary" disabled={busy || capturing || !map || !!problem} onClick={() => void apply(false)}>
            <Icon name="check" /> Aplicar
          </button>
        </div>
      }>
        <fieldset disabled={busy || !map} aria-label="Teclado para remapear">
          <Keyboard keys={keys} selected={new Set(selected ? [posId(selected.pos)] : [])} marked={remapped}
            onToggle={(key) => { setSelected(key); setCapturing(false); }}
            caption={(key) => map && remapped.has(posId(key.pos)) ? `↦ ${actionName(map[keyIndex(key.pos)])}` : undefined} />
        </fieldset>
        <p className="muted">↦ indica uma tecla remapeada em relação ao padrão de fábrica. Use clique ou Tab + Enter para selecionar.</p>
      </Panel>
      {problem && <p className="notice" role="alert">{problem}</p>}
      <Panel title={selected ? `Ação de ${selected.label || "Espaço"}` : "Ação da tecla"}>
        {!action ? <p className="muted">Selecione uma tecla no teclado acima.</p> : <>
          <p>Ação na cópia em edição: <strong>{actionName(action)}</strong></p>
          {action.kind === "fn" ? <p className="notice">Fn protegida. O mapa deve manter exatamente uma tecla Fn;
            esta função não pode ser removida ou duplicada.</p> : <fieldset className="remap-fields" disabled={busy} aria-label="Editar ação">
            <label><span id={`${fieldId}-type`}>Tipo de ação</span>
              <select aria-labelledby={`${fieldId}-type`} value={action.kind === "advanced" ? action.key.type : action.kind}
                onChange={(e) => changeType(e.target.value)}>
                <option value="key">Tecla</option>
                <option value="shortcut">Atalho</option>
                <option value="media">Multimídia</option>
                <option value="mouse">Mouse · beta</option>
                <option value="macro" disabled={macroFull}>Macro</option>
                <option value="disabled">Desativar</option>
                <optgroup label="Avançada">
                  <option value="mod_tap" disabled={advancedFull}>Mod-Tap</option>
                  <option value="toggle" disabled={advancedFull}>Toggle</option>
                  <option value="dks" disabled={advancedFull}>DKS</option>
                </optgroup>
              </select>
            </label>
            {(action.kind === "advanced" || advancedFull) && <p className="muted">
              Teclas avançadas no mapa: {advancedCount} de {ADVANCED_SLOTS}.</p>}
            {(action.kind === "macro" || macroFull) && <p className="muted">Macros no mapa: {macroCount} de {MACRO_SLOTS}.</p>}
            {action.kind === "macro" && <MacroFields key={posId(selected!.pos)} value={action} onChange={update} />}
            {(action.kind === "key" || action.kind === "shortcut") && <StrokeFields label="Tecla de destino" stroke={action} onChange={update} />}
            {action.kind === "key" && <div className="actions">
              <button type="button" className="ghost" onClick={() => {
                setCapturing(!capturing);
                setStatus(capturing ? "Captura cancelada." : "Pressione a próxima tecla. Esc cancela; escolha Esc na lista para atribuí-la.");
              }}>{capturing ? "Cancelar captura" : "Capturar próxima tecla"}</button>
            </div>}
            {action.kind === "advanced" && <AdvancedFields value={action.key} onChange={(key) => update({ kind: "advanced", key })} />}
            {action.kind === "media" && <label><span id={`${fieldId}-media`}>Ação multimídia</span>
              <select aria-labelledby={`${fieldId}-media`} value={action.key} onChange={(e) => update({ kind: "media", key: e.target.value as MediaKey })}>
                {Object.entries(MEDIA_NAMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>}
            {action.kind === "mouse" && <>
              <p className="notice"><strong className="badge">beta</strong> Ações de mouse ainda não foram confirmadas no hardware.</p>
              <label><span id={`${fieldId}-mouse`}>Ação de mouse</span>
                <select aria-labelledby={`${fieldId}-mouse`} value={action.action} onChange={(e) => update({ kind: "mouse", action: e.target.value as MouseAction })}>
                  {Object.entries(MOUSE_NAMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </>}
          </fieldset>}
        </>}
      </Panel>
    </div>
  );
}

/** Key list plus, for a shortcut, its modifier checkboxes. */
function StrokeFields({ label, stroke, onChange }: { label: string; stroke: KeyStroke; onChange: (stroke: KeyStroke) => void }) {
  const id = useId();
  return <>
    <label><span id={`${id}-key`}>{label}</span>
      <select aria-labelledby={`${id}-key`} value={stroke.usage} onChange={(e) => onChange({ ...stroke, usage: Number(e.target.value) })}>
        {!KEY_OPTIONS.some((key) => key.usage === stroke.usage) && <option value={stroke.usage}>{actionName({ kind: "key", usage: stroke.usage })}</option>}
        {KEY_OPTIONS.filter((key) => stroke.kind === "key" || key.usage < 0xe0).map((key) => (
          <option key={key.usage} value={key.usage}>{key.label}</option>
        ))}
      </select>
    </label>
    {stroke.kind === "shortcut" && <fieldset className="modifier-options">
      <legend>Modificadores (1–2)</legend>
      {MODIFIERS.map((modifier) => <label key={modifier.bit}>
        <input type="checkbox" checked={!!(stroke.modifiers & modifier.bit)}
          disabled={!(stroke.modifiers & modifier.bit) && modifierCount(stroke.modifiers) >= 2}
          onChange={(e) => onChange({ ...stroke, modifiers: e.target.checked
            ? stroke.modifiers | modifier.bit : stroke.modifiers & ~modifier.bit })} />
        {modifier.label}
      </label>)}
    </fieldset>}
  </>;
}

/** A key or shortcut sent by an advanced key, under its own legend. */
function StrokeGroup({ legend, stroke, onChange, children }: {
  legend: string; stroke: KeyStroke; onChange: (stroke: KeyStroke) => void; children?: ReactNode;
}) {
  const id = useId();
  return (
    <fieldset className="stroke-group">
      <legend>{legend}</legend>
      <label><span id={`${id}-kind`}>Envia</span>
        <select aria-labelledby={`${id}-kind`} value={stroke.kind} onChange={(e) => onChange(e.target.value === "shortcut"
          ? { kind: "shortcut", modifiers: 1, usage: 6 } : { kind: "key", usage: stroke.usage })}>
          <option value="key">Tecla</option>
          <option value="shortcut">Atalho</option>
        </select>
      </label>
      <StrokeFields label="Tecla" stroke={stroke} onChange={onChange} />
      {children}
    </fieldset>
  );
}

function AdvancedFields({ value, onChange }: { value: AdvancedKey; onChange: (key: AdvancedKey) => void }) {
  switch (value.type) {
    case "mod_tap": return <>
      <p className="muted">Um toque envia uma ação; segurar além do tempo definido envia outra.</p>
      <StrokeGroup legend="Ao tocar" stroke={value.tap} onChange={(tap) => onChange({ ...value, tap })} />
      <StrokeGroup legend="Ao segurar" stroke={value.hold} onChange={(hold) => onChange({ ...value, hold })} />
      <Slider label="Tempo para segurar" value={value.hold_ms} min={10} max={2550} step={10}
        format={(ms) => `${ms} ms`} onChange={(hold_ms) => onChange({ ...value, hold_ms })} />
    </>;
    case "toggle": return <>
      <p className="muted">O primeiro toque mantém a ação pressionada; o toque seguinte a solta.</p>
      <StrokeGroup legend="Ação mantida" stroke={value.key} onChange={(key) => onChange({ ...value, key })} />
    </>;
    case "dks": {
      const setBinding = (index: number, binding: DksBinding | null) =>
        onChange({ ...value, bindings: value.bindings.map((current, i) => i === index ? binding : current) });
      const free = value.bindings.indexOf(null);
      return <>
        <p className="muted">Envia até 4 ações em etapas diferentes do curso da tecla. Um toque que não chega
          ao fundo passa só pelas etapas 1 e 4. Segurar pressiona na etapa escolhida e solta na seguinte.</p>
        <fieldset className="stroke-group">
          <legend>Ponto de cada etapa</legend>
          {DKS_STAGES.map(({ point, label }, stage) => <Slider key={point} label={`${stage + 1} · ${label}`}
            value={value.points[point]} min={1} max={40} format={mm}
            onChange={(depth) => onChange({ ...value, points: { ...value.points, [point]: depth } })} />)}
        </fieldset>
        {value.bindings.map((binding, index) => binding && <StrokeGroup key={index} legend={`Ação ${index + 1}`}
          stroke={binding.key} onChange={(key) => setBinding(index, { ...binding, key })}>
          <div className="dks-stages">
            {DKS_STAGES.map(({ label }, stage) => <label key={stage}>{`${stage + 1} · ${label}`}
              <select value={binding.stages[stage]} onChange={(e) => setBinding(index, {
                ...binding, stages: binding.stages.map((current, i) => i === stage ? e.target.value as StageAction : current),
              })}>
                {/* The last stage has no next one to release a hold. */}
                {(Object.keys(STAGE_NAMES) as StageAction[]).filter((option) => stage < 3 || option !== "hold")
                  .map((option) => <option key={option} value={option}>{STAGE_NAMES[option]}</option>)}
              </select>
            </label>)}
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setBinding(index, null)}>Remover ação {index + 1}</button>
          </div>
        </StrokeGroup>)}
        {free >= 0 && <div className="actions">
          <button type="button" className="ghost" onClick={() => setBinding(free,
            { key: { kind: "key", usage: 4 }, stages: ["tap", "none", "none", "none"] })}>Adicionar ação</button>
        </div>}
      </>;
    }
  }
}
