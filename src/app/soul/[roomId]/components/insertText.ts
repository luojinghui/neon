export const SOUL_INSERT_TEXT_EVENT = 'soul:insert-text';

/** Ask the chat input to insert text at the caret without sending it. */
export function insertChatText(text: string) {
  window.dispatchEvent(new CustomEvent(SOUL_INSERT_TEXT_EVENT, { detail: text }));
}
