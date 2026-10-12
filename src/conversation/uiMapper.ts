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

  try {
    if (options.length <= 3) {
      return await sendInteractiveButtons(to, text, options.map(o => ({ id: o.id, title: o.title })));
    } else {
      // For lists, we must limit to 10 rows per section for WhatsApp API
      const rows = options.map(o => ({ id: o.id, title: o.title, description: o.description }));
      const sections = [];
      for (let i = 0; i < rows.length; i += 10) {
        sections.push({
          title: rows.length > 10 ? `Options (${i + 1}-${Math.min(i + 10, rows.length)})` : undefined,
          rows: rows.slice(i, i + 10)
        });
      }
      return await sendInteractiveList(to, text, listButtonText, sections);
    }
  } catch (err) {
    console.warn(`[uiMapper] sendMenu interactive failed, falling back to plain text menu:`, err);
    const menuLines = options.map((o, idx) => `${idx + 1}. ${o.title}`);
    const fallbackText = `${text}\n\n${menuLines.join('\n')}\n\n_(Reply with option number or title)_`;
    return sendMessage(to, fallbackText);
  }
}
