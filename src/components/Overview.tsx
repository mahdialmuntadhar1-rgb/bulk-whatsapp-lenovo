import { 
  Send, 
  CheckCircle2, 
  XCircle, 
  Layers, 
  TrendingUp, 
  Radio, 
  Clock, 
  AlertCircle 
} from "lucide-react";
import { Campaign, Instance, SystemLog } from "../types";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

interface OverviewProps {
  campaigns: Campaign[];
  instances: Instance[];
  logs: SystemLog[];
  setActiveTab: (tab: string) => void;
  setSelectedCampaignId: (id: string | null) => void;
}

export default function Overview({ 
  campaigns, 
  instances, 
  logs, 
  setActiveTab,
  setSelectedCampaignId 
}: OverviewProps) {
  
  // Calculate analytics metrics
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter(c => ["PROCESSING", "QUEUED"].includes(c.status)).length;
  
  let totalContacts = 0;
  let totalSent = 0;
  let totalDelivered = 0;
  let totalFailed = 0;
  let totalDuplicate = 0;

  campaigns.forEach(c => {
    totalContacts += c.total_contacts || 0;
    totalSent += c.sent_count || 0;
    totalDelivered += c.delivered_count || 0;
    totalFailed += c.failed_count || 0;
    totalDuplicate += c.duplicate_count || 0;
  });

  // Calculate delivery success rate (avoid division by zero)
  const totalCompletedDispatches = totalSent + totalFailed;
  const deliverySuccessRate = totalCompletedDispatches > 0 
    ? Math.round((totalDelivered / totalCompletedDispatches) * 100) 
    : 0;

  const connectedInstancesCount = instances.filter(i => i.status === "connected").length;

  const stats = [
    {
      label: "Total Campaigns",
      value: totalCampaigns,
      sub: `${activeCampaigns} currently active`,
      icon: Send,
      color: "bg-blue-500/10 text-blue-500 border-blue-500/10",
    },
    {
      label: "Dispatched",
      value: totalSent,
      sub: `${totalContacts} imported total`,
      icon: Layers,
      color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/10",
    },
    {
      label: "Delivered Messages",
      value: totalDelivered,
      sub: `${deliverySuccessRate}% real-time success`,
      icon: CheckCircle2,
      color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/10",
    },
    {
      label: "Failed Transports",
      value: totalFailed,
      sub: `${totalDuplicate} duplicates skipped`,
      icon: XCircle,
      color: "bg-red-500/10 text-red-500 border-red-500/10",
    }
  ];

  // Compile Recharts analytical timelines (simulate campaign throughput hour-by-hour)
  const chartData = campaigns.slice(-6).map((c, idx) => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + "..." : c.name,
    Delivered: c.delivered_count,
    Failed: c.failed_count,
    Skipped: c.duplicate_count,
  }));

  // Fallback seed chart data if empty
  const graphData = chartData.length > 0 ? chartData : [
    { name: "Demo Camp 1", Delivered: 10, Failed: 1, Skipped: 1 },
    { name: "Marketing A", Delivered: 35, Failed: 2, Skipped: 5 },
    { name: "System Alert", Delivered: 48, Failed: 0, Skipped: 0 },
    { name: "Loyalty B", Delivered: 12, Failed: 3, Skipped: 2 },
  ];

  return (
    <div className="space-y-6">
      {/* Upper header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Operational Overview</h2>
          <p className="text-xs text-muted-foreground">Monitor WhatsApp campaign analytics and gateway routing health.</p>
        </div>
        
        {/* Connection health summary button bar */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card shadow-sm text-xs text-card-foreground">
            <Radio className="w-4 h-4 text-primary" />
            <span className="font-medium text-foreground">
              WhatsApp Pool: <strong className="font-semibold text-primary">{connectedInstancesCount}/{instances.length} ACTIVE</strong>
            </span>
          </div>
          <button 
            onClick={() => setActiveTab("instances")} 
            className="text-xs px-4 py-2 font-medium bg-primary hover:bg-primary/95 text-primary-foreground rounded-lg transition-all shadow-sm cursor-pointer"
          >
            Manage Instances
          </button>
        </div>
      </div>

      {/* Metrics Card Grids */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const IconComp = stat.icon;
          return (
            <div key={i} className="rounded-xl border border-border bg-card text-card-foreground shadow-sm px-5 py-4 transition-all duration-150 hover:shadow-md hover:border-border/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <span className={`p-2 rounded-lg border ${stat.color}`}>
                  <IconComp className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</h3>
                <p className="text-xxs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                  <span>{stat.sub}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Chart Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recharts Deliveries Output Area Chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card text-card-foreground p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold tracking-tight text-sm text-foreground">Delivery Matrix Analyzer</h4>
              <p className="text-xxs text-muted-foreground">Recent messages tracking volumes segmented by campaign groups.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xxs font-mono text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Delivered
              </span>
              <span className="flex items-center gap-1.5 text-xxs font-mono text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-red-500"></span> Failed
              </span>
            </div>
          </div>
          
          <div className="h-64 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={graphData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border opacity-50" />
                <XAxis dataKey="name" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px"
                  }} 
                />
                <Area type="monotone" dataKey="Delivered" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorDelivered)" />
                <Area type="monotone" dataKey="Failed" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorFailed)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dashboard Quick Actions & Status */}
        <div className="rounded-xl border border-border bg-card text-card-foreground p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="font-semibold tracking-tight text-sm text-foreground">Orchestrator Speed Profile</h4>
            <p className="text-xxs text-muted-foreground mb-4">Anti-spam throttle constraints are currently active globally.</p>
            
            <div className="space-y-3.5 mt-2">
              <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2.5">
                <span className="text-muted-foreground font-medium">Sequential Lock</span>
                <span className="font-mono bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-semibold text-[10px]">ENFORCED</span>
              </div>
              <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2.5">
                <span className="text-muted-foreground font-medium">Random Cooldown</span>
                <span className="font-mono text-foreground font-semibold">4 – 12 seconds</span>
              </div>
              <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2.5">
                <span className="text-muted-foreground font-medium">Active Retries</span>
                <span className="font-mono text-foreground font-semibold">Exponential backoff</span>
              </div>
              <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2.5">
                <span className="text-muted-foreground font-medium">Max Sending Slots</span>
                <span className="font-mono text-foreground font-semibold">1 Message / Instance</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-1">
                <span className="text-muted-foreground font-medium">Nabda Webhook Sign</span>
                <span className="font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-semibold text-[10px]">PENDING CONFIG</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <button 
              onClick={() => {
                setActiveTab("campaigns");
                // Open new campaign modal via state downstream
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground font-medium text-xs transition-colors shadow-sm cursor-pointer"
            >
              <span>Launch New Campaign</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Live Activity Stream Logs */}
      <div className="rounded-xl border border-border bg-card text-card-foreground p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
          <div>
            <h4 className="font-semibold tracking-tight text-sm text-foreground">Recent Activity Logs</h4>
            <p className="text-xxs text-muted-foreground">Observability logs streamed directly from Nabda routing worker.</p>
          </div>
          <button 
            onClick={() => setActiveTab("logs")} 
            className="text-xxs font-semibold font-mono tracking-wide text-primary hover:underline cursor-pointer"
          >
            SYSTEM-SHELL VIEW
          </button>
        </div>

        <div className="space-y-3.5 max-h-48 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No activity logs recorded yet. Create an instance or start campaigns to inspect output.
            </div>
          ) : (
            logs.slice(0, 5).map((log) => {
              let tagColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
              if (log.level === "success") tagColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
              if (log.level === "warning") tagColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
              if (log.level === "error") tagColor = "bg-red-500/10 text-red-500 border-red-500/20";

              return (
                <div key={log.id} className="flex items-start gap-3.5 text-xs">
                  <span className={`font-mono text-[9px] px-2 py-0.5 rounded border ${tagColor} uppercase tracking-wider font-semibold`}>
                    {log.level}
                  </span>
                  <div className="flex-1">
                    <p className="text-foreground font-medium leading-relaxed">{log.message}</p>
                    <span className="text-[10px] font-mono text-muted-foreground mt-0.5 block">
                      {new Date(log.timestamp).toLocaleTimeString()} — 
                      {log.campaign_id ? ` Ref: ${log.campaign_id}` : " Platform Monitor"}
                    </span>
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
