"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Indique la perte de connexion reseau.
 *
 * Ce composant affichait aussi un compteur de mutations en attente, alimente par
 * une file IndexedDB (`lib/offline/mutation-queue`). Cette file n'etait jamais
 * remplie : aucun appel a `queueMutation` n'existait dans l'application, donc le
 * compteur valait toujours zero. La file a ete retiree en attendant un vrai
 * service worker (phase 8) ; elle reste disponible dans l'historique git.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateStatus = () => setIsOffline(!navigator.onLine);

    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (!isOffline) return null;

  return (
    /* À 8 px du haut, la pastille se logeait derrière la barre d'état — donc
       invisible au moment précis où l'information compte, en salle avec une
       connexion qui lâche. */
    <div className="fixed right-2 z-50" style={{ top: "calc(var(--marge-haut) + 0.5rem)" }}>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-feu-orange text-encre">
        <WifiOff className="w-3 h-3" />
        Hors ligne
      </div>
    </div>
  );
}
