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
  const url = `${env.META_API_BASE_URL}/v20.0/${env.META_PHONE_NUMBER_ID}${path}`;
  console.log(`[metaClient] calling fetch: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.META_API_TOKEN}`,
        'Content-Type': 'application/json',
        ...(env.EMOVUR_CONNECTOR_ID ? { 'collector-id': env.EMOVUR_CONNECTOR_ID, 'connector-id': env.EMOVUR_CONNECTOR_ID } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    console.log(`[metaClient] fetch response status: ${res.status}`);
    if (!res.ok) {
      console.error(`[metaClient] ${path} failed ${res.status}: ${text}`);
      throw new Error(`Meta API error ${res.status}: ${text}`);
    }
    try { return JSON.parse(text); } catch { return text; }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[metaClient] fetch error:`, err);
    throw err;
  }
}

/** Strip the "wa:" prefix if present and return bare phone number */
function phone(to: string): string {
  return to.replace(/^(wa:)+/gi, "").replace(/^\+/, "").trim();
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
  // WhatsApp Cloud API enforces: max 3 buttons, max 20 chars per title, max 256 chars per id
  const validButtons = buttons.slice(0, 3).map(b => ({
    type: 'reply' as const,
    reply: {
      id: b.id.slice(0, 256),
      title: b.title.slice(0, 20)
    }
  }));

  return metaFetch('/messages', {
    messaging_product: 'whatsapp',
    to: phone(to),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: validButtons
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
  // WhatsApp Cloud API enforces: max 20 chars button text, max 24 chars row title, max 72 chars description, max 200 chars id
  return metaFetch('/messages', {
    messaging_product: 'whatsapp',
    to: phone(to),
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: text.slice(0, 1024) },
      action: {
        button: buttonText.slice(0, 20),
        sections: sections.slice(0, 10).map(section => ({
          ...(section.title ? { title: section.title.slice(0, 24) } : {}),
          rows: section.rows.slice(0, 10).map(row => ({
            id: row.id.slice(0, 200),
            title: row.title.slice(0, 24),
            ...(row.description ? { description: row.description.slice(0, 72) } : {})
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
