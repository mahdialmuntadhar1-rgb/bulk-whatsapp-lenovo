import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { 
  Send, 
  TrendingUp, 
  Terminal, 
  RefreshCw,
  Moon,
  Sun
} from "lucide-react";
import { Instance, Campaign, SystemLog } from "./types";
import { ApiClient } from "./lib/api-client";

// Modular Components imports
import Sidebar from "./components/Sidebar";
import Overview from "./components/Overview";
import CampaignsList from "./components/CampaignsList";
import CampaignCreator from "./components/CampaignCreator";
import CampaignDetails from "./components/CampaignDetails";
import InstancesList from "./components/InstancesList";
import LogsViewer from "./components/LogsViewer";

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("nb_orchestrator_dark") === "true";
  });

  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [adminUser, setAdminUser] = useState<{ email: string; name: string } | null>({
    email: "mahdialmuntadhar1@gmail.com",
    name: "Mahdi Admin"
  });

  // Layout Tab State
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isCreatorOpen, setIsCreatorOpen] = useState<boolean>(false);

  // Resource Pools
  const [instances, setInstances] = useState<Instance[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Synchronize Dark Theme class addition
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      localStorage.setItem("nb_orchestrator_dark", "true");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("nb_orchestrator_dark", "false");
    }
  }, [darkMode]);

  // Check existing session token on mount / Setup open session
  useEffect(() => {
    const setupOpenWorkspace = async () => {
      try {
        const res = await ApiClient.get<{ user: { email: string; name: string } }>("/api/auth/me");
        if (res && res.user) {
          setAdminUser(res.user);
        }
      } catch {
        // Fallback user details
        setAdminUser({ email: "mahdialmuntadhar1@gmail.com", name: "Mahdi Admin" });
      }
      setIsAuthenticated(true);
      loadOrchestratorPayload();
    };
    setupOpenWorkspace();
  }, []);

  // Fetch telemetry fields from database
  const loadOrchestratorPayload = async () => {
    try {
      setResourcesLoading(true);
      const insts = await ApiClient.get<Instance[]>("/api/instances");
      setInstances(insts);

      const camps = await ApiClient.get<Campaign[]>("/api/campaigns");
      setCampaigns(camps);

      const sysLogs = await ApiClient.get<SystemLog[]>("/api/logs?limit=100");
      setLogs(sysLogs);
    } catch (err) {
      console.error("Telemetry mapping failed:", err);
    } finally {
      setResourcesLoading(false);
    }
  };

  // Periodical automatic polling in database when authenticated
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAuthenticated) {
      interval = setInterval(() => {
        loadOrchestratorPayload();
      }, 5000); // Pulse every 5 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Telemetry fetching and polling states are maintained below

  // Instance Operations
  const handleAddInstance = async (payload: { name: string; api_url: string; api_key: string }) => {
    await ApiClient.post<Instance>("/api/instances", payload);
    await loadOrchestratorPayload();
  };

  const handleDeleteInstance = async (id: string) => {
    await ApiClient.delete(`/api/instances/${id}`);
    await loadOrchestratorPayload();
  };

  const handleSyncInstance = async (id: string) => {
    await ApiClient.post(`/api/instances/${id}/sync`);
    await loadOrchestratorPayload();
  };

  // Campaign Operations
  const handleCreateCampaign = async (payload: any) => {
    const res = await ApiClient.post<{ campaign: Campaign }>("/api/campaigns", payload);
    setIsCreatorOpen(false);
    await loadOrchestratorPayload();
    
    // Auto-migrate routing view to the newly compiled details monitor!
    if (res.campaign && res.campaign.id) {
      setSelectedCampaignId(res.campaign.id);
      setActiveTab("campaign_detail");
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    await ApiClient.delete(`/api/campaigns/${id}`);
    if (selectedCampaignId === id) {
      setSelectedCampaignId(null);
      setActiveTab("campaigns");
    }
    await loadOrchestratorPayload();
  };

  // Main UI Screen Swapper resolver
  const renderTabContent = () => {
    if (activeTab === "campaign_detail" && selectedCampaignId) {
      return (
        <CampaignDetails
          campaignId={selectedCampaignId}
          instances={instances}
          onBack={() => {
            setSelectedCampaignId(null);
            setActiveTab("campaigns");
          }}
        />
      );
    }

    switch (activeTab) {
      case "overview":
        return (
          <Overview
            campaigns={campaigns}
            instances={instances}
            logs={logs}
            setActiveTab={setActiveTab}
            setSelectedCampaignId={(id) => {
              setSelectedCampaignId(id);
              setActiveTab("campaign_detail");
            }}
          />
        );
      case "campaigns":
        return (
          <CampaignsList
            campaigns={campaigns}
            instances={instances}
            onSelectCampaign={(id) => {
              setSelectedCampaignId(id);
              setActiveTab("campaign_detail");
            }}
            onDeleteCampaign={handleDeleteCampaign}
            onOpenCreateModal={() => setIsCreatorOpen(true)}
          />
        );
      case "instances":
        return (
          <InstancesList
            instances={instances}
            onAddInstance={handleAddInstance}
            onDeleteInstance={handleDeleteInstance}
            onSyncInstance={handleSyncInstance}
          />
        );
      case "logs":
        return <LogsViewer logs={logs} onRefresh={loadOrchestratorPayload} />;
      default:
        return (
          <div className="py-12 text-center text-xs text-muted-foreground select-none">
            Page screen not found.
          </div>
        );
    }
  };

  // Render Layout
  // Active Authenticated Application layout container
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-200">
      
      {/* Sidebar Layout */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(t) => {
          setSelectedCampaignId(null); // Unset details state
          setActiveTab(t);
        }}
        instancesCount={instances.length}
        activeInstancesCount={instances.filter((i) => i.status === "connected").length}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-950/40 overflow-hidden relative">
        
        {/* Header Ribbon bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-8 shrink-0 select-none">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-slate-800 dark:text-zinc-100 uppercase tracking-tight">
              {activeTab === "overview" && "Orchestration Overview"}
              {activeTab === "campaigns" && "Campaign Directory"}
              {activeTab === "instances" && "WhatsApp Connections"}
              {activeTab === "logs" && "System Observability Logs"}
              {activeTab === "campaign_detail" && "Campaign Analyzer"}
            </h1>
            <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/40 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/60">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
              System Operational
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsCreatorOpen(true)}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer"
            >
              + New Campaign
            </button>
            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center text-xs font-extrabold border border-indigo-200 dark:border-indigo-800">
              {adminUser?.name ? adminUser.name.split(" ").map((n: string) => n[0]).join("").toUpperCase() : "JD"}
            </div>
          </div>
        </header>

        {/* View content container layout */}
        <div id="workspace-viewport" className="flex-1 overflow-y-auto p-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (selectedCampaignId || "")}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {renderTabContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Launch Campaign creator Modal Dialogue */}
      {isCreatorOpen && (
        <CampaignCreator
          instances={instances}
          onClose={() => setIsCreatorOpen(false)}
          onSubmit={handleCreateCampaign}
        />
      )}
    </div>
  );
}
