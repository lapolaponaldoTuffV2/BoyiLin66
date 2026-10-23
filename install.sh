#!/usr/bin/env bash
# Instalador do BoyiLin66 (AppImage) para Linux. Rodar de novo atualiza para a última versão:
#   curl -fsSL https://raw.githubusercontent.com/lapolaponaldoTuffV2/BoyiLin66/main/install.sh | bash
#   ./install.sh caminho/BoyiLin66.AppImage     # instala um AppImage já baixado ou compilado
#   ./install.sh --uninstall
set -euo pipefail
repo="lapolaponaldoTuffV2/BoyiLin66"
raw="https://raw.githubusercontent.com/$repo/main"
bin_dir="${XDG_BIN_HOME:-$HOME/.local/bin}"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
app="$bin_dir/boyilin66"
desktop="$data_dir/applications/boyilin66.desktop"
icon="$data_dir/icons/hicolor/128x128/apps/boyilin66.png"
rule="/etc/udev/rules.d/70-boyilin66.rules"
here="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merro:\033[0m %s\n' "$*" >&2; exit 1; }
# A file from this checkout when the script runs from one, otherwise from GitHub.
fetch() {
  if [ -f "$here/$1" ]; then cp "$here/$1" "$2"; else curl -fsSL -o "$2" "$raw/$1"; fi
}

[ "$(uname -s)" = Linux ] || die "o BoyiLin66 só roda no Linux"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f -- "$app" "$desktop" "$icon"
  if [ -f "$rule" ]; then
    say "Removendo a regra udev (pede a senha de administrador)"
    sudo rm -f -- "$rule" && sudo udevadm control --reload-rules
  fi
  say "BoyiLin66 removido. As cópias locais do mapa e das cores ficam em ~/.local/share/io.github.lapolaponaldotuffv2.boyilin66"
  exit 0
fi

if [ -n "${1:-}" ]; then
  [ -f "$1" ] || die "arquivo não encontrado: $1"
  cp -- "$1" "$tmp/boyilin66"
else
  [ "$(uname -m)" = x86_64 ] || die "somente x86_64 tem build pronto; compile pelo README"
  command -v curl >/dev/null || die "curl não encontrado"
  say "Procurando a última versão"
  release="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest")" \
    || die "não foi possível consultar as releases (o repositório ainda é privado?)"
  url="$(printf '%s' "$release" | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | head -n1 | sed 's/.*"\(https[^"]*\)"/\1/')"
  [ -n "$url" ] || die "a última release não tem AppImage"
  tag="$(printf '%s' "$release" | grep -o '"tag_name": *"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')"
  sums="$(printf '%s' "$release" | grep -o '"browser_download_url": *"[^"]*SHA256SUMS"' | head -n1 | sed 's/.*"\(https[^"]*\)"/\1/')"
  [ -n "$sums" ] || die "a última release não tem SHA256SUMS"
  expected="$(curl -fsSL "$sums" | grep " $(basename "$url")\$" | cut -d' ' -f1)"
  [ -n "$expected" ] || die "o SHA256SUMS não lista $(basename "$url")"
  if [ -f "$app" ] && [ "$(sha256sum "$app" | cut -d' ' -f1)" = "$expected" ]; then
    say "O BoyiLin66 $tag já está instalado; nada para baixar"
    cp -- "$app" "$tmp/boyilin66"
  else
    [ -f "$app" ] && action="Atualizando para" || action="Baixando"
    say "$action $tag"
    curl -fL --progress-bar -o "$tmp/boyilin66" "$url"
    # A download that does not match the published checksum is never installed.
    [ "$(sha256sum "$tmp/boyilin66" | cut -d' ' -f1)" = "$expected" ] || die "o arquivo baixado não confere com o SHA256SUMS"
  fi
fi

mkdir -p "$bin_dir" "$(dirname "$desktop")" "$(dirname "$icon")"
install -m 755 "$tmp/boyilin66" "$app"
fetch src-tauri/icons/128x128.png "$tmp/icon.png" && install -m 644 "$tmp/icon.png" "$icon" || say "ícone não instalado"
cat > "$desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=BoyiLin66
Comment=Configurador do teclado BOYI 66 Pro
Exec=$app
Icon=$icon
StartupWMClass=boyilin66
Terminal=false
Categories=Utility;Settings;HardwareSettings;
DESKTOP

# Without a rule only root can open the keyboard's hidraw nodes; any rule
# already naming the keyboard (from a .deb/.rpm or an older install) will do.
if grep -qs 'ATTRS{idProduct}=="7372"' /etc/udev/rules.d/*.rules /usr/lib/udev/rules.d/*.rules; then
  say "Regra udev do teclado já instalada"
else
  fetch udev/70-boyilin66.rules "$tmp/rule"
  say "Instalando a regra udev do teclado (pede a senha de administrador)"
  sudo install -m 644 "$tmp/rule" "$rule" || die "não foi possível instalar $rule; veja o README"
  sudo udevadm control --reload-rules
  sudo udevadm trigger --subsystem-match=hidraw
fi

command -v fusermount >/dev/null || command -v fusermount3 >/dev/null \
  || say "Aviso: o AppImage precisa do FUSE (pacote fuse2/libfuse2) para abrir"
say "BoyiLin66${tag:+ $tag} instalado em $app"
case ":$PATH:" in *":$bin_dir:"*) ;; *) say "Adicione $bin_dir ao PATH para rodar 'boyilin66' no terminal";; esac
