const TZ = "Europe/Paris";

// Le serveur (Vercel) tourne en UTC : on calcule toujours la date et l'heure
// dans le fuseau du cabinet pour que « aujourd'hui » et le passage courant
// soient justes, quel que soit l'endroit où le code s'exécute.
function parisParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

export function todayISO(): string {
  return parisParts().iso;
}

export function dateToISO(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function inferPassage(): "matin" | "midi" | "soir" {
  const { hour } = parisParts();
  if (hour < 11) return "matin";
  if (hour < 16) return "midi";
  return "soir";
}

export function greeting(): string {
  const { hour } = parisParts();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

const JOURS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}
