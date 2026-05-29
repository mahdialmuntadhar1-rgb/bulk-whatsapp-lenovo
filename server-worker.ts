import { dbInstance, CampaignMessage, Instance, Campaign } from "./server-db";
import { NabdaClient } from "./server-nabda";

class QueueManager {
  private activeLoops: Record<string, NodeJS.Timeout> = {};
  private instanceLocks: Record<string, boolean> = {};
  private isShuttingDown: boolean = false;

  constructor() {
    this.startOrchestrator();
  }

  /**
   * Initializes the dispatcher loop for each Whatsapp Nabda Instance in the database.
   */
  public startOrchestrator() {
    console.log("[Queue Orchestrator] Booting background workers...");
    this.isShuttingDown = false;
    
    // Auto-resume crashed or interrupted campaigns on application startup!
    this.recoverActiveCampaigns();

    // Start checking for instance cycles periodically
    const loopInterval = setInterval(() => {
      if (this.isShuttingDown) {
        clearInterval(loopInterval);
        return;
      }
      this.tick();
    }, 2000); // Poll database for updates every 2 seconds
  }

  public shutdown() {
    this.isShuttingDown = true;
    console.log("[Queue Orchestrator] Worker shutdown completed safely.");
  }

  /**
   * Recover any campaigns that were left in 'PROCESSING' or 'QUEUED' states if server restarted.
   */
  private recoverActiveCampaigns() {
    const campaigns = dbInstance.getCampaigns();
    let recoveredCount = 0;

    for (const c of campaigns) {
      if (c.status === "PROCESSING" || c.status === "QUEUED") {
        // Find any messages that were left in 'PROCESSING' state and mark them back to 'QUEUED' so they can be processed and avoiding getting stuck!
        const messages = dbInstance.getMessages(c.id);
        let resetMessagesCount = 0;
        
        messages.forEach((m) => {
          if (m.status === "PROCESSING") {
            dbInstance.updateMessageStatus(m.id, "QUEUED");
            resetMessagesCount++;
          }
        });

        // Set status to QUEUED so background processors pick it up sequentially
        dbInstance.updateCampaignStatus(c.id, "QUEUED");
        recoveredCount++;
        
        dbInstance.addLog(
          "warning",
          c.instance_id,
          c.id,
          `Automated crash recovery: resumed campaign '${c.name}' and re-queued ${resetMessagesCount} messages left in PROCESSING state.`
        );
      }
    }

    if (recoveredCount > 0) {
      console.log(`[Queue Orchestrator] Sweeper recovered ${recoveredCount} campaigns.`);
    }
  }

  /**
   * Evaluates active WhatsApp instances and triggers processing cycle if unlocked.
   */
  private async tick() {
    const instances = dbInstance.getInstances();

    for (const inst of instances) {
      if (this.instanceLocks[inst.id] === true) {
        // Busy processing a message, sequential lock strictly enforced!
        continue;
      }

      // Check if there is any messages ready for dispatch
      const nextMessage = this.fetchNextEligibleMessage(inst.id);
      if (nextMessage) {
        // Trigger non-blocking asynchronous message dispatch thread for this instance
        this.processMessage(inst, nextMessage);
      }
    }
  }

  /**
   * Search for the next message belonging to active campaigns on a specific instance.
   * Leverages retry exponential backoffs and avoids duplicating messages in active retry.
   */
  private fetchNextEligibleMessage(instanceId: string): CampaignMessage | null {
    // 1. Ensure campaign itself is active
    const campaigns = dbInstance.getCampaigns();
    const activeCampaignIds = new Set(
      campaigns
        .filter((c) => ["QUEUED", "PROCESSING"].includes(c.status) && c.instance_id === instanceId)
        .map((c) => c.id)
    );

    if (activeCampaignIds.size === 0) return null;

    // 2. Fetch messages belonging to these active campaigns that are marked as QUEUED
    const allMessages = dbInstance.getMessages();
    const candidates = allMessages.filter(
      (m) => m.status === "QUEUED" && activeCampaignIds.has(m.campaign_id)
    );

    if (candidates.length === 0) {
      // Clean up check: if there are campaigns still marked QUEUED/PROCESSING but no messages are actually left QUEUED
      // then we should make sure that campaign metrics and completion sweeps are run!
      campaigns.forEach((c) => {
        if (["QUEUED", "PROCESSING"].includes(c.status) && c.instance_id === instanceId) {
          dbInstance.updateCampaignMetrics(c.id);
        }
      });
      return null;
    }

    // 3. Evaluate eligibility (retry backoff timeline)
    const nowTs = Date.now();
    for (const m of candidates) {
      if (m.retry_count > 0 && m.last_attempt_at) {
        const lastAttempt = new Date(m.last_attempt_at).getTime();
        
        // Exponential backoffs: Retry 1 = 15s, Retry 2 = 60s, Retry 3 = 180s (scaled down slightly for sleek testability)
        let cooldownMs = 15000; // 15 seconds default
        if (m.retry_count === 2) cooldownMs = 60000;  // 1 minute
        if (m.retry_count === 3) cooldownMs = 180000; // 3 minutes

        if (nowTs - lastAttempt < cooldownMs) {
          // Still in cooling period, bypass
          continue;
        }
      }

      // Found oldest eligible message!
      return m;
    }

    return null;
  }

  /**
   * Executes the actual message sending operations including duplicates fingerprinting, Nabda routing, and retries.
   */
  private async processMessage(instance: Instance, message: CampaignMessage) {
    const instanceId = instance.id;
    // Set lock to ensure sequential single-threaded dispatch per WhatsApp line
    this.instanceLocks[instanceId] = true;

    const campaign = dbInstance.getCampaign(message.campaign_id);
    if (!campaign) {
      dbInstance.updateMessageStatus(message.id, "CANCELLED", { retry_reason: "Campaign not found" });
      this.instanceLocks[instanceId] = false;
      return;
    }

    // Ensure campaign status transitions to PROCESSING
    if (campaign.status === "QUEUED") {
      dbInstance.updateCampaignStatus(campaign.id, "PROCESSING");
    }

    // Double check that campaign is not paused or cancelled in between cycles
    if (["PAUSED", "CANCELLED", "COMPLETED"].includes(campaign.status)) {
      dbInstance.updateMessageStatus(message.id, campaign.status === "CANCELLED" ? "CANCELLED" : "PENDING");
      this.instanceLocks[instanceId] = false;
      return;
    }

    try {
      // 1. UPDATE STATE TO PROCESSING immediately
      dbInstance.updateMessageStatus(message.id, "PROCESSING");

      // 2. CHECK ANTI-DUPLICATION FINGERPRINT
      // Fingerprint combines campaign, phone, normalized text, and attachment url to guarantee perfect idempotency
      const isDuplicate = dbInstance.verifyFingerprintExists(message.fingerprint, message.id);
      
      if (isDuplicate) {
        dbInstance.updateMessageStatus(message.id, "SKIPPED_DUPLICATE", {
          retry_reason: "Anti-duplication block: Identical fingerprint already sent in this instance queue."
        });
        dbInstance.addLog(
          "warning",
          instanceId,
          campaign.id,
          `Anti-Duplication: Skipped message sending to phone ${message.normalized_phone}. Duplicate found.`
        );

        // Released lock immediately - skipped duplicates execute zero pacing delay
        this.instanceLocks[instanceId] = false;
        return;
      }

      // 3. DISPATCH VIA NABDA OTP CLIENT
      const attemptNum = message.retry_count + 1;
      
      const payloadMessageText = message.message;
      const response = await NabdaClient.sendMessage(instance, {
        phone: message.normalized_phone,
        message: payloadMessageText,
        attachmentUrl: message.attachment_url,
        messageId: message.id,
      });

      if (response.success) {
        // Message processed by Nabda. Note: We mark as SENT but NOT DELIVERED until webhooks feedback.
        dbInstance.updateMessageStatus(message.id, "SENT", {
          provider_message_id: response.message_id || null,
          retry_reason: null,
          last_attempt_at: new Date().toISOString(),
        });

        dbInstance.recordSendAttempt({
          campaign_message_id: message.id,
          attempt_number: attemptNum,
          provider_response: JSON.stringify({ message_id: response.message_id, success: true }),
          error_message: null,
        });

        dbInstance.addLog(
          "info",
          instanceId,
          campaign.id,
          `Message dispatched to ${message.phone} (Ref: ${response.message_id || "simulated"}).`
        );

        // 4. HUMAN-LIKE SENDING pacing delay
        // Choose a randomized delay within pacing profile bounds
        const pacingMin = campaign.pacing_delay_min || 4;
        const pacingMax = campaign.pacing_delay_max || 12;
        const randomSeconds = Math.floor(Math.random() * (pacingMax - pacingMin + 1)) + pacingMin;
        
        console.log(`[Queue Orchestrator] Message sent. Sleeping for human-like throttle: ${randomSeconds}s...`);
        
        // Wait background pacing cooldown
        await new Promise((resolve) => setTimeout(resolve, randomSeconds * 1000));

      } else {
        // Dispatch failed, evaluate retry loops
        const errorMsg = response.error || "Unknown Nabda error API gateway failure.";
        const nextRetryCount = message.retry_count + 1;
        
        dbInstance.recordSendAttempt({
          campaign_message_id: message.id,
          attempt_number: attemptNum,
          provider_response: null,
          error_message: errorMsg,
        });

        if (nextRetryCount >= 3) {
          // Exhausted max retry limit
          dbInstance.updateMessageStatus(message.id, "FAILED", {
            retry_count: nextRetryCount,
            last_attempt_at: new Date().toISOString(),
            retry_reason: `Attempt ${nextRetryCount} failed: ${errorMsg}`,
          });

          dbInstance.addLog(
            "error",
            instanceId,
            campaign.id,
            `Delivery permanently failed for ${message.phone} after 3 attempts. Error: ${errorMsg}`
          );
        } else {
          // Put back in queue to retry with exponential backoff on next tick check
          dbInstance.updateMessageStatus(message.id, "QUEUED", {
            retry_count: nextRetryCount,
            last_attempt_at: new Date().toISOString(),
            retry_reason: `Attempt ${nextRetryCount} failed, retrying soon. Last Error: ${errorMsg}`,
          });

          dbInstance.addLog(
            "warning",
            instanceId,
            campaign.id,
            `Attempt ${attemptNum}/3 failed for ${message.phone}. Rescheduled with exponential backoff.`
          );
        }

        // Wait a standard failing pacing padding (e.g. 2s) before unlocking to let the network stabilize
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

    } catch (err: any) {
      console.error(`[Queue Orchestrator] Critical error processing message ${message.id}:`, err);
      dbInstance.addLog(
        "error",
        instanceId,
        campaign.id,
        `Task exception inside orchestrator loop: ${err.message || String(err)}`
      );

      // Reset message to failed if critical crash occurred
      dbInstance.updateMessageStatus(message.id, "FAILED", {
        retry_reason: `Internal Orchestrator Exception: ${err.message || "Unknown error"}`
      });

    } finally {
      // ALWAYS unlock the instance to guarantee processing resumes
      this.instanceLocks[instanceId] = false;
    }
  }

  /**
   * Forces an immediate cycle check for a campaign. Use when starting or resuming campaigns.
   */
  public triggerImmediateCycle(instanceId: string) {
    if (this.instanceLocks[instanceId] !== true) {
      this.tick();
    }
  }
}

export const queueManagerInstance = new QueueManager();
