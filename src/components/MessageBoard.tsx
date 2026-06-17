import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, MessageAttachment, PrivateMessage, UserProfile } from "../types";
import {
  ArrowRight,
  Camera,
  Check,
  Pencil,
  MessageSquare,
  Mic,
  Paperclip,
  Send,
  Shield,
  Smile,
  Trash2,
  Users,
  X
} from "lucide-react";

interface MessageBoardProps {
  currentUser: UserProfile;
  activeUsers: UserProfile[];
  publicMessages: ChatMessage[];
  privateDMs: Record<string, PrivateMessage[]>; // keyed by custom userId
  activeChannel: "public" | string; // 'public' or 'dm:userId'
  onChangeChannel: (chan: "public" | string) => void;
  onSendMessage: (text: string, recipientId?: string, attachment?: MessageAttachment) => void;
  onEditMessage: (messageId: string, text: string, recipientId?: string) => void;
  onDeleteMessage: (messageId: string, recipientId?: string) => void;
  onStartDM: (otherUserId: string) => void;
}

const EMOJI_OPTIONS = [
  "😀", "😂", "😍", "🥰", "😎", "😭", "😡", "👍",
  "🙏", "👏", "🔥", "❤️", "💔", "✨", "🎉", "✅",
  "👋", "🤝", "💪", "🚀", "📸", "🎨", "💬", "🔒"
];

export default function MessageBoard({
  currentUser,
  activeUsers,
  publicMessages,
  privateDMs,
  activeChannel,
  onChangeChannel,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onStartDM
}: MessageBoardProps) {
  const [inputText, setInputText] = useState("");
  const [attachment, setAttachment] = useState<MessageAttachment | undefined>();
  const [fileError, setFileError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom on message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [publicMessages, privateDMs, activeChannel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedText = inputText.trim();
    if (!trimmedText && !attachment) return;

    if (activeChannel === "public") {
      onSendMessage(trimmedText, undefined, attachment);
    } else if (activeChannel.startsWith("dm:")) {
      const recipientId = activeChannel.substring(3);
      onSendMessage(trimmedText, recipientId, attachment);
    }
    setInputText("");
    setAttachment(undefined);
    setFileError(null);
    setShowEmojiPicker(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setInputText(prev => `${prev}${emoji}`);
    setShowEmojiPicker(false);
    messageInputRef.current?.focus();
  };

  const handleImageSelect = (file?: File) => {
    if (!file) return;
    setFileError(null);

    if (!file.type.startsWith("image/")) {
      setFileError("Veuillez choisir une image.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFileError("Image trop grande. Taille maximale : 2 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachment({
          type: "image",
          name: file.name,
          dataUrl: reader.result
        });
      }
    };
    reader.onerror = () => setFileError("Impossible de lire cette image.");
    reader.readAsDataURL(file);
  };

  const getActiveRecipientId = () => {
    return activeChannel.startsWith("dm:") ? activeChannel.substring(3) : undefined;
  };

  const startEditingMessage = (message: ChatMessage | PrivateMessage) => {
    if (message.deleted) return;
    setEditingMessageId(message.id);
    setEditingText(message.text);
    setShowEmojiPicker(false);
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const submitEditMessage = () => {
    const trimmedText = editingText.trim();
    if (!editingMessageId || !trimmedText) return;

    onEditMessage(editingMessageId, trimmedText, getActiveRecipientId());
    cancelEditingMessage();
  };

  const deleteMessage = (messageId: string) => {
    onDeleteMessage(messageId, getActiveRecipientId());
    if (editingMessageId === messageId) {
      cancelEditingMessage();
    }
  };

  // Extract active DM lists to display tabs for
  const openDMTails = Object.keys(privateDMs); // list of target userIds with active histories

  const getRecipientInfo = (otherId: string) => {
    return activeUsers.find(u => u.userId === otherId) || {
      userId: otherId,
      username: `Utilisateur Déconnecté (${otherId.substring(4)})`,
      color: "#94a3b8",
      role: "user"
    };
  };

  // Determine standard message listing
  const getMessagesToRender = () => {
    if (activeChannel === "public") {
      return publicMessages;
    } else if (activeChannel.startsWith("dm:")) {
      const otherId = activeChannel.substring(3);
      return privateDMs[otherId] || [];
    }
    return [];
  };

  const currentMessages = getMessagesToRender();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 shadow-sm min-h-[480px]">
      
      {/* Sidebar Area: Connected Active Users list */}
      <div className="lg:col-span-1 border-r border-slate-100 flex flex-col gap-3 pr-2">
        <div className="flex items-center gap-2 pb-2 border-b border-rose-100/10">
          <Users className="w-4 h-4 text-indigo-500 animate-pulse" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Membres connectés ({activeUsers.length})
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2">
          {activeUsers.length <= 1 ? (
            <div className="text-[11px] text-slate-400 py-4 italic text-center">
              Seul avec vous-même ! Ouvrez un autre onglet pour tester.
            </div>
          ) : (
            activeUsers
              .filter(u => u.userId !== currentUser.userId)
              .map(u => (
                <div
                  key={u.userId}
                  onClick={() => onStartDM(u.userId)}
                  className="group flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 cursor-pointer transition-all"
                  title="Cliquer pour démarrer un DM crypté"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: u.color }}
                    />
                    <div className="text-xs font-medium text-slate-700 max-w-[120px] truncate">
                      {u.username}
                      {u.role === "admin" && (
                        <span className="ml-1 text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold uppercase">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 font-bold hover:text-indigo-600">
                    DM <ArrowRight className="w-2.5 h-2.5" />
                  </span>
                </div>
              ))
          )}
        </div>

        {/* Profile Card Summary */}
        <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm mt-auto">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Votre Profil</div>
          <div className="flex items-center gap-2 mt-1">
            <div
              className="w-3.5 h-3.5 rounded-full ring-2 ring-offset-1 shrink-0"
              style={{ backgroundColor: currentUser.color, ringColor: currentUser.color }}
            />
            <div className="truncate">
              <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1">
                {currentUser.username}
                {currentUser.role === "admin" && (
                  <Shield className="w-3 h-3 text-red-500 fill-red-100" />
                )}
              </div>
              <div className="text-[9px] text-slate-400 capitalize">
                ID: {currentUser.userId} • {currentUser.role}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Messaging Hub */}
      <div className="lg:col-span-3 flex flex-col h-full bg-white rounded-lg border border-slate-200/60 shadow-inner overflow-hidden">
        
        {/* Navigation Channels Tabs list */}
        <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex flex-wrap gap-1.5 items-center">
          
          {/* Public canal */}
          <button
            onClick={() => onChangeChannel("public")}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeChannel === "public"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Salon Général</span>
          </button>

          {/* DM channels list */}
          {openDMTails.map(uid => {
            const inf = getRecipientInfo(uid);
            const isSelected = activeChannel === `dm:${uid}`;
            return (
              <button
                key={uid}
                onClick={() => onChangeChannel(`dm:${uid}`)}
                className={`relative px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isSelected
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-150"
                }`}
              >
                {/* Shining green dot indicating active secure DM channel */}
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                
                <span>💬 DM : {inf.username}</span>
              </button>
            );
          })}
        </div>

        {/* Message Logs Area */}
        <div 
          ref={scrollRef} 
          className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px] max-h-[300px] bg-slate-50/30"
        >
          {currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-slate-400 text-center select-none gap-2">
              <MessageSquare className="w-10 h-10 text-slate-300" />
              <p className="text-xs">Aucun message pour le moment dans ce canal.</p>
              {activeChannel.startsWith("dm:") && (
                <p className="text-[10px] text-slate-400 max-w-[250px]">
                  Vos échanges sont confidentiels et visibles uniquement entre vous deux.
                </p>
              )}
            </div>
          ) : (
            currentMessages.map(msg => {
              const belongsToMe = msg.senderId === currentUser.userId;
              const formattedTime = new Date(msg.timestamp).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit"
              });
              const isEditingThis = editingMessageId === msg.id;

              return (
                <div 
                  key={msg.id} 
                  className={`group flex flex-col ${belongsToMe ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {!belongsToMe && (
                      <span 
                        className="text-[10px] font-extrabold"
                        style={{ color: msg.senderColor }}
                      >
                        {msg.senderName}
                      </span>
                    )}
                    <span className="text-[9px] text-slate-400 font-medium">
                      {formattedTime}
                    </span>
                  </div>
                  
                  <div className={`flex items-end gap-1.5 ${belongsToMe ? "flex-row-reverse" : ""}`}>
                    <div 
                      className={`px-3 py-2 rounded-2xl max-w-[85%] text-xs shadow-sm break-words space-y-2 ${
                        belongsToMe 
                          ? "bg-slate-900 text-white rounded-tr-none" 
                          : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                      }`}
                    >
                      {msg.deleted ? (
                        <p className={`italic ${belongsToMe ? "text-slate-300" : "text-slate-400"}`}>
                          Message supprimé
                        </p>
                      ) : isEditingThis ? (
                        <div className="flex min-w-[220px] items-center gap-2">
                          <input
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitEditMessage();
                              if (e.key === "Escape") cancelEditingMessage();
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-emerald-400"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={submitEditMessage}
                            className="rounded-full bg-emerald-500 p-1 text-white hover:bg-emerald-600"
                            title="Valider"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingMessage}
                            className="rounded-full bg-slate-200 p-1 text-slate-700 hover:bg-slate-300"
                            title="Annuler"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {msg.attachment?.type === "image" && (
                            <a
                              href={msg.attachment.dataUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-xl border border-black/10 bg-black/5"
                              title={msg.attachment.name}
                            >
                              <img
                                src={msg.attachment.dataUrl}
                                alt={msg.attachment.name || "Image envoyée"}
                                className="max-h-52 w-full max-w-xs object-cover"
                              />
                            </a>
                          )}
                          {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                          {msg.editedAt && (
                            <p className={`text-[9px] ${belongsToMe ? "text-slate-300" : "text-slate-400"}`}>
                              modifié
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {belongsToMe && !msg.deleted && !isEditingThis && (
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEditingMessage(msg)}
                          className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:text-emerald-600"
                          title="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMessage(msg.id)}
                          className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:text-red-600"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reply Submission Field */}
        <form 
          onSubmit={handleSubmit} 
          className="p-2 border-t border-slate-100 bg-slate-50 shrink-0"
        >
          {attachment && (
            <div className="mb-2 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-2">
              <img
                src={attachment.dataUrl}
                alt={attachment.name}
                className="h-12 w-12 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-emerald-900">{attachment.name}</p>
                <p className="text-[10px] text-emerald-700">Photo prête à envoyer</p>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(undefined)}
                className="rounded-full p-1 text-emerald-700 hover:bg-emerald-100"
                title="Retirer la photo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {fileError && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600">
              {fileError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
              {showEmojiPicker && (
                <div className="absolute bottom-14 left-0 z-20 grid w-64 grid-cols-8 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleEmojiSelect(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-slate-100"
                      title={`Ajouter ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowEmojiPicker(prev => !prev)}
                className={`rounded-full p-1 transition-colors ${
                  showEmojiPicker ? "bg-emerald-50 text-emerald-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
                title="Ajouter un emoji"
              >
                <Smile className="h-5 w-5" />
              </button>
              <input
                ref={messageInputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Message"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-500 outline-none"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleImageSelect(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handleImageSelect(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                title="Joindre une photo"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                title="Prendre une photo"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>
            <button
              type="submit"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-colors hover:bg-emerald-600"
              title={inputText.trim() || attachment ? "Envoyer" : "Message vocal"}
            >
              {inputText.trim() || attachment ? (
                <Send className="h-5 w-5" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
