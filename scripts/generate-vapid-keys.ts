// Génère une paire de clés VAPID pour les notifications push.
// Usage : npm run vapid:generate
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  -> clé publique (visible du navigateur)
//   VAPID_PRIVATE_KEY             -> clé privée (secret, serveur uniquement)
//   VAPID_SUBJECT                 -> mailto:contact@votre-cabinet.fr
import webpush from "web-push";

const cles = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${cles.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${cles.privateKey}`);
console.log("VAPID_SUBJECT=mailto:contact@exemple.fr   # à remplacer par une adresse réelle");
