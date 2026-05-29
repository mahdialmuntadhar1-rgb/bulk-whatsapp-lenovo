import { 
  LayoutDashboard, 
  Send, 
  Radio, 
  FileCode, 
  LogOut, 
  Activity, 
  TrendingUp,
  Moon,
  Sun
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  instancesCount: number;
  activeInstancesCount: number;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  instancesCount,
  activeInstancesCount,
  darkMode,
  setDarkMode,
}: SidebarProps) {
  const menuItems = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard },
    { id: "campaigns", label: "Campaigns", icon: Send },
    { id: "instances", label: "WhatsApp Lines", icon: Radio },
    { id: "logs", label: "System Logs", icon: Activity },
  ];

  return (
    <aside className="w-64 border-r bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 flex flex-col justify-between shrink-0 border-slate-200 dark:border-zinc-800 h-full">
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Unified Logo Brand */}
        <div className="flex h-20 items-center px-6 border-b border-slate-200 dark:border-zinc-800 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md">
            <TrendingUp className="h-5.5 w-5.5" id="brand-logo-icon" />
          </div>
          <span className="ml-3 text-sm font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">NABDA ORCHESTRA</span>
        </div>

        {/* Sidebar Nav links */}
        <nav className="flex-1 py-6 px-4 space-y-1 select-none">
          {menuItems.map((item) => {
            const IconComp = item.icon;
            const isSelected = activeTab === item.id || (item.id === "campaigns" && activeTab.startsWith("campaign_detail"));
            return (
              <button
                key={item.id}
                id={`sidebar-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "bg-slate-100 dark:bg-zinc-850 text-indigo-700 dark:text-indigo-400 font-semibold"
                    : "text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-zinc-100 font-medium"
                }`}
              >
                <div className="flex items-center gap-3">
                  <IconComp className={`w-4 h-4 ${isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-zinc-500"}`} />
                  <span>{item.label}</span>
                </div>
                {item.id === "instances" && (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    isSelected ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                  }`}>
                    {activeInstancesCount}/{instancesCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* WhatsApp Instances Quick Health Panel - Professional Polish Style */}
        <div className="p-4 mx-4 mb-4 rounded-xl bg-slate-900 text-white shadow-lg border border-slate-800">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Queue Health Status</p>
          <div className="flex items-center justify-between mb-1.5 text-xs font-medium">
            <span className="text-slate-300">Active Channels</span>
            <span className="font-mono text-green-400">{activeInstancesCount}/{instancesCount}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${instancesCount > 0 ? (activeInstancesCount / instancesCount) * 100 : 0}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-slate-400 leading-normal mt-2.5 italic">
            Sequential thread pacing is locked & protected by mutexes.
          </p>
        </div>
      </div>

      {/* Sidebar Footer Controls */}
      <div className="p-4 border-t border-border bg-card space-y-1">
        {/* Theme select controller */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
            <span>{darkMode ? "Light Theme" : "Deep Dark Mode"}</span>
          </div>
          <span className="text-[10px] font-mono border border-border px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase scale-90">
            {darkMode ? "Dark" : "Light"}
          </span>
        </button>
      </div>
    </aside>
  );
}
