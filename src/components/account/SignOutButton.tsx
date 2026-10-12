import { LogOut } from "lucide-react";
import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="flex items-center justify-center gap-2 text-coral font-medium py-3"
      >
        <LogOut size={18} /> Déconnexion
      </button>
    </form>
  );
}
