"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Dumbbell, BookOpen, MapPin, Menu, TrendingUp } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sessions/new", label: "Séance", icon: Dumbbell },
  { href: "/exercises", label: "Exercices", icon: BookOpen },
  { href: "/progression", label: "Progression", icon: TrendingUp },
  { href: "/gyms", label: "Salles", icon: MapPin },
  { href: "/settings", label: "Plus", icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 z-50">
      <div className="flex items-center justify-around h-full max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-16 h-14 rounded-lg transition-colors ${
                isActive ? "text-white" : "text-zinc-500"
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] mt-0.5 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
