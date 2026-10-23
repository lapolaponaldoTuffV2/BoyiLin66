import { useEffect, useId, useRef, useState } from "react";
import { api, Performance as Timing } from "./api";
import { Icon, Panel } from "./ui";

const RATES = [1, 2, 4, 8];

/** Keyboard-wide debounce and report rate, plus the factory sensitivity reset. Writes are beta. */
export function Performance({ onError, onReset }: { onError: (e: unknown) => void; onReset: () => void }) {
  const [value, setValue] = useState<Timing | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Lendo desempenho…");
  const request = useRef(0);
  const id = useId();

  const run = async (label: string, done: string, failed: string, action: () => Promise<void>) => {
    const call = ++request.current;
    setBusy(true);
    setStatus(label);
    try {
      await action();
      if (call !== request.current) return;
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
  const load = () => run("Lendo desempenho…", "Desempenho lido do teclado.", "Não foi possível ler o desempenho.",
    async () => setValue(await api.getPerformance()));
  useEffect(() => {
    void load();
    return () => { request.current++; };
  }, []);

  const apply = () => value && run("Aplicando desempenho…", "Desempenho aplicado e conferido no teclado.",
    "Não foi possível aplicar o desempenho.", async () => setValue(await api.setPerformance(value)));
  const reset = () => {
    if (!window.confirm("Restaurar a sensibilidade de fábrica? Os pontos de acionamento, soltura e Quick Trigger de todas as teclas voltam ao padrão.")) return;
    void run("Restaurando sensibilidade…", "Sensibilidade restaurada. Relendo as teclas…",
      "Não foi possível restaurar a sensibilidade.", async () => { await api.resetSensitivity(); onReset(); });
  };

  return (
    <Panel title="Desempenho" actions={
      <div className="actions">
        <button type="button" className="ghost" disabled={busy} onClick={reset}>Restaurar sensibilidade de fábrica</button>
        <button type="button" className="primary" aria-label="Aplicar desempenho" disabled={busy || !value} onClick={apply}>
          <Icon name="check" /> Aplicar
        </button>
      </div>
    }>
      <p className="muted" role="status">{status}</p>
      {!value && !busy && <button type="button" className="ghost read-button" onClick={load}>Tentar novamente</button>}
      {value && <fieldset className="remap-fields" disabled={busy} aria-label="Desempenho do teclado">
        <p className="notice"><strong className="badge">beta</strong> A leitura foi confirmada no teclado; gravar estes
          ajustes e restaurar a sensibilidade ainda não.</p>
        <label><span id={`${id}-debounce`}>Anti-repique (debounce)</span>
          <select aria-labelledby={`${id}-debounce`} aria-describedby={`${id}-debounce-hint`} value={value.debounce}
            onChange={(e) => setValue({ ...value, debounce: Number(e.target.value) })}>
            {Array.from({ length: 8 }, (_, level) => <option key={level} value={level}>Nível {level}</option>)}
          </select>
          <small id={`${id}-debounce-hint`} className="muted">Quanto a tecla precisa ficar pressionada para contar.
            Níveis maiores evitam acionamentos acidentais, com um pouco mais de atraso.</small>
        </label>
        <label><span id={`${id}-rate`}>Taxa de relatório</span>
          <select aria-labelledby={`${id}-rate`} value={value.report_rate_khz}
            onChange={(e) => setValue({ ...value, report_rate_khz: Number(e.target.value) })}>
            {RATES.map((khz) => <option key={khz} value={khz}>{khz * 1000} Hz</option>)}
          </select>
        </label>
      </fieldset>}
    </Panel>
  );
}
