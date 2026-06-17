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
  attachment?: MessageAttachment;
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
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
