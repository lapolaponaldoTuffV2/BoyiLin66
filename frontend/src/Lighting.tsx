import { useEffect, useId, useRef, useState } from "react";
import { api, Key, LED_MODES, LedConfig, LedMode } from "./api";
import { Keyboard } from "./Keyboard";
import { Icon, Panel, Slider } from "./ui";

const MODE_NAMES: Record<LedMode, string> = {
  Static: "Estático", Breath: "Respiração", Wave: "Onda", Neon: "Neon", Radar: "Radar", Snake: "Cobra",
  Reactive: "Reativo", Aurora: "Aurora", Ripple: "Ondulação", Twinkle: "Cintilar", Custom: "Personalizado",
  Cross: "Cruz", SpeedRespond: "Resposta rápida", AutoRipple: "Ondulação auto", Striation: "Estrias",
  Fireworks: "Fogos", MusicRhythm: "Ritmo musical",
};

const toHex = (c: number[]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as LedConfig["color"];

export function Lighting({ keys, onError }: { keys: Key[]; onError: (e: unknown) => void }) {
  const [config, setConfig] = useState<LedConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("Lendo iluminação…");
  const request = useRef(0);
  const modeGroup = useId();

  const load = async () => {
    const id = ++request.current;
    setBusy(true);
    setStatus("Lendo iluminação…");
    try {
      const value = await api.getLed();
      if (id !== request.current) return;
      setConfig(value);
      setLoadFailed(false);
      onError(null);
      setStatus("Iluminação lida do teclado.");
    } catch (e) {
      if (id !== request.current) return;
      setLoadFailed(true);
      setStatus("Não foi possível ler a iluminação. Tente novamente.");
      onError(e);
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { request.current++; };
  }, []);

  const update = (patch: Partial<LedConfig>) => setConfig((value) => value && { ...value, ...patch });

  const apply = async () => {
    if (!config || busy || loadFailed || config.mode === "MusicRhythm") return;
    const id = ++request.current;
    setBusy(true);
    setStatus("Aplicando iluminação…");
    try {
      const value = await api.setLed(config);
      if (id !== request.current) return;
      setConfig(value);
      onError(null);
      setStatus("Iluminação aplicada.");
    } catch (e) {
      if (id !== request.current) return;
      setStatus("Não foi possível aplicar a iluminação. Tente novamente.");
      onError(e);
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="actions">
        <p className="muted" role="status">{status}</p>
        {!config && loadFailed && <button type="button" className="ghost" onClick={load} disabled={busy}>Tentar novamente</button>}
      </div>
      {config && <>
        <Panel title="Pré-visualização">
          <Keyboard keys={keys} tint={toHex(config.color)} />
          <p className="muted">Prévia da cor; o efeito é exibido no teclado após aplicar.</p>
        </Panel>
        <fieldset className="columns" disabled={busy || loadFailed} aria-label="Iluminação">
          <Panel title="Efeito">
            <div className="mode-grid" role="radiogroup" aria-label="Efeito de iluminação">
              {LED_MODES.filter((mode) => mode !== "MusicRhythm").map((mode) => (
                <label key={mode} className={`mode ${config.mode === mode ? "active" : ""}`}>
                  <input type="radio" name={modeGroup} value={mode} checked={config.mode === mode}
                    onChange={() => update({ mode })} />
                  <span>{MODE_NAMES[mode]}</span>
                </label>
              ))}
            </div>
            {config.mode === "MusicRhythm" && <p className="muted">Ritmo musical não é compatível. Escolha outro efeito.</p>}
          </Panel>
          <Panel
            title="Ajustes"
            actions={
              <button type="button" className="primary" onClick={apply} disabled={config.mode === "MusicRhythm"}>
                <Icon name="check" /> Aplicar
              </button>
            }
          >
            <label className="color-field">
              Cor
              <input type="color" aria-label="Cor" value={toHex(config.color)} onChange={(e) => update({ color: fromHex(e.target.value) })} />
              <code>{toHex(config.color).toUpperCase()}</code>
            </label>
            <Slider label="Brilho" value={config.brightness} min={0} max={4} onChange={(brightness) => update({ brightness })} />
            <Slider label="Velocidade" value={config.speed} min={0} max={4} onChange={(speed) => update({ speed })} />
          </Panel>
        </fieldset>
        <button type="button" className="ghost read-button" onClick={load} disabled={busy}>
          <Icon name="refresh" /> Ler iluminação do teclado
        </button>
      </>}
    </div>
  );
}
