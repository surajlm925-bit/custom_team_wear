export class ZaptiloClient {
  constructor(_opts: { apiKey: string, baseUrl: string, phoneNumberId: string }) {}
  async sendText(_phone: string, _text: string): Promise<any> { return {}; }
  async sendInteractiveButtons(_phone: string, _payload: any): Promise<any> { return {}; }
  async sendInteractiveList(_phone: string, _payload: any): Promise<any> { return {}; }
  async sendImage(_phone: string, _mediaUrl: string, _caption?: string): Promise<any> { return {}; }
  async sendTemplate(_phone: string, _templateName: string, _languageCode: string): Promise<any> { return {}; }
}
import { getEnv } from '../config/env.js';

let client: ZaptiloClient | null = null;

export function getZaptiloClient() {
  if (!client) {
    const env = getEnv();
    client = new ZaptiloClient({
      apiKey: env.ZAPTILO_API_KEY,
      baseUrl: env.ZAPTILO_BASE_URL,
      phoneNumberId: env.ZAPTILO_PHONE_NUMBER_ID,
    });
  }
  return client;
}

export async function sendMessage(to: string, text: string) {
  const c = getZaptiloClient();
  // Strip "wa:" prefix if present
  const phone = to.startsWith('wa:') ? to.substring(3) : to;
  return c.sendText(phone, text);
}

export async function sendInteractiveButtons(to: string, text: string, buttons: Array<{id: string, title: string}>) {
  const c = getZaptiloClient();
  const phone = to.startsWith('wa:') ? to.substring(3) : to;
  return c.sendInteractiveButtons(phone, {
    body: { text },
    action: {
      buttons: buttons.map(b => ({
        type: 'reply',
        reply: {
          id: b.id,
          title: b.title
        }
      }))
    }
  });
}

export async function sendInteractiveList(to: string, text: string, buttonText: string, sections: Array<{title?: string, rows: Array<{id: string, title: string, description?: string}>}>) {
  const c = getZaptiloClient();
  const phone = to.startsWith('wa:') ? to.substring(3) : to;
  return c.sendInteractiveList(phone, {
    body: { text },
    action: {
      button: buttonText,
      sections: sections
    }
  });
}

export async function sendMedia(to: string, mediaUrl: string, caption?: string) {
  const c = getZaptiloClient();
  const phone = to.startsWith('wa:') ? to.substring(3) : to;
  return c.sendImage(phone, mediaUrl, caption);
}

export async function sendTemplate(to: string, templateName: string, languageCode: string = 'en') {
  const c = getZaptiloClient();
  const phone = to.startsWith('wa:') ? to.substring(3) : to;
  return c.sendTemplate(phone, templateName, languageCode);
}
