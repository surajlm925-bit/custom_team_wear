/**
 * S3 — Size Split "Enter my own" mode.
 * Six sequential numeric prompts (0 allowed), then deficit/surplus
 * assignment via size quick-picks until the sum matches qty exactly.
 */

import { COPY } from "../copy.js";
import { sizeQuickPickMenu } from "../keyboards.js";
import { CANCEL, waitForStep, isCancelCallback } from "../waitHelpers.js";
import type { MyConversation } from "../types.js";
import { SIZE_KEYS, type SizeKey } from "../../pricing/priceBook.js";

const SIZE_LABELS: Record<SizeKey, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
  XXL: "XXL",
  "3XL": "3XL",
};

async function askOneSize(
  conversation: MyConversation,
): Promise<number | typeof CANCEL> {
  return waitForStep<number>(
    conversation,
    (ctx) => {
      if (isCancelCallback(ctx)) return CANCEL;
      const text = ctx.message?.text?.trim();
      if (text === undefined) return undefined;
      if (!/^\d+$/.test(text)) return undefined;
      return Number(text);
    },
    (ctx) => ctx.reply(COPY.sizeSplitOwnInvalid),
  );
}

/**
 * Collects a manual size split. Returns CANCEL if the user cancels at
 * any point. Guarantees the returned split sums exactly to `qty`.
 */
export async function collectOwnSizeSplit(
  conversation: MyConversation,
  reply: (text: string, extra?: Record<string, unknown>) => Promise<unknown>,
  qty: number,
): Promise<Record<SizeKey, number> | typeof CANCEL> {
  const split: Partial<Record<SizeKey, number>> = {};

  for (const size of SIZE_KEYS) {
    await reply(COPY.sizeSplitOwnPrompt(SIZE_LABELS[size]));
    const value = await askOneSize(conversation);
    if (value === CANCEL) return CANCEL;
    split[size] = value;
  }

  let sum = SIZE_KEYS.reduce((s, k) => s + (split[k] ?? 0), 0);

  while (sum !== qty) {
    const diff = qty - sum;
    if (diff > 0) {
      await reply(COPY.sizeSplitMismatch(sum, qty, diff), { reply_markup: sizeQuickPickMenu() });
    } else {
      await reply(COPY.sizeSplitSurplus(sum, qty, -diff), { reply_markup: sizeQuickPickMenu() });
    }

    const pickedSize = await waitForStep<SizeKey>(
      conversation,
      (ctx) => {
        if (isCancelCallback(ctx)) return CANCEL;
        const data = ctx.callbackQuery?.data;
        if (!data?.startsWith("sizefix:")) return undefined;
        return data.slice("sizefix:".length) as SizeKey;
      },
      (ctx) => ctx.reply(COPY.genericReprompt),
    );
    if (pickedSize === CANCEL) return CANCEL;

    split[pickedSize] = (split[pickedSize] ?? 0) + diff;
    if ((split[pickedSize] ?? 0) < 0) split[pickedSize] = 0;
    sum = SIZE_KEYS.reduce((s, k) => s + (split[k] ?? 0), 0);
  }

  return split as Record<SizeKey, number>;
}
