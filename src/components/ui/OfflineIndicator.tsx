"use client";
import { useEffect, useState } from "react";
import { getPendingMutations } from "@/lib/offline/mutation-queue";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateStatus = async () => {
      setIsOffline(!navigator.onLine);
      const pending = await getPendingMutations();
      setPendingCount(pending.length);
    };

    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    // Poll periodically to update pending count
    const interval = setInterval(updateStatus, 5000);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
      clearInterval(interval);
    };
  }, []);

  if (!isOffline && pendingCount === 0) return null;

  return (
    <div className="fixed top-2 right-2 z-50">
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
        isOffline
          ? "bg-orange-600 text-white"
          : "bg-yellow-600 text-white"
      }`}>
        {isOffline ? (
          <>
            <WifiOff className="w-3 h-3" />
            Hors ligne
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            {pendingCount} en attente
          </>
        )}
      </div>
    </div>
  );
}