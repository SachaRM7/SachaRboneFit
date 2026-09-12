"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, History, Plus, Send } from "lucide-react";
import { messageErreur } from "@/lib/messages";
import { useCoach } from "./ContexteCoach";
import { MascotteCoach } from "./MascotteCoach";
import { resoudreMascotteCoach, type SujetCoach } from "@/lib/coach/resoudre-mascotte";
import type { ContexteEcran } from "@/lib/coach/contexte-ecran";
import { CarteProposition, type Proposition } from "./CarteProposition";
import { ReponseCoach } from "./ReponseCoach";
import { QUESTIONS_PEDAGOGIQUES, type AccueilCoach } from "@/lib/coach/accueil-conversation";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

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

/**
 * Du contexte d'écran au sujet visuel.
 *
 * L'intention déclarée prime — c'est le geste le plus précis dont on dispose.
 * À défaut, l'écran suffit à dire de quoi on va parler. Aucune de ces valeurs
 * ne vient du modèle.
 */
function sujetDuCoach(contexte: ContexteEcran | null): SujetCoach | null {
  switch (contexte?.sujet) {
    case "observation_seance":
      return "observation_seance";
    case "modifier_programme":
      return "modifier_programme";
    case "materiel":
      return "materiel";
    case "decharge":
      return "adaptation_programme";
    case "stagnation":
      return "stagnation";
    case "expliquer_seance":
      return "analyse_seance";
  }
  switch (contexte?.ecran) {
    case "seance":
      return "live";
    case "programme":
      return "modifier_programme";
    case "progression":
      return "stagnation";
    case "exercices":
      return "expliquer_exercice";
    default:
      // Sans contexte, le Coach réfléchit : c'est ce qu'il fait quand on
      // l'ouvre sans rien lui demander de précis.
      return null;
  }
}

export function CoachConversation({ contexte, onClose }: {
  contexte: ContexteEcran | null; onClose: () => void;
}) {
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
  const [vue, setVue] = useState<"liste" | "conversation">("conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const envoiEnCours = useRef(false);
  const [loading, setLoading] = useState(false);
  const [attenteLongue, setAttenteLongue] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setAttenteLongue(true), 8000);
    return () => clearTimeout(timer);
  }, [loading]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /**
   * Ce que le coach a proposé et qui attend une décision.
   *
   * Cette liste vient du serveur, pas de la réponse du modèle : une carte ne
   * s'affiche que si une proposition a réellement été calculée et contrôlée.
   */
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [accueil, setAccueil] = useState<AccueilCoach | null>(null);
  const [chargementThread, setChargementThread] = useState(false);
  const [dernierEssai, setDernierEssai] = useState<string | null>(null);
  const corpsRef = useRef<HTMLDivElement>(null);
  const procheDuBas = useRef(true);
  const demande = useRef(0);
  const { agir } = useCoach();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach/accueil", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contexte }), signal: controller.signal,
    }).then(async (r) => { if (r.ok) setAccueil(await r.json()); }).catch(() => {});
    return () => { controller.abort(); demande.current += 1; };
  }, [contexte]);
  useEffect(() => {
    if (procheDuBas.current) messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function loadConversations() {
    setErreur(null);
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/coach/conversations");
      if (!res.ok) throw new Error("Historique indisponible. Réessaie.");
      setConversations(await res.json());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Historique indisponible.");
    } finally {
      setLoadingConversations(false);
    }
  }

  async function chargerPropositions(convId: string | null) {
    const tour = demande.current;
    try {
      const res = await fetch(
        `/api/coach/propositions${convId ? `?conversationId=${convId}` : ""}`,
      );
      if (res.ok) {
        const propositions = await res.json();
        if (tour === demande.current) setPropositions(propositions);
      }
    } catch (e) {
      // Une proposition non affichée n'est pas une modification perdue : rien
      // n'a été écrit, et elle reste en attente côté serveur.
      console.error("Propositions du coach illisibles", e);
    }
  }

  async function selectConversation(convId: string) {
    const tour = ++demande.current;
    setErreur(null); setDernierEssai(null); setMessages([]); setPropositions([]); setInput("");
    setActiveConvId(convId); setVue("conversation"); setChargementThread(true);
    try {
      const res = await fetch(`/api/coach/conversations/${convId}/messages`);
      if (!res.ok) throw new Error("Conversation indisponible. Réessaie.");
      const data = await res.json();
      if (tour !== demande.current) return;
      setMessages(data); await chargerPropositions(convId);
    } catch (e) {
      if (tour === demande.current) setErreur(e instanceof Error ? e.message : "Conversation indisponible.");
    } finally { if (tour === demande.current) setChargementThread(false); }
  }

  function startNewConversation() {
    demande.current += 1; setChargementThread(false); setErreur(null); setDernierEssai(null); setInput("");
    setActiveConvId(null);
    setMessages([]);
    setPropositions([]);
    setVue("conversation");
  }

  function revenirALaListe() {
    demande.current += 1; setChargementThread(false); setErreur(null);
    setActiveConvId(null);
    setMessages([]);
    setPropositions([]);
    setVue("liste");
    loadConversations();
  }

  /**
   * Après un oui ou un non, la carte disparaît et la conversation dit ce qui
   * s'est passé. Sans cette phrase, l'athlète n'aurait que la disparition de la
   * carte pour savoir si son geste a produit quelque chose.
   */
  function apresDecision(
    id: string,
    _decision: "appliquer" | "refuser",
    message: string,
  ) {
    setPropositions((prev) => prev.filter((p) => p.id !== id));
    setMessages((prev) => [
      ...prev,
      {
        id: `decision-${id}`,
        role: "assistant",
        content: message,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  async function handleSend(messageImpose?: string, retry = false) {
    const brut = messageImpose ?? input;
    if (!brut.trim() || envoiEnCours.current) return;
    envoiEnCours.current = true;

    const userMessage = brut.trim();
    const nouvelEssai = retry || Boolean(erreur && dernierEssai === userMessage);
    setDernierEssai(userMessage); procheDuBas.current = true;
    setInput("");
    setAttenteLongue(false);
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
        signal: AbortSignal.timeout(250_000),
        headers: { "Content-Type": "application/json" },
        // Une désignation, pas des données : le serveur résout lui-même ce que
        // l'écran affiche, depuis la session authentifiée.
        body: JSON.stringify({
          conversationId: activeConvId,
          retry: nouvelEssai,
          message: userMessage,
          contexte: conversations.some((c) => c.id === activeConvId) ? null : contexte,
        }),
      });

      if (!res.ok) {
        const erreur = await res.json().catch(() => null);
        if (erreur?.conversationId) setActiveConvId(erreur.conversationId);
        throw new Error(
          erreur?.code === "COACH_QUOTA"
            ? "Le coach a atteint sa limite temporaire. Ton message est conservé : réessaie dans un instant."
            : messageErreur("joindre le coach", erreur?.error, res.status),
        );
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

      // Le coach a pu déposer une proposition pendant ce tour : on va la
      // chercher là où elle existe vraiment, plutôt que de croire sa réponse.
      await chargerPropositions(data.conversationId ?? activeConvId);

      // L’historique sera relu à son ouverture.
    } catch (e) {
      // Le message envoyé était simplement retiré de la liste : il disparaissait
      // sous les yeux de l'utilisateur, sans que rien n'explique pourquoi.
      console.error("Message au coach non transmis", e);
      setErreur(e instanceof Error ? e.message : "Le coach n'a pas répondu");
      setInput(userMessage);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      envoiEnCours.current = false;
      setLoading(false);
    }
  }

  return <div className="coach-conversation">
    <header className="coach-toolbar">
      <button type="button" aria-label="Fermer le coach" onClick={onClose}><ChevronLeft size={21} /></button>
      <strong>Ton coach</strong>
      <button type="button" disabled={loading} onClick={revenirALaListe} aria-label="Historique des conversations"><History size={21} /></button>
      <button type="button" disabled={loading} onClick={startNewConversation} aria-label="Nouvelle conversation"><Plus size={21} /></button>
    </header>
    <div className="coach-scroll" ref={corpsRef} onScroll={() => {
      const el = corpsRef.current; if (el) procheDuBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    }}>
      {vue === "liste" ? <section className="coach-history">
        <h2>Nos conversations</h2>
        <button className="coach-text-action" onClick={startNewConversation}>Nouvelle conversation <Plus size={16} /></button>
        {loadingConversations && <p role="status">Lecture de l’historique…</p>}
        {!loadingConversations && conversations.length === 0 && <p>Tu peux commencer par une question, simplement.</p>}
        {conversations.map((conv) => <button key={conv.id} className="coach-thread" onClick={() => void selectConversation(conv.id)}>
          <strong>{conv.title || "Conversation"}</strong>
          {conv.lastMessage && <span>{conv.lastMessage.preview.replace(/[#*_`]/g, "")}</span>}
          <time dateTime={conv.updatedAt}>{formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true, locale: fr })}</time>
        </button>)}
      </section> : <>
        {messages.length === 0 && !activeConvId && !loading && !chargementThread && <section className="coach-entry">
          <MascotteCoach etat={resoudreMascotteCoach(sujetDuCoach(contexte))} taille="normal" presence="forte" />
          <h1>On en parle.</h1>
          <p>{contexte?.ecran === "seance" ? "Un repère à comprendre pendant ta séance." : "Une question. Un prochain pas clair."}</p>
          {accueil?.repere && <div className="coach-context"><span>Dans sportperso</span><strong>{accueil.repere}</strong></div>}
          <div className="coach-suggestions">{(accueil?.suggestions ?? QUESTIONS_PEDAGOGIQUES).map((s) =>
            <button key={s.libelle} onClick={() => void handleSend(s.message)}>{s.libelle}<ArrowUpRight size={18} /></button>)}</div>
        </section>}
        {chargementThread && <p role="status">Lecture de la conversation…</p>}
        {messages.length > 0 && contexte && accueil?.repere && !conversations.some((c) => c.id === activeConvId) && <div className="coach-context"><span>Contexte de cet échange</span><strong>{accueil.repere}</strong></div>}
        <div className="coach-messages" aria-label="Messages de la conversation">
          {messages.map((msg) => <article key={msg.id} className={`coach-message coach-message-${msg.role}`} aria-label={msg.role === "assistant" ? "Réponse du coach" : "Ton message"}>
            {msg.role === "assistant" ? <ReponseCoach texte={msg.content} /> : <p>{msg.content}</p>}
          </article>)}
          {propositions.map((p) => <CarteProposition key={p.id} proposition={p} onDecide={apresDecision} />)}
          {loading && <p role="status" className="coach-thinking">{attenteLongue ? "Je consulte les éléments utiles à ta réponse…" : "Le coach prépare sa réponse…"}</p>}
        </div>
      </>}
      {erreur && <div role="alert" className="coach-error"><p>{erreur}</p><button disabled={loading} onClick={() => vue === "liste" ? void loadConversations() : dernierEssai ? void handleSend(dernierEssai, true) : activeConvId ? void selectConversation(activeConvId) : undefined}>Réessayer</button></div>}
      <div ref={messagesEndRef} />
    </div>
    {vue === "conversation" && <footer className="coach-compose">
      {contexte?.ecran === "seance" && <div className="coach-flow-actions">
        <button onClick={() => agir("douleur")}>J’ai une gêne</button><button onClick={() => agir("machine")}>Machine occupée</button>
      </div>}
      <form onSubmit={(event) => { event.preventDefault(); void handleSend(); }}>
        <textarea aria-label="Message au coach" placeholder="Ta question…" rows={2} maxLength={4000} value={input}
          onChange={(e) => setInput(e.target.value)} disabled={loading || chargementThread}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void handleSend(); } }} />
        <button type="submit" aria-label="Envoyer le message" disabled={loading || chargementThread || !input.trim()}><Send size={20} /></button>
      </form>
    </footer>}
  </div>;
}
