import { onBeforeUnmount, onMounted, type Ref } from "vue";

// Opens a native <dialog> as a modal on mount and returns focus to where it was when it goes away (v-if does not close() it). Escape
// never closes it (`@cancel.prevent` in the template): the only way out is a choice.
export function useModalDialog(dialog: Ref<HTMLDialogElement | null>) {
  let before: HTMLElement | null = null;
  onMounted(() => {
    before = document.activeElement as HTMLElement | null;
    dialog.value?.showModal();
  });
  onBeforeUnmount(() => {
    dialog.value?.close();
    if (before?.isConnected) before.focus();
  });
}
