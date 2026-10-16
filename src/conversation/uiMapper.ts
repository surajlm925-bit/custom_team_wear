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
export async function sendMenu(
  to: string,
  text: string,
  options: MenuOption[],
  listButtonText: string = "View Options",
  footerText: string = "Reply 'back' to undo • 'cancel' to exit",
) {
  if (options.length === 0) {
    return sendMessage(to, text);
  }

  const effectiveFooter = footerText?.trim() || undefined;

  try {
    if (options.length <= 3) {
      return await sendInteractiveButtons(
        to,
        text,
        options.map((o) => ({ id: o.id, title: o.title })),
        effectiveFooter,
      );
    } else {
      if (options.length > 10) {
        // WhatsApp interactive list message enforces max 10 rows total across all sections.
        const menuLines = options.map((o, idx) => `${idx + 1}. ${o.title}`);
        const footerHint = effectiveFooter ? `\n\n_(${effectiveFooter})_` : "\n\n_(Reply with option number or title)_";
        const fallbackText = `${text}\n\n${menuLines.join("\n")}${footerHint}`;
        return sendMessage(to, fallbackText);
      }
      const rows = options.map((o) => ({ id: o.id, title: o.title, description: o.description }));
      return await sendInteractiveList(to, text, listButtonText, [{ rows }], effectiveFooter);
    }
  } catch (err) {
    console.warn(`[uiMapper] sendMenu interactive failed, falling back to plain text menu:`, err);
    const menuLines = options.map((o, idx) => `${idx + 1}. ${o.title}`);
    const footerHint = effectiveFooter ? `\n\n_(${effectiveFooter})_` : "\n\n_(Reply with option number or title)_";
    const fallbackText = `${text}\n\n${menuLines.join("\n")}${footerHint}`;
    return sendMessage(to, fallbackText);
  }
}
