"use client";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useCoach } from "./ContexteCoach";
import dynamic from "next/dynamic";
import { useCoachViewport } from "./useCoachViewport";
const CoachConversation = dynamic(() => import("./CoachConversation").then((m) => m.CoachConversation));
export function CoachDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { contexte } = useCoach();
  const viewport = useCoachViewport(open);
  return <Drawer open={open} onClose={onClose} repositionInputs={false}>
    <DrawerContent className="coach-sheet coach-immersive" style={viewport} aria-describedby={undefined}>
      <DrawerTitle className="sr-only">Ton coach</DrawerTitle>
      {open && <CoachConversation contexte={contexte} onClose={onClose} />}
    </DrawerContent>
  </Drawer>;
}
