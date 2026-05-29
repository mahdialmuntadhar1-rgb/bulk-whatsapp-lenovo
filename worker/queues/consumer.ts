import { Env } from "../index";

interface QueueMessagePayload {
  message_id: string;
  campaign_id: string;
  instance_id: string;
  phone: string;
  message: string;
  attachment_url: string | null;
}

export default {
  /**
   * Cloudflare queue consumer processes incoming batches sequentially.
   * Leverages transactional properties of SQLite DB binding for anti-duplication.
   */
  async queue(batch: MessageBatch<QueueMessagePayload>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const payload = msg.body;

      try {
        // 1. Mark as PROCESSING in D1 relational database
        await env.DB.prepare(
          "UPDATE campaign_messages SET status = 'PROCESSING', updated_at = ? WHERE id = ?"
        )
          .bind(new Date().toISOString(), payload.message_id)
          .run();

        // 2. Anti-duplication check: Query D1 for messages with identical fingerprints
        const fingerprints = await env.DB.prepare(
          "SELECT id, status FROM campaign_messages WHERE fingerprint = (SELECT fingerprint FROM campaign_messages WHERE id = ?) AND id != ? AND status IN ('SENT', 'DELIVERED', 'PROCESSING')"
        )
          .bind(payload.message_id, payload.message_id)
          .all();

        if (fingerprints.results && fingerprints.results.length > 0) {
          // If duplicate exists, skip sending to avoid multiple spam sends
          await env.DB.prepare(
            "UPDATE campaign_messages SET status = 'SKIPPED_DUPLICATE', retry_reason = 'Duplicate fingerprint blocked' WHERE id = ?"
          )
            .bind(payload.message_id)
            .run();
          
          await env.DB.prepare(
            "UPDATE campaigns SET duplicate_count = duplicate_count + 1 WHERE id = ?"
          )
            .bind(payload.campaign_id)
            .run();

          // Move onto next message with zero pacing penalty
          continue;
        }

        // 3. Resolve active Nabda OTP instance credential parameters from D1
        const instance: any = await env.DB.prepare("SELECT * FROM instances WHERE id = ?")
          .bind(payload.instance_id)
          .first();

        if (!instance) {
          throw new Error("Target Nabda instance disappeared or was deallocated.");
        }

        // 4. Request Nabda endpoints to release the WhatsApp package
        const gatewayUrl = `${instance.api_url.replace(/\/$/, "")}/api/v1/send`;
        const res = await fetch(gatewayUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${instance.api_key}`,
          },
          body: JSON.stringify({
            instance_id: instance.id,
            to: payload.phone,
            message: payload.message,
            media_url: payload.attachment_url || undefined,
            reference: payload.message_id,
          }),
        });

        if (!res.ok) {
          const bodyErr = await res.text();
          throw new Error(`Nabda API error code: ${res.status}. Output: ${bodyErr}`);
        }

        const data: any = await res.json();
        const providerId = data.message_id || `nb_msg_cf_${Math.random().toString(36).substring(2, 8)}`;

        // 5. Commit status changes to D1 on success
        await env.DB.prepare(
          "UPDATE campaign_messages SET status = 'SENT', provider_message_id = ?, updated_at = ? WHERE id = ?"
        )
          .bind(providerId, new Date().toISOString(), payload.message_id)
          .run();

        await env.DB.prepare(
          "UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = ?"
        )
          .bind(payload.campaign_id)
          .run();

        // 6. Enforce human-like pacing checks (e.g. sleep 5 seconds)
        const campaign: any = await env.DB.prepare("SELECT pacing_delay_min, pacing_delay_max FROM campaigns WHERE id = ?")
          .bind(payload.campaign_id)
          .first();

        const pacingMin = campaign?.pacing_delay_min || 4;
        const pacingMax = campaign?.pacing_delay_max || 12;
        const randomDelaySec = Math.floor(Math.random() * (pacingMax - pacingMin + 1)) + pacingMin;

        await new Promise((resolve) => setTimeout(resolve, randomDelaySec * 1000));

      } catch (err: any) {
        console.error(`CF Worker Queue Execution Exception: ${err.message}`);

        // Handle retries increment or mark as permanently failed based on message attempts properties
        // We log historical send failure to check later in send_attempts
        const attemptId = "att_" + Math.random().toString(36).substring(2, 11);
        await env.DB.prepare(
          "INSERT INTO send_attempts (id, campaign_message_id, attempt_number, error_message, created_at) VALUES (?, ?, 1, ?, ?)"
        )
          .bind(attemptId, payload.message_id, err.message || "Queue Worker Crash", new Date().toISOString())
          .run();

        // Retry of individual messages is handled directly by Cloudflare Queue consumer retry policy
        // Let it throw to signal Cloudflare to back off and retry later based on wrangler configuration.
        throw err;
      }
    }
  }
};
