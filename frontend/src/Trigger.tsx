import { useEffect, useRef, useState } from "react";
import { api, Key, posId, TriggerSettings } from "./api";
import { Keyboard } from "./Keyboard";
import { Icon, mm, Panel, Slider, Toggle } from "./ui";

const DEFAULT: TriggerSettings = { press: 10, release: 10, separate: false, quick_trigger: false, qt_press: 5, qt_release: 5 };

export function Trigger({ keys, onError }: { keys: Key[]; onError: (e: unknown) => void }) {
  const [current, setCurrent] = useState<Map<string, TriggerSettings>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<TriggerSettings>(DEFAULT);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("Lendo acionamento…");
  const request = useRef(0);

  // One request per key; the firmware has no bulk read.
  const load = async () => {
    const id = ++request.current;
    setBusy(true);
    setStatus("Lendo acionamento…");
    try {
      const all = new Map<string, TriggerSettings>();
      for (const key of keys) {
        const value = await api.getKeyTrigger(key.pos);
        if (id !== request.current) return;
        all.set(posId(key.pos), value);
      }
      setCurrent(all);
      if (selected.size === 1) setSettings(all.get([...selected][0])!);
      setLoadFailed(false);
      onError(null);
      setStatus("Acionamento lido do teclado.");
    } catch (e) {
      if (id !== request.current) return;
      setLoadFailed(true);
      setStatus("Não foi possível ler o acionamento. Tente novamente.");
      onError(e);
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { request.current++; };
  }, [keys]);

  const toggle = (key: Key, additive: boolean) => {
    const id = posId(key.pos);
    const next = new Set(additive ? selected : []);
    if (selected.has(id) && (additive || selected.size === 1)) next.delete(id);
    else next.add(id);
    setSelected(next);
    const first = current.get([...next][0]);
    if (next.size === 1 && first) setSettings(first);
  };

  const apply = async () => {
    if (busy || loadFailed || current.size !== keys.length || selected.size === 0) return;
    const id = request.current;
    setBusy(true);
    setStatus("Aplicando acionamento…");
    try {
      const chosen = keys.filter((k) => selected.has(posId(k.pos))).map((k) => k.pos);
      await api.setTrigger(chosen, settings);
      if (id !== request.current) return;
      await load();
    } catch (e) {
      if (id !== request.current) return;
      setStatus("Não foi possível aplicar o acionamento. Tente novamente.");
      onError(e);
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  const update = (patch: Partial<TriggerSettings>) => setSettings({ ...settings, ...patch });

  return (
    <div className="page">
      <div className="actions">
        <p className="muted" role="status">{status}</p>
        <button type="button" className="ghost" onClick={load} disabled={busy}>
          <Icon name="refresh" /> Ler acionamento do teclado
        </button>
      </div>
      <fieldset disabled={busy || loadFailed || current.size !== keys.length} aria-label="Seleção de teclas">
        <Panel
          title="Teclas"
          actions={
            <div className="actions">
              <button type="button" className="ghost" onClick={() => {
                setSelected(new Set(keys.map((k) => posId(k.pos))));
                if (selected.size === 0) setSettings(current.get(posId(keys[0].pos))!);
              }}>
                Selecionar todas
              </button>
              <button type="button" className="ghost" onClick={() => setSelected(new Set())}>Limpar</button>
            </div>
          }
        >
          <Keyboard keys={keys} selected={selected} onToggle={toggle}
            caption={(k) => { const t = current.get(posId(k.pos)); return t && mm(t.press); }} />
          <p className="muted">Use clique, Tab + Espaço ou Enter para escolher; segure Shift ou Ctrl para selecionar várias.</p>
        </Panel>
      </fieldset>
      <fieldset disabled={busy || loadFailed || current.size !== keys.length || selected.size === 0} aria-label="Ajustes de acionamento">
        <Panel
          title={`Acionamento${selected.size ? ` · ${selected.size} tecla(s)` : ""}`}
          actions={
            <button type="button" className="primary" onClick={apply}>
              <Icon name="check" /> Aplicar
            </button>
          }
        >
          <p className="muted">{selected.size > 1
            ? "Ao aplicar, todas as teclas selecionadas receberão os valores abaixo."
            : selected.size === 0 ? "Selecione uma tecla para editar seus valores." : "Valores da tecla selecionada."}</p>
          <div className="columns">
            <div>
              <Slider label="Ponto de acionamento" value={settings.press} min={1} max={40} format={mm}
                onChange={(press) => update({ press })} />
              <Toggle label="Soltura separada" hint="Define um ponto diferente para soltar a tecla."
                checked={settings.separate} onChange={(separate) => update({ separate })} />
              {settings.separate && (
                <Slider label="Ponto de soltura" value={settings.release} min={1} max={40} format={mm}
                  onChange={(release) => update({ release })} />
              )}
            </div>
            <div>
              <Toggle label="Quick Trigger" hint="Aciona e solta pelo movimento da tecla, em qualquer profundidade."
                checked={settings.quick_trigger} onChange={(quick_trigger) => update({ quick_trigger })} />
              {settings.quick_trigger && (
                <>
                  <Slider label="Sensibilidade ao pressionar" value={settings.qt_press} min={1} max={40} format={mm}
                    onChange={(qt_press) => update({ qt_press })} />
                  <Slider label="Sensibilidade ao soltar" value={settings.qt_release} min={1} max={40} format={mm}
                    onChange={(qt_release) => update({ qt_release })} />
                </>
              )}
            </div>
          </div>
        </Panel>
      </fieldset>
    </div>
  );
}
