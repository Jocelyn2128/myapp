import React, { useState } from "react";
import { PacketLog } from "../types";
import { Terminal, Trash2, ArrowUpRight, ArrowDownLeft, Cpu, Shield, Search } from "lucide-react";

interface NetworkInspectorProps {
  logs: PacketLog[];
  onClear: () => void;
  latency: number | null;
}

export default function NetworkInspector({ logs, onClear, latency }: NetworkInspectorProps) {
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter(log => {
    if (filter === "in" && log.direction !== "in") return false;
    if (filter === "out" && log.direction !== "out") return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        log.type.toLowerCase().includes(term) ||
        log.stringified.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div id="network-inspector" className="bg-slate-900 border-t border-slate-800 text-slate-300 font-mono text-xs flex flex-col h-80 shrink-0">
      {/* Header bar */}
      <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-slate-200">Inspecteur de Trames WebSocket (Temps Réel)</span>
          {latency !== null && (
            <div className="flex items-center gap-1.5 ml-4 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-emerald-400">
              <Cpu className="w-3 h-3 animate-pulse" />
              <span>Latence RTT : {latency} ms</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stats */}
          <span className="text-[10px] text-slate-500 mr-2">
            Packets capturés : {logs.length}
          </span>
          <button
            onClick={onClear}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-[11px]"
            title="Effacer la console"
          >
            <Trash2 className="w-3 h-3" />
            <span>Effacer</span>
          </button>
        </div>
      </div>

      {/* Control filters panel */}
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex flex-wrap gap-2 items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              filter === "all" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "hover:text-slate-100"
            }`}
          >
            Toutes
          </button>
          <button
            onClick={() => setFilter("in")}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
              filter === "in" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "hover:text-slate-100"
            }`}
          >
            <ArrowDownLeft className="w-3 h-3" />
            <span>Entrante (IN)</span>
          </button>
          <button
            onClick={() => setFilter("out")}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
              filter === "out" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "hover:text-slate-100"
            }`}
          >
            <ArrowUpRight className="w-3 h-3" />
            <span>Sortante (OUT)</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex items-center">
          <Search className="w-3 h-3 absolute left-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filtrer par type ou payload..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 pr-2.5 py-1 w-52 rounded bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-700 text-[11px]"
          />
        </div>
      </div>

      {/* Traces table / list */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-600 flex flex-col items-center justify-center gap-2">
            <Terminal className="w-8 h-8 opacity-20" />
            <p className="text-[11px]">Aucun paquet capturé correspondant</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const logTime = new Date(log.timestamp).toLocaleTimeString("fr-FR", {
              hour12: false,
              fractionalSecondDigits: 3,
            } as any);

            let prettyPayload = "";
            try {
              prettyPayload = JSON.stringify(JSON.parse(log.stringified), null, 2);
            } catch (e) {
              prettyPayload = log.stringified;
            }

            return (
              <div
                key={log.id}
                className={`hover:bg-slate-800/40 transition-colors ${
                  log.direction === "in" ? "border-l-2 border-l-blue-500" : "border-l-2 border-l-purple-500"
                }`}
              >
                {/* Main Row summary */}
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="flex items-center justify-between px-4 py-2 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 w-11/12">
                    <span className="text-slate-600 text-[10px] w-20 shrink-0">{logTime}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 flex items-center gap-1 ${
                        log.direction === "in"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/10"
                          : "bg-purple-500/10 text-purple-400 border border-purple-500/10"
                      }`}
                    >
                      {log.direction === "in" ? (
                        <>
                          <ArrowDownLeft className="w-2.5 h-2.5" />
                          <span>IN</span>
                        </>
                      ) : (
                        <>
                          <ArrowUpRight className="w-2.5 h-2.5" />
                          <span>OUT</span>
                        </>
                      )}
                    </span>
                    <span className="text-slate-200 font-bold truncate text-[11px]">
                      {log.type}
                    </span>
                    <span className="text-slate-500 truncate text-[10px] italic">
                      {log.stringified.length > 120
                        ? log.stringified.substring(0, 120) + "..."
                        : log.stringified}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 text-[10px]">
                      {isExpanded ? "Replier" : "Déplier"}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="bg-slate-950/80 px-4 py-3 border-t border-b border-slate-900 text-slate-300">
                    <div className="flex items-center gap-4 mb-2 border-b border-slate-900 pb-2 text-[10px] text-slate-500">
                      <span>Direction: {log.direction === "in" ? "Reçu (Serveur -> Client)" : "Envoyé (Client -> Serveur)"}</span>
                      <span>Horodatage complet: {new Date(log.timestamp).toISOString()}</span>
                    </div>
                    <pre className="text-[11px] text-emerald-400 leading-relaxed overflow-x-auto whitespace-pre">
                      <code>{prettyPayload}</code>
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
