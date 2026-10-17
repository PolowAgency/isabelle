"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-full border border-pine/30 px-3.5 py-2 text-sm font-semibold text-pine"
    >
      <Printer size={15} /> PDF / Imprimer
    </button>
  );
}
