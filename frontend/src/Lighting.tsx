import { useEffect, useId, useRef, useState } from "react";
import { api, Key, KeyColors, LED_MODES, LedConfig, LedMode, posId } from "./api";
import { Keyboard } from "./Keyboard";
import { keyIndex } from "./keymap";
import { fromHex, Icon, Panel, Slider, toHex } from "./ui";

const MODE_NAMES: Record<LedMode, string> = {
  Static: "Estático", Breath: "Respiração", Wave: "Onda", Neon: "Neon", Radar: "Radar", Snake: "Cobra",
  Reactive: "Reativo", Aurora: "Aurora", Ripple: "Ondulação", Twinkle: "Cintilar", Custom: "Personalizado",
  Cross: "Cruz", SpeedRespond: "Resposta rápida", AutoRipple: "Ondulação auto", Striation: "Estrias",
  Fireworks: "Fogos", MusicRhythm: "Ritmo musical",
};

const WHITE: KeyColors = Array.from({ length: 132 }, () => [255, 255, 255]);

export function Lighting({ keys, onError }: { keys: Key[]; onError: (e: unknown) => void }) {
  const [config, setConfig] = useState<LedConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("Lendo iluminação…");
  const [colors, setColors] = useState<KeyColors | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paint, setPaint] = useState("#ffffff");
  const request = useRef(0);
  const modeGroup = useId();

  const load = async () => {
    const id = ++request.current;
    setBusy(true);
    setStatus("Lendo iluminação…");
    try {
      // A broken local copy of the colours must not block the rest of the page.
      const [value, saved] = await Promise.all([api.getLed(), api.getKeyColors().catch(() => null)]);
      if (id !== request.current) return;
      setConfig(value);
      setColors(saved ?? WHITE);
      setLoadFailed(false);
      onError(null);
      setStatus(saved ? "Iluminação lida do teclado."
        : "Iluminação lida do teclado. A cópia local das cores por tecla é inválida; usando branco.");
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
  const custom = config?.mode === "Custom";

  const toggle = (key: Key, additive: boolean) => {
    const id = posId(key.pos);
    const next = new Set(additive ? selected : []);
    if (selected.has(id) && (additive || selected.size === 1)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (next.size === 1 && colors) setPaint(toHex(colors[keyIndex(key.pos)]));
  };
  const paintSelected = (hex: string) => {
    const chosen = new Set(keys.filter((key) => selected.has(posId(key.pos))).map((key) => keyIndex(key.pos)));
    setPaint(hex);
    setColors((value) => value && value.map((rgb, index) => chosen.has(index) ? fromHex(hex) : rgb));
  };

  const apply = async () => {
    if (!config || busy || loadFailed || config.mode === "MusicRhythm") return;
    const id = ++request.current;
    setBusy(true);
    setStatus(custom ? "Aplicando cores por tecla e iluminação…" : "Aplicando iluminação…");
    try {
      if (custom && colors) {
        await api.setKeyColors(colors);
        if (id !== request.current) return;
      }
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
        {custom && colors ? <Panel title="Cores por tecla" actions={
          <div className="actions">
            <button type="button" className="ghost" disabled={busy} onClick={() => setSelected(new Set(keys.map((key) => posId(key.pos))))}>
              Selecionar todas
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => setSelected(new Set())}>Limpar</button>
          </div>
        }>
          <fieldset disabled={busy || loadFailed} aria-label="Cores por tecla">
            <Keyboard keys={keys} selected={selected} onToggle={toggle} colorOf={(key) => toHex(colors[keyIndex(key.pos)])} />
            <label className="color-field">
              Cor das teclas selecionadas
              <input type="color" aria-label="Cor das teclas selecionadas" value={paint} disabled={!selected.size}
                onChange={(e) => paintSelected(e.target.value)} />
              <code>{paint.toUpperCase()}</code>
            </label>
          </fieldset>
          <p className="muted">O teclado não informa as cores por tecla: esta é a última cópia salva pelo app, ou tudo
            branco quando ainda não há cópia. Clique para escolher; Shift ou Ctrl seleciona várias. As cores são gravadas ao aplicar.</p>
        </Panel> : <Panel title="Pré-visualização">
          <Keyboard keys={keys} tint={toHex(config.color)} />
          <p className="muted">Prévia da cor; o efeito é exibido no teclado após aplicar.</p>
        </Panel>}
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
            {!custom && <label className="color-field">
              Cor
              <input type="color" aria-label="Cor" value={toHex(config.color)} onChange={(e) => update({ color: fromHex(e.target.value) })} />
              <code>{toHex(config.color).toUpperCase()}</code>
            </label>}
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
