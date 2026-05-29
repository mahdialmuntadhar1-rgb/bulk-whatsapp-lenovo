import React, { useState } from "react";
import { 
  Radio, 
  Plus, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Key, 
  Globe, 
  Clock, 
  AlertCircle 
} from "lucide-react";
import { Instance } from "../types";

interface InstancesListProps {
  instances: Instance[];
  onAddInstance: (payload: { name: string; api_url: string; api_key: string }) => Promise<void>;
  onDeleteInstance: (id: string) => Promise<void>;
  onSyncInstance: (id: string) => Promise<void>;
}

export default function InstancesList({
  instances,
  onAddInstance,
  onDeleteInstance,
  onSyncInstance,
}: InstancesListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("https://api.nabda.otp.example.com");
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState("");

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Instance identifier name is required");
      return;
    }
    if (!apiUrl.trim()) {
      setFormError("API Endpoint standard root URL is required");
      return;
    }
    if (!apiKey.trim()) {
      setFormError("API Authorization key is required");
      return;
    }

    try {
      setIsLoading(true);
      await onAddInstance({
        name: name.trim(),
        api_url: apiUrl.trim(),
        api_key: apiKey.trim(),
      });
      // Reset form variables
      setName("");
      setApiKey("");
      setShowAddForm(false);
    } catch (err: any) {
      setFormError(err.message || "Something crashed while registering instance.");
    } finally {
      setIsLoading(false);
    }
  };

  const executeSync = async (id: string) => {
    setSyncingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await onSyncInstance(id);
    } catch (err: any) {
      alert(`Synchronizing failed: ${err.message}`);
    } finally {
      setSyncingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">WhatsApp Channels Coordinator</h2>
          <p className="text-xs text-muted-foreground">Register and synchronize WhatsApp lines powered by Nabda OTP API.</p>
        </div>
        <button
          onClick={() => {
            setFormError("");
            setShowAddForm(!showAddForm);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-lg transition-all shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{showAddForm ? "Fold Panel" : "Deploy Nabda Connection"}</span>
        </button>
      </div>

      {/* Deploy Connection Form drawer */}
      {showAddForm && (
        <div className="rounded-xl border border-border bg-card text-card-foreground p-5 shadow-md flex-1 max-w-xl animate-in fade-in slide-in-from-top-4 duration-150">
          <h3 className="font-semibold text-sm text-foreground mb-1 select-none">Deploy Connection</h3>
          <p className="text-xxs text-muted-foreground mb-4">Input instance credentials emitted by your Nabda OTP Workspace.</p>
          
          <form onSubmit={handleAddSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 border border-red-500/15 bg-red-500/15 text-red-500 text-xs rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">WhatsApp Line Label / Custom Name</label>
              <input
                type="text"
                required
                placeholder="e.g. SG Support Team Live Line"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Nabda API URL Standard Root</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.nabda.otp.example.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Bearer API Secret Key</label>
                <input
                  type="password"
                  required
                  placeholder="Paste nb_live_key..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-muted text-foreground text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                id="btn-confirm-register-instance"
                className="flex items-center gap-1.5 px-6 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Active Link Connection</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deploy list section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {instances.length === 0 ? (
          <div className="col-span-2 text-center py-16 rounded-xl border border-border bg-card">
            <Radio className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground text-sm">No Active Instances Connected</h3>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
              You must register at least one Whatsapp Nabda Instance line to start broadcasting orchestrations.
            </p>
          </div>
        ) : (
          instances.map((i) => {
            const isSyncing = syncingIds[i.id] === true;
            return (
              <div 
                key={i.id} 
                id={`instance-card-${i.id}`}
                className="rounded-xl border border-border bg-card text-card-foreground p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow relative"
              >
                {/* Upper line metadata header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border ${
                      i.status === "connected" 
                        ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/10" 
                        : i.status === "disconnected" 
                        ? "bg-amber-500/5 text-amber-500 border-amber-500/10" 
                        : "bg-blue-500/5 text-blue-500 border-blue-500/10 animate-pulse"
                    }`}>
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground select-all leading-tight">{i.name}</h4>
                      <span className="text-[10px] text-muted-foreground font-mono block mt-1">ID: {i.id}</span>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xxs font-bold font-mono tracking-wider uppercase border border-current ${
                    i.status === "connected" 
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/15" 
                      : i.status === "disconnected" 
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/15" 
                      : "bg-blue-500/10 text-blue-500 border-blue-500/15 animate-pulse"
                  }`}>
                    {i.status}
                  </span>
                </div>

                {/* Instance Attributes list */}
                <div className="text-xxs font-mono space-y-2 border-y border-border/60 py-3 text-muted-foreground select-all">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">ENDPOINT: {i.api_url}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 shrink-0" />
                    <span>AUTH KEY: ••••••••{i.api_key.slice(-4)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>LAST ACTIVE SYNC: {new Date(i.last_active_at).toLocaleTimeString()} ({new Date(i.created_at).toLocaleDateString()})</span>
                  </div>
                </div>

                {/* Operations widgets */}
                <div className="flex justify-end gap-2.5">
                  <button
                    onClick={() => {
                      if (confirm("Are you certain you want to wipe this gateway correlation from orchestrator? Active queues on this line will break.")) {
                        onDeleteInstance(i.id);
                      }
                    }}
                    id={`btn-delete-inst-${i.id}`}
                    className="p-2 border border-border hover:bg-destructive/10 text-destructive rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    title="Remove instance line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => executeSync(i.id)}
                    disabled={isSyncing}
                    id={`btn-sync-inst-${i.id}`}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-border bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
                    <span>Test Handshake</span>
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
