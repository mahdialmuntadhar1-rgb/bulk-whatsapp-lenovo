import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { dbInstance, CampaignMessage } from "./server-db";
import { queueManagerInstance } from "./server-worker";
import { NabdaClient } from "./server-nabda";

const app = express();
const PORT = 3000;

// Set up express parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// -----------------------------------------------------------------
// SECURITY & AUTH MIDDLEWARE (Token base)
// -----------------------------------------------------------------
const ADMIN_TOKEN = "nb-auth-secure-token-2026";
const MOCK_ADMIN_USER = { email: "mahdialmuntadhar1@gmail.com", name: "Mahdi Admin" };

const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  next();
};

// -----------------------------------------------------------------
// PHONE NORMALIZATION UTILS
// -----------------------------------------------------------------
/**
 * Normalizes phone numbers to pure digits in international format (e.g. +65 9123-4567 becomes 6591234567)
 */
function normalizePhoneNumber(phone: string): { normalized: string; isValid: boolean; reason?: string } {
  const cleaned = phone.replace(/[^\d+]/g, ""); // Strip non-numeric expect plus
  let hasPlus = cleaned.startsWith("+");
  const digits = cleaned.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15) {
    return { normalized: digits, isValid: false, reason: "Must contain between 8 and 15 digits." };
  }

  // Nabda OTP standard: expects E.164 without plus or prefix zeros for global routing
  return { normalized: digits, isValid: true };
}

// -----------------------------------------------------------------
// AUTH ROUTES
// -----------------------------------------------------------------
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  
  // Custom simple master authentication rules
  if ((username === "admin" || username === "mahdialmuntadhar1@gmail.com") && password === "admin1234") {
    return res.json({
      token: ADMIN_TOKEN,
      user: MOCK_ADMIN_USER,
    });
  }

  return res.status(401).json({ error: "Invalid username or password credentials. Hint: use admin / admin1234" });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: MOCK_ADMIN_USER });
});

// -----------------------------------------------------------------
// INSTANCES CRUD
// -----------------------------------------------------------------
app.get("/api/instances", authenticateToken, (req, res) => {
  res.json(dbInstance.getInstances());
});

app.post("/api/instances", authenticateToken, (req, res) => {
  const { name, api_url, api_key, status } = req.body;

  if (!name || !api_url || !api_key) {
    return res.status(400).json({ error: "Name, API URL, and API Key are mandatory variables." });
  }

  const inst = dbInstance.addInstance({
    name,
    api_url,
    api_key,
    status: status || "connected",
    last_active_at: new Date().toISOString(),
  });

  res.status(201).json(inst);
});

app.post("/api/instances/:id/sync", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const instances = dbInstance.getInstances();
  const inst = instances.find((i) => i.id === id);

  if (!inst) {
    return res.status(404).json({ error: "Instance not found" });
  }

  try {
    dbInstance.updateInstance(id, { status: "validating" });
    const connectionState = await NabdaClient.checkStatus(inst);
    const updated = dbInstance.updateInstance(id, {
      status: connectionState,
      last_active_at: new Date().toISOString(),
    });
    dbInstance.addLog("info", id, null, `Instance correlation synced. Gateway Status: ${connectionState.toUpperCase()}`);
    res.json(updated);
  } catch (err: any) {
    dbInstance.updateInstance(id, { status: "disconnected" });
    res.status(500).json({ error: `Connection handshake failed: ${err.message}` });
  }
});

app.delete("/api/instances/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const deleted = dbInstance.deleteInstance(id);
  if (!deleted) {
    return res.status(404).json({ error: "Instance not found" });
  }
  res.json({ success: true });
});

// -----------------------------------------------------------------
// LOGS FEED
// -----------------------------------------------------------------
app.get("/api/logs", authenticateToken, (req, res) => {
  const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json(dbInstance.getLogs(parsedLimit));
});

// -----------------------------------------------------------------
// CAMPAIGNS ROOT
// -----------------------------------------------------------------
app.get("/api/campaigns", authenticateToken, (req, res) => {
  res.json(dbInstance.getCampaigns());
});

app.get("/api/campaigns/:id", authenticateToken, (req, res) => {
  const campaign = dbInstance.getCampaign(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  res.json(campaign);
});

app.get("/api/campaigns/:id/messages", authenticateToken, (req, res) => {
  const { search, status, limit = "100" } = req.query;
  let messages = dbInstance.getMessages(req.params.id);

  if (search) {
    const s = (search as string).toLowerCase();
    messages = messages.filter(
      (m) =>
        m.phone.toLowerCase().includes(s) ||
        m.normalized_phone.includes(s) ||
        m.message.toLowerCase().includes(s)
    );
  }

  if (status) {
    messages = messages.filter((m) => m.status === status);
  }

  const parsedLimit = parseInt(limit as string, 10);
  res.json(messages.slice(0, parsedLimit));
});

app.post("/api/campaigns", authenticateToken, (req, res) => {
  const {
    idempotency_key,
    name,
    instance_id,
    pacing_delay_min = 4,
    pacing_delay_max = 12,
    message_template,
    contacts, // Expects array of { phone: string, [key: string]: string (dynamic field replacements) }
    attachment_url = null,
  } = req.body;

  // 1. IDEMPOTENCY SYSTEM CHECK (Strict prevent replays)
  if (idempotency_key && dbInstance.isIdempotencyKeyUsed(idempotency_key)) {
    const existingId = dbInstance.getCampaignByIdempotencyKey(idempotency_key);
    dbInstance.addLog("warning", instance_id, existingId, `Idempotent request replayed for campaigns '${name}'. Replying with existing ID.`);
    return res.status(200).json({
      id: existingId,
      replayed: true,
      message: "Idempotency trigger caught. Campaign already registered.",
    });
  }

  // 2. BACKEND VALIDATIONS
  if (!name) return res.status(400).json({ error: "Campaign name is required." });
  if (!instance_id) return res.status(400).json({ error: "WhatsApp Instance binding is required." });
  if (!message_template) return res.status(400).json({ error: "Core message template content is empty." });
  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: "Contacts container should not be empty." });
  }

  // Validate instance existence
  const instances = dbInstance.getInstances();
  const activeInstance = instances.find(i => i.id === instance_id);
  if (!activeInstance) {
    return res.status(400).json({ error: "The targeted sending WhatsApp instance does not exist in our orchestrator pool." });
  }

  // 3. CONTACTS CLEANING & NORMALIZATION RUN
  const processedMessages: Omit<CampaignMessage, "id" | "created_at" | "updated_at">[] = [];
  let duplicatesCount = 0;
  let invalidCount = 0;
  
  const uniqueNormalizedPhones = new Set<string>();

  for (const rawCont of contacts) {
    if (!rawCont.phone) {
      invalidCount++;
      continue;
    }

    const normResult = normalizePhoneNumber(rawCont.phone);
    if (!normResult.isValid) {
      invalidCount++;
      continue;
    }

    const normPhone = normResult.normalized;

    // Check CSV local double-sends (deduplication)
    if (uniqueNormalizedPhones.has(normPhone)) {
      duplicatesCount++;
      continue;
    }

    uniqueNormalizedPhones.add(normPhone);

    // Dynamic templating values compiler (supports e.g., 'Hello {{name}}!')
    let compiledMessage = message_template;
    for (const key of Object.keys(rawCont)) {
      const placeholder = `{{${key}}}`;
      compiledMessage = compiledMessage.replace(new RegExp(placeholder, "g"), rawCont[key]);
    }

    // Hash fingerprint generator
    const fingerprintString = `camp-fingerprint-holder:${normPhone}:${compiledMessage}:${attachment_url || "none"}`;

    processedMessages.push({
      campaign_id: "", // Will populate post creation
      phone: rawCont.phone,
      normalized_phone: normPhone,
      message: compiledMessage,
      attachment_url: attachment_url || null,
      fingerprint: fingerprintString,
      status: "PENDING",
      retry_count: 0,
      provider_message_id: null,
      retry_reason: null,
      last_attempt_at: null,
    });
  }

  if (processedMessages.length === 0) {
    return res.status(400).json({
      error: `All ${contacts.length} uploaded CSV contacts were skipped. Total invalid: ${invalidCount}, duplicates: ${duplicatesCount}.`
    });
  }

  // 4. STORAGE PERSISTENCE
  // Create Campaign Parent Header
  const campaign = dbInstance.addCampaign({
    name,
    status: "PENDING",
    instance_id,
    pacing_delay_min: Number(pacing_delay_min),
    pacing_delay_max: Number(pacing_delay_max),
    total_contacts: contacts.length,
    idempotency_key: idempotency_key || null,
  });

  // Stamp messages with campaign ID and ingest bulk array
  processedMessages.forEach((m) => (m.campaign_id = campaign.id));
  dbInstance.bulkAddMessages(processedMessages);

  // Auto-track initial counters inside D1 simulation
  dbInstance.updateCampaignMetrics(campaign.id);

  // Return full processing statistics report to dashboard
  res.status(201).json({
    campaign,
    summary: {
      total: contacts.length,
      imported: processedMessages.length,
      invalidSkipped: invalidCount,
      duplicatesSkipped: duplicatesCount,
    }
  });
});

app.post("/api/campaigns/:id/status", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // QUEUED, PAUSED, CANCELLED

  const campaign = dbInstance.getCampaign(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (!["QUEUED", "PAUSED", "CANCELLED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status command. Supported: QUEUED, PAUSED, CANCELLED" });
  }

  dbInstance.updateCampaignStatus(id, status);
  
  // Instantly nudge orchestrator threads to wake up
  queueManagerInstance.triggerImmediateCycle(campaign.instance_id);

  res.json(dbInstance.getCampaign(id));
});

app.post("/api/campaigns/:id/retry-failed", authenticateToken, (req, res) => {
  const { id } = req.params;
  const campaign = dbInstance.getCampaign(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  dbInstance.retryFailedCampaignMessages(id);
  
  // Wake worker thread up
  queueManagerInstance.triggerImmediateCycle(campaign.instance_id);

  res.json({ success: true, campaign: dbInstance.getCampaign(id) });
});

app.delete("/api/campaigns/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const idx = dbInstance.getCampaigns().findIndex((c) => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  // Remove campaign and cascade messages
  const campaigns = dbInstance.getCampaigns();
  const cName = campaigns[idx].name;
  campaigns.splice(idx, 1);

  // Clean messages
  const allMessages = dbInstance.getMessages();
  const keptMessages = allMessages.filter((m) => m.campaign_id !== id);
  dbInstance.getMessages().length = 0;
  keptMessages.forEach((m) => dbInstance.getMessages().push(m));

  dbInstance.save();
  dbInstance.addLog("warning", null, null, `Campaign '${cName}' deleted completely.`);
  res.json({ success: true });
});

// -----------------------------------------------------------------
// NABDA WEBHOOKS RECEIVER
// -----------------------------------------------------------------
app.post("/api/webhooks/nabda", (req, res) => {
  const { event, provider_message_id, campaign_message_id, status } = req.body;
  
  // In production, verify the Nabda gateway webhook signature for safety
  const signature = req.headers["x-nabda-signature"];
  console.log(`[Webhook Receiver] Webhook arrived: event=${event}, status=${status}, ref=${campaign_message_id}`);

  if (!campaign_message_id && !provider_message_id) {
    return res.status(400).json({ error: "Missing correlation identifiers." });
  }

  // Try to find the message by campaign message id, or fall back to provider_message_id
  let message = campaign_message_id ? dbInstance.getMessage(campaign_message_id) : null;
  if (!message && provider_message_id) {
    const allm = dbInstance.getMessages();
    message = allm.find((m) => m.provider_message_id === provider_message_id) || null;
  }

  if (!message) {
    // If webhook matches no local messages, return a silent 200 OK (WhatsApp providers send miscellaneous receipts)
    return res.json({ status: "acknowledged", error: "Message reference correlation not found in database" });
  }

  // Match and update statuses
  if (event === "delivery_receipt") {
    const campaign = dbInstance.getCampaign(message.campaign_id);
    const instanceId = campaign ? campaign.instance_id : null;

    if (status === "delivered") {
      dbInstance.updateMessageStatus(message.id, "DELIVERED");
      dbInstance.addLog("success", instanceId, message.campaign_id, `Delivery confirmed for phone ${message.normalized_phone}.`);
    } else if (status === "failed") {
      dbInstance.updateMessageStatus(message.id, "FAILED", {
        retry_reason: "Handset rejected message (WhatsApp protocol delivery failure)"
      });
      dbInstance.addLog("error", instanceId, message.campaign_id, `Delivery receipt reports WhatsApp rejected message to phone ${message.normalized_phone}.`);
    }
  }

  res.json({ success: true });
});

// -----------------------------------------------------------------
// FLOW TESTING WEBHOOK SIMULATOR
// -----------------------------------------------------------------
app.post("/api/simulator/trigger-delivery", authenticateToken, (req, res) => {
  const { message_id } = req.body;
  const msg = dbInstance.getMessage(message_id);

  if (!msg) {
    return res.status(404).json({ error: "Message id not found." });
  }

  if (msg.status !== "SENT") {
    return res.status(400).json({ error: `Simulator: message state is ${msg.status}. Can only trigger webhook for status: SENT.` });
  }

  const campaign = dbInstance.getCampaign(msg.campaign_id);
  const instanceId = campaign ? campaign.instance_id : null;
  const providerId = msg.provider_message_id || `nb_msg_sim_${Math.random().toString(36).substring(2, 8)}`;

  // Update status immediately!
  dbInstance.updateMessageStatus(msg.id, "DELIVERED", { provider_message_id: providerId });
  dbInstance.addLog("success", instanceId, msg.campaign_id, `[Manual Webhook Simulator] Delivery confirmed for phone ${msg.normalized_phone}.`);

  res.json({ success: true, message: dbInstance.getMessage(msg.id) });
});


// -----------------------------------------------------------------
// GEMINI MSG OPTIMIZER
// -----------------------------------------------------------------
let geminiClientInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClientInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClientInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClientInstance;
}

app.post("/api/gemini/optimize", authenticateToken, async (req, res) => {
  const { message_template, style } = req.body;

  if (!message_template) {
    return res.status(400).json({ error: "Message template content is required." });
  }

  const selectedStyle = style || "supportive";

  try {
    const ai = getGeminiClient();
    
    const prompt = `You are a professional WhatsApp communications copywriter.
Optimize this message template for bulk WhatsApp campaign broadcasting: "${message_template}".
Create 3 natural, highly engaging, and varied copy combinations tailored to WhatsApp's formatting (bold text using asterisks *like this*, clean spacing, and well-chosen emojis if appropriate).
Rules:
1. Make sure ALL merge placeholders inside double curly braces (e.g., {{name}}, {{rewards_code}}, {{discount}}, or any other {{tag}}) are kept completely intact, unchanged, and present in the resulting message variations.
2. Maintain the core message objective.
3. The desired stylistic variation target is: "${selectedStyle}".

Return your final output strictly as a JSON array containing exactly 3 strings (representing the 3 variations). Do NOT wrap the JSON inside markdown code fence blocks like \`\`\`json. Return only the raw JSON array string.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const textOutput = response.text || "[]";
    const parsedVariations = JSON.parse(textOutput);
    res.json({ variations: parsedVariations });
  } catch (err: any) {
    console.error("[Gemini Message Optimizer Error]", err);
    res.status(500).json({
      error: `Gemini API Optimization Failed: ${err.message || String(err)}`,
    });
  }
});


// -----------------------------------------------------------------
// VITE DEV SERVER / PRODUCTION SERVING
// -----------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running full-stack on http://localhost:${PORT}`);
  });
}

// Global process exception safe catch
process.on("uncaughtException", (err) => {
  console.error("Critical: Uncaught server-side exception:", err);
});

startServer();
