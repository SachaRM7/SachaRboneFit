"use client";

import { useState, useRef, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Send, Plus, ChevronLeft } from "lucide-react";

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
  /**
   * Vue affichée.
   *
   * Elle se déduisait de `!activeConvId && messages.length === 0`, or c'est
   * exactement l'état que produisait « Nouvelle conversation » : le bouton
   * renvoyait à la liste où l'on se trouvait déjà, et la zone de saisie restait
   * inatteignable tant qu'aucun message n'existait. Aucune conversation ne
   * pouvait donc être ouverte à la main.
   */
  const [vue, setVue] = useState<"liste" | "conversation">("liste");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Rouvrir le tiroir repart de la liste : rester dans une conversation
    // fermée la veille n'a pas de sens.
    setVue("liste");
    setActiveConvId(null);
    setMessages([]);
    loadConversations();
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
    setVue("conversation");
    await loadMessages(convId);
  }

  function startNewConversation() {
    setActiveConvId(null);
    setMessages([]);
    setVue("conversation");
  }

  function revenirALaListe() {
    setActiveConvId(null);
    setMessages([]);
    setVue("liste");
    loadConversations();
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setErreur(null);

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      // La route ne diffuse plus : elle renvoie la réponse complète, outils
      // exécutés côté serveur. Le client décodait auparavant un flux SSE qui
      // n'était jamais décodé côté serveur non plus.
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConvId, message: userMessage }),
      });

      if (!res.ok) {
        const erreur = await res.json().catch(() => null);
        throw new Error(erreur?.error || "Le coach n'a pas répondu");
      }

      const data = await res.json();

      if (!activeConvId && data.conversationId) {
        setActiveConvId(data.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.message?.id ?? `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message?.content ?? "",
          createdAt: new Date().toISOString(),
        },
      ]);

      loadConversations();
    } catch (e) {
      // Le message envoyé était simplement retiré de la liste : il disparaissait
      // sous les yeux de l'utilisateur, sans que rien n'explique pourquoi.
      console.error("Failed to send message:", e);
      setErreur(e instanceof Error ? e.message : "Le coach n'a pas répondu");
      setInput(userMessage);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} direction="bottom">
      <DrawerContent className="bg-papier text-encre max-h-[90vh] !rounded-t-2xl">
        <div className="flex flex-col h-[90vh]">
          <DrawerHeader className="border-b border-filet pb-2">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-encre">Coach</DrawerTitle>
              <Button variant="ghost" size="icon" onClick={onClose} className="text-encre hover:bg-papier-2">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </DrawerHeader>

          {vue === "liste" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <Button
                variant="outline"
                className="w-full bg-carte border-filet text-encre hover:bg-papier-2 justify-start"
                onClick={startNewConversation}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle conversation
              </Button>

              {loadingConversations ? (
                <div className="text-encre-3 text-sm text-center py-4">Chargement...</div>
              ) : conversations.length === 0 ? (
                <div className="text-encre-3 text-sm text-center py-4">
                  Aucune conversation. Démarre en envoyant un message !
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    className="w-full text-left p-3 rounded-lg bg-carte border border-filet hover:bg-papier-2 transition-colors"
                  >
                    <div className="font-medium text-encre text-sm truncate">
                      {conv.title || "Nouvelle conversation"}
                    </div>
                    {conv.lastMessage && (
                      <div className="text-encre-3 text-xs truncate mt-1">
                        {conv.lastMessage.role === "user" ? "Vous: " : "Coach: "}
                        {conv.lastMessage.preview}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {vue === "conversation" && (
            <>
              {/* Sans ce retour, ouvrir une conversation enfermait dans la vue :
                  seule la fermeture du tiroir permettait d'en sortir. */}
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-filet">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={revenirALaListe}
                  className="text-encre-2 hover:text-encre hover:bg-papier-2 text-xs"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Conversations
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startNewConversation}
                  className="text-encre-2 hover:text-encre hover:bg-papier-2 text-xs"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nouveau
                </Button>
              </div>

              {erreur && (
                <p className="mx-4 mt-3 rounded-lg bg-perte-fond border border-perte/30 px-3 py-2 text-perte text-sm">
                  {erreur}
                </p>
              )}

              {messages.length === 0 && !loading && !erreur && (
                <p className="px-4 pt-6 text-encre-3 text-sm text-center">
                  Pose ta question — le coach a accès à tes séances, ton état du jour
                  et aux machines de ta salle.
                </p>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                        msg.role === "user"
                          ? "bg-encre text-papier rounded-br-md"
                          : "bg-papier-2 text-encre rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-papier-2 text-encre rounded-2xl rounded-bl-md px-4 py-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-encre-3 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-encre-3 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-encre-3 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}

          <div className="p-4 border-t border-filet">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Message au coach..."
                className="flex-1 bg-carte border border-filet rounded-full px-4 py-2 text-sm text-encre placeholder:text-encre-3 focus:outline-none focus:border-filet"
                disabled={loading}
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="w-12 h-12 rounded-full bg-encre text-papier hover:bg-filet p-0"
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
