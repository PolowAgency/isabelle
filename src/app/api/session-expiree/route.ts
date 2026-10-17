import { signOut } from "@/auth";

// Termine la session (cookie effacé) puis renvoie vers la page de connexion.
export const dynamic = "force-dynamic";

const MOTIFS = new Set(["expire", "ailleurs", "duree", "mdp", "bye"]);

export async function GET(request: Request) {
  const motif = new URL(request.url).searchParams.get("motif") ?? "expire";
  await signOut({
    redirectTo: `/login?fin=${MOTIFS.has(motif) ? motif : "expire"}`,
  });
}
