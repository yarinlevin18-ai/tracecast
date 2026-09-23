import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Replay a session | Tracecast" };

export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
