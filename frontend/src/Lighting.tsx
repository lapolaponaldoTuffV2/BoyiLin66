import { useEffect, useState } from "react";
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
  const [saving, setSaving] = useState(false);

  const load = () => api.getLed().then(setConfig, onError);
  useEffect(() => void load(), []);

  if (!config) return <p className="muted">Lendo iluminação…</p>;
  const update = (patch: Partial<LedConfig>) => setConfig({ ...config, ...patch });

  const apply = async () => {
    setSaving(true);
    try {
      setConfig(await api.setLed(config));
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <Panel title="Pré-visualização">
        <Keyboard keys={keys} tint={toHex(config.color)} />
      </Panel>
      <div className="columns">
        <Panel title="Efeito">
          <div className="mode-grid" role="radiogroup" aria-label="Efeito de iluminação">
            {LED_MODES.map((mode) => (
              <button key={mode} type="button" role="radio" aria-checked={config.mode === mode}
                className={`mode ${config.mode === mode ? "active" : ""}`} onClick={() => update({ mode })}>
                {MODE_NAMES[mode]}
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title="Ajustes"
          actions={
            <div className="actions">
              <button type="button" className="ghost" onClick={load} title="Ler do teclado">
                <Icon name="refresh" />
              </button>
              <button type="button" className="primary" onClick={apply} disabled={saving}>
                <Icon name="check" /> {saving ? "Aplicando…" : "Aplicar"}
              </button>
            </div>
          }
        >
          <label className="color-field">
            Cor
            <input type="color" value={toHex(config.color)} onChange={(e) => update({ color: fromHex(e.target.value) })} />
            <code>{toHex(config.color).toUpperCase()}</code>
          </label>
          <Slider label="Brilho" value={config.brightness} min={0} max={4} onChange={(brightness) => update({ brightness })} />
          <Slider label="Velocidade" value={config.speed} min={0} max={4} onChange={(speed) => update({ speed })} />
        </Panel>
      </div>
    </div>
  );
}
