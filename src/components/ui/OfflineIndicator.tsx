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
    <div className="fixed top-2 right-2 z-50">
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-orange-600 text-white">
        <WifiOff className="w-3 h-3" />
        Hors ligne
      </div>
    </div>
  );
}
