import { BottomNav } from "@/components/layout/BottomNav";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      <main className="pb-20">{children}</main>
      <BottomNav />
    </>
  );
}
