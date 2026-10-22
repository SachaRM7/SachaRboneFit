import type { Metadata } from "next";
import { ApercuMascotte } from "@/components/coach/ApercuMascotte";

export const metadata: Metadata = {
  title: "La mascotte · SachaRbone Fit",
  robots: { index: false, follow: false },
};

export default function PageMascotte() {
  return <ApercuMascotte />;
}
