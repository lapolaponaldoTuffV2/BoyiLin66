import { useEffect, useState } from "react";
import { api, Key, posId, TriggerSettings } from "./api";
import { Keyboard } from "./Keyboard";
import { Icon, Panel, Slider, Toggle } from "./ui";

const mm = (v: number) => `${(v / 10).toFixed(1)} mm`;
const DEFAULT: TriggerSettings = { press: 10, release: 10, separate: false, quick_trigger: false, qt_press: 5, qt_release: 5 };

export function Trigger({ keys, onError }: { keys: Key[]; onError: (e: unknown) => void }) {
  const [current, setCurrent] = useState<Map<string, TriggerSettings>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<TriggerSettings>(DEFAULT);
  const [busy, setBusy] = useState(false);

  // One request per key; the firmware has no bulk read.
  const load = async () => {
    setBusy(true);
    try {
      const all = new Map<string, TriggerSettings>();
      for (const key of keys) all.set(posId(key.pos), await api.getKeyTrigger(key.pos));
      setCurrent(all);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => void load(), [keys]);

  const toggle = (key: Key, additive: boolean) => {
    const id = posId(key.pos);
    const next = new Set(additive ? selected : []);
    if (selected.has(id) && (additive || selected.size === 1)) next.delete(id);
    else next.add(id);
    setSelected(next);
    const first = current.get(id);
    if (next.size === 1 && first) setSettings(first);
  };

  const apply = async () => {
    setBusy(true);
    try {
      const chosen = keys.filter((k) => selected.has(posId(k.pos))).map((k) => k.pos);
      await api.setTrigger(chosen, settings);
      await load();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const update = (patch: Partial<TriggerSettings>) => setSettings({ ...settings, ...patch });

  return (
    <div className="page">
      <Panel
        title="Teclas"
        actions={
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setSelected(new Set(keys.map((k) => posId(k.pos))))}>
              Selecionar todas
            </button>
            <button type="button" className="ghost" onClick={() => setSelected(new Set())}>Limpar</button>
          </div>
        }
      >
        <Keyboard keys={keys} selected={selected} onToggle={toggle}
          caption={(k) => { const t = current.get(posId(k.pos)); return t && mm(t.press); }} />
        <p className="muted">Clique para escolher uma tecla; Shift ou Ctrl + clique adiciona várias.</p>
      </Panel>
      <Panel
        title={`Acionamento${selected.size ? ` · ${selected.size} tecla(s)` : ""}`}
        actions={
          <button type="button" className="primary" onClick={apply} disabled={busy || selected.size === 0}>
            <Icon name="check" /> {busy ? "Aguarde…" : "Aplicar"}
          </button>
        }
      >
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
    </div>
  );
}
