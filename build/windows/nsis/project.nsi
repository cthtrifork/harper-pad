Unicode true

####
## NSIS installer for Harper Pad, adapted from the Wails v3 example installer. Built by scripts/package-windows.sh:
##   makensis -DARG_WAILS_AMD64_BINARY=<exe> -DINFO_PRODUCTVERSION=<x.y.z> -DOUTFILE=<installer.exe> project.nsi
## It installs per user (no administrator prompt) into %LOCALAPPDATA%\Programs\Harper Pad, so the in-app updater
## can replace the executable. See docs/windows.md.
####
!define INFO_PROJECTNAME    "harper-pad"
!define INFO_COMPANYNAME    "cthtrifork"
!define INFO_PRODUCTNAME    "Harper Pad"
!ifndef INFO_PRODUCTVERSION
    !define INFO_PRODUCTVERSION "0.0.0"
!endif
!define INFO_COPYRIGHT      "Apache-2.0 licensed"
!define PRODUCT_EXECUTABLE  "harper-pad.exe"
!define UNINST_KEY_NAME     "io.github.cthtrifork.harper-pad"
!define REQUEST_EXECUTION_LEVEL "user"
!define WAILS_INSTALL_SCOPE     "user"

!include "wails_tools.nsh"

# The version information for these two must have four parts.
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Name "${INFO_PRODUCTNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
ShowInstDetails show

Function .onInit
   !insertmacro wails.checkArchitecture
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR

    !insertmacro wails.files

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles

    !insertmacro wails.writeUninstaller
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 data path

    RMDir /r $INSTDIR

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles

    !insertmacro wails.deleteUninstaller
SectionEnd
