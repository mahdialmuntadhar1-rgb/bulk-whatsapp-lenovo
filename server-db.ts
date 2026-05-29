import fs from "fs";
import path from "path";

// Define strong types mirroring D1 tables
export interface Instance {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  status: "connected" | "disconnected" | "validating";
  last_active_at: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: "PENDING" | "QUEUED" | "PROCESSING" | "PAUSED" | "CANCELLED" | "COMPLETED";
  instance_id: string;
  pacing_delay_min: number; // e.g. 4 seconds
  pacing_delay_max: number; // e.g. 12 seconds
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  duplicate_count: number;
  idempotency_key: string | null;
}

export interface CampaignMessage {
  id: string;
  campaign_id: string;
  phone: string;
  normalized_phone: string;
  message: string;
  attachment_url: string | null;
  fingerprint: string;
  status: "PENDING" | "QUEUED" | "PROCESSING" | "SENT" | "DELIVERED" | "FAILED" | "SKIPPED_DUPLICATE" | "CANCELLED";
  retry_count: number;
  provider_message_id: string | null;
  retry_reason: string | null;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendAttempt {
  id: string;
  campaign_message_id: string;
  attempt_number: number;
  provider_response: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  instance_id: string | null;
  campaign_id: string | null;
  message: string;
}

interface DatabaseSchema {
  instances: Instance[];
  campaigns: Campaign[];
  messages: CampaignMessage[];
  send_attempts: SendAttempt[];
  logs: SystemLog[];
  idempotency_keys: Record<string, { timestamp: string; campaign_id: string }>;
}

const DB_FILE = path.join(process.cwd(), "db.json");

class LocalDatabase {
  private data: DatabaseSchema = {
    instances: [],
    campaigns: [],
    messages: [],
    send_attempts: [],
    logs: [],
    idempotency_keys: {},
  };
  private writePromise: Promise<void> = Promise.resolve();

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(fileContent);
        console.log(`[Database] Loaded successfully from ${DB_FILE}`);
      } else {
        console.log("[Database] No database file found, initializing new empty structure with seed data.");
        this.seed();
        this.saveSync();
      }
    } catch (err) {
      console.error("[Database] Error loading database file, re-initializing:", err);
      this.seed();
    }
  }

  private seed() {
    this.data = {
      instances: [
        {
          id: "inst-primary-1",
          name: "Singapore Support Line (Primary)",
          api_url: "https://api.nabda.otp.example.com",
          api_key: "nb_live_1289fhjksdf9832",
          status: "connected",
          last_active_at: new Date(Date.now() - 60000).toISOString(),
          created_at: new Date(Date.now() - 15 * 86400 * 1000).toISOString(),
        },
        {
          id: "inst-backup-2",
          name: "London Sales Backup",
          api_url: "https://api.nabda.otp.example.com",
          api_key: "nb_live_90238fkkshdyu12",
          status: "disconnected",
          last_active_at: new Date(Date.now() - 3600000).toISOString(),
          created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
        }
      ],
      campaigns: [
        {
          id: "camp-demo-1",
          name: "Q2 Product Launch Notification",
          status: "COMPLETED",
          instance_id: "inst-primary-1",
          pacing_delay_min: 4,
          pacing_delay_max: 8,
          created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
          started_at: new Date(Date.now() - 2.8 * 3600000).toISOString(),
          completed_at: new Date(Date.now() - 2.5 * 3600000).toISOString(),
          total_contacts: 12,
          sent_count: 10,
          delivered_count: 8,
          failed_count: 1,
          duplicate_count: 1,
          idempotency_key: "idem-seed-1",
        },
        {
          id: "camp-demo-2",
          name: "Global Loyalty Rewards Campaign",
          status: "PENDING",
          instance_id: "inst-primary-1",
          pacing_delay_min: 4,
          pacing_delay_max: 12,
          created_at: new Date(Date.now() - 15 * 60000).toISOString(),
          started_at: null,
          completed_at: null,
          total_contacts: 5,
          sent_count: 0,
          delivered_count: 0,
          failed_count: 0,
          duplicate_count: 0,
          idempotency_key: "idem-seed-2",
        },
      ],
      messages: [
        {
          id: "msg-1",
          campaign_id: "camp-demo-1",
          phone: "+65 9123 4567",
          normalized_phone: "6591234567",
          message: "Hello John! Your Singapore Q2 early bird rewards code is SG9910. Redeem by entering it into your dashboard.",
          attachment_url: null,
          fingerprint: "camp-demo-1:6591234567:Hello John! Your Singapore Q2 early bird rewards code is SG9910. Redeem by entering it into your dashboard.:none",
          status: "DELIVERED",
          retry_count: 0,
          provider_message_id: "nabda_msg_abc123x",
          retry_reason: null,
          last_attempt_at: new Date(Date.now() - 2.75 * 3600000).toISOString(),
          created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
          updated_at: new Date(Date.now() - 2.75 * 3600000).toISOString(),
        },
        {
          id: "msg-2",
          campaign_id: "camp-demo-1",
          phone: "+65-8888-7777",
          normalized_phone: "6588887777",
          message: "Hello Alice! Your Singapore Q2 early bird rewards code is SG9911. Redeem by entering it into your dashboard.",
          attachment_url: null,
          fingerprint: "camp-demo-1:6588887777:Hello Alice! Your Singapore Q2 early bird rewards code is SG9911. Redeem by entering it into your dashboard.:none",
          status: "DELIVERED",
          retry_count: 0,
          provider_message_id: "nabda_msg_abc123y",
          retry_reason: null,
          last_attempt_at: new Date(Date.now() - 2.7 * 3600000).toISOString(),
          created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
          updated_at: new Date(Date.now() - 2.7 * 3600000).toISOString(),
        },
        {
          id: "msg-3",
          campaign_id: "camp-demo-1",
          phone: "6591234567", // Duplicate phone in same campaign to show off duplicate system
          normalized_phone: "6591234567",
          message: "Hello John! Your Singapore Q2 early bird rewards code is SG9910. Redeem by entering it into your dashboard.",
          attachment_url: null,
          fingerprint: "camp-demo-1:6591234567:Hello John! Your Singapore Q2 early bird rewards code is SG9910. Redeem by entering it into your dashboard.:none",
          status: "SKIPPED_DUPLICATE",
          retry_count: 0,
          provider_message_id: null,
          retry_reason: "Fingerprint matched existing sent message",
          last_attempt_at: new Date(Date.now() - 2.68 * 3600000).toISOString(),
          created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
          updated_at: new Date(Date.now() - 2.68 * 3600000).toISOString(),
        },
        {
          id: "msg-4",
          campaign_id: "camp-demo-1",
          phone: "+1 (555) 019-2831",
          normalized_phone: "15550192831",
          message: "Hello Dave! Your Singapore Q2 early bird rewards code is SG9912. Redeem by entering it into your dashboard.",
          attachment_url: null,
          fingerprint: "camp-demo-1:15550192831:Hello Dave! Your Singapore Q2 early bird rewards code is SG9912. Redeem by entering it into your dashboard.:none",
          status: "FAILED",
          retry_count: 3,
          provider_message_id: null,
          retry_reason: "Instance disconnected or connection timed out: 3 attempts failed.",
          last_attempt_at: new Date(Date.now() - 2.6 * 3600000).toISOString(),
          created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
          updated_at: new Date(Date.now() - 2.6 * 3600000).toISOString(),
        },
        // Populate Demo 2 messages
        {
          id: "msg-demo2-1",
          campaign_id: "camp-demo-2",
          phone: "+1 415-300-4000",
          normalized_phone: "14153004000",
          message: "Hi Sarah, thank you for being a loyalty regular! Get 20% off all Singapore outlets using VIP20.",
          attachment_url: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=600&auto=format&fit=crop",
          fingerprint: "camp-demo-2:14153004000:Hi Sarah, thank you for being a loyalty regular! Get 20% off all Singapore outlets using VIP20.:https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=600&auto=format&fit=crop",
          status: "PENDING",
          retry_count: 0,
          provider_message_id: null,
          retry_reason: null,
          last_attempt_at: null,
          created_at: new Date(Date.now() - 15 * 60000).toISOString(),
          updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
        },
        {
          id: "msg-demo2-2",
          campaign_id: "camp-demo-2",
          phone: "+44 7911 123456",
          normalized_phone: "447911123456",
          message: "Hi Thomas, thank you for being a loyalty regular! Get 20% off all Singapore outlets using VIP20.",
          attachment_url: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=600&auto=format&fit=crop",
          fingerprint: "camp-demo-2:447911123456:Hi Thomas, thank you for being a loyalty regular! Get 20% off all Singapore outlets using VIP20.:https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=600&auto=format&fit=crop",
          status: "PENDING",
          retry_count: 0,
          provider_message_id: null,
          retry_reason: null,
          last_attempt_at: null,
          created_at: new Date(Date.now() - 15 * 60000).toISOString(),
          updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
        }
      ],
      send_attempts: [
        {
          id: "att-1",
          campaign_message_id: "msg-4",
          attempt_number: 1,
          provider_response: null,
          error_message: "ECONNREFUSED: No route to host during post",
          created_at: new Date(Date.now() - 2.8 * 3600000).toISOString(),
        },
        {
          id: "att-2",
          campaign_message_id: "msg-4",
          attempt_number: 2,
          provider_response: null,
          error_message: "Network request timeout: Nabda endpoint in Singapore unreachable",
          created_at: new Date(Date.now() - 2.7 * 3600000).toISOString(),
        },
        {
          id: "att-3",
          campaign_message_id: "msg-4",
          attempt_number: 3,
          provider_response: null,
          error_message: "Instance connection dead: failed to authenticate sessions",
          created_at: new Date(Date.now() - 2.6 * 3600000).toISOString(),
        }
      ],
      logs: [
        {
          id: "log-1",
          timestamp: new Date(Date.now() - 1 * 3600000).toISOString(),
          level: "info",
          instance_id: "inst-primary-1",
          campaign_id: null,
          message: "Instance Singapore Support Connected to WhatsApp Server. Dynamic ping: 48ms.",
        },
        {
          id: "log-2",
          timestamp: new Date(Date.now() - 40 * 60000).toISOString(),
          level: "success",
          instance_id: "inst-primary-1",
          campaign_id: "camp-demo-1",
          message: "Campaign 'Q2 Product Launch Notification' completed. Sent: 10, Failed: 1, Duplicates Skipped: 1.",
        },
      ],
      idempotency_keys: {
        "idem-seed-1": { timestamp: new Date(Date.now() - 3 * 3600000).toISOString(), campaign_id: "camp-demo-1" },
        "idem-seed-2": { timestamp: new Date(Date.now() - 15 * 60000).toISOString(), campaign_id: "camp-demo-2" },
      },
    };
  }

  // Queue writes sequentially to block concurrent JSON corruptions
  public save(): Promise<void> {
    this.writePromise = this.writePromise.then(() => {
      return new Promise<void>((resolve, reject) => {
        try {
          fs.writeFile(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8", (err) => {
            if (err) {
              console.error("[Database] Failed to write db.json:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        } catch (e) {
          reject(e);
        }
      });
    });
    return this.writePromise;
  }

  private saveSync() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (err) {
      console.error("[Database] Failed to write db.json synchronously:", err);
    }
  }

  // Methods
  public getInstances(): Instance[] {
    return this.data.instances;
  }

  public addInstance(inst: Omit<Instance, "id" | "created_at">): Instance {
    const newInst: Instance = {
      ...inst,
      id: "inst-" + Math.random().toString(36).substring(2, 11),
      created_at: new Date().toISOString(),
    };
    this.data.instances.push(newInst);
    this.save();
    this.addLog("info", newInst.id, null, `Instance '${newInst.name}' added to orchestrator pool.`);
    return newInst;
  }

  public updateInstance(id: string, updates: Partial<Instance>): Instance | null {
    const idx = this.data.instances.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    this.data.instances[idx] = { ...this.data.instances[idx], ...updates };
    this.save();
    return this.data.instances[idx];
  }

  public deleteInstance(id: string): boolean {
    const idx = this.data.instances.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    const name = this.data.instances[idx].name;
    this.data.instances.splice(idx, 1);
    this.save();
    this.addLog("warning", null, null, `Instance '${name}' removed from cluster.`);
    return true;
  }

  public getCampaigns(): Campaign[] {
    return this.data.campaigns;
  }

  public getCampaign(id: string): Campaign | null {
    return this.data.campaigns.find((c) => c.id === id) || null;
  }

  public addCampaign(camp: Omit<Campaign, "id" | "created_at" | "started_at" | "completed_at" | "sent_count" | "delivered_count" | "failed_count" | "duplicate_count">): Campaign {
    const newCamp: Campaign = {
      ...camp,
      id: "camp-" + Math.random().toString(36).substring(2, 11),
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      sent_count: 0,
      delivered_count: 0,
      failed_count: 0,
      duplicate_count: 0,
    };
    this.data.campaigns.push(newCamp);
    if (camp.idempotency_key) {
      this.data.idempotency_keys[camp.idempotency_key] = {
        timestamp: new Date().toISOString(),
        campaign_id: newCamp.id,
      };
    }
    this.save();
    this.addLog("info", camp.instance_id, newCamp.id, `Campaign '${newCamp.name}' created with ${newCamp.total_contacts} contacts.`);
    return newCamp;
  }

  public updateCampaignStatus(id: string, status: Campaign["status"]) {
    const idx = this.data.campaigns.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const camp = this.data.campaigns[idx];
    camp.status = status;
    if (status === "PROCESSING" && !camp.started_at) {
      camp.started_at = new Date().toISOString();
    }
    if (status === "COMPLETED" && !camp.completed_at) {
      camp.completed_at = new Date().toISOString();
    }
    
    // Auto-propagate state change to message queues if pausing/resuming/cancelling
    if (status === "QUEUED") {
      // Mark all pending messages of this campaign as QUEUED
      this.data.messages.forEach(m => {
        if (m.campaign_id === id && m.status === "PENDING") {
          m.status = "QUEUED";
          m.updated_at = new Date().toISOString();
        }
      });
    } else if (status === "PAUSED") {
      // Mark all QUEUED/PENDING messages as PENDING to halt consumer polling
      this.data.messages.forEach(m => {
        if (m.campaign_id === id && (m.status === "QUEUED" || m.status === "PROCESSING")) {
          m.status = "PENDING";
          m.updated_at = new Date().toISOString();
        }
      });
    } else if (status === "CANCELLED") {
      this.data.messages.forEach(m => {
        if (m.campaign_id === id && (m.status === "QUEUED" || m.status === "PROCESSING" || m.status === "PENDING")) {
          m.status = "CANCELLED";
          m.updated_at = new Date().toISOString();
        }
      });
    }

    this.save();
    this.addLog(
      status === "COMPLETED" ? "success" : status === "CANCELLED" || status === "PAUSED" ? "warning" : "info",
      camp.instance_id,
      camp.id,
      `Campaign status shifted to '${status}'.`
    );
  }

  public updateCampaignMetrics(id: string) {
    const camp = this.data.campaigns.find(c => c.id === id);
    if (!camp) return;
    
    const campMessages = this.data.messages.filter(m => m.campaign_id === id);
    camp.sent_count = campMessages.filter(m => ["SENT", "DELIVERED"].includes(m.status)).length;
    camp.delivered_count = campMessages.filter(m => m.status === "DELIVERED").length;
    camp.failed_count = campMessages.filter(m => m.status === "FAILED").length;
    camp.duplicate_count = campMessages.filter(m => m.status === "SKIPPED_DUPLICATE").length;

    // Evaluate auto-completed conditions
    const activeMsgCount = campMessages.filter(m => ["PENDING", "QUEUED", "PROCESSING"].includes(m.status)).length;
    if (activeMsgCount === 0 && camp.status === "PROCESSING") {
      camp.status = "COMPLETED";
      camp.completed_at = new Date().toISOString();
      this.addLog("success", camp.instance_id, camp.id, `All delivery threads completed for '${camp.name}'. Final Success: ${camp.sent_count}/${camp.total_contacts}`);
    }

    this.save();
  }

  public addMessage(msg: Omit<CampaignMessage, "id" | "created_at" | "updated_at">): CampaignMessage {
    const newMsg: CampaignMessage = {
      ...msg,
      id: "msg-" + Math.random().toString(36).substring(2, 11),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.messages.push(newMsg);
    // Note: Do not save database *for each* message individually in loops. Let callers handle bulk saves!
    return newMsg;
  }

  public bulkAddMessages(msgs: Omit<CampaignMessage, "id" | "created_at" | "updated_at">[]) {
    const added: CampaignMessage[] = [];
    for (const m of msgs) {
      const newMsg: CampaignMessage = {
        ...m,
        id: "msg-" + Math.random().toString(36).substring(2, 11),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.data.messages.push(newMsg);
      added.push(newMsg);
    }
    this.save();
    return added;
  }

  public getMessages(campaignId?: string): CampaignMessage[] {
    if (campaignId) {
      return this.data.messages.filter((m) => m.campaign_id === campaignId);
    }
    return this.data.messages;
  }

  public getMessage(id: string): CampaignMessage | null {
    return this.data.messages.find((m) => m.id === id) || null;
  }

  public verifyFingerprintExists(fingerprint: string, excludeId?: string): boolean {
    return this.data.messages.some(
      (m) => m.fingerprint === fingerprint && 
             m.id !== excludeId && 
             ["SENT", "DELIVERED", "PROCESSING"].includes(m.status)
    );
  }

  public getMessageByFingerprint(fingerprint: string): CampaignMessage | null {
    return this.data.messages.find(m => m.fingerprint === fingerprint) || null;
  }

  public updateMessageStatus(id: string, status: CampaignMessage["status"], updates: Partial<CampaignMessage> = {}) {
    const msg = this.data.messages.find((m) => m.id === id);
    if (!msg) return;
    
    const prevStatus = msg.status;
    msg.status = status;
    Object.assign(msg, updates);
    msg.updated_at = new Date().toISOString();

    this.save();

    // Trigger Campaign metrics propagation
    this.updateCampaignMetrics(msg.campaign_id);
  }

  public recordSendAttempt(attempt: Omit<SendAttempt, "id" | "created_at">) {
    const newAttempt: SendAttempt = {
      ...attempt,
      id: "att-" + Math.random().toString(36).substring(2, 11),
      created_at: new Date().toISOString(),
    };
    this.data.send_attempts.push(newAttempt);
    this.save();
    return newAttempt;
  }

  public getAttemptsForMessage(messageId: string): SendAttempt[] {
    return this.data.send_attempts.filter((a) => a.campaign_message_id === messageId);
  }

  public addLog(level: SystemLog["level"], instanceId: string | null, campaignId: string | null, message: string): SystemLog {
    const newLog: SystemLog = {
      id: "log-" + Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      level,
      instance_id: instanceId,
      campaign_id: campaignId,
      message,
    };
    this.data.logs.unshift(newLog); // Prepend so latest shows up first
    if (this.data.logs.length > 500) {
      this.data.logs.pop(); // Keep log files tight
    }
    this.save();
    return newLog;
  }

  public getLogs(limit: number = 80): SystemLog[] {
    return this.data.logs.slice(0, limit);
  }

  public isIdempotencyKeyUsed(key: string): boolean {
    return !!this.data.idempotency_keys[key];
  }

  public getCampaignByIdempotencyKey(key: string): string | null {
    return this.data.idempotency_keys[key]?.campaign_id || null;
  }

  public retryFailedCampaignMessages(campaignId: string) {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) return;

    let retriedCount = 0;
    this.data.messages.forEach(m => {
      if (m.campaign_id === campaignId && m.status === "FAILED") {
        m.status = "QUEUED"; // Reset back to queue
        m.retry_count = 0;   // Reset retry attempts count
        m.retry_reason = null;
        m.provider_message_id = null;
        m.updated_at = new Date().toISOString();
        retriedCount++;
      }
    });

    if (retriedCount > 0) {
      campaign.status = "QUEUED";
      campaign.completed_at = null;
      this.save();
      this.updateCampaignMetrics(campaignId);
      this.addLog("info", campaign.instance_id, campaignId, `Re-queued ${retriedCount} failed messages for campaign processing.`);
    }
  }

  public getQueuedMessageForInstance(instanceId: string): CampaignMessage | null {
    // Nabda processes messages sequentially per instance. Let's find one queued message
    // but ONLY if the campaign is active (PROCESSING or QUEUED)
    const activeCampaignIds = new Set(
      this.data.campaigns
        .filter(c => ["PROCESSING", "QUEUED"].includes(c.status) && c.instance_id === instanceId)
        .map(c => c.id)
    );

    if (activeCampaignIds.size === 0) return null;

    // Find the oldest message belonging to these active campaigns
    const msg = this.data.messages.find(m => 
      m.status === "QUEUED" && activeCampaignIds.has(m.campaign_id)
    );

    return msg || null;
  }
}

export const dbInstance = new LocalDatabase();
