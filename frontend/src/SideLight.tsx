import { useEffect, useId, useRef, useState } from "react";
import { api, SIDE_MODES, SideLight } from "./api";
import { fromHex, Icon, Panel, Slider, toHex } from "./ui";

const NAMES: Record<SideLight["mode"], string> = {
  Static: "Estático", Breath: "Respiração", Wave: "Onda", Collision: "Colisão", Neon: "Neon", Off: "Desligada",
};

/** The side light strip. Reading is confirmed on hardware; writing is beta. */
export function SideLightPanel({ onError }: { onError: (e: unknown) => void }) {
  const [side, setSide] = useState<SideLight | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Lendo luz lateral…");
  const request = useRef(0);
  const id = useId();

  const run = async (label: string, done: string, failed: string, action: () => Promise<SideLight>) => {
    const call = ++request.current;
    setBusy(true);
    setStatus(label);
    try {
      const value = await action();
      if (call !== request.current) return;
      setSide(value);
      setStatus(done);
      onError(null);
    } catch (e) {
      if (call !== request.current) return;
      setStatus(failed);
      onError(e);
    } finally {
      if (call === request.current) setBusy(false);
    }
  };
  const load = () => run("Lendo luz lateral…", "Luz lateral lida do teclado.", "Não foi possível ler a luz lateral.", api.getSideLight);
  useEffect(() => {
    void load();
    return () => { request.current++; };
  }, []);
  const update = (patch: Partial<SideLight>) => setSide((value) => value && { ...value, ...patch });
  const apply = () => side && run("Aplicando luz lateral…", "Luz lateral aplicada e conferida no teclado.",
    "Não foi possível aplicar a luz lateral.", () => api.setSideLight(side));

  return (
    <Panel title="Luz lateral" actions={
      <button type="button" className="primary" aria-label="Aplicar luz lateral" disabled={busy || !side} onClick={apply}>
        <Icon name="check" /> Aplicar
      </button>
    }>
      <p className="muted" role="status">{status}</p>
      {!side && !busy && <button type="button" className="ghost read-button" onClick={load}>Tentar novamente</button>}
      {side && <fieldset className="remap-fields" disabled={busy} aria-label="Luz lateral">
        <p className="notice"><strong className="badge">beta</strong> A leitura foi confirmada no teclado; a gravação ainda não.</p>
        <label><span id={`${id}-mode`}>Efeito</span>
          <select aria-labelledby={`${id}-mode`} value={side.mode} onChange={(e) => update({ mode: e.target.value as SideLight["mode"] })}>
            {SIDE_MODES.map((mode) => <option key={mode} value={mode}>{NAMES[mode]}</option>)}
          </select>
        </label>
        {side.mode !== "Off" && <>
          <label className="color-field">
            Cor da luz lateral
            <input type="color" aria-label="Cor da luz lateral" value={toHex(side.color)} onChange={(e) => update({ color: fromHex(e.target.value) })} />
            <code>{toHex(side.color).toUpperCase()}</code>
          </label>
          <Slider label="Brilho da luz lateral" value={side.brightness} min={0} max={4} onChange={(brightness) => update({ brightness })} />
          <Slider label="Velocidade da luz lateral" value={side.speed} min={0} max={4} onChange={(speed) => update({ speed })} />
        </>}
      </fieldset>}
    </Panel>
  );
}
