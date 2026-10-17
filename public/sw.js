/* Isabelle — service worker.
 *
 * Ce qu'il met en cache (jamais de donnée de santé) :
 *   - les fichiers statiques de l'application (/_next/static/…), après un premier chargement ;
 *   - la coquille /hors-ligne (page sans aucune donnée : les données viennent de l'appareil,
 *     chiffrées, voir src/lib/offline/stockage.ts).
 * Ce qu'il ne met JAMAIS en cache : les pages authentifiées, les routes /api, les actions.
 *
 * Hors-ligne, une navigation qui échoue (réseau absent) reçoit la coquille /hors-ligne.
 * Il gère aussi les notifications push (texte sans contenu médical).
 */
const VERSION = "v1";
const CACHE_COQUILLE = `isabelle-coquille-${VERSION}`;
const CACHE_STATIQUE = `isabelle-statique-${VERSION}`;
const URL_COQUILLE = "/hors-ligne";

async function precacherCoquille() {
  const cache = await caches.open(CACHE_COQUILLE);
  const reponse = await fetch(URL_COQUILLE, { credentials: "same-origin", cache: "no-store" });
  if (!reponse.ok) return;
  const html = await reponse.clone().text();
  await cache.put(URL_COQUILLE, reponse);

  // Les fichiers référencés par la coquille (scripts, styles, polices) : sans eux la page ne s'afficherait pas hors-ligne.
  const statiques = new Set();
  for (const m of html.matchAll(/["'(](\/_next\/static\/[^"'()\s\\]+)/g)) statiques.add(m[1]);
  const cacheStatique = await caches.open(CACHE_STATIQUE);
  await Promise.all(
    Array.from(statiques).map(async (url) => {
      try {
        if (!(await cacheStatique.match(url))) await cacheStatique.add(url);
      } catch (_) {
        /* un fichier manquant n'empêche pas les autres */
      }
    })
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacherCoquille().catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const gardes = new Set([CACHE_COQUILLE, CACHE_STATIQUE]);
      for (const nom of await caches.keys()) {
        if (nom.startsWith("isabelle-") && !gardes.has(nom)) await caches.delete(nom);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "PRECACHE_COQUILLE") {
    event.waitUntil(precacherCoquille().catch(() => undefined));
  }
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // jamais d'API ni de données en cache

  // Fichiers statiques versionnés : cache d'abord.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIQUE);
        const connu = await cache.match(requete);
        if (connu) return connu;
        const reponse = await fetch(requete);
        if (reponse.ok) cache.put(requete, reponse.clone());
        return reponse;
      })()
    );
    return;
  }

  // Navigation : réseau d'abord ; réseau absent -> coquille hors-ligne.
  if (requete.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const reponse = await fetch(requete);
          if (url.pathname === URL_COQUILLE && reponse.ok) {
            const cache = await caches.open(CACHE_COQUILLE);
            cache.put(URL_COQUILLE, reponse.clone());
          }
          return reponse;
        } catch (_) {
          const cache = await caches.open(CACHE_COQUILLE);
          const coquille = await cache.match(URL_COQUILLE);
          if (coquille) return coquille;
          return new Response("Hors-ligne : ouvrez l'application une fois avec du réseau pour activer le mode hors-ligne.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
  }
});

// --- Notifications push --------------------------------------------------------------
// Le texte ne contient JAMAIS de donnée médicale (ni nom de patient) : seulement un
// type d'événement. Le détail s'affiche dans l'application, après connexion.
self.addEventListener("push", (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch (_) {
    donnees = {};
  }
  const titre = typeof donnees.titre === "string" ? donnees.titre.slice(0, 80) : "Isabelle — Tournée";
  const corps = typeof donnees.corps === "string" ? donnees.corps.slice(0, 140) : "Nouvelle notification";
  const url = typeof donnees.url === "string" && donnees.url.startsWith("/") ? donnees.url : "/alertes";
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: corps,
      icon: "/icon",
      badge: "/icon",
      tag: typeof donnees.tag === "string" ? donnees.tag : undefined,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const cible = (event.notification.data && event.notification.data.url) || "/alertes";
  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const fenetre of fenetres) {
        if ("focus" in fenetre) {
          await fenetre.focus();
          if ("navigate" in fenetre) await fenetre.navigate(cible);
          return;
        }
      }
      await self.clients.openWindow(cible);
    })()
  );
});
