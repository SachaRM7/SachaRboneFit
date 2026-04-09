import { BottomNav } from "@/components/layout/BottomNav";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      <OfflineIndicator />
      <main className="pb-20">{children}</main>
      <BottomNav />
    </>
  );
}
