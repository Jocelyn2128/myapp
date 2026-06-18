import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import { UserProfile, ChatMessage, PrivateMessage, MessageAttachment, PendingUser } from "./types";
import PixelBoard from "./components/PixelBoard";
import MessageBoard from "./components/MessageBoard";
import { 
  ShieldAlert, 
  Wifi, 
  WifiOff, 
  LogOut, 
  Lock, 
  Layers, 
  User, 
  RefreshCw, 
  Sparkles,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  UserPlus,
  XCircle
} from "lucide-react";

async function readApiJson(res: Response, fallbackMessage: string) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  await res.text();
  throw new Error(
    `${fallbackMessage} Le serveur a retourné une page HTML au lieu d'un JSON. Redémarrez le serveur avec Ctrl+C puis npm run dev.`
  );
}

export default function App() {
  // Session / Authentication Configuration
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("ws_jwt_token"));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const cached = sessionStorage.getItem("ws_jwt_user");
    return cached ? JSON.parse(cached) : null;
  });

  // Login variables
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [nickNameInput, setNickNameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState(3600); // 1hr default
  const [isSignLoading, setIsSignLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Active sync states
  const [connectionStatus, setConnectionStatus] = useState<"IDLE" | "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "EXPIRED">("IDLE");
  const [activeUsers, setActiveUsers] = useState<UserProfile[]>([]);
  const [publicMessages, setPublicMessages] = useState<ChatMessage[]>([]);
  const [privateDMs, setPrivateDMs] = useState<Record<string, PrivateMessage[]>>({});
  const [pixelGrid, setPixelGrid] = useState<Record<string, string>>({});
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [isLoadingPendingUsers, setIsLoadingPendingUsers] = useState(false);
  
  // Channels
  const [activeChannel, setActiveChannel] = useState<"public" | string>("public");

  // Connection references
  const wsRef = useRef<WebSocket | null>(null);
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  const activeChannelRef = useRef<"public" | string>(activeChannel);
  const reconnectEnabledRef = useRef(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // REST API request to generate credentials dynamically with Roles support
  const handleAuthenticate = async (e: FormEvent) => {
    e.preventDefault();
    if (!nickNameInput.trim()) {
      setAuthError("Veuillez saisir un pseudonyme valide.");
      return;
    }

    if (!passwordInput) {
      setAuthError("Veuillez saisir votre mot de passe.");
      return;
    }

    setIsSignLoading(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nickNameInput.trim(),
          password: passwordInput,
          expireInSecs: selectedExpiry
        })
      });
      const data = await readApiJson(res, "Connexion impossible.");

      if (!res.ok) {
        throw new Error(data.error || "Erreur de communication avec le contrôleur d'accès.");
      }

      // Cache session setup for reload safety
      sessionStorage.setItem("ws_jwt_token", data.token);
      sessionStorage.setItem("ws_jwt_user", JSON.stringify(data.user));

      setToken(data.token);
      setCurrentUser(data.user);
      setConnectionStatus("CONNECTING");
    } catch (err: any) {
      setAuthError(err.message || "Impossible de se connecter au serveur backend.");
    } finally {
      setIsSignLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!nickNameInput.trim()) {
      setAuthError("Veuillez saisir un pseudonyme valide.");
      return;
    }

    if (passwordInput.length < 4) {
      setAuthError("Le mot de passe doit contenir au moins 4 caractères.");
      return;
    }

    if (passwordInput !== confirmPasswordInput) {
      setAuthError("Les mots de passe ne correspondent pas.");
      return;
    }

    setIsSignLoading(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nickNameInput.trim(),
          password: passwordInput
        })
      });
      const data = await readApiJson(res, "Inscription impossible.");

      if (!res.ok) {
        throw new Error(data.error || "Impossible de créer le compte.");
      }

      setAuthMode("login");
      setPasswordInput("");
      setConfirmPasswordInput("");
      setAuthNotice(data.message || "Compte créé. Attendez la validation d'un administrateur.");
    } catch (err: any) {
      setAuthError(err.message || "Impossible de créer le compte.");
    } finally {
      setIsSignLoading(false);
    }
  };

  // Exit/Revoke credentials flow
  const handleLogout = () => {
    reconnectEnabledRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
    }
    sessionStorage.clear();
    setToken(null);
    setCurrentUser(null);
    setConnectionStatus("IDLE");
    setActiveUsers([]);
    setPublicMessages([]);
    setPrivateDMs({});
    setPixelGrid({});
    setActiveChannel("public");
    setPendingUsers([]);
    setAdminActionError(null);
  };

  const fetchPendingUsers = useCallback(async () => {
    if (!token || currentUserRef.current?.role !== "admin") return;

    setIsLoadingPendingUsers(true);
    setAdminActionError(null);

    try {
      const res = await fetch("/api/admin/pending-users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await readApiJson(res, "Chargement des inscriptions impossible.");

      if (!res.ok) {
        throw new Error(data.error || "Impossible de charger les inscriptions.");
      }

      setPendingUsers(data.users || []);
    } catch (err: any) {
      setAdminActionError(err.message || "Impossible de charger les inscriptions.");
    } finally {
      setIsLoadingPendingUsers(false);
    }
  }, [token]);

  const handleApproveUser = async (userId: string, role: "user" | "admin" = "user") => {
    if (!token) return;
    setAdminActionError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role })
      });
      const data = await readApiJson(res, "Validation impossible.");

      if (!res.ok) {
        throw new Error(data.error || "Validation impossible.");
      }

      await fetchPendingUsers();
    } catch (err: any) {
      setAdminActionError(err.message || "Validation impossible.");
    }
  };

  const handleRejectUser = async (userId: string) => {
    if (!token) return;
    setAdminActionError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await readApiJson(res, "Refus impossible.");

      if (!res.ok) {
        throw new Error(data.error || "Refus impossible.");
      }

      await fetchPendingUsers();
    } catch (err: any) {
      setAdminActionError(err.message || "Refus impossible.");
    }
  };

  // Establish custom ws socket connection with authenticated payload URL
  const connectWebSocket = useCallback(() => {
    if (!token) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.CONNECTING ||
        wsRef.current.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    // Build correct ws links
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}?token=${token}`;
    
    reconnectEnabledRef.current = true;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;
    setConnectionStatus("CONNECTING");

    socket.onopen = () => {
      setConnectionStatus("CONNECTED");
      reconnectAttempts.current = 0;
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, payload } = message;

        switch (type) {
          case "INITIAL_STATE": {
            setActiveUsers(payload.users || []);
            setPublicMessages(payload.publicMessages || []);
            setPixelGrid(payload.pixelGrid || {});
            
            // Check state setup integrity
            if (payload.userId && currentUserRef.current) {
              const enrichedUser = { ...currentUserRef.current, userId: payload.userId };
              setCurrentUser(enrichedUser);
              sessionStorage.setItem("ws_jwt_user", JSON.stringify(enrichedUser));
            }
            break;
          }

          case "USER_JOINED": {
            setActiveUsers(payload.users || []);
            // Simple system message logic
            setPublicMessages(prev => [
              ...prev,
              {
                id: "sys-" + Date.now(),
                senderId: "system",
                senderName: "System",
                senderColor: "#64748b",
                text: `🔔 ${payload.username} est entré dans le salon général (${payload.role}).`,
                timestamp: Date.now()
              }
            ]);
            break;
          }

          case "USER_LEFT": {
            setActiveUsers(payload.users || []);
            setPublicMessages(prev => [
              ...prev,
              {
                id: "sys-" + Date.now(),
                senderId: "system",
                senderName: "System",
                senderColor: "#64748b",
                text: `🚪 ${payload.username} a quitté le salon de discussion.`,
                timestamp: Date.now()
              }
            ]);
            
            // Cleanup closed user DM channels visually if desired, but keep records
            break;
          }

          case "PUBLIC_MESSAGE": {
            setPublicMessages(prev => [...prev, payload]);
            break;
          }

          case "PUBLIC_MESSAGE_UPDATED": {
            setPublicMessages(prev => prev.map(msg => msg.id === payload.id ? payload : msg));
            break;
          }

          case "PRIVATE_MESSAGE": {
            // Find whether the current user is sender or receiver to group accurately
            const otherUserId =
              payload.senderId === currentUserRef.current?.userId ? payload.recipientId : payload.senderId;
            
            setPrivateDMs(prev => {
              const currentList = prev[otherUserId] || [];
              
              // Only push if message is not already duplicated in list
              if (currentList.some(m => m.id === payload.id)) {
                return prev;
              }
              
              return {
                ...prev,
                [otherUserId]: [...currentList, payload]
              };
            });

            // Automatically open secure DM view/focus tab if we receive a message from another person
            if (payload.senderId !== currentUserRef.current?.userId && activeChannelRef.current === "public") {
              setActiveChannel(`dm:${payload.senderId}`);
            }
            break;
          }

          case "PRIVATE_MESSAGE_UPDATED": {
            const otherUserId =
              payload.senderId === currentUserRef.current?.userId ? payload.recipientId : payload.senderId;

            setPrivateDMs(prev => ({
              ...prev,
              [otherUserId]: (prev[otherUserId] || []).map(msg => msg.id === payload.id ? payload : msg)
            }));
            break;
          }

          case "PRIVATE_HISTORY": {
            const { recipientId, history } = payload;
            setPrivateDMs(prev => ({
              ...prev,
              [recipientId]: history
            }));
            break;
          }

          case "PIXEL_UPDATED": {
            const { x, y, pixelColor } = payload;
            const coordKey = `${x},${y}`;
            setPixelGrid(prev => {
              const nextGrid = { ...prev };
              if (pixelColor === null || pixelColor === "") {
                delete nextGrid[coordKey];
              } else {
                nextGrid[coordKey] = pixelColor;
              }
              return nextGrid;
            });
            break;
          }

          case "GRID_CLEARED": {
            setPixelGrid({});
            setPublicMessages(prev => [
              ...prev,
              {
                id: "sys-" + Date.now(),
                senderId: "system",
                senderName: "System",
                senderColor: "#64748b",
                text: `🎨 La grille collaborative a été réinitialisée par ${payload.updaterName}.`,
                timestamp: Date.now()
              }
            ]);
            break;
          }

          case "ERROR": {
            alert(`[Serveur] ${payload.message}`);
            break;
          }

          default:
            break;
        }
      } catch (e) {
        console.error("Framer parsing exception on receiving:", e);
      }
    };

    socket.onclose = (event) => {
      if (wsRef.current === socket) {
        wsRef.current = null;
      }

      if (!reconnectEnabledRef.current) {
        return;
      }

      // Identify whether token was rejected/expired (typical standard 4401 or proxy codes)
      if (event.code === 4100 || event.reason.includes("expiré") || event.reason.includes("Jeton expiré")) {
        setConnectionStatus("EXPIRED");
        reconnectEnabledRef.current = false;
        return;
      }

      setConnectionStatus("DISCONNECTED");

      // Handle custom exponential backoff auto reconnect loop
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        const delay = reconnectAttempts.current * 3000;
        setTimeout(() => {
          if (token && reconnectEnabledRef.current) {
            connectWebSocket();
          }
        }, delay);
      }
    };

    socket.onerror = (e) => {
      console.error("WS transport socket error occurrence:", e);
    };

  }, [token]);

  // Hook connection to token
  useEffect(() => {
    if (token) {
      reconnectEnabledRef.current = true;
      connectWebSocket();
    }
    return () => {
      reconnectEnabledRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, connectWebSocket]);

  useEffect(() => {
    if (token && currentUser?.role === "admin") {
      fetchPendingUsers();
    }
  }, [token, currentUser?.role, fetchPendingUsers]);

  // Trigger outbound WS message send
  const sendWSMessage = useCallback((type: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  // Chat callbacks
  const handleChatSendMessage = (text: string, recipientId?: string, attachment?: MessageAttachment) => {
    if (recipientId) {
      sendWSMessage("SEND_PRIVATE_MESSAGE", { text, recipientId, attachment });
    } else {
      sendWSMessage("SEND_PUBLIC_MESSAGE", { text, attachment });
    }
  };

  const handleEditMessage = (messageId: string, text: string, recipientId?: string) => {
    if (recipientId) {
      sendWSMessage("EDIT_PRIVATE_MESSAGE", { messageId, text, recipientId });
    } else {
      sendWSMessage("EDIT_PUBLIC_MESSAGE", { messageId, text });
    }
  };

  const handleDeleteMessage = (messageId: string, recipientId?: string) => {
    if (recipientId) {
      sendWSMessage("DELETE_PRIVATE_MESSAGE", { messageId, recipientId });
    } else {
      sendWSMessage("DELETE_PUBLIC_MESSAGE", { messageId });
    }
  };

  const handleReactMessage = (messageId: string, emoji: string, recipientId?: string) => {
    if (recipientId) {
      sendWSMessage("REACT_PRIVATE_MESSAGE", { messageId, emoji, recipientId });
    } else {
      sendWSMessage("REACT_PUBLIC_MESSAGE", { messageId, emoji });
    }
  };

  const handleStartDM = (otherUserId: string) => {
    // Open target list tab immediately and ask server for recent DM log history
    setActiveChannel(`dm:${otherUserId}`);
    sendWSMessage("REQUEST_PRIVATE_HISTORY", { recipientId: otherUserId });
  };

  const handlePixelUpdate = (x: number, y: number, pixelColor: string | null) => {
    sendWSMessage("SEND_PIXEL_UPDATE", { x, y, pixelColor });
  };

  const handleClearGrid = () => {
    if (currentUser?.role === "admin") {
      sendWSMessage("CLEAR_GRID", {});
    }
  };

  // Re-verify manually if socket is stuck or we want to retry connection
  const handleManualReestablish = () => {
    reconnectAttempts.current = 0;
    connectWebSocket();
  };

  // Switch tabs/channels cleanly
  const handleChannelSwitch = (channel: string) => {
    setActiveChannel(channel);
    if (channel.startsWith("dm:")) {
      const otherId = channel.substring(3);
      sendWSMessage("REQUEST_PRIVATE_HISTORY", { recipientId: otherId });
    }
  };

  // -------------------------------------------------------------
  // Render login screen if no sessions currently set up
  if (!currentUser || !token) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-slate-200">
        <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
          
          {/* Visual glow accents */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Heading Logo */}
          <div className="text-center relative">
            <div className="inline-flex p-3 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400 mb-3 skeleton-fade">
              <KeyRound className="w-6 h-6 animate-pulse" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Portail Collaboratif Sécurisé
            </h1>
            <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
              Accédez à la plateforme WebSocket temps réel via une signature de jeton (JWT) cryptographique.
            </p>
          </div>

          <form onSubmit={authMode === "login" ? handleAuthenticate : handleRegister} className="space-y-4">
            {/* Nickname */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Pseudonyme
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Alice, PixMaster..."
                  value={nickNameInput}
                  onChange={(e) => setNickNameInput(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Mot de passe
              </label>
              <div className="relative flex items-center">
                <KeyRound className="absolute left-3 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Votre mot de passe"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 text-slate-500 hover:text-slate-300 transition-colors"
                  title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authMode === "register" && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirmer le mot de passe
                </label>
                <div className="relative flex items-center">
                  <ShieldCheck className="absolute left-3 w-4 h-4 text-slate-500" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    placeholder="Répétez le mot de passe"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    className="absolute right-3 text-slate-500 hover:text-slate-300 transition-colors"
                    title={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Expiry testing dropdown (Satisfies expiracy handling) */}
            {authMode === "login" && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Durée de validité du Jeton</span>
                <span className="text-[10px] text-yellow-500 font-bold lowercase">Optionnel pour tests</span>
              </label>
              
              <select
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
              >
                <option value={15}>15 secondes (Pour tester l'expiration en direct !)</option>
                <option value={60}>1 minute (Expiration rapide)</option>
                <option value={300}>5 minutes</option>
                <option value={3600}>1 heure (Recommandé par défaut)</option>
              </select>
              
              <span className="text-[10px] text-slate-500 mt-1 block leading-relaxed">
                * Choisissez <b>15 secondes</b> pour observer le cycle automatique de fermeture, de déconnexion et de blocage pour de sécurité suite à l'expiration de la signature cryptographique.
              </span>
            </div>
            )}

            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authNotice && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authNotice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSignLoading}
              className={`w-full py-2.5 border border-transparent text-white font-semibold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                authMode === "login"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-950/20"
                  : "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 shadow-indigo-950/20"
              }`}
            >
              {authMode === "login" ? <Sparkles className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              <span>
                {isSignLoading
                  ? "Traitement..."
                  : authMode === "login"
                    ? "Se connecter"
                    : "Créer un compte en attente"}
              </span>
            </button>

            <div className="text-center text-xs text-slate-500">
              {authMode === "login" ? (
                <>
                  <span>Pas encore de compte ? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("register");
                      setAuthError(null);
                      setAuthNotice(null);
                    }}
                    className="font-semibold text-indigo-400 hover:text-indigo-300"
                  >
                    Créer une inscription
                  </button>
                </>
              ) : (
                <>
                  <span>Déjà un compte validé ? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError(null);
                      setAuthNotice(null);
                    }}
                    className="font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Se connecter
                  </button>
                </>
              )}
            </div>
          </form>

          {/* Footer badge */}
          <div className="pt-2 border-t border-slate-800/50 text-center text-[10px] text-slate-600 flex items-center justify-center gap-1.5 justify-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Serveur asynchrone sécurisé actif [Port 3000]</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Render full dashboard layout when session is authenticated
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 font-sans">
      
      {/* Dynamic Network Status Navbar banner */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-950 text-white shrink-0">
              <Layers className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-none flex items-center gap-1.5">
                My app 
              </h1>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Serveur asynchrone sécurisé
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            
            {/* Interactive WebSocket State indicators */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-100/90 text-[11px] font-medium">
              {connectionStatus === "CONNECTED" && (
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <Wifi className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                  <span>Connecté (Actif)</span>
                </div>
              )}
              {connectionStatus === "CONNECTING" && (
                <div className="flex items-center gap-1.5 text-amber-500">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span>Recherche du serveur...</span>
                </div>
              )}
              {connectionStatus === "DISCONNECTED" && (
                <div className="flex items-center gap-1.5 text-rose-500">
                  <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                  <span>Déconnecté</span>
                  <button
                    onClick={handleManualReestablish}
                    className="ml-1 text-[10px] text-indigo-600 underline hover:text-indigo-800 font-bold"
                  >
                    Reconnecter
                  </button>
                </div>
              )}
              {connectionStatus === "EXPIRED" && (
                <div className="flex items-center gap-1.5 text-red-600">
                  <Clock className="w-3.5 h-3.5 text-red-500 animate-bounce" />
                  <span>Jeton JWT Expiré !</span>
                </div>
              )}
            </div>

            {/* Profile info & credentials clear */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200 transition-colors cursor-pointer"
                title="Déconnexion (Régénérer jeton)"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quitter</span>
              </button>
            </div>

          </div>

        </div>
      </header>

      {/* Main active platform content space */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 flex flex-col gap-6">
        
        {/* Token Alert warnings if JWT has expired in session */}
        {connectionStatus === "EXPIRED" && (
          <div className="p-4 bg-red-100 border border-red-200 rounded-xl text-red-800 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-extrabold text-[13px]">Sécurisation JWT : Jeton Expiré</p>
                <p className="text-red-700 leading-relaxed mt-0.5 text-[11px]">
                  Votre signature cryptographique d'authentification a expiré de manière réglementaire. 
                  Toute communication temps-réel a été coupée du serveur. Veuillez vider votre session pour en régénérer une nouvelle.
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 bg-red-800 hover:bg-red-900 hover:scale-102 transition-transform text-white font-bold text-xs py-1.5 px-3.5 rounded-lg border border-red-955"
            >
              Nouveau Jeton (Login)
            </button>
          </div>
        )}

        {currentUser.role === "admin" && (
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Validation des inscriptions
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  Les nouveaux comptes doivent être approuvés avant de pouvoir se connecter.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchPendingUsers}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPendingUsers ? "animate-spin" : ""}`} />
                Actualiser
              </button>
            </div>

            {adminActionError && (
              <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
                {adminActionError}
              </div>
            )}

            <div className="mt-4">
              {pendingUsers.length === 0 ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] text-slate-500">
                  Aucun compte en attente.
                </div>
              ) : (
                <div className="grid gap-2">
                  {pendingUsers.map(user => (
                    <div
                      key={user.userId}
                      className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: user.color }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-800">{user.username}</p>
                          <p className="text-[10px] text-slate-500">
                            ID {user.userId} · Inscrit le {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleApproveUser(user.userId, "user")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Valider user
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveUser(user.userId, "admin")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Valider admin
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectUser(user.userId)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Refuser
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Block: Collaborative grid canvas (taking 5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <PixelBoard
              grid={pixelGrid}
              onPixelUpdate={handlePixelUpdate}
              onClearGrid={handleClearGrid}
              userRole={currentUser.role}
              currentUserColor={currentUser.color}
            />
          </div>

          {/* Right Block: Instant public/private chat hub (taking 7 cols) */}
          <div className="lg:col-span-7">
            <MessageBoard
              currentUser={currentUser}
              activeUsers={activeUsers}
              publicMessages={publicMessages}
              privateDMs={privateDMs}
              activeChannel={activeChannel}
              onChangeChannel={handleChannelSwitch}
              onSendMessage={handleChatSendMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onReactMessage={handleReactMessage}
              onStartDM={handleStartDM}
            />
          </div>

        </div>

      </main>
    </div>
  );
}
