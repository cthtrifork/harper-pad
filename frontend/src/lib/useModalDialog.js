import { onBeforeUnmount, onMounted } from "vue";

// A native <dialog> that opens as a modal when its component mounts. The page behind it is inert. Focus goes back to where it was (the editor)
// when the dialog goes away: the page removes it with v-if, which does not close() it. Escape never closes it (`@cancel.prevent` in the
// template), so the dialogs that use this have no way out except a choice.
export function useModalDialog(dialog) {
  let before = null;
  onMounted(() => {
    before = document.activeElement;
    dialog.value?.showModal();
  });
  onBeforeUnmount(() => {
    dialog.value?.close();
    if (before?.isConnected) before.focus();
  });
}
