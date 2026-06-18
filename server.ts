import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_DB_PATH = path.join(DATA_DIR, "users.json");

// Use express.json for receiving authentication data
app.use(express.json());

// JWT Utility logic for cryptographic session signing
const JWT_SECRET = process.env.JWT_SECRET || "super-collab-secret-pixel-key-2026";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

function signToken(payload: object, durationMs = 3600000): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Date.now() + durationMs;
  const fullPayload = { ...payload, exp };
  
  const tokenInput = base64UrlEncode(JSON.stringify(header)) + "." + base64UrlEncode(JSON.stringify(fullPayload));
  const hmac = crypto.createHmac("sha256", JWT_SECRET);
  hmac.update(tokenInput);
  const signature = hmac.digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  
  return `${tokenInput}.${signature}`;
}

function verifyToken(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const tokenInput = `${headerB64}.${payloadB64}`;
    
    const hmac = crypto.createHmac("sha256", JWT_SECRET);
    hmac.update(tokenInput);
    const expectedSig = hmac.digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    
    if (signature !== expectedSig) {
      return null; 
    }
    
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    return payload;
  } catch (err) {
    return null;
  }
}

// Memory Database & Shared Stateful models
type UserRole = "user" | "admin";

interface RegisteredUser {
  userId: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  color: string;
  approved: boolean;
  createdAt: number;
}

const connectedClients = new Map<string, { userId: string; username: string; role: string; color: string; ws: WebSocket }>();
const registeredUsers = new Map<string, RegisteredUser>();
const publicChatHistory: Array<{
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  attachment?: {
    type: "image";
    name: string;
    dataUrl: string;
  };
  replyTo?: {
    messageId: string;
    senderName: string;
    text: string;
    attachmentName?: string;
  };
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
}> = [
  {
    id: "init-msg-1",
    senderId: "system",
    senderName: "System",
    senderColor: "#64748b",
    text: "Bienvenue sur le hub collaboratif ! WebSockets connectés avec succès.",
    timestamp: Date.now() - 60000
  }
];

// DM hash table: key is sorted user IDs (A < B -> A-B)
const privateChatHistory = new Map<string, Array<{
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  attachment?: {
    type: "image";
    name: string;
    dataUrl: string;
  };
  replyTo?: {
    messageId: string;
    senderName: string;
    text: string;
    attachmentName?: string;
  };
  roomId: string;
  recipientId: string;
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
}>>();

// Collaborative grid state: coordinates (x,y) to hex codes
const pixelGridState: Record<string, string> = {};

// Prefill pixel art grid with a colorful smile icon on init
for (let i = 0; i < 20; i++) {
  // prefill eyes
  if (i === 6) pixelGridState["5,6"] = "#10b981";
  if (i === 13) pixelGridState["14,6"] = "#10b981";
  // smile curve
  pixelGridState["6,13"] = "#f59e0b";
  pixelGridState["7,14"] = "#f59e0b";
  pixelGridState["8,15"] = "#f59e0b";
  pixelGridState["9,15"] = "#f59e0b";
  pixelGridState["10,15"] = "#f59e0b";
  pixelGridState["11,15"] = "#f59e0b";
  pixelGridState["12,14"] = "#f59e0b";
  pixelGridState["13,13"] = "#f59e0b";
}

// Sleek array of colors to assign to users
const REVEL_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981", 
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", 
  "#d946ef", "#ec4899"
];

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function publicUser(user: RegisteredUser) {
  return {
    userId: user.userId,
    username: user.username,
    role: user.role,
    color: user.color,
    approved: user.approved,
    createdAt: user.createdAt
  };
}

function loadRegisteredUsers() {
  try {
    if (!fs.existsSync(USERS_DB_PATH)) return;
    const raw = fs.readFileSync(USERS_DB_PATH, "utf8");
    const users = JSON.parse(raw) as RegisteredUser[];

    users.forEach(user => {
      if (user.userId && user.username && user.passwordHash) {
        registeredUsers.set(user.userId, user);
      }
    });
  } catch (error) {
    console.error("Impossible de charger les utilisateurs enregistrés:", error);
  }
}

function saveRegisteredUsers() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      USERS_DB_PATH,
      JSON.stringify(Array.from(registeredUsers.values()), null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Impossible d'enregistrer les utilisateurs:", error);
  }
}

function requireAdmin(req: express.Request, res: express.Response): any {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const decoded = token ? verifyToken(token) : null;

  if (!decoded || decoded.exp && Date.now() > decoded.exp) {
    res.status(401).json({ error: "Authentification administrateur requise." });
    return null;
  }

  const user = registeredUsers.get(decoded.userId);
  if (!user || user.role !== "admin" || !user.approved) {
    res.status(403).json({ error: "Accès réservé aux administrateurs." });
    return null;
  }

  return user;
}

const defaultAdmin: RegisteredUser = {
  userId: "usr_admin",
  username: "admin",
  passwordHash: hashPassword(ADMIN_PASSWORD),
  role: "admin",
  color: "#ef4444",
  approved: true,
  createdAt: Date.now()
};
loadRegisteredUsers();
registeredUsers.set(defaultAdmin.userId, {
  ...defaultAdmin,
  ...(registeredUsers.get(defaultAdmin.userId) || {}),
  passwordHash: hashPassword(ADMIN_PASSWORD),
  role: "admin",
  approved: true
});
saveRegisteredUsers();

// Helper to get sorted chat identifier key
function getPrivateChatKey(id1: string, id2: string): string {
  return [id1, id2].sort().join("<->");
}

function toggleReactionOnMessage(message: { reactions?: Record<string, string[]> }, emoji: string, userId: string) {
  if (!message.reactions) {
    message.reactions = {};
  }

  const currentUsers = message.reactions[emoji] || [];
  if (currentUsers.includes(userId)) {
    const nextUsers = currentUsers.filter(id => id !== userId);
    if (nextUsers.length) {
      message.reactions[emoji] = nextUsers;
    } else {
      delete message.reactions[emoji];
    }
  } else {
    message.reactions[emoji] = [...currentUsers, userId];
  }
}

function buildReplySnapshot(replyTo: any) {
  if (!replyTo || typeof replyTo.messageId !== "string") return undefined;

  return {
    messageId: replyTo.messageId,
    senderName: typeof replyTo.senderName === "string" ? replyTo.senderName.slice(0, 80) : "Utilisateur",
    text: typeof replyTo.text === "string" ? replyTo.text.slice(0, 160) : "",
    ...(typeof replyTo.attachmentName === "string" ? { attachmentName: replyTo.attachmentName.slice(0, 120) } : {})
  };
}

// 🔐 REST authentication and account approval endpoints
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || typeof username !== "string" || username.trim().length < 3) {
    return res.status(400).json({ error: "Le pseudonyme doit contenir au moins 3 caractères." });
  }

  if (!password || typeof password !== "string" || password.length < 4) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 4 caractères." });
  }

  const normalizedUsername = normalizeUsername(username);
  const userAlreadyExists = Array.from(registeredUsers.values()).some(
    user => normalizeUsername(user.username) === normalizedUsername
  );

  if (userAlreadyExists) {
    return res.status(409).json({ error: "Ce pseudonyme est déjà utilisé." });
  }

  const userId = "usr_" + Math.floor(100000 + Math.random() * 900000);
  const color = REVEL_COLORS[Math.floor(Math.random() * REVEL_COLORS.length)];
  const user: RegisteredUser = {
    userId,
    username: username.trim(),
    passwordHash: hashPassword(password),
    role: "user",
    color,
    approved: false,
    createdAt: Date.now()
  };

  registeredUsers.set(userId, user);
  saveRegisteredUsers();

  return res.status(201).json({
    status: "pending",
    user: publicUser(user),
    message: "Compte créé. Un administrateur doit le valider avant connexion."
  });
});

app.post("/api/login", (req, res) => {
  const { username, password, expireInSecs } = req.body;
  if (!username || typeof username !== "string" || !password || typeof password !== "string") {
    return res.status(400).json({ error: "Pseudonyme et mot de passe requis." });
  }

  const normalizedUsername = normalizeUsername(username);
  const user = Array.from(registeredUsers.values()).find(
    item => normalizeUsername(item.username) === normalizedUsername
  );

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Identifiants invalides." });
  }

  if (!user.approved) {
    return res.status(403).json({
      error: "Compte en attente de validation par un administrateur.",
      status: "pending"
    });
  }

  const durationMs = expireInSecs ? expireInSecs * 1000 : 3600000; // 1 hour default
  const token = signToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
    color: user.color
  }, durationMs);
  
  return res.json({
    token,
    user: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      color: user.color,
      approved: user.approved,
      exp: Date.now() + durationMs
    }
  });
});

app.post("/api/token", (req, res) => {
  return res.status(410).json({ error: "Endpoint désactivé. Utilisez /api/login après validation du compte." });
});

app.get("/api/admin/pending-users", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const pendingUsers = Array.from(registeredUsers.values())
    .filter(user => !user.approved)
    .map(publicUser);

  return res.json({ users: pendingUsers });
});

app.post("/api/admin/users/:userId/approve", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const user = registeredUsers.get(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable." });
  }

  user.approved = true;
  user.role = req.body.role === "admin" ? "admin" : "user";
  saveRegisteredUsers();

  return res.json({ user: publicUser(user) });
});

app.post("/api/admin/users/:userId/reject", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const user = registeredUsers.get(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable." });
  }

  if (user.role === "admin") {
    return res.status(400).json({ error: "Impossible de refuser un administrateur." });
  }

  registeredUsers.delete(req.params.userId);
  saveRegisteredUsers();
  return res.json({ ok: true });
});

// Broadcast packet inspect event with logging helpers
function buildWSEvent(type: string, payload: any) {
  return JSON.stringify({ type, payload });
}

function broadcastToAll(type: string, payload: any) {
  const msgStr = buildWSEvent(type, payload);
  connectedClients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msgStr);
    }
  });
}

// WebSocket Server attached directly to standard HTTP Server
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const urlParams = new URL(request.url || "", `http://${request.headers.host}`);
  const token = urlParams.searchParams.get("token");
  
  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\nJeton manquant");
    socket.destroy();
    return;
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\nJeton invalide");
    socket.destroy();
    return;
  }
  
  if (decoded.exp && Date.now() > decoded.exp) {
    socket.write("HTTP/1.1 419 Authentication Expired\r\n\r\nJeton expiré");
    socket.destroy();
    return;
  }

  const registeredUser = registeredUsers.get(decoded.userId);
  if (!registeredUser || !registeredUser.approved) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\nCompte non validé");
    socket.destroy();
    return;
  }
  
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, {
      userId: registeredUser.userId,
      username: registeredUser.username,
      role: registeredUser.role,
      color: registeredUser.color,
      exp: decoded.exp
    });
  });
});

wss.on("connection", (ws: WebSocket, userSession: any) => {
  const { userId, username, role, color } = userSession;
  
  // Register connected active user
  connectedClients.set(userId, { userId, username, role, color, ws });
  
  // Send Welcome configuration state
  const activeMembersList = Array.from(connectedClients.values()).map(c => ({
    userId: c.userId,
    username: c.username,
    role: c.role,
    color: c.color
  }));
  
  ws.send(buildWSEvent("INITIAL_STATE", {
    userId,
    username,
    role,
    color,
    users: activeMembersList,
    publicMessages: publicChatHistory,
    pixelGrid: pixelGridState
  }));
  
  // Broadcast joining occurrence to other peers
  broadcastToAll("USER_JOINED", { userId, username, role, color, users: activeMembersList });
  
  ws.on("message", (messageStr: string) => {
    try {
      const packet = JSON.parse(messageStr);
      const { type, payload } = packet;
      
      switch (type) {
        case "PING": {
          // Send responsive pong payload with original millisecond signature
          ws.send(buildWSEvent("PONG", { timestamp: payload?.timestamp || Date.now() }));
          break;
        }
        
        case "SEND_PUBLIC_MESSAGE": {
          const attachment = payload.attachment?.type === "image" ? payload.attachment : undefined;
          const replyTo = buildReplySnapshot(payload.replyTo);
          const newMsg = {
            id: "msg-pub-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            senderId: userId,
            senderName: username,
            senderColor: color,
            text: payload.text || "",
            ...(attachment ? { attachment } : {}),
            ...(replyTo ? { replyTo } : {}),
            timestamp: Date.now()
          };
          publicChatHistory.push(newMsg);
          if (publicChatHistory.length > 200) publicChatHistory.shift();
          
          broadcastToAll("PUBLIC_MESSAGE", newMsg);
          break;
        }

        case "EDIT_PUBLIC_MESSAGE": {
          const messageId = payload.messageId;
          const nextText = typeof payload.text === "string" ? payload.text.trim() : "";
          const targetMsg = publicChatHistory.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.senderId !== userId || targetMsg.deleted || !nextText) {
            ws.send(buildWSEvent("ERROR", { message: "Modification impossible pour ce message." }));
            break;
          }

          targetMsg.text = nextText;
          targetMsg.editedAt = Date.now();
          broadcastToAll("PUBLIC_MESSAGE_UPDATED", targetMsg);
          break;
        }

        case "DELETE_PUBLIC_MESSAGE": {
          const messageId = payload.messageId;
          const targetMsg = publicChatHistory.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.senderId !== userId || targetMsg.deleted) {
            ws.send(buildWSEvent("ERROR", { message: "Suppression impossible pour ce message." }));
            break;
          }

          targetMsg.text = "";
          delete targetMsg.attachment;
          targetMsg.deleted = true;
          targetMsg.editedAt = Date.now();
          broadcastToAll("PUBLIC_MESSAGE_UPDATED", targetMsg);
          break;
        }

        case "REACT_PUBLIC_MESSAGE": {
          const messageId = payload.messageId;
          const emoji = typeof payload.emoji === "string" ? payload.emoji : "";
          const targetMsg = publicChatHistory.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.deleted || !emoji) {
            ws.send(buildWSEvent("ERROR", { message: "Réaction impossible pour ce message." }));
            break;
          }

          toggleReactionOnMessage(targetMsg, emoji, userId);
          broadcastToAll("PUBLIC_MESSAGE_UPDATED", targetMsg);
          break;
        }

        case "PIN_PUBLIC_MESSAGE": {
          const messageId = payload.messageId;
          const targetMsg = publicChatHistory.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.deleted) {
            ws.send(buildWSEvent("ERROR", { message: "Épinglage impossible pour ce message." }));
            break;
          }

          targetMsg.pinned = !targetMsg.pinned;
          broadcastToAll("PUBLIC_MESSAGE_UPDATED", targetMsg);
          break;
        }
        
        case "SEND_PRIVATE_MESSAGE": {
          const recipientId = payload.recipientId;
          const target = connectedClients.get(recipientId);
          const chatKey = getPrivateChatKey(userId, recipientId);
          const attachment = payload.attachment?.type === "image" ? payload.attachment : undefined;
          const replyTo = buildReplySnapshot(payload.replyTo);
          
          const dmMsg = {
            id: "msg-priv-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            senderId: userId,
            senderName: username,
            senderColor: color,
            text: payload.text || "",
            ...(attachment ? { attachment } : {}),
            ...(replyTo ? { replyTo } : {}),
            roomId: "private",
            recipientId: recipientId,
            timestamp: Date.now()
          };
          
          // Persistence in memory sorted hash list
          if (!privateChatHistory.has(chatKey)) {
            privateChatHistory.set(chatKey, []);
          }
          privateChatHistory.get(chatKey)!.push(dmMsg);
          
          // Send to recipient
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(buildWSEvent("PRIVATE_MESSAGE", dmMsg));
          }
          // Send copy to sender for immediate confirmation
          ws.send(buildWSEvent("PRIVATE_MESSAGE", dmMsg));
          break;
        }

        case "EDIT_PRIVATE_MESSAGE": {
          const messageId = payload.messageId;
          const recipientId = payload.recipientId;
          const nextText = typeof payload.text === "string" ? payload.text.trim() : "";
          const chatKey = getPrivateChatKey(userId, recipientId);
          const history = privateChatHistory.get(chatKey) || [];
          const targetMsg = history.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.senderId !== userId || targetMsg.deleted || !nextText) {
            ws.send(buildWSEvent("ERROR", { message: "Modification impossible pour ce message privé." }));
            break;
          }

          targetMsg.text = nextText;
          targetMsg.editedAt = Date.now();

          const target = connectedClients.get(recipientId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          }
          ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          break;
        }

        case "DELETE_PRIVATE_MESSAGE": {
          const messageId = payload.messageId;
          const recipientId = payload.recipientId;
          const chatKey = getPrivateChatKey(userId, recipientId);
          const history = privateChatHistory.get(chatKey) || [];
          const targetMsg = history.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.senderId !== userId || targetMsg.deleted) {
            ws.send(buildWSEvent("ERROR", { message: "Suppression impossible pour ce message privé." }));
            break;
          }

          targetMsg.text = "";
          delete targetMsg.attachment;
          targetMsg.deleted = true;
          targetMsg.editedAt = Date.now();

          const target = connectedClients.get(recipientId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          }
          ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          break;
        }

        case "REACT_PRIVATE_MESSAGE": {
          const messageId = payload.messageId;
          const recipientId = payload.recipientId;
          const emoji = typeof payload.emoji === "string" ? payload.emoji : "";
          const chatKey = getPrivateChatKey(userId, recipientId);
          const history = privateChatHistory.get(chatKey) || [];
          const targetMsg = history.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.deleted || !emoji) {
            ws.send(buildWSEvent("ERROR", { message: "Réaction impossible pour ce message privé." }));
            break;
          }

          toggleReactionOnMessage(targetMsg, emoji, userId);

          const target = connectedClients.get(recipientId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          }
          ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          break;
        }

        case "PIN_PRIVATE_MESSAGE": {
          const messageId = payload.messageId;
          const recipientId = payload.recipientId;
          const chatKey = getPrivateChatKey(userId, recipientId);
          const history = privateChatHistory.get(chatKey) || [];
          const targetMsg = history.find(msg => msg.id === messageId);

          if (!targetMsg || targetMsg.deleted) {
            ws.send(buildWSEvent("ERROR", { message: "Épinglage impossible pour ce message privé." }));
            break;
          }

          targetMsg.pinned = !targetMsg.pinned;

          const target = connectedClients.get(recipientId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          }
          ws.send(buildWSEvent("PRIVATE_MESSAGE_UPDATED", targetMsg));
          break;
        }
        
        case "REQUEST_PRIVATE_HISTORY": {
          const recipientId = payload.recipientId;
          const chatKey = getPrivateChatKey(userId, recipientId);
          const history = privateChatHistory.get(chatKey) || [];
          ws.send(buildWSEvent("PRIVATE_HISTORY", {
            recipientId,
            history
          }));
          break;
        }
        
        case "SEND_PIXEL_UPDATE": {
          const { x, y, pixelColor } = payload;
          if (typeof x === "number" && typeof y === "number") {
            const coordKey = `${x},${y}`;
            if (pixelColor === null || pixelColor === "") {
              delete pixelGridState[coordKey];
            } else {
              pixelGridState[coordKey] = pixelColor;
            }
            
            broadcastToAll("PIXEL_UPDATED", {
              x,
              y,
              pixelColor,
              updaterId: userId,
              updaterName: username
            });
          }
          break;
        }
        
        case "CLEAR_GRID": {
          // Admins have access to clear the entire pixel board
          if (role === "admin") {
            Object.keys(pixelGridState).forEach(k => delete pixelGridState[k]);
            broadcastToAll("GRID_CLEARED", { updaterName: username });
          } else {
            ws.send(buildWSEvent("ERROR", { message: "Seuls les administrateurs peuvent vider la grille !" }));
          }
          break;
        }
        
        default:
          break;
      }
    } catch (err) {
      console.error("Error processing websocket payload frame:", err);
    }
  });
  
  ws.on("close", () => {
    connectedClients.delete(userId);
    const remainingMembersList = Array.from(connectedClients.values()).map(c => ({
      userId: c.userId,
      username: c.username,
      role: c.role,
      color: c.color
    }));
    
    // Broadcast user exit metadata
    broadcastToAll("USER_LEFT", {
      userId,
      username,
      users: remainingMembersList
    });
  });
});

// Configure Vite or simple static builds depending on staging profile
async function startApp() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Mount Vite dev middleware FIRST
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Node custom Full-Stack server running active on http://0.0.0.0:${PORT}`);
  });
}

startApp().catch(error => {
  console.error("Fatal exception during server boot process:", error);
});
