import React, { useState } from "react";
import { 
  Search, 
  Send, 
  Eye, 
  Trash2, 
  Plus, 
  Layers, 
  Ban, 
  PauseCircle, 
  PlayCircle 
} from "lucide-react";
import { Campaign, Instance } from "../types";

interface CampaignsListProps {
  campaigns: Campaign[];
  instances: Instance[];
  onSelectCampaign: (id: string) => void;
  onDeleteCampaign: (id: string) => void;
  onOpenCreateModal: () => void;
}

export default function CampaignsList({
  campaigns,
  instances,
  onSelectCampaign,
  onDeleteCampaign,
  onOpenCreateModal,
}: CampaignsListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Get instance readable name helper
  const getInstanceName = (instId: string) => {
    const inst = instances.find((i) => i.id === instId);
    return inst ? inst.name : `Instance (ID: ${instId.substring(0, 5)}...)`;
  };

  // Status Badge visual styles mapping
  const statusBadges: Record<Campaign["status"], { bg: string; text: string; label: string; dot: string }> = {
    PENDING: { bg: "bg-muted text-muted-foreground", text: "text-muted-foreground", label: "Draft State", dot: "bg-muted" },
    QUEUED: { bg: "bg-blue-550/10 text-blue-500 bg-blue-500/15 animate-pulse", text: "text-blue-500", label: "Queued", dot: "bg-blue-500" },
    PROCESSING: { bg: "bg-amber-500/10 text-amber-500 bg-amber-500/15 animate-pulse", text: "text-amber-500", label: "Sending Live", dot: "bg-amber-500" },
    PAUSED: { bg: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400", text: "text-amber-600", label: "Paused", dot: "bg-amber-600" },
    CANCELLED: { bg: "bg-red-500/10 text-red-500 bg-red-500/15", text: "text-red-500", label: "Shut Down", dot: "bg-red-500" },
    COMPLETED: { bg: "bg-emerald-500/10 text-emerald-500 bg-emerald-500/15", text: "text-emerald-500", label: "Completed", dot: "bg-emerald-500" },
  };

  // Filter campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    const nameMatch = c.name.toLowerCase().includes(search.toLowerCase());
    const statusMatch = statusFilter === "ALL" ? true : c.status === statusFilter;
    return nameMatch && statusMatch;
  });

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Campaign Directory</h2>
          <p className="text-xs text-muted-foreground">Log and supervise your bulk message broadcasts.</p>
        </div>
        <button
          onClick={onOpenCreateModal}
          id="btn-trigger-builder"
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-lg transition-all shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Assemble Campaign</span>
        </button>
      </div>

      {/* Filter and Tools Panel */}
      <div className="flex flex-col md:flex-row gap-3.5 justify-between">
        {/* Search input tab */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="Search campaigns by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9.5 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        {/* Tab state toggler bar */}
        <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-lg border border-border text-xs">
          {["ALL", "QUEUED", "PROCESSING", "PAUSED", "COMPLETED", "CANCELLED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === st
                  ? "bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns Listing Container */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {filteredCampaigns.length === 0 ? (
          <div className="py-16 text-center">
            <Send className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground text-sm">No Campaigns Found</h3>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              Assemble your primary messaging campaign by importing a CSV of numbers and assigning a WhatsApp slot.
            </p>
            <button
              onClick={onOpenCreateModal}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/80 cursor-pointer"
            >
              Create Campaign Now
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground font-mono text-xxs font-semibold tracking-wider uppercase select-none">
                  <th className="px-6 py-4">Campaign Name</th>
                  <th className="px-6 py-4">WhatsApp Line</th>
                  <th className="px-6 py-4">Dispatched Status</th>
                  <th className="px-6 py-4">Progress Rating</th>
                  <th className="px-6 py-4">Release Date</th>
                  <th className="px-6 py-4 text-center">Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs text-foreground">
                {filteredCampaigns.map((c) => {
                  const badge = statusBadges[c.status] || statusBadges.PENDING;
                  
                  // Compute progression bar variables
                  const completedMessages = c.sent_count + c.failed_count + c.duplicate_count;
                  const ratioPercent = c.total_contacts > 0 
                    ? Math.round((completedMessages / c.total_contacts) * 100) 
                    : 0;

                  return (
                    <tr 
                      key={c.id} 
                      id={`campaign-row-${c.id}`}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      <td className="px-6 py-4 font-semibold text-card-foreground">
                        <button
                          onClick={() => onSelectCampaign(c.id)}
                          className="hover:underline text-left font-semibold text-foreground block cursor-pointer"
                        >
                          {c.name}
                        </button>
                        <span className="text-[10px] text-muted-foreground font-mono block mt-1">ID: {c.id}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-medium">
                        {getInstanceName(c.instance_id)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xxs font-semibold font-mono tracking-wide ${badge.bg}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`}></span>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 min-w-[150px]">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden border border-border/40">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                c.status === "COMPLETED" 
                                  ? "bg-emerald-500" 
                                  : c.status === "CANCELLED" 
                                  ? "bg-red-400" 
                                  : "bg-primary animate-pulse"
                              }`} 
                              style={{ width: `${ratioPercent}%` }}
                            />
                          </div>
                          <span className="font-mono text-xxs font-bold text-muted-foreground">
                            {ratioPercent}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-1">
                          <span>Sent: <strong className="font-semibold text-foreground">{c.sent_count}</strong></span>
                          <span>•</span>
                          <span>Failed: <strong className="font-semibold text-red-400">{c.failed_count}</strong></span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-[11px]">
                        {new Date(c.created_at).toLocaleDateString()}
                        <span className="block text-[9px] text-muted-foreground/80 mt-0.5">{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 scale-90 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onSelectCampaign(c.id)}
                            id={`btn-view-${c.id}`}
                            title="Inspect Live Analytics"
                            className="p-1.5 rounded border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Are you certain you wish to wipe this campaign and cascade all messages from database permanently?")) {
                                onDeleteCampaign(c.id);
                              }
                            }}
                            id={`btn-delete-${c.id}`}
                            title="Wipe Campaign"
                            className="p-1.5 rounded border border-border bg-card hover:bg-destructive/10 text-destructive transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
