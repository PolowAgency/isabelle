// Exécuté une fois au démarrage du serveur Next. Le contrôle (Node uniquement)
// est dans instrumentation-node.ts : l'import conditionnel garde `postgres` hors du bundle Edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { controler } = await import("./instrumentation-node");
    await controler();
  }
}
