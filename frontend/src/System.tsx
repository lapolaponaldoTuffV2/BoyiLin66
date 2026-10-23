import { useEffect, useId, useRef, useState } from "react";
import { api, Sleep, WinLock } from "./api";
import { Icon, Panel, Toggle } from "./ui";

const WIN_LOCK: { key: keyof WinLock; label: string }[] = [
  { key: "windows", label: "Tecla Windows" }, { key: "alt_tab", label: "Alt + Tab" },
  { key: "shift_tab", label: "Shift + Tab" }, { key: "alt_f4", label: "Alt + F4" },
];

/** Same limits as the keyboard: it sleeps after 5–1000 minutes, the light no later than the keyboard. */
export function sleepProblem(s: Sleep): string | null {
  if (!Number.isInteger(s.keyboard_s) || s.keyboard_s < 300 || s.keyboard_s > 60000) return "O teclado precisa dormir após 5 a 1000 minutos.";
  if (!Number.isInteger(s.light_s) || s.light_s < 0 || s.light_s > s.keyboard_s) return "A luz não pode apagar depois que o teclado dorme.";
  return null;
}

export function System({ onError }: { onError: (e: unknown) => void }) {
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const [winLock, setWinLock] = useState<WinLock | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Lendo sistema…");
  const request = useRef(0);
  const id = useId();
  const problem = sleep && !sleep.never ? sleepProblem(sleep) : null;

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
  const load = () => run("Lendo sistema…", "Repouso lido do teclado; trava do Win da cópia local.",
    "Não foi possível ler o sistema. Tente novamente.", async () => {
      const [s, w] = await Promise.all([api.getSleep(), api.getWinLock()]);
      setSleep(s);
      setWinLock(w);
    });
  useEffect(() => {
    void load();
    return () => { request.current++; };
  }, []);

  const applySleep = () => sleep && !problem && run("Aplicando repouso…", "Repouso aplicado e conferido no teclado.",
    "Não foi possível aplicar o repouso.", async () => setSleep(await api.setSleep(sleep)));
  const applyWinLock = () => winLock && run("Aplicando trava do Win…", "Trava do Win aplicada e cópia local salva.",
    "Não foi possível aplicar a trava do Win. O teclado pode não ter mudado.", () => api.setWinLock(winLock));
  const number = (value: string, scale: number) => Math.round(Number(value) * scale) || 0;

  return (
    <div className="page">
      <p className="muted" role="status">{status}</p>
      {(!sleep || !winLock) && !busy && <button type="button" className="ghost read-button" onClick={load}>Tentar novamente</button>}
      {sleep && <Panel title="Repouso" actions={
        <button type="button" className="primary" aria-label="Aplicar repouso" disabled={busy || !!problem} onClick={applySleep}>
          <Icon name="check" /> Aplicar
        </button>
      }>
        <fieldset className="remap-fields" disabled={busy} aria-label="Repouso">
          <p className="notice"><strong className="badge">beta</strong> A leitura foi confirmada no teclado; a gravação ainda não.</p>
          <Toggle label="Nunca dormir" checked={sleep.never} onChange={(never) => setSleep({ ...sleep, never })} />
          {!sleep.never && <>
            <label><span id={`${id}-light`}>Luz apaga após (segundos, 0–60000)</span>
              <input type="number" aria-labelledby={`${id}-light`} min={0} max={60000} value={sleep.light_s}
                onChange={(e) => setSleep({ ...sleep, light_s: number(e.target.value, 1) })} />
            </label>
            <label><span id={`${id}-keyboard`}>Teclado dorme após (minutos, 5–1000)</span>
              <input type="number" aria-labelledby={`${id}-keyboard`} min={5} max={1000} value={Math.round(sleep.keyboard_s / 60)}
                onChange={(e) => setSleep({ ...sleep, keyboard_s: number(e.target.value, 60) })} />
            </label>
          </>}
        </fieldset>
        {problem && <p className="notice" role="alert">{problem}</p>}
      </Panel>}
      {winLock && <Panel title="Trava do Win" actions={
        <button type="button" className="primary" aria-label="Aplicar trava do Win" disabled={busy} onClick={applyWinLock}>
          <Icon name="check" /> Aplicar
        </button>
      }>
        <fieldset className="remap-fields" disabled={busy} aria-label="Trava do Win">
          <p className="notice"><strong className="badge">beta</strong> Gravação ainda não confirmada no teclado. O teclado
            não informa estas opções: esta é a última cópia salva pelo app.</p>
          <p className="muted">Com a trava do Win ligada (pelo atalho do teclado), bloquear:</p>
          {WIN_LOCK.map(({ key, label }) => <Toggle key={key} label={label} checked={winLock[key]}
            onChange={(checked) => setWinLock({ ...winLock, [key]: checked })} />)}
        </fieldset>
      </Panel>}
    </div>
  );
}
