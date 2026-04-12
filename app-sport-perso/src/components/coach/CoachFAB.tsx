"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { CoachDrawer } from "./CoachDrawer";

export function CoachFAB() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-zinc-100 transition-colors"
        aria-label="Ouvrir le coach"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
      <CoachDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
