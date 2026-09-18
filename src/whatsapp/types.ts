export interface ZaptiloWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: "text" | "interactive" | "image" | "document" | "button";
          text?: {
            body: string;
          };
          interactive?: {
            type: "button_reply" | "list_reply";
            button_reply?: {
              id: string;
              title: string;
            };
            list_reply?: {
              id: string;
              title: string;
              description?: string;
            };
          };
          image?: {
            caption?: string;
            mime_type: string;
            sha256: string;
            id: string;
          };
          document?: {
            caption?: string;
            filename: string;
            mime_type: string;
            sha256: string;
            id: string;
          };
          button?: {
            text: string;
            payload: string;
          };
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface ZaptiloInteractiveButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}

export interface ZaptiloInteractiveListSection {
  title?: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}
