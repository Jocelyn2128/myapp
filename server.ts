import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const server = http.createServer(app);

// Use express.json for receiving authentication data
app.use(express.json());

// JWT Utility logic for cryptographic session signing
const JWT_SECRET = process.env.JWT_SECRET || "super-collab-secret-pixel-key-2026";

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
const connectedClients = new Map<string, { userId: string; username: string; role: string; color: string; ws: WebSocket }>();
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
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
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
  roomId: string;
  recipientId: string;
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
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

// Helper to get sorted chat identifier key
function getPrivateChatKey(id1: string, id2: string): string {
  return [id1, id2].sort().join("<->");
}

// 🔐 REST Endpoint for Token Generation
app.post("/api/token", (req, res) => {
  const { username, role, expireInSecs } = req.body;
  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "username is required as a string" });
  }
  
  const userId = "usr_" + Math.floor(100000 + Math.random() * 900000);
  const color = REVEL_COLORS[Math.floor(Math.random() * REVEL_COLORS.length)];
  const durationMs = expireInSecs ? expireInSecs * 1000 : 3600000; // 1 hour default
  
  const token = signToken({ userId, username, role: role || "user", color }, durationMs);
  
  return res.json({
    token,
    user: {
      userId,
      username,
      role: role || "user",
      color,
      exp: Date.now() + durationMs
    }
  });
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
  
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, decoded);
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
          const newMsg = {
            id: "msg-pub-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            senderId: userId,
            senderName: username,
            senderColor: color,
            text: payload.text || "",
            ...(attachment ? { attachment } : {}),
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
        
        case "SEND_PRIVATE_MESSAGE": {
          const recipientId = payload.recipientId;
          const target = connectedClients.get(recipientId);
          const chatKey = getPrivateChatKey(userId, recipientId);
          const attachment = payload.attachment?.type === "image" ? payload.attachment : undefined;
          
          const dmMsg = {
            id: "msg-priv-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            senderId: userId,
            senderName: username,
            senderColor: color,
            text: payload.text || "",
            ...(attachment ? { attachment } : {}),
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
