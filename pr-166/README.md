# PR #166: screenshots

## Keep or Overwrite dialog
- [File differs](dialog-new-file-desktop.png)
- [Server differs](dialog-new-server-desktop.png) · [phone](dialog-new-server-phone.png)
- [File and server differ](dialog-new-both-desktop.png)
- [Server rejected the update](rejected-final.png)
- [Binary file](binary-desktop.png)

## Without a question
- [Updated from file, with Undo](refresh-toast.png)
- [File recreated](recreated-status.png)

## Deleted on another device
- [Desktop](deleted-elsewhere.png) · [phone](deleted-elsewhere-phone.png)

## Header chip
- [Clean](dirty-1-clean.png) · [Draft ahead of file (dot)](dirty-2-dot.png)
- File chip with copy-path and unlink buttons: [linked](chip-1-linked.png), [path copied](chip-2-copied.png), [unlinked with Undo toast](chip-3-unlinked-toast.png)
- [Unlinked](unlink-1-unlinked.png) · [Linked](unlink-2-linked.png) · [Unlink with Undo](unlink-3-toast.png) · [File gone (struck)](unlink-4-gone.png) · [Shortcut while linked](unlink-7-shortcut.png)
- Narrow desktop window, 720 px: [linked](header-720-linked.png), [unlinked](header-720-unlinked.png), [struck](header-720-struck.png), [dot](header-720-dot.png); 600 px (the smallest window): [linked](header-600-linked.png), [unlinked](header-600-unlinked.png), [struck](header-600-struck.png), [dot](header-600-dot.png)
- Web build in an untouched Chromium at [390 px](real-header-narrow-390.png) and [320 px](real-header-narrow-320.png), touch emulation only. A real iPhone (Share) and a real Android phone were not available, so there is no screenshot of them.

## Drafts drawer and version
- [Drawer](modal-drawer.png)
- Phone: [header, no version](version-header-phone.png), [drawer, version at the bottom](version-drawer-phone.png)
- Desktop: [header, version at the end](version-header-desktop.png); the drawer shows none

`mockups/` holds early sketches, superseded by the built dialog.

Phone-sized shots (`*-phone*`, `version-*-phone`) are Chromium with a phone viewport, touch and an iPhone user agent; no browser API is replaced. They are not a real device.
