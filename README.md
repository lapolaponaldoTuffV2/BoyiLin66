<p align="center">
  <img src="docs/logo.png" width="96" alt="BoyiLin66">
</p>

<h1 align="center">BoyiLin66</h1>

<p align="center">
  Configurador de código aberto para o teclado magnético <b>BOYI 66 Pro</b> no Linux.
  <br><br>
  <img src="https://img.shields.io/badge/plataforma-Linux-615be8" alt="Plataforma">
  <img src="https://img.shields.io/badge/Tauri-2-24c8db" alt="Tauri 2">
  <img src="https://img.shields.io/badge/licen%C3%A7a-MIT-64c7a0" alt="Licença MIT">
</p>

O software oficial do BOYI 66 Pro só existe para Windows. O BoyiLin66 conversa
direto com o teclado pelo `hidraw` do Linux: sem drivers, sem Wine, sem
serviço rodando em segundo plano. Tudo o que você configura fica salvo no
próprio teclado.

## Recursos

| | Status |
|---|---|
| Iluminação: efeito, cor, brilho e velocidade | ✅ |
| Ponto de acionamento por tecla (0,1 – 4,0 mm) | ✅ |
| Ponto de soltura separado | ✅ |
| Quick Trigger (rapid trigger) | ✅ |
| Remapeamento: teclas, atalhos (Ctrl+C…), multimídia, desativar | ✅ |
| Remapeamento: botões e rolagem do mouse | 🧪 beta |
| DKS, Mod-Tap e Toggle (até 40 teclas) | ✅ |
| RGB por tecla (efeito Personalizado) | ✅ |
| Macros: gravar teclas e pausas, repetir, liga/desliga, enquanto segurar (até 10) | ✅ |
| Calibração | 🚧 |
| Luz lateral, trava do Win, tempo de repouso | 🚧 |

O teclado não informa o próprio mapa de teclas, então o app guarda uma cópia
do último mapa gravado. Veja o [roadmap](docs/ROADMAP.md) para os detalhes.

Atualização de firmware está fora do escopo de propósito: um erro ali pode
inutilizar o teclado.

## Instalação

### 1. Permissão de acesso ao teclado

Sem isso só o root consegue abrir o dispositivo. Os pacotes `.deb` e `.rpm`
já instalam a regra; no AppImage ou compilando do código-fonte, rode uma vez:

```bash
sudo cp udev/70-boyilin66.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger
```

### 2. Compilar

Requisitos: Rust estável, Node.js 20+ e as
[dependências de sistema do Tauri](https://v2.tauri.app/start/prerequisites/#linux).

```bash
git clone https://github.com/lapolaponaldoTuffV2/BoyiLin66.git
cd BoyiLin66
npm --prefix frontend install
npm run tauri dev       # abre o app em modo desenvolvimento
npm run tauri build     # gera AppImage, .deb e .rpm em target/release/bundle
```

## Estrutura

```
crates/boyi-protocol   protocolo em Rust puro: frames, comandos, acesso ao hidraw
src-tauri              app Tauri: expõe o protocolo para a interface
frontend               interface em React + TypeScript
udev                   regra de permissão
docs/protocol.md       documentação do protocolo
docs/ROADMAP.md        o que está pronto e o que falta
AGENTS.md              guia para quem for contribuir (pessoas ou agentes)
```

A crate `boyi-protocol` não depende do Tauri e pode ser usada sozinha:

```rust
use boyi_protocol::{Keyboard, led::{LedConfig, LedMode}};

let kb = Keyboard::open_first()?;
kb.set_led(&LedConfig { mode: LedMode::Static, brightness: 4, speed: 2, color: [255, 0, 0] })?;
```

Para ver o estado do teclado sem alterar nada:

```bash
cargo run -p boyi-protocol --example info
```

## Desenvolvimento

```bash
cargo test --workspace                 # testes do protocolo e do app (não precisam do teclado)
npm run build                          # checagem de tipos e build da interface
npm --prefix frontend run test:ui      # testes da interface (Playwright, IPC simulado)
```

Para restaurar o mapa de teclas de fábrica (desfaz qualquer remapeamento):

```bash
cargo run -p boyi-protocol --example restore_keymap
```

Cada comando novo entra no protocolo só depois de testado num teclado real, e
ganha um teste com os bytes capturados. Veja [`docs/protocol.md`](docs/protocol.md).

## Aviso

Projeto independente, sem relação com a BOYI. Ele foi escrito do zero a partir
da observação do protocolo USB do teclado. Nenhum código, imagem ou recurso
do software oficial está incluído aqui. Use por sua conta e risco.

## Licença

[MIT](LICENSE)
