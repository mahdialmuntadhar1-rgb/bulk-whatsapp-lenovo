// Frontend Type Definitions

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
  pacing_delay_min: number;
  pacing_delay_max: number;
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

export interface SystemLog {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  instance_id: string | null;
  campaign_id: string | null;
  message: string;
}

export interface AuthState {
  token: string | null;
  user: { email: string; name: string } | null;
  isAuthenticated: boolean;
}
