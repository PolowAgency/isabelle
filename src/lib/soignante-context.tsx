"use client";

import { createContext, useContext } from "react";
import type { PublicSoignante } from "@/lib/schema";

interface SoignanteContextValue {
  current: PublicSoignante;
  equipe: PublicSoignante[];
}

const SoignanteContext = createContext<SoignanteContextValue | null>(null);

export function SoignanteProvider({
  current,
  equipe,
  children,
}: SoignanteContextValue & { children: React.ReactNode }) {
  return (
    <SoignanteContext.Provider value={{ current, equipe }}>
      {children}
    </SoignanteContext.Provider>
  );
}

export function useSoignanteContext() {
  const ctx = useContext(SoignanteContext);
  if (!ctx) {
    throw new Error("useSoignanteContext doit être utilisé dans SoignanteProvider");
  }
  return ctx;
}
