export interface UserProfile {
  userId: string;
  username: string;
  role: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
}

export interface PrivateMessage extends ChatMessage {
  roomId: "private";
  recipientId: string;
}

export interface PacketLog {
  id: string;
  timestamp: number;
  direction: "in" | "out";
  type: string;
  stringified: string;
}
