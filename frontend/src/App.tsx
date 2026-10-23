import { useEffect, useRef, useState } from "react";
import { api, DeviceInfo, Key } from "./api";
import { Lighting } from "./Lighting";
import { Trigger } from "./Trigger";
import { Icon, IconName } from "./ui";

type View = "lighting" | "trigger";
const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: "lighting", label: "Iluminação", icon: "light" },
  { id: "trigger", label: "Acionamento", icon: "gauge" },
];

export default function App() {
  const [view, setView] = useState<View>("lighting");
  const [keys, setKeys] = useState<Key[]>([]);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [session, setSession] = useState(0);
  const request = useRef(0);
  const reportError = (e: unknown) => setError(e == null ? null : String(e));

  const connect = async () => {
    const id = ++request.current;
    setConnecting(true);
    setError(null);
    try {
      const [layout, info] = await Promise.all([api.layout(), api.deviceInfo()]);
      if (id !== request.current) return;
      setKeys(layout);
      setDevice(info);
      setSession((value) => value + 1);
    } catch (e) {
      if (id !== request.current) return;
      setDevice(null);
      setError(String(e));
    } finally {
      if (id === request.current) setConnecting(false);
    }
  };
  useEffect(() => {
    void connect();
    return () => { request.current++; };
  }, []);

  return (
    <div className="shell">
      <a className="skip-link" href="#content">Ir para o conteúdo</a>
      <aside className="sidebar">
        <div className="brand">
          <Icon name="keyboard" />
          <div>
            <strong>BoyiLin66</strong>
            <small>BOYI 66 Pro</small>
          </div>
        </div>
        <nav aria-label="Configurações do teclado">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={`nav-item ${view === v.id ? "active" : ""}`}
              aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
              <Icon name={v.icon} /> {v.label}
            </button>
          ))}
        </nav>
        <div className={`status ${device && !error ? "ok" : "off"}`} role="status">
          <span className="dot" aria-hidden="true" />
          {connecting ? <span>Conectando…</span> : error && device ? (
            <span>Última operação falhou</span>
          ) : device ? (
            <span title={device.serial}>Conectado · {device.path}</span>
          ) : (
            <button type="button" className="link" onClick={connect}>Desconectado · tentar de novo</button>
          )}
        </div>
      </aside>
      <main className="content" id="content" tabIndex={-1}>
        <header className="topbar">
          <h1>{VIEWS.find((v) => v.id === view)!.label}</h1>
          <button type="button" className="ghost" onClick={connect} disabled={connecting}>
            <Icon name="refresh" /> {connecting ? "Conectando…" : "Reconectar"}
          </button>
        </header>
        {error && (
          <div className="banner" role="alert">
            <Icon name="info" /> <span>{error}. Verifique a conexão e as permissões USB; tente novamente ou reconecte.</span>
            <button type="button" className="link" onClick={() => setError(null)}>Fechar</button>
          </div>
        )}
        {connecting ? <p className="page muted" role="status">Conectando ao teclado…</p> : !device ? (
          <p className="page muted">Conecte o BOYI 66 Pro por USB e use Reconectar para carregar as configurações.</p>
        ) : keys.length > 0 && (
          view === "lighting"
            ? <Lighting key={session} keys={keys} onError={reportError} />
            : <Trigger key={session} keys={keys} onError={reportError} />
        )}
      </main>
    </div>
  );
}
