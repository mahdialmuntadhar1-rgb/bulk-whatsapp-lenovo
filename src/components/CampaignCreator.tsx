import React, { useState, useRef } from "react";
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  HelpCircle, 
  Play, 
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  Sparkles,
  Wand2
} from "lucide-react";
import { Instance } from "../types";

interface CampaignCreatorProps {
  instances: Instance[];
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    instance_id: string;
    pacing_delay_min: number;
    pacing_delay_max: number;
    message_template: string;
    contacts: Array<Record<string, string>>;
    attachment_url: string | null;
    idempotency_key: string;
  }) => Promise<void>;
}

export default function CampaignCreator({ instances, onClose, onSubmit }: CampaignCreatorProps) {
  const [name, setName] = useState("");
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("Hello {{name}}! Your Singapore Q2 early bird rewards code is {{rewards_code}}. Redeem by entering it into your dashboard.");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [pacingMin, setPacingMin] = useState(4);
  const [pacingMax, setPacingMax] = useState(12);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // CSV states
  const [contactsList, setContactsList] = useState<Array<Record<string, string>>>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [importSummary, setImportSummary] = useState<{
    total: number;
    valid: number;
    duplicates: number;
    invalid: number;
    headers: string[];
  } | null>(null);

  // Auto-generate idempotency key upon form creation
  const [idempotencyKey] = useState(() => "idem_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36));

  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI message template optimization states
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiStyle, setAiStyle] = useState("marketing");
  const [aiResultVariations, setAiResultVariations] = useState<string[]>([]);
  const [aiError, setAiError] = useState("");

  const handleAiOptimize = async () => {
    if (!messageTemplate.trim()) {
      setAiError("Please type some message draft in the template block before optimizing.");
      return;
    }
    setAiOptimizing(true);
    setAiError("");
    setAiResultVariations([]);
    try {
      const { ApiClient } = await import("../lib/api-client");
      const data = await ApiClient.post<{ variations: string[] }>("/api/gemini/optimize", {
        message_template: messageTemplate,
        style: aiStyle,
      });
      if (data && Array.isArray(data.variations)) {
        setAiResultVariations(data.variations);
      } else {
        setAiError("No variations could be suggested. Try adjusting style or content.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Failed to contact Gemini copywriter. Enable GEMINI_API_KEY.");
    } finally {
      setAiOptimizing(false);
    }
  };

  // Handle Loading Simulation Payload (UX shortcut)
  const handleLoadDemoCSV = () => {
    const demoContacts = [
      { phone: "+65 9123 4567", name: "John Goh", rewards_code: "SG-8812" },
      { phone: "+65 8888 7777", name: "Alice Lim", rewards_code: "SG-1092" },
      { phone: "+44 7911 123456", name: "Thomas Sterling", rewards_code: "UK-9020" },
      { phone: "+1 (555) 019-2831", name: "Dave Miller", rewards_code: "US-1112" }, // Simulated fail ends with 4
      { phone: "6591234567", name: "John Goh Duplicated", rewards_code: "SG-8812" }, // Local Duplicate phone to show deduplication
      { phone: "14153004000", name: "Sarah Connor", rewards_code: "US-3031" },
      { phone: "447911123456", name: "Thomas Sterling Duplicated", rewards_code: "UK-9020" }, // Local Duplicate
      { phone: "invalid-phone-num", name: "Malformed User", rewards_code: "BAD-99" }, // Malformed number to show validator skipped
      { phone: "+1 (555) 012-3454", name: "Frank Sinatra", rewards_code: "US-4444" }, // Will trigger Nabda mock dispatch failure
    ];

    // Evaluate summary properties
    const headers = ["phone", "name", "rewards_code"];
    const seen = new Set<string>();
    let valid = 0;
    let duplicates = 0;
    let invalid = 0;

    demoContacts.forEach(c => {
      if (!c.phone || c.phone === "invalid-phone-num") {
        invalid++;
        return;
      }
      const cleanDigits = c.phone.replace(/\D/g, "");
      if (cleanDigits.length < 8 || cleanDigits.length > 15) {
        invalid++;
        return;
      }

      if (seen.has(cleanDigits)) {
        duplicates++;
        return;
      }
      seen.add(cleanDigits);
      valid++;
    });

    setContactsList(demoContacts);
    setCsvFileName("synthetic_demo_rewards_list.csv");
    setImportSummary({
      total: demoContacts.length,
      valid,
      duplicates,
      invalid,
      headers
    });
    setErrorMessage("");
  };

  // CSV parsing core logic
  const handleCSVParse = (text: string) => {
    try {
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
      if (lines.length < 2) {
        throw new Error("CSV file does not contain enough records (headers and body required).");
      }

      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      if (!headers.includes("phone")) {
        throw new Error("CSV schema must include a explicit column titled 'phone' (e.g. phone,name,id)");
      }

      const parsed: Array<Record<string, string>> = [];
      const seen = new Set<string>();
      
      let valid = 0;
      let duplicates = 0;
      let invalid = 0;

      for (let i = 1; i < lines.length; i++) {
        const rowValues = lines[i].split(",").map(v => v.trim());
        if (rowValues.length < headers.length) {
          invalid++; // Incomplete row
          continue; 
        }

        const contactRecord: Record<string, string> = {};
        headers.forEach((header, idx) => {
          contactRecord[header] = rowValues[idx] || "";
        });

        const rawPhone = contactRecord["phone"];
        if (!rawPhone) {
          invalid++;
          continue;
        }

        const cleanDigits = rawPhone.replace(/\D/g, "");
        if (cleanDigits.length < 8 || cleanDigits.length > 15) {
          invalid++;
          continue;
        }

        if (seen.has(cleanDigits)) {
          duplicates++;
          continue;
        }

        seen.add(cleanDigits);
        valid++;
        parsed.push(contactRecord);
      }

      setContactsList(parsed);
      setImportSummary({
        total: lines.length - 1,
        valid,
        duplicates,
        invalid,
        headers
      });
      setErrorMessage("");
    } catch (err: any) {
      setErrorMessage(`CSV parsing failure: ${err.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleCSVParse(text);
    };
    reader.readAsText(file);
  };

  const executeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!name.trim()) {
      setErrorMessage("Please input a campaign descriptor name.");
      return;
    }
    if (!selectedInstanceId) {
      setErrorMessage("Please assign an active WhatsApp Nabda Instance line.");
      return;
    }
    if (contactsList.length === 0) {
      setErrorMessage("Please import a CSV of contacts before submitting.");
      return;
    }
    if (pacingMin > pacingMax) {
      setErrorMessage("Pacing delay parameters must fit bounding ranges (Min < Max).");
      return;
    }

    try {
      setIsLoading(true);
      await onSubmit({
        name: name.trim(),
        instance_id: selectedInstanceId,
        pacing_delay_min: pacingMin,
        pacing_delay_max: pacingMax,
        message_template: messageTemplate,
        contacts: contactsList,
        attachment_url: attachmentUrl.trim() || null,
        idempotency_key: idempotencyKey,
      });
    } catch (err: any) {
      setErrorMessage(err.message || "An exception occurred registering campaign.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground border border-border rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-150">
        
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-bold text-base text-foreground">Orchestrate Bulk Campaign</h3>
            <p className="text-xxs text-muted-foreground mt-0.5">Define your message pattern, load recipient digits, and launch queues.</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form panel body */}
        <form onSubmit={executeSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 border border-red-500/10 bg-red-500/15 text-red-500 text-xs rounded-lg flex items-start gap-2 animate-pulse">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Grid Layout Row 1: Campaign Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Campaign Identifier Name</label>
              <input
                type="text"
                required
                placeholder="e.g. VIP Singapore Launch Notifications"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Sender WhatsApp Instance Line</label>
              <select
                required
                value={selectedInstanceId}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                <option value="">-- Choose WhatsApp Line --</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: CSV Importer File selection */}
          <div className="p-4 border border-dashed border-border rounded-xl bg-muted/40">
            <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span>CSV Contact List Database</span>
              </span>
              <button
                type="button"
                onClick={handleLoadDemoCSV}
                id="btn-auto-load-demo-csv"
                className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>🚀 Simulate Demo CSV Upload</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Dropper block */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="md:col-span-1 border border-dashed border-border rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-accent/40 hover:border-accent-border transition-colors group"
              >
                <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                <span className="text-xxs font-semibold text-foreground">Select spreadsheet file</span>
                <p className="text-[9px] text-muted-foreground mt-1 leading-normal">Requires phone column</p>
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Status Report detail block */}
              <div className="md:col-span-2 flex flex-col justify-center space-y-2">
                {csvFileName ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-foreground">
                      <FileText className="w-4 h-4 text-amber-500" />
                      <span>{csvFileName}</span>
                    </div>
                    {importSummary && (
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="bg-card border border-border p-2 rounded-lg">
                          <strong className="text-foreground block">{importSummary.total}</strong>
                          <span className="text-[9px] text-muted-foreground">Total Rows</span>
                        </div>
                        <div className="bg-card border border-emerald-500/10 p-2 rounded-lg text-emerald-500">
                          <strong className="block">{importSummary.valid}</strong>
                          <span className="text-[9px] text-muted-foreground">Valid</span>
                        </div>
                        <div className="bg-card border border-amber-500/10 p-2 rounded-lg text-amber-500">
                          <strong className="block">{importSummary.duplicates}</strong>
                          <span className="text-[9px] text-muted-foreground">Duplicates</span>
                        </div>
                        <div className="bg-card border border-red-500/10 p-2 rounded-lg text-red-500">
                          <strong className="block">{importSummary.invalid}</strong>
                          <span className="text-[9px] text-muted-foreground">Declined</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center md:text-left py-4 text-xs text-muted-foreground">
                    No list imported. Import your CSV containing E.164 phone numbers (e.g. +6591234567). Headers other than phone will serve as mustache template replacements (e.g. <code>{"{{name}}"}</code>).
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Messages Template Compiler */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>Core Messaging Text Template</span>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60" title="Placeholder replacement helper" />
              </label>
              {importSummary && (
                <div className="flex flex-wrap gap-1">
                  {importSummary.headers.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setMessageTemplate(prev => prev + ` {{${h}}}`)}
                      className="text-[9px] font-mono px-2 py-0.5 rounded border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    >
                      +{h}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <textarea
              required
              rows={3}
              placeholder="Compile campaign message text pattern..."
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-sans leading-relaxed"
            />

            {/* AI Optimization helper inline */}
            <div className="bg-accent/25 border border-border/80 rounded-lg p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Copywriting Co-Pilot</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <select
                    value={aiStyle}
                    onChange={(e) => setAiStyle(e.target.value)}
                    className="bg-card text-foreground text-[10px] font-semibold border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="marketing">🚀 Marketing Tone</option>
                    <option value="supportive">🤝 Warm Supportive</option>
                    <option value="alert">📢 Urgent Direct</option>
                    <option value="formal">👔 Corporate Formal</option>
                  </select>
                  
                  <button
                    type="button"
                    disabled={aiOptimizing}
                    onClick={handleAiOptimize}
                    className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-md hover:bg-primary/90 hover:shadow-sm border border-transparent transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiOptimizing ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Revising...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3 h-3" />
                        <span>Suggest Variations</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {aiError && (
                <p className="text-[10px] text-red-500 font-medium">{aiError}</p>
              )}

              {aiResultVariations.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-dashed border-border/80">
                  <p className="text-[9px] uppercase font-mono text-muted-foreground font-semibold">Gemini Suggestions (Click to apply):</p>
                  <div className="grid grid-cols-1 gap-2">
                    {aiResultVariations.map((v, i) => (
                      <div 
                        key={i}
                        onClick={() => {
                          setMessageTemplate(v);
                          setAiResultVariations([]);
                        }}
                        className="bg-card border border-border hover:border-primary/80 p-2.5 rounded text-xxs text-foreground leading-normal cursor-pointer transition-colors group relative"
                      >
                        <span className="absolute top-1 right-1 text-[8px] bg-accent text-accent-foreground font-mono px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          Apply
                        </span>
                        <div className="whitespace-pre-wrap pr-6">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Advanced: Attachments (Image) & Speed Throttles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Media Attachment URL (Optional image link)</label>
              <input
                type="url"
                placeholder="https://example.com/assets/banner.png"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Pacing Send Interval Delay (Seconds)</label>
              <div className="flex items-center gap-3 bg-muted border border-border rounded-lg px-3 py-1.5 text-xs">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">Min:</span>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={pacingMin}
                    onChange={(e) => setPacingMin(Number(e.target.value))}
                    className="w-12 bg-card focus:ring-1 border border-border/60 rounded px-1 text-center font-bold"
                  />
                  <span className="text-[10px] text-muted-foreground">s</span>
                </div>
                <div className="h-6 w-px bg-border"></div>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">Max:</span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={pacingMax}
                    onChange={(e) => setPacingMax(Number(e.target.value))}
                    className="w-12 bg-card focus:ring-1 border border-border/60 rounded px-1 text-center font-bold"
                  />
                  <span className="text-[10px] text-muted-foreground">s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Metadata Footer block */}
          <div className="border-t border-border pt-4 text-xxs font-mono text-muted-foreground leading-relaxed space-y-1 select-none">
            <div className="flex justify-between">
              <span>SECURITY IDEMPOTENCY KEY:</span>
              <span className="text-foreground font-semibold">{idempotencyKey}</span>
            </div>
            <div className="flex justify-between">
              <span>DISPATCH SEQUENCING RATE:</span>
              <span className="text-emerald-500 font-semibold">1 TASK THREAD / LOCKED MULTI-INSTANCE</span>
            </div>
          </div>
        </form>

        {/* Footer bars */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted text-foreground transition-colors cursor-pointer"
          >
            Abandon Creator
          </button>
          <button
            type="button"
            onClick={executeSubmit}
            id="btn-confirm-and-submit-campaign"
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/95 font-semibold text-primary-foreground text-xs rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                <span>Compiling Campaign Channels...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Initialize campaign queue</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
