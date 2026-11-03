import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type {
  SupportMessage,
  SupportSenderRole,
  SupportThread,
  SupportThreadStatus,
} from '../types/support';
import type { UserData } from '../types/user';
import { getCurrentUserProfile } from './userService';

const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 4000;

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readDate(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value) {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
    if (typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000).toISOString();
    }
  }
  return '';
}

function readCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function mapThread(id: string, data: DocumentData, pending: boolean): SupportThread {
  return {
    id,
    ownerId: readString(data.ownerId),
    ownerName: readString(data.ownerName, 'SmartAqua user'),
    ownerEmail: readString(data.ownerEmail),
    subject: readString(data.subject, 'Support request'),
    status: data.status === 'closed' ? 'closed' : 'open',
    lastMessage: readString(data.lastMessage),
    lastMessageAt: readDate(data.lastMessageAt),
    lastSenderRole: data.lastSenderRole === 'Admin' ? 'Admin' : 'User',
    userUnreadCount: readCount(data.userUnreadCount),
    adminUnreadCount: readCount(data.adminUnreadCount),
    visibleToUser: data.visibleToUser !== false,
    visibleToAdmin: data.visibleToAdmin !== false,
    createdAt: readDate(data.createdAt),
    updatedAt: readDate(data.updatedAt),
    pending,
  };
}

function mapMessage(id: string, data: DocumentData, pending: boolean): SupportMessage {
  return {
    id,
    senderId: readString(data.senderId),
    senderName: readString(data.senderName, 'SmartAqua user'),
    senderRole: data.senderRole === 'Admin' ? 'Admin' : 'User',
    body: readString(data.body),
    createdAt: readDate(data.createdAt),
    pending,
  };
}

function mapThreads(snapshot: QuerySnapshot<DocumentData>) {
  return snapshot.docs
    .map((entry) => mapThread(
      entry.id,
      entry.data({ serverTimestamps: 'estimate' }),
      entry.metadata.hasPendingWrites
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function requireProfile(): Promise<UserData & { id: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('You must be signed in to use support messages.');

  const profile = await getCurrentUserProfile(currentUser.uid);
  if (!profile) throw new Error('Your SmartAqua Pro profile could not be loaded.');

  return { ...profile, id: currentUser.uid };
}

function validateMessage(value: string) {
  const body = value.trim();
  if (!body) throw new Error('Enter a message before sending.');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`);
  }
  return body;
}

export function subscribeToSupportThreads(
  role: SupportSenderRole,
  userId: string,
  onThreads: (threads: SupportThread[]) => void,
  onError: (error: unknown) => void
) {
  const threadCollection = collection(db, 'support_threads');
  const threadQuery =
    role === 'Admin'
      ? query(threadCollection)
      : query(threadCollection, where('ownerId', '==', userId));

  return onSnapshot(
    threadQuery,
    (snapshot) => onThreads(
      mapThreads(snapshot).filter((thread) =>
        role === 'Admin' ? thread.visibleToAdmin : thread.visibleToUser
      )
    ),
    onError
  );
}

export function subscribeToSupportMessages(
  threadId: string,
  onMessages: (messages: SupportMessage[]) => void,
  onError: (error: unknown) => void
) {
  const messageQuery = query(
    collection(db, 'support_threads', threadId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    messageQuery,
    (snapshot) => onMessages(snapshot.docs.map((entry) => mapMessage(
      entry.id,
      entry.data({ serverTimestamps: 'estimate' }),
      entry.metadata.hasPendingWrites
    ))),
    onError
  );
}

export async function createSupportThread(subjectValue: string, messageValue: string) {
  const profile = await requireProfile();
  if (profile.role !== 'User') throw new Error('Only user accounts can open support requests.');

  const subject = subjectValue.trim();
  const body = validateMessage(messageValue);
  if (!subject) throw new Error('Enter a subject for your support request.');
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(`Subjects must be ${MAX_SUBJECT_LENGTH} characters or fewer.`);
  }

  const threadRef = doc(collection(db, 'support_threads'));
  const messageRef = doc(collection(threadRef, 'messages'));
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();

  batch.set(threadRef, {
    ownerId: profile.id,
    ownerName: profile.name,
    ownerEmail: profile.email,
    subject,
    status: 'open',
    lastMessage: body,
    lastMessageAt: timestamp,
    lastSenderRole: 'User',
    userUnreadCount: 0,
    adminUnreadCount: 1,
    visibleToUser: true,
    visibleToAdmin: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(messageRef, {
    senderId: profile.id,
    senderName: profile.name,
    senderRole: 'User',
    body,
    createdAt: timestamp,
  });
  await batch.commit();
  return threadRef.id;
}

export async function sendSupportReply(thread: SupportThread, messageValue: string) {
  const profile = await requireProfile();
  const body = validateMessage(messageValue);
  if (thread.status === 'closed') throw new Error('Reopen this conversation before replying.');
  if (profile.role === 'User' && thread.ownerId !== profile.id) {
    throw new Error('You are not allowed to reply to this conversation.');
  }

  const threadRef = doc(db, 'support_threads', thread.id);
  const messageRef = doc(collection(threadRef, 'messages'));
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  const senderRole: SupportSenderRole = profile.role;

  batch.set(messageRef, {
    senderId: profile.id,
    senderName: profile.name,
    senderRole,
    body,
    createdAt: timestamp,
  });
  batch.update(threadRef, {
    lastMessage: body,
    lastMessageAt: timestamp,
    lastSenderRole: senderRole,
    updatedAt: timestamp,
    ...(senderRole === 'Admin'
      ? { userUnreadCount: increment(1), adminUnreadCount: 0 }
      : { adminUnreadCount: increment(1), userUnreadCount: 0 }),
  });
  await batch.commit();
}

export async function markSupportThreadRead(
  threadId: string,
  role: SupportSenderRole
) {
  await updateDoc(doc(db, 'support_threads', threadId), {
    [role === 'Admin' ? 'adminUnreadCount' : 'userUnreadCount']: 0,
  });
}

export async function setSupportThreadStatus(
  threadId: string,
  status: SupportThreadStatus
) {
  const profile = await requireProfile();
  if (profile.role !== 'Admin') throw new Error('Only administrators can change ticket status.');

  await updateDoc(doc(db, 'support_threads', threadId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSupportConversation(threadId: string) {
  const profile = await requireProfile();
  await updateDoc(doc(db, 'support_threads', threadId), {
    [profile.role === 'Admin' ? 'visibleToAdmin' : 'visibleToUser']: false,
  });
}
