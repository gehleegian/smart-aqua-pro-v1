export type SupportSenderRole = 'Admin' | 'User';
export type SupportThreadStatus = 'open' | 'closed';

export interface SupportThread {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  subject: string;
  status: SupportThreadStatus;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderRole: SupportSenderRole;
  userUnreadCount: number;
  adminUnreadCount: number;
  visibleToUser: boolean;
  visibleToAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  pending: boolean;
}

export interface SupportMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: SupportSenderRole;
  body: string;
  createdAt: string;
  pending: boolean;
}
