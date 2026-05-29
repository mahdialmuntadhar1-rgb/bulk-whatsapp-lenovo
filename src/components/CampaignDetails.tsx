import React, { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  XOctagon, 
  RefreshCcw, 
  Search, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  HelpCircle,
  Clock,
  Layers,
  Database,
  Radio,
  FileText
} from "lucide-react";
import { Campaign, CampaignMessage, Instance } from "../types";
import { ApiClient } from "../lib/api-client";

interface CampaignDetailsProps {
  campaignId: string;
  instances: Instance[];
  onBack: () => void;
}

export default function CampaignDetails({ campaignId, instances, onBack }: CampaignDetailsProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [messages, setMessages] = useState<CampaignMessage[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  
  // Controls
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Load Campaign and Messages from API
  const refreshCampaignState = async () => {
    try {
      const camp = await ApiClient.get<Campaign>(`/api/campaigns/${campaignId}`);
      setCampaign(camp);

      const msgs = await ApiClient.get<CampaignMessage[]>(`/api/campaigns/${campaignId}/messages`);
      setMessages(msgs);

      // Tail platform logs representing this campaign context
      const sysLogs = await ApiClient.get<any[]>("/api/logs?limit=50");
      setLogs(sysLogs.filter(l => l.campaign_id === campaignId));
    } catch (err) {
      console.error("Failed to load campaign metadata:", err);
    }
  };

  // Poll for updates if campaign is active (running or queued)
  useEffect(() => {
    refreshCampaignState();
    
    const interval = setInterval(() => {
      if (campaign && ["QUEUED", "PROCESSING"].includes(campaign.status)) {
        refreshCampaignState();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [campaignId, campaign?.status]);

  if (!campaign) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center flex-col gap-3">
        <RefreshCcw className="w-8 h-8 animate-spin text-primary" />
        <span>Syncing campaign state telemetry...</span>
      </div>
    );
  }

  // Get instance name
  const instName = instances.find(i => i.id === campaign.instance_id)?.name || "WhatsApp Instance Line";

  const totalCompleted = campaign.sent_count + campaign.failed_count + campaign.duplicate_count;
  const progressPercent = campaign.total_contacts > 0 
    ? Math.round((totalCompleted / campaign.total_contacts) * 100) 
    : 0;

  // Formula: average pacing delay * pending contacts count
  const remainingCount = Math.max(0, campaign.total_contacts - totalCompleted);
  const avgPacingSeconds = ((campaign.pacing_delay_min + campaign.pacing_delay_max) / 2) || 8;
  const etaSeconds = remainingCount * avgPacingSeconds;

  const getETALabel = () => {
    if (campaign.status === "COMPLETED") return "Campaign fully completed.";
    if (campaign.status === "CANCELLED") return "Campaign cancelled.";
    if (campaign.status === "PAUSED") return "Pacing paused.";
    if (etaSeconds === 0) return "Calculating ETA...";
    
    if (etaSeconds < 60) return `~${Math.round(etaSeconds)}s remaining`;
    const etaMins = Math.round(etaSeconds / 60);
    return `~${etaMins}m remaining (pacing at avg. ${avgPacingSeconds}s/msg)`;
  };

  // Status Handlers
  const handleUpdateStatus = async (newStatus: "QUEUED" | "PAUSED" | "CANCELLED") => {
    try {
      setIsActionLoading(true);
      const updated = await ApiClient.post<Campaign>(`/api/campaigns/${campaign.id}/status`, { status: newStatus });
      setCampaign(updated);
      await refreshCampaignState();
    } catch (err: any) {
      alert(`Status modification failed: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      setIsActionLoading(true);
      await ApiClient.post(`/api/campaigns/${campaign.id}/retry-failed`);
      await refreshCampaignState();
    } catch (err: any) {
      alert(`Selective retry fails: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Webhook manual testing trigger (Simulates client receiving webhook notification)
  const handleTriggerSimulatedWebhook = async (messageId: string) => {
    try {
      await ApiClient.post(`/api/simulator/trigger-delivery`, { message_id: messageId });
      await refreshCampaignState();
    } catch (err: any) {
      alert(`Simulation injection failed: ${err.message}`);
    }
  };

  // Messages Grid calculations
  const filteredMessages = messages.filter(m => {
    const text = m.phone.toLowerCase() + m.message.toLowerCase() + (m.provider_message_id || "").toLowerCase();
    const matchesSearch = text.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" ? true : m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const messageStatesBadges: Record<CampaignMessage["status"], { bg: string; text: string; label: string }> = {
    PENDING: { bg: "bg-muted text-muted-foreground", text: "text-muted-foreground", label: "Pending" },
    QUEUED: { bg: "bg-blue-500/15 text-blue-500 animate-pulse", text: "text-blue-500", label: "Queued" },
    PROCESSING: { bg: "bg-amber-500/15 text-amber-500 animate-pulse", text: "text-amber-500", label: "Dispatching" },
    SENT: { bg: "bg-sky-500/15 text-sky-500", text: "text-sky-500", label: "Sent" },
    DELIVERED: { bg: "bg-emerald-500/15 text-emerald-500", text: "text-emerald-500", label: "Delivered √" },
    FAILED: { bg: "bg-red-500/15 text-red-500", text: "text-red-500", label: "Failed" },
    SKIPPED_DUPLICATE: { bg: "bg-amber-700/10 text-amber-700 border-amber-700/20", text: "text-amber-700", label: "Duplicate Block" },
    CANCELLED: { bg: "bg-zinc-500/15 text-zinc-500", text: "text-zinc-500", label: "Cancelled" },
  };

  return (
    <div className="space-y-6">
      
      {/* Upper header section */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">{campaign.name}</h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-muted text-muted-foreground uppercase`}>
                {campaign.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assigned Line: <strong className="font-semibold text-foreground">{instName}</strong>
            </p>
          </div>
        </div>

        {/* Command Buttons based on active states */}
        <div className="flex items-center gap-2 flex-wrap">
          {campaign.status === "PENDING" && (
            <button
              onClick={() => handleUpdateStatus("QUEUED")}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Bootstrap Queue</span>
            </button>
          )}

          {["QUEUED", "PROCESSING"].includes(campaign.status) && (
            <button
              onClick={() => handleUpdateStatus("PAUSED")}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-semibold border border-amber-500/20 bg-amber-500/15 text-amber-500 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause Campaign</span>
            </button>
          )}

          {campaign.status === "PAUSED" && (
            <button
              onClick={() => handleUpdateStatus("QUEUED")}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-semibold bg-primary hover:bg-primary/95 text-primary-foreground rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Broadcast</span>
            </button>
          )}

          {!["COMPLETED", "CANCELLED"].includes(campaign.status) && (
            <button
              onClick={() => {
                if (confirm("Are you sure you wish to permanently halt this campaign and cancel all pending messages?")) {
                  handleUpdateStatus("CANCELLED");
                }
              }}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-semibold border border-red-500/20 bg-red-500/15 text-red-500 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <XOctagon className="w-3.5 h-3.5" />
              <span>Cancel Queue</span>
            </button>
          )}

          {campaign.failed_count > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={isActionLoading}
              id="btn-retry-fails"
              className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-semibold border border-border bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${isActionLoading ? "animate-spin" : ""}`} />
              <span>Retry Fails ({campaign.failed_count})</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Cards & ETA Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Core Percentage Gauge */}
        <div className="md:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 select-none">
              <span className="text-xs font-bold text-foreground">Dispatched Ratio Progress</span>
              <span className="text-xs font-mono font-bold text-primary">{progressPercent}%</span>
            </div>
            
            {/* Progression visual layout */}
            <div className="h-3.5 bg-muted border border-border/60 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  campaign.status === "COMPLETED" 
                    ? "bg-emerald-500" 
                    : campaign.status === "CANCELLED" 
                    ? "bg-red-400" 
                    : "bg-primary animate-pulse"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xxs font-mono text-muted-foreground mt-4 border-t border-border pt-4">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>ETA: {getETALabel()}</span>
            </span>
            <span>TOTAL METRIC: {totalCompleted} / {campaign.total_contacts} Contacts</span>
          </div>
        </div>

        {/* Small stats breakout dashboard */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm grid grid-cols-2 gap-3.5">
          <div className="bg-muted/50 p-2.5 rounded-lg border border-border/40 text-center">
            <span className="text-[10px] font-mono text-muted-foreground uppercase font-semibold">Sent</span>
            <strong className="text-xl text-foreground font-bold block mt-1">{campaign.sent_count}</strong>
          </div>
          <div className="bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/10 text-center text-emerald-500">
            <span className="text-[10px] font-mono text-muted-foreground uppercase font-semibold">Delivered</span>
            <strong className="text-xl font-bold block mt-1">{campaign.delivered_count}</strong>
          </div>
          <div className="bg-red-500/5 p-2.5 rounded-lg border border-red-500/10 text-center text-red-500">
            <span className="text-[10px] font-mono text-muted-foreground uppercase font-semibold">Failed</span>
            <strong className="text-xl font-bold block mt-1">{campaign.failed_count}</strong>
          </div>
          <div className="bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/10 text-center text-amber-500">
            <span className="text-[10px] font-mono text-muted-foreground uppercase font-semibold">Duplicates</span>
            <strong className="text-xl font-bold block mt-1">{campaign.duplicate_count}</strong>
          </div>
        </div>
      </div>

      {/* Grid Layout Section: Live Message Log Viewer and Filter controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Messages List Directory (Big Block) */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card text-card-foreground p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row gap-3.5 sm:items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h4 className="font-semibold text-sm text-foreground">Recipient Queue Log</h4>
              <p className="text-xxs text-muted-foreground">Individual dispatches status and provider traces.</p>
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              {/* Search contacts bar */}
              <div className="relative max-w-44">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Filter grid..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-muted border border-border pl-8 pr-2 py-1 text-xxs rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>

              {/* Status toggler select dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-muted border border-border text-xxs px-2 py-1.5 rounded focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="QUEUED">QUEUED</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="SENT">SENT</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="FAILED">FAILED</option>
                <option value="SKIPPED_DUPLICATE">DUPLICATES</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[9px] font-mono font-bold tracking-wider text-muted-foreground uppercase select-none">
                  <th className="px-4 py-2.5">Phone Number</th>
                  <th className="px-4 py-2.5">Compiled Message Context</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 font-mono text-center">Tries</th>
                  <th className="px-4 py-2.5 text-center font-mono">Simulate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xxs font-medium text-foreground select-text">
                {filteredMessages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground text-xs">
                      No matching queue messages found.
                    </td>
                  </tr>
                ) : (
                  filteredMessages.map(m => {
                    const bgBadge = messageStatesBadges[m.status] || messageStatesBadges.PENDING;
                    return (
                      <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-semibold font-mono text-card-foreground">
                          {m.phone}
                          <span className="text-[9px] text-muted-foreground/80 block font-normal mt-0.5">Norm: {m.normalized_phone}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px] leading-relaxed select-all">
                          <p className="truncate" title={m.message}>{m.message}</p>
                          {m.attachment_url && (
                            <span className="text-[8px] font-mono text-primary bg-primary/10 px-1 py-0.5 rounded truncate inline-block mt-1 max-w-[120px]" title={m.attachment_url}>
                              Media Attachment
                            </span>
                          )}
                          {m.retry_reason && (
                            <span className="text-[8px] font-mono text-red-500 bg-red-500/5 border border-red-500/10 px-1 py-0.5 rounded block leading-tight mt-1">
                              Fail reason: {m.retry_reason}
                            </span>
                          )}
                          {m.provider_message_id && (
                            <span className="text-[8px] font-mono text-muted-foreground block mt-1">Ref: {m.provider_message_id}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wide ${bgBadge.bg}`}>
                            {bgBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-muted-foreground font-semibold">
                          {m.retry_count}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.status === "SENT" ? (
                            <button
                              onClick={() => handleTriggerSimulatedWebhook(m.id)}
                              id={`btn-mock-webhook-${m.id}`}
                              className="px-2 py-1 border border-emerald-500/25 hover:bg-emerald-500/10 text-emerald-500 hover:text-emerald-600 rounded text-[9px] font-mono font-semibold transition-colors cursor-pointer"
                              title="Simulate WhatsApp delivery report webhook"
                            >
                              Deliver √
                            </button>
                          ) : (
                            <span className="text-muted-foreground/40 font-mono text-[9px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-time campaign scoped activity log (Sidebar Block) */}
        <div className="rounded-xl border border-border bg-card text-card-foreground p-5 shadow-sm flex flex-col justify-between h-[450px]">
          <div className="flex flex-col h-full">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <Database className="w-4 h-4 text-purple-500" />
              <span>Diagnostic Traces</span>
            </h4>

            {/* Scoped activities trail */}
            <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1 text-xxs font-mono">
              {logs.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground font-sans">
                  No telemetry logged. Standard pacing activities will print here in real-time durand sendings.
                </div>
              ) : (
                logs.map(l => (
                  <div key={l.id} className="border-b border-border/40 pb-2">
                    <div className="flex justify-between text-[9px] text-muted-foreground mb-1 select-none">
                      <span>[{new Date(l.timestamp).toLocaleTimeString()}]</span>
                      <span className={`uppercase font-bold ${
                        l.level === "success" ? "text-emerald-500" : l.level === "error" ? "text-red-500" : "text-blue-400"
                      }`}>{l.level}</span>
                    </div>
                    <p className="text-foreground leading-normal">{l.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
