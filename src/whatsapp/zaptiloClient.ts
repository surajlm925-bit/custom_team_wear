process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { getEnv } from '../config/env.js';

/** Call Zaptilo REST API. Base URL: https://api.zaptilo.ai */
async function zaptiloFetch(path: string, body: Record<string, unknown>): Promise<any> {
  const env = getEnv();
  const url = `${env.ZAPTILO_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.ZAPTILO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[zaptiloClient] ${path} failed ${res.status}: ${text}`);
    throw new Error(`Zaptilo API error ${res.status}: ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

/** Strip the "wa:" prefix if present and return bare phone number */
function phone(to: string): string {
  return to.startsWith('wa:') ? to.substring(3) : to;
}

/** Send a plain text message */
export async function sendMessage(to: string, text: string) {
  console.log(`[zaptiloClient] sendMessage to=${to} text=${text.substring(0, 60)}`);
  return zaptiloFetch('/api/send', { number: phone(to), message: text });
}

/** Send an image with optional caption */
export async function sendMedia(to: string, mediaUrl: string, caption?: string) {
  console.log(`[zaptiloClient] sendMedia to=${to} url=${mediaUrl}`);
  return zaptiloFetch('/api/send/media', {
    number: phone(to),
    media_url: mediaUrl,
    media_type: 'image',
    ...(caption ? { caption } : {}),
  });
}

/** Send interactive reply buttons (max 3) */
export async function sendInteractiveButtons(
  to: string,
  text: string,
  buttons: Array<{ id: string; title: string }>,
) {
  console.log(`[zaptiloClient] sendInteractiveButtons to=${to} buttons=${buttons.length}`);
  // Zaptilo may not support native interactive buttons via REST — fallback to numbered text list
  const numbered = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
  const ids = buttons.map((b, i) => `(reply *${i + 1}* for "${b.id}")`).join('  ');
  return zaptiloFetch('/api/send', {
    number: phone(to),
    message: `${text}\n\n${numbered}\n\n_${ids}_`,
  });
}

/** Send interactive list (more than 3 options) */
export async function sendInteractiveList(
  to: string,
  text: string,
  _buttonText: string,
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>,
) {
  console.log(`[zaptiloClient] sendInteractiveList to=${to}`);
  // Fallback to numbered text list
  const lines: string[] = [text, ''];
  let idx = 1;
  for (const section of sections) {
    if (section.title) lines.push(`*${section.title}*`);
    for (const row of section.rows) {
      lines.push(`${idx}. ${row.title}${row.description ? ' — ' + row.description : ''}`);
      idx++;
    }
  }
  lines.push('', '_Reply with the number of your choice_');
  return zaptiloFetch('/api/send', { number: phone(to), message: lines.join('\n') });
}

/** Send a template message */
export async function sendTemplate(to: string, templateName: string, languageCode: string = 'en') {
  return zaptiloFetch('/api/send/template', {
    number: phone(to),
    template_name: templateName,
    language: languageCode,
  });
}
