import React, { useState } from "react";
import { 
  Activity, 
  Terminal, 
  RefreshCw, 
  Search, 
  AlertCircle, 
  CheckCircle, 
  Info,
  ShieldAlert
} from "lucide-react";
import { SystemLog } from "../types";

interface LogsViewerProps {
  logs: SystemLog[];
  onRefresh: () => void;
}

export default function LogsViewer({ logs, onRefresh }: LogsViewerProps) {
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const triggerRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (err) {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    const matchesLevel = filterLevel === "ALL" ? true : l.level === filterLevel.toLowerCase();
    const matchesSearch = l.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (l.campaign_id || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  return (
    <div className="space-y-6 flex-1 h-full flex flex-col">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span>Observability Audit Logs</span>
          </h2>
          <p className="text-xs text-muted-foreground">Audit trail and real-time dispatch streams reported from the queuing server.</p>
        </div>
        <button
          onClick={triggerRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border font-semibold text-xs rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
          <span>Reload Shell</span>
        </button>
      </div>

      {/* Control panel and filters */}
      <div className="flex flex-col sm:flex-row gap-3.5 justify-between select-none">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="Index query logs by descriptor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        <div className="flex gap-1 bg-muted p-1 rounded-lg border border-border text-xs">
          {["ALL", "INFO", "SUCCESS", "WARNING", "ERROR"].map((lv) => (
            <button
              key={lv}
              onClick={() => setFilterLevel(lv)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                filterLevel === lv
                  ? "bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {/* Shell component */}
      <div className="flex-1 min-h-[400px] border border-border bg-card dark:bg-zinc-950 rounded-xl shadow-inner flex flex-col overflow-hidden font-mono text-xs select-text">
        <div className="bg-muted px-4 py-2.5 border-b border-border flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold text-foreground">STDOUT_STREAM_DESK: nabda_pacing_worker.log</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[9px] font-bold text-muted-foreground">LIVE POLLER FEED</span>
          </div>
        </div>

        {/* Lines logs list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[500px]">
          {filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground font-sans text-xs">
              No matching activity logs are cached in the buffer memory.
            </div>
          ) : (
            filteredLogs.map((log) => {
              // Level colors mapping inside shell
              let textClass = "text-zinc-300";
              let IconComp = Info;
              const dateLabel = new Date(log.timestamp).toISOString();

              if (log.level === "success") {
                textClass = "text-emerald-500 dark:text-emerald-450";
                IconComp = CheckCircle;
              } else if (log.level === "warning") {
                textClass = "text-amber-500 dark:text-amber-400";
                IconComp = AlertCircle;
              } else if (log.level === "error") {
                textClass = "text-red-500 dark:text-red-400";
                IconComp = ShieldAlert;
              }

              return (
                <div key={log.id} className="flex items-start gap-3 border-b border-border/30 pb-3 last:border-0 leading-relaxed font-mono">
                  <IconComp className={`w-4 h-4 shrink-0 mt-0.5 ${textClass}`} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground select-none">
                      <span>[{dateLabel}]</span>
                      <span>—</span>
                      <span className={`uppercase font-bold tracking-wider ${textClass}`}>{log.level}</span>
                      {log.instance_id && (
                        <>
                          <span>—</span>
                          <span>Line: {log.instance_id}</span>
                        </>
                      )}
                      {log.campaign_id && (
                        <>
                          <span>—</span>
                          <span>Camp: {log.campaign_id}</span>
                        </>
                      )}
                    </div>
                    <p className="text-foreground text-[11px] font-mono leading-normal select-all">{log.message}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
