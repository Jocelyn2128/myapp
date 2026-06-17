import React, { useState, useEffect } from "react";
import { Paintbrush, Eraser, Trash2, ShieldAlert, Palette, HelpCircle, User } from "lucide-react";

interface PixelBoardProps {
  grid: Record<string, string>;
  onPixelUpdate: (x: number, y: number, color: string | null) => void;
  onClearGrid: () => void;
  userRole: string;
  currentUserColor: string;
}

const PALETTE_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981", 
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#1e293b", "#ffffff", "#000000"
];

export default function PixelBoard({
  grid,
  onPixelUpdate,
  onClearGrid,
  userRole,
  currentUserColor
}: PixelBoardProps) {
  const [selectedColor, setSelectedColor] = useState(PALETTE_COLORS[4]); // Blue default
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Track grid highlights when others update
  const [lastUpdates, setLastUpdates] = useState<Record<string, { name: string; timestamp: number }>>({});

  const gridSize = 20;

  // Let's listen for updates to show highlights or mini status
  useEffect(() => {
    // Expire old indicators after 1.5 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      setLastUpdates(prev => {
        const keeps: typeof prev = {};
        let modified = false;
        Object.entries(prev).forEach(([key, val]) => {
          const updateItem = val as { name: string; timestamp: number };
          if (now - updateItem.timestamp < 1500) {
            keeps[key] = updateItem;
          } else {
            modified = true;
          }
        });
        return modified ? keeps : prev;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Update paint command
  const paintCell = (x: number, y: number) => {
    const targetColor = tool === "draw" ? selectedColor : null;
    const currentHexValue = grid[`${x},${y}`] || null;
    
    // Only send the event if the color is actually different
    if (currentHexValue !== targetColor) {
      onPixelUpdate(x, y, targetColor);
    }
  };

  const handleMouseDown = (x: number, y: number) => {
    setIsDrawing(true);
    paintCell(x, y);
  };

  const handleMouseEnter = (x: number, y: number) => {
    if (isDrawing) {
      paintCell(x, y);
    }
  };

  const handleMouseUpOrLeave = () => {
    setIsDrawing(false);
  };

  return (
    <div id="collaborative-pixel-board" className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex flex-col gap-4">
      {/* Title & Help */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-slate-700" />
            Tableau Collaboratif Synchrone
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Sélectionnez une couleur pour peindre à plusieurs. Maintenez le clic pour dessiner.
          </p>
        </div>
        
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Taille : 20 × 20 pixels</span>
        </div>
      </div>

      {/* Grid stage container */}
      <div 
        className="relative self-center border-4 border-slate-900 rounded-lg overflow-hidden shadow-inner cursor-crosshair bg-slate-50 select-none flex items-center justify-center p-1"
        onMouseLeave={handleMouseUpOrLeave}
        onMouseUp={handleMouseUpOrLeave}
      >
        <div 
          className="grid grid-cols-20 gap-[1px] bg-slate-300"
          style={{ width: "360px", height: "360px" }}
        >
          {Array.from({ length: gridSize }).map((_, y) => (
            <React.Fragment key={y}>
              {Array.from({ length: gridSize }).map((_, x) => {
                const coordKey = `${x},${y}`;
                const cellColor = grid[coordKey] || "transparent";
                const upd = lastUpdates[coordKey];

                return (
                  <div
                    key={x}
                    onMouseDown={() => handleMouseDown(x, y)}
                    onMouseEnter={() => handleMouseEnter(x, y)}
                    className="relative w-[17px] h-[17px] transition-colors duration-100 ease-out"
                    style={{ 
                      backgroundColor: cellColor === "transparent" ? "#f8fafc" : cellColor,
                    }}
                    title={`Pixel (${x}, ${y})`}
                  >
                    {/* Retro Grid Lines on transparent cell */}
                    {cellColor === "transparent" && (
                      <div className="absolute inset-0 border-[0.5px] border-slate-150 pointer-events-none opacity-40" />
                    )}

                    {/* Ping / highlight border if recently updated by another user */}
                    {upd && (
                      <div 
                        className="absolute inset-0 border-2 border-amber-400 animate-ping pointer-events-none z-10" 
                        title={`Modifié par ${upd.name}`}
                      />
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Editor controls Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
        
        {/* Color picking palette */}
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Palette</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {PALETTE_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setSelectedColor(color);
                  setTool("draw");
                }}
                className={`w-6 h-6 rounded-md border transition-all relative ${
                  tool === "draw" && selectedColor === color 
                    ? "ring-2 ring-slate-900 ring-offset-1 border-slate-900" 
                    : "border-slate-300 hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              >
                {color === "#ffffff" && (
                  <div className="absolute inset-0 rounded-md border border-slate-300 pointer-events-none" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:mt-4">
          <button
            onClick={() => setTool("draw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
              tool === "draw"
                ? "bg-slate-900 border-slate-950 text-white shadow-sm"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>Pinceau</span>
          </button>

          <button
            onClick={() => setTool("erase")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
              tool === "erase"
                ? "bg-slate-900 border-slate-950 text-white shadow-sm"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Gomme</span>
          </button>
          
          {/* Admin Command: Clear Grid */}
          <div className="border-l border-slate-200 pl-2 ml-1">
            {userRole === "admin" ? (
              <button
                onClick={onClearGrid}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition-colors cursor-pointer"
                title="Vider la grille (Admin seulement)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vider la grille</span>
              </button>
            ) : (
              <button
                disabled
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                title="Seuls les administrateurs peuvent vider la grille"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Vider [Admin]</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
