#!/usr/bin/env bash
# Install the Windows installer silently into a scratch folder, check the exe landed, then uninstall and check it is gone.
# Runs on a Windows runner (Git Bash).
#
#   scripts/check-windows-installer.sh <installer>
set -euo pipefail

installer="${1:?usage: check-windows-installer.sh <installer>}"
installer="$(cygpath -w "$(cd "$(dirname "$installer")" && pwd)/$(basename "$installer")")"
dir="$(cygpath -w "$(mktemp -d)")\\hp-install"
export MSYS_NO_PATHCONV=1

# /S is silent; /D= sets the install folder and must be last and unquoted. -Wait: NSIS returns only when it is done.
powershell.exe -NoProfile -Command "\$p = Start-Process -FilePath '$installer' -ArgumentList '/S','/D=$dir' -Wait -PassThru; exit \$p.ExitCode"
[ -f "$(cygpath -u "$dir")/harper-pad.exe" ] || { echo "::error::the installer did not put harper-pad.exe in $dir"; exit 1; }
[ -f "$(cygpath -u "$dir")/uninstall.exe" ] || { echo "::error::the installer did not write uninstall.exe"; exit 1; }
echo "installed to $dir"

# _?= makes the uninstaller run in place and wait, instead of copying itself to %TEMP% and returning at once.
powershell.exe -NoProfile -Command "\$p = Start-Process -FilePath '$dir\\uninstall.exe' -ArgumentList '/S','_?=$dir' -Wait -PassThru; exit \$p.ExitCode"
[ ! -f "$(cygpath -u "$dir")/harper-pad.exe" ] || { echo "::error::the uninstaller left harper-pad.exe behind"; exit 1; }
echo "uninstalled"
