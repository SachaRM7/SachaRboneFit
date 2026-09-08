import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import type { ReactNode } from "react";

export function RepereEnConstruction({
  titre,
  children,
  href = "/dashboard",
  action = "Voir ma prochaine séance",
}: {
  titre: string;
  children: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <section className="building-state">
      <span className="building-icon">
        <ChartNoAxesCombined size={24} aria-hidden />
      </span>
      <p className="eyebrow">Un repère à la fois</p>
      <h2>{titre}</h2>
      <div className="building-copy">{children}</div>
      <Link href={href}>
        {action} <ArrowUpRight size={17} aria-hidden />
      </Link>
    </section>
  );
}
