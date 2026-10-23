import { useEffect, useState } from "react";
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

  const connect = () => {
    setError(null);
    api.deviceInfo().then(setDevice, (e) => { setDevice(null); setError(String(e)); });
  };
  useEffect(() => {
    api.layout().then(setKeys);
    connect();
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Icon name="keyboard" />
          <div>
            <strong>BoyiLin66</strong>
            <small>BOYI 66 Pro</small>
          </div>
        </div>
        <nav>
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={`nav-item ${view === v.id ? "active" : ""}`}
              aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
              <Icon name={v.icon} /> {v.label}
            </button>
          ))}
        </nav>
        <div className={`status ${device ? "ok" : "off"}`}>
          <span className="dot" aria-hidden="true" />
          {device ? (
            <span title={device.serial}>Conectado · {device.path}</span>
          ) : (
            <button type="button" className="link" onClick={connect}>Desconectado · tentar de novo</button>
          )}
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <h1>{VIEWS.find((v) => v.id === view)!.label}</h1>
        </header>
        {error && (
          <div className="banner" role="alert">
            <Icon name="info" /> {error}
            <button type="button" className="link" onClick={() => setError(null)}>Fechar</button>
          </div>
        )}
        {device && keys.length > 0 && (
          view === "lighting"
            ? <Lighting keys={keys} onError={(e) => setError(String(e))} />
            : <Trigger keys={keys} onError={(e) => setError(String(e))} />
        )}
      </main>
    </div>
  );
}
