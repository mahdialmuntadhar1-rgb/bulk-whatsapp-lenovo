/**
 * Cloudflare Worker API Router
 * Handles dashboard client requests, writes campaigns to D1,
 * and pushes individual sending tasks into Cloudflare Queues (`MESSAGE_QUEUE`).
 */

export interface Env {
  DB: D1Database;
  MESSAGE_QUEUE: Queue<any>;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Standard CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Simple auth check
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        // Exclude webhook endpoint from Bearer Authentication
        if (path !== "/api/webhooks/nabda") {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // 2. Instances routes
      if (path === "/api/instances" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM instances ORDER BY created_at DESC").all();
        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 3. Campaigns submission route to trigger queue loading
      if (path === "/api/campaigns" && request.method === "POST") {
        const body: any = await request.json();
        const { name, instance_id, pacing_delay_min, pacing_delay_max, messages, idempotency_key } = body;

        if (!name || !instance_id || !messages || !Array.isArray(messages)) {
          return new Response(JSON.stringify({ error: "Malformed payload parameter variables" }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        // Idempotency validation
        if (idempotency_key) {
          const existing = await env.DB.prepare("SELECT id FROM campaigns WHERE idempotency_key = ?")
            .bind(idempotency_key)
            .first<any>();
          if (existing) {
            return new Response(JSON.stringify({ error: "Idempotency conflict", campaign_id: existing.id }), {
              status: 409,
              headers: corsHeaders,
            });
          }
        }

        const campaignId = "camp_" + Math.random().toString(36).substring(2, 11);
        const timestamp = new Date().toISOString();

        // Transaction insert on D1
        await env.DB.prepare(
          "INSERT INTO campaigns (id, name, status, instance_id, pacing_delay_min, pacing_delay_max, created_at, total_contacts) VALUES (?, ?, 'QUEUED', ?, ?, ?, ?, ?)"
        )
          .bind(campaignId, name, instance_id, pacing_delay_min || 4, pacing_delay_max || 12, timestamp, messages.length)
          .run();

        // Queue each message task asynchronously through Cloudflare Queue
        for (const msg of messages) {
          const messageId = "msg_" + Math.random().toString(36).substring(2, 11);
          const fingerprint = `${campaignId}:${msg.normalized_phone}:${msg.message}:${msg.attachment_url || "none"}`;

          // Store in D1 database first to act as source of truth
          await env.DB.prepare(
            "INSERT INTO campaign_messages (id, campaign_id, phone, normalized_phone, message, attachment_url, fingerprint, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?)"
          )
            .bind(messageId, campaignId, msg.phone, msg.normalized_phone, msg.message, msg.attachment_url || null, fingerprint, timestamp, timestamp)
            .run();

          // Dispatch Task Job onto Cloudflare Queues
          await env.MESSAGE_QUEUE.send({
            message_id: messageId,
            campaign_id: campaignId,
            instance_id: instance_id,
            phone: msg.normalized_phone,
            message: msg.message,
            attachment_url: msg.attachment_url,
          });
        }

        return new Response(JSON.stringify({ success: true, campaign_id: campaignId }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Fallback route
      return new Response("Nabda Bulk Worker Orchestration Gateway Live", { status: 200, headers: corsHeaders });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || String(err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
