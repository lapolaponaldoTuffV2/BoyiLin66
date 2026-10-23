import { useEffect, useId, useRef, useState } from "react";
import { api, Key, KeyAction, Keymap, MediaKey, MouseAction, posId } from "./api";
import { Keyboard } from "./Keyboard";
import { actionName, KEY_OPTIONS, keyIndex, keymapProblem, MEDIA_NAMES, MODIFIERS, modifierCount, MOUSE_NAMES, sameAction } from "./keymap";
import { Icon, Panel } from "./ui";

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
    switch (kind) {
      case "key": update({ kind, usage: selected?.usage ?? 4 }); break;
      case "shortcut": update({ kind, modifiers: 1, usage: 6 }); break;
      case "media": update({ kind, key: "VolumeUp" }); break;
      case "mouse": update({ kind, action: "Left" }); break;
      case "disabled": update({ kind }); break;
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
              <select aria-labelledby={`${fieldId}-type`} value={action.kind} onChange={(e) => changeType(e.target.value)}>
                <option value="key">Tecla</option>
                <option value="shortcut">Atalho</option>
                <option value="media">Multimídia</option>
                <option value="mouse">Mouse · beta</option>
                <option value="disabled">Desativar</option>
              </select>
            </label>
            {(action.kind === "key" || action.kind === "shortcut") && <label><span id={`${fieldId}-key`}>Tecla de destino</span>
              <select aria-labelledby={`${fieldId}-key`} value={action.usage} onChange={(e) => update({ ...action, usage: Number(e.target.value) })}>
                {!KEY_OPTIONS.some((key) => key.usage === action.usage) && <option value={action.usage}>{actionName({ kind: "key", usage: action.usage })}</option>}
                {KEY_OPTIONS.filter((key) => action.kind === "key" || key.usage < 0xe0).map((key) => (
                  <option key={key.usage} value={key.usage}>{key.label}</option>
                ))}
              </select>
            </label>}
            {action.kind === "key" && <div className="actions">
              <button type="button" className="ghost" onClick={() => {
                setCapturing(!capturing);
                setStatus(capturing ? "Captura cancelada." : "Pressione a próxima tecla. Esc cancela; escolha Esc na lista para atribuí-la.");
              }}>{capturing ? "Cancelar captura" : "Capturar próxima tecla"}</button>
            </div>}
            {action.kind === "shortcut" && <fieldset className="modifier-options">
              <legend>Modificadores (1–2)</legend>
              {MODIFIERS.map((modifier) => <label key={modifier.bit}>
                <input type="checkbox" checked={!!(action.modifiers & modifier.bit)}
                  disabled={!(action.modifiers & modifier.bit) && modifierCount(action.modifiers) >= 2}
                  onChange={(e) => update({ ...action, modifiers: e.target.checked
                    ? action.modifiers | modifier.bit : action.modifiers & ~modifier.bit })} />
                {modifier.label}
              </label>)}
            </fieldset>}
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
