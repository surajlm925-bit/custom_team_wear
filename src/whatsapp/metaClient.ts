import { getEnv } from '../config/env.js';

/**
 * Call Meta WhatsApp Cloud API (or a Tech Provider wrapper, e.g. Emovur).
 *
 * The base URL is configurable via META_API_BASE_URL. Meta-direct deployments
 * use https://graph.facebook.com; an approved Tech Provider's wrapper goes here
 * verbatim. The version segment (/v20.0) is folded into META_API_BASE_URL so
 * a BSP can supply its own routing surface without code changes.
 */
async function metaFetch(path: string, body: Record<string, unknown>): Promise<any> {
  const env = getEnv();
  const url = `${env.META_API_BASE_URL}/${env.META_PHONE_NUMBER_ID}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.META_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[metaClient] ${path} failed ${res.status}: ${text}`);
    throw new Error(`Meta API error ${res.status}: ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

/** Strip the "wa:" prefix if present and return bare phone number */
function phone(to: string): string {
  let num = to.startsWith('wa:') ? to.substring(3) : to;
  if (num.startsWith('+')) {
    num = num.substring(1);
  }
  return num;
}

/** Send a plain text message */
export async function sendMessage(to: string, text: string) {
  console.log(`[metaClient] sendMessage to=${to} type=text len=${text.length}`);
  return metaFetch('/messages', {
    messaging_product: 'whatsapp',
    to: phone(to),
    type: 'text',
    text: { body: text }
  });
}

/** Send an image with optional caption */
export async function sendMedia(to: string, mediaUrl: string, caption?: string) {
  console.log(`[metaClient] sendMedia to=${to} type=image hasCaption=${Boolean(caption)}`);
  return metaFetch('/messages', {
    messaging_product: 'whatsapp',
    to: phone(to),
    type: 'image',
    image: {
      link: mediaUrl,
      ...(caption ? { caption } : {}),
    }
  });
}

/** Send interactive reply buttons (max 3) */
export async function sendInteractiveButtons(
  to: string,
  text: string,
  buttons: Array<{ id: string; title: string }>,
) {
  console.log(`[metaClient] sendInteractiveButtons to=${to} type=button buttons=${buttons.length}`);
  return metaFetch('/messages', {
    messaging_product: 'whatsapp',
    to: phone(to),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title }
        }))
      }
    }
  });
}

/** Send interactive list (more than 3 options) */
export async function sendInteractiveList(
  to: string,
  text: string,
  buttonText: string,
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>,
) {
  console.log(`[metaClient] sendInteractiveList to=${to} type=list rows=${sections.reduce((n, s) => n + s.rows.length, 0)}`);
  return metaFetch('/messages', {
    messaging_product: 'whatsapp',
    to: phone(to),
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text },
      action: {
        button: buttonText,
        sections: sections.map(section => ({
          ...(section.title ? { title: section.title } : {}),
          rows: section.rows.map(row => ({
            id: row.id,
            title: row.title,
            ...(row.description ? { description: row.description } : {})
          }))
        }))
      }
    }
  });
}

/** Send a template message */
export async function sendTemplate(to: string, templateName: string, languageCode: string = 'en') {
  return metaFetch('/messages', {
    messaging_product: 'whatsapp',
    to: phone(to),
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      }
    }
  });
}
