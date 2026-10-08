import { sendInteractiveButtons, sendInteractiveList, sendMessage } from '../whatsapp/metaClient.js';

export interface MenuOption {
  id: string;
  title: string;
  description?: string;
}

/**
 * Automatically maps a menu to either Buttons (if <= 3 items) or a List (if > 3 items).
 * WhatsApp only allows max 3 buttons per interactive message.
 */
export async function sendMenu(to: string, text: string, options: MenuOption[], listButtonText: string = "View Options") {
  if (options.length === 0) {
    return sendMessage(to, text);
  }

  if (options.length <= 3) {
    return sendInteractiveButtons(to, text, options.map(o => ({ id: o.id, title: o.title })));
  } else {
    // For lists, we put everything in one section for now
    const rows = options.map(o => ({ id: o.id, title: o.title, description: o.description }));
    return sendInteractiveList(to, text, listButtonText, [{ rows }]);
  }
}
