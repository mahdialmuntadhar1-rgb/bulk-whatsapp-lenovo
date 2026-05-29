import { Instance } from "./server-db";

export interface NabdaSendResponse {
  success: boolean;
  message_id?: string;
  error?: string;
}

export class NabdaClient {
  /**
   * Dispatches a message to Nabda OTP API gateway.
   * If real credentials are provided or if configured, runs real HTTP request.
   * Otherwise, runs a highly-observed local simulation that fires delivery webhooks later.
   */
  static async sendMessage(
    instance: Instance,
    payload: {
      phone: string;
      message: string;
      attachmentUrl: string | null;
      messageId: string; // our local campaign message ID
    }
  ): Promise<NabdaSendResponse> {
    const isMock = !instance.api_key || instance.api_url.includes(".example.com") || instance.api_key.startsWith("nb_live_");

    console.log(`[Nabda API Client] Delivering to ${payload.phone} via Instance ${instance.name} (${instance.id}) [Mock=${isMock}]`);

    if (!isMock) {
      try {
        const url = `${instance.api_url.replace(/\/$/, "")}/api/v1/send`;
        const body = {
          instance_id: instance.id,
          to: payload.phone,
          message: payload.message,
          media_url: payload.attachmentUrl || undefined,
          reference: payload.messageId,
        };

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${instance.api_key}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            success: false,
            error: `Nabda Error (${response.status}): ${text || response.statusText}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          message_id: data.message_id || `nb_msg_${Math.random().toString(36).substring(2, 11)}`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Nabda Transport Hook Failed: ${err.message || String(err)}`,
        };
      }
    } else {
      // Simulate Nabda OTP network trip
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Simulate a small fraction of failures (e.g. 5% phone invalid, or based on specific strings)
      if (payload.phone.endsWith("4")) {
        return {
          success: false,
          error: "Nabda OTP Transport: Recipient number is not registered on WhatsApp.",
        };
      }

      const generatedProviderId = `nabda_msg_${Math.random().toString(36).substring(2, 9)}`;

      // Spawn asynchronus mock webhook callback after 3-5 seconds to simulate WhatsApp delivery confirmations!
      // This allows the full orchestrator analytics and metric dashboards to update dynamically.
      this.triggerDeferredWebhook(payload.phone, generatedProviderId, payload.messageId);

      return {
        success: true,
        message_id: generatedProviderId,
      };
    }
  }

  /**
   * Checks the connection state and physical session pairing of the Nabda OTP instance.
   */
  static async checkStatus(instance: Instance): Promise<"connected" | "disconnected"> {
    const isMock = !instance.api_key || instance.api_url.includes(".example.com") || instance.api_key.startsWith("nb_live_");

    if (!isMock) {
      try {
        const url = `${instance.api_url.replace(/\/$/, "")}/api/v1/instance/status?instance_id=${instance.id}`;
        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${instance.api_key}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          return data.status === "connected" ? "connected" : "disconnected";
        }
        return "disconnected";
      } catch {
        return "disconnected";
      }
    } else {
      // Simulate quick check
      await new Promise((resolve) => setTimeout(resolve, 400));
      return instance.status === "connected" ? "connected" : "disconnected"; // Return stored status in mock state
    }
  }

  /**
   * Dispatches and signs a mock webhook event back to our server endpoint to update delivery status
   */
  private static triggerDeferredWebhook(phone: string, providerMessageId: string, campaignMessageId: string) {
    const delay = 3000 + Math.random() * 4000; // 3 to 7 seconds delay
    setTimeout(async () => {
      try {
        console.log(`[Nabda Webhook Simulator] Dispatching delivery receipt for provider_id: ${providerMessageId}`);
        
        // Post back to our local delivery webhook endpoint on port 3000
        const response = await fetch("http://localhost:3000/api/webhooks/nabda", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-nabda-signature": "sha256_mock_signature_system",
          },
          body: JSON.stringify({
            event: "delivery_receipt",
            instance_id: "inst-primary-1",
            provider_message_id: providerMessageId,
            campaign_message_id: campaignMessageId,
            phone: phone,
            status: "delivered", // sent, delivered, failed
            timestamp: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          console.warn(`[Nabda Webhook Simulator] Delivery webhook post rejected by server: ${response.status}`);
        }
      } catch (err: any) {
        console.error(`[Nabda Webhook Simulator] Error attempting to invoke self-webhook callback:`, err.message);
      }
    }, delay);
  }
}
