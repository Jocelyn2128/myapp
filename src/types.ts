export interface UserProfile {
  userId: string;
  username: string;
  role: string;
  color: string;
  approved?: boolean;
}

export interface PendingUser {
  userId: string;
  username: string;
  role: string;
  color: string;
  approved: boolean;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  attachment?: MessageAttachment;
  replyTo?: MessageReply;
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
}

export interface PrivateMessage extends ChatMessage {
  roomId: "private";
  recipientId: string;
}

export interface MessageAttachment {
  type: "image";
  name: string;
  dataUrl: string;
}

export interface MessageReply {
  messageId: string;
  senderName: string;
  text: string;
  attachmentName?: string;
}
