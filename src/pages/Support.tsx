import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Inbox,
  MailPlus,
  MessageSquareText,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import { auth } from '../firebase';
import Button from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import {
  createSupportThread,
  deleteSupportConversation,
  markSupportThreadRead,
  sendSupportReply,
  setSupportThreadStatus,
  subscribeToSupportMessages,
  subscribeToSupportThreads,
} from '../services/supportService';
import { getCurrentUserProfile } from '../services/userService';
import type { SupportMessage, SupportThread } from '../types/support';
import type { UserData } from '../types/user';

function formatDate(value: string) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

export default function Support() {
  const [profile, setProfile] = useState<UserData | null>(null);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [subject, setSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [reply, setReply] = useState('');
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedId) ?? null,
    [threads, selectedId]
  );
  const role = profile?.role;

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    void getCurrentUserProfile(currentUser.uid)
      .then(setProfile)
      .catch(() => setError('Unable to load your support inbox.'));
  }, []);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser || !role) return;

    return subscribeToSupportThreads(
      role,
      currentUser.uid,
      (nextThreads) => {
        setThreads(nextThreads);
        if (nextThreads.length === 0) setMessages([]);
        setSelectedId((current) =>
          current && nextThreads.some((thread) => thread.id === current)
            ? current
            : nextThreads.find((thread) => !thread.pending)?.id ?? ''
        );
      },
      () => setError('Unable to load support conversations.')
    );
  }, [role]);

  useEffect(() => {
    if (!selectedId || !selectedThread || selectedThread.pending) return;

    return subscribeToSupportMessages(
      selectedId,
      (nextMessages) => {
        setMessages(nextMessages);
        window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      },
      () => setError('Unable to load this conversation.')
    );
  }, [selectedId, selectedThread]);

  useEffect(() => {
    if (!selectedThread || !role) return;
    const unread = role === 'Admin'
      ? selectedThread.adminUnreadCount
      : selectedThread.userUnreadCount;
    if (unread > 0) void markSupportThreadRead(selectedThread.id, role);
  }, [role, selectedThread]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const threadId = await createSupportThread(subject, newMessage);
      setSubject('');
      setNewMessage('');
      setSelectedId(threadId);
      setSuccess('Your message was sent to SmartAqua Pro support.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to send your message.');
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedThread) return;
    setSending(true);
    setError('');
    try {
      await sendSupportReply(selectedThread, reply);
      setReply('');
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Unable to send your reply.');
    } finally {
      setSending(false);
    }
  };

  const handleStatus = async () => {
    if (!selectedThread) return;
    setError('');
    try {
      await setSupportThreadStatus(
        selectedThread.id,
        selectedThread.status === 'open' ? 'closed' : 'open'
      );
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update ticket status.');
    }
  };

  const handleDelete = async () => {
    if (!selectedThread) return;

    const confirmed = window.confirm(
      `Delete “${selectedThread.subject}” from your chats? The other participant will keep their copy until they also delete it.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await deleteSupportConversation(selectedThread.id);
      setSelectedId('');
      setMessages([]);
      setSuccess('The conversation was deleted from your chats.');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete this conversation.'
      );
    } finally {
      setDeleting(false);
    }
  };

  if (!profile) {
    return <div className="text-sm text-slate-400">Loading support inbox...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Support Messages</h1>
        <p className="mt-1 text-sm text-slate-400">
          {role === 'Admin'
            ? 'Reply to user questions and manage support conversations.'
            : 'Send a message to SmartAqua Pro and see replies here in real time.'}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {role === 'User' && (
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <MailPlus className="h-5 w-5 text-teal-200" />
              New message
            </h2>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Subject</label>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={120}
                  placeholder="How can we help?"
                  className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400/60"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Message</label>
                <textarea
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  maxLength={4000}
                  rows={4}
                  placeholder="Describe your question or concern."
                  className="w-full resize-y rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400/60"
                />
                <p className="mt-1 text-right text-xs text-slate-500">{newMessage.length}/4000</p>
              </div>
              <Button type="submit" disabled={creating}>
                <Send className="h-4 w-4" />
                {creating ? 'Sending...' : 'Send to support'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid min-h-[560px] gap-5 xl:grid-cols-[340px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Inbox className="h-5 w-5 text-teal-200" />
              {role === 'Admin' ? 'Support inbox' : 'Your conversations'}
            </h2>
          </CardHeader>
          <div className="max-h-[620px] overflow-y-auto">
            {threads.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-400">
                No support conversations yet.
              </div>
            ) : (
              threads.map((thread) => {
                const unread = role === 'Admin' ? thread.adminUnreadCount : thread.userUnreadCount;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(thread.id);
                      setSuccess('');
                    }}
                    className={`w-full border-b border-slate-600/25 px-4 py-4 text-left transition ${
                      selectedId === thread.id ? 'bg-teal-500/12' : 'hover:bg-slate-700/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className={`truncate text-sm ${unread ? 'font-semibold text-white' : 'text-slate-200'}`}>
                        {thread.subject}
                      </p>
                      {unread > 0 && (
                        <span className="rounded-full bg-teal-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          {unread} new
                        </span>
                      )}
                    </div>
                    {role === 'Admin' && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <UserRound className="h-3 w-3" /> {thread.ownerName}
                      </p>
                    )}
                    <p className="mt-2 truncate text-xs text-slate-500">{thread.lastMessage}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{formatDate(thread.updatedAt)}</span>
                      <span className={thread.status === 'open' ? 'text-emerald-300' : 'text-slate-500'}>
                        {thread.status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className="flex min-h-[560px] flex-col overflow-hidden">
          {selectedThread ? (
            <>
              <CardHeader className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-white">{selectedThread.subject}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {role === 'Admin'
                      ? `${selectedThread.ownerName} · ${selectedThread.ownerEmail}`
                      : selectedThread.lastSenderRole === 'Admin'
                        ? 'SmartAqua Pro replied to this conversation'
                        : 'Waiting for a SmartAqua Pro reply'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {role === 'Admin' && (
                    <Button type="button" variant="secondary" size="sm" onClick={handleStatus}>
                      {selectedThread.status === 'open' ? 'Close ticket' : 'Reopen ticket'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={deleting}
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? 'Deleting...' : 'Delete from my chats'}
                  </Button>
                </div>
              </CardHeader>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {messages.map((message) => {
                  const ownMessage = message.senderRole === role;
                  return (
                    <div key={message.id} className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                        ownMessage
                          ? 'rounded-br-md bg-teal-600 text-white'
                          : 'rounded-bl-md border border-slate-600/40 bg-slate-700/45 text-slate-100'
                      }`}>
                        <p className="mb-1 text-[11px] font-semibold opacity-75">{message.senderName}</p>
                        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                        <p className="mt-2 text-right text-[10px] opacity-65">
                          {message.pending ? 'Sending...' : formatDate(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form className="border-t border-slate-600/30 p-4" onSubmit={handleReply}>
                <div className="flex items-end gap-3">
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    disabled={selectedThread.status === 'closed'}
                    maxLength={4000}
                    rows={2}
                    placeholder={selectedThread.status === 'closed' ? 'This conversation is closed.' : 'Write a reply...'}
                    className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400/60 disabled:opacity-60"
                  />
                  <Button type="submit" disabled={sending || selectedThread.status === 'closed'}>
                    <Send className="h-4 w-4" />
                    {sending ? 'Sending...' : 'Reply'}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MessageSquareText className="h-10 w-10 text-slate-500" />
              <p className="mt-3 text-sm text-slate-400">Select a conversation to read its messages.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
