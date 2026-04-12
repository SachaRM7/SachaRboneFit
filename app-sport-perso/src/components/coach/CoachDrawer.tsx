"use client";

import { useState, useRef, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Send, Plus } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ConversationPreview {
  id: string;
  title: string | null;
  lastMessage: { role: string; preview: string } | null;
  updatedAt: string;
}

export function CoachDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      loadConversations();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConversations() {
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/coach/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (e) {
      console.error("Failed to load conversations", e);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadMessages(convId: string) {
    const res = await fetch(`/api/coach/conversations/${convId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
    }
  }

  async function selectConversation(convId: string) {
    setActiveConvId(convId);
    await loadMessages(convId);
  }

  function startNewConversation() {
    setActiveConvId(null);
    setMessages([]);
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          message: userMessage,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send message");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            if (line.slice(7).trim() === "done") {
              loadConversations();
            }
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            try {
              const data = JSON.parse(dataStr);
              if (data.conversationId && !activeConvId) {
                setActiveConvId(data.conversationId);
                loadConversations();
              }
              if (data.content !== undefined) {
                fullText += data.content;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      if (fullText) {
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: fullText,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (e) {
      console.error("Failed to send message:", e);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} direction="bottom">
      <DrawerContent className="bg-zinc-950 text-white max-h-[90vh] !rounded-t-2xl">
        <div className="flex flex-col h-[90vh]">
          <DrawerHeader className="border-b border-zinc-800 pb-2">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-white">Coach</DrawerTitle>
              <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </DrawerHeader>

          {!activeConvId && messages.length === 0 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <Button
                variant="outline"
                className="w-full bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800 justify-start"
                onClick={startNewConversation}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle conversation
              </Button>

              {loadingConversations ? (
                <div className="text-zinc-500 text-sm text-center py-4">Chargement...</div>
              ) : conversations.length === 0 ? (
                <div className="text-zinc-500 text-sm text-center py-4">
                  Aucune conversation. Démarre en envoyant un message !
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    className="w-full text-left p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
                  >
                    <div className="font-medium text-white text-sm truncate">
                      {conv.title || "Nouvelle conversation"}
                    </div>
                    {conv.lastMessage && (
                      <div className="text-zinc-500 text-xs truncate mt-1">
                        {conv.lastMessage.role === "user" ? "Vous: " : "Coach: "}
                        {conv.lastMessage.preview}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {(activeConvId || messages.length > 0) && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startNewConversation}
                  className="text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nouveau
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                        msg.role === "user"
                          ? "bg-white text-black rounded-br-md"
                          : "bg-zinc-800 text-white rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 text-white rounded-2xl rounded-bl-md px-4 py-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}

          <div className="p-4 border-t border-zinc-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Message au coach..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                disabled={loading}
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="w-12 h-12 rounded-full bg-white text-black hover:bg-zinc-200 p-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
