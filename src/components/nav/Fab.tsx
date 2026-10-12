import { Plus } from "lucide-react";

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ajouter"
      className="fixed right-5 bottom-24 z-30 h-14 w-14 rounded-full bg-coral text-white shadow-lg flex items-center justify-center active:scale-95 transition"
    >
      <Plus size={26} />
    </button>
  );
}
