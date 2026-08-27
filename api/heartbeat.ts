/**
 * Daily heartbeat cron — PRD §10.2, AC10.
 * "Daily heartbeat cron → 👍 to admin chat; silence = investigate."
 * Configured as a Vercel Cron Job (see vercel.json "crons").
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { notifyAdminsText } from "../src/admin/notify.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Vercel Cron requests are GET by default; keep this permissive but simple.
  try {
    await notifyAdminsText("👍 CTW bot heartbeat — all systems nominal.");
    res.status(200).send("OK");
  } catch (err) {
    console.error("Heartbeat failed to send:", err);
    res.status(500).send("Heartbeat failed");
  }
}
