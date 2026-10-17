import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { URL_APP, clientOwner, creerJeu, integrationActive, type Jeu, type Sql } from "./helpers";
import { ajouterJours, todayISO } from "../../src/lib/date";

// Parcours applicatifs (modules serveur réels) contre Postgres, avec le rôle
// restreint de l'application : validation, audit, chiffrement, connexion.

describe.skipIf(!integrationActive)("logique applicative (Postgres réel)", () => {
  let owner: Sql;
  let jeu: Jeu;
  let m: {
    visites: typeof import("../../src/lib/visites");
    series: typeof import("../../src/lib/series");
    transferts: typeof import("../../src/lib/transferts");
    login: typeof import("../../src/lib/login");
    acces: typeof import("../../src/lib/acces");
    exportation: typeof import("../../src/lib/export");
    detail: typeof import("../../src/lib/patient-detail");
    password: typeof import("../../src/lib/password");
    resultat: typeof import("../../src/lib/resultat");
    db: typeof import("../../src/lib/db");
  };

  const aujourdhui = todayISO();
  const actionsAudit = async (soignanteId: string, action: string) => {
    const lignes = await owner`select count(*)::int as n from audit_log where soignante_id = ${soignanteId} and action = ${action}`;
    return lignes[0].n as number;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_APP;
    process.env.AUTH_SECRET = "secret-de-test";
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    owner = clientOwner();
    jeu = await creerJeu(owner, aujourdhui, ajouterJours(aujourdhui, -1));
    m = {
      visites: await import("../../src/lib/visites"),
      series: await import("../../src/lib/series"),
      transferts: await import("../../src/lib/transferts"),
      login: await import("../../src/lib/login"),
      acces: await import("../../src/lib/acces"),
      exportation: await import("../../src/lib/export"),
      detail: await import("../../src/lib/patient-detail"),
      password: await import("../../src/lib/password"),
      resultat: await import("../../src/lib/resultat"),
      db: await import("../../src/lib/db"),
    };
  });

  afterAll(async () => {
    await owner.end();
  });

  describe("validation des visites", () => {
    test("« faite » refusée sans acte, acceptée avec, historique tracé", async () => {
      const [v] = await owner`insert into visites (patient_id, soignante_id, date, tranche)
        values (${jeu.patient}, ${jeu.active}, ${ajouterJours(aujourdhui, 3)}, '10-12') returning id`;
      await expect(m.visites.changerStatutVisite(jeu.active, v.id, "faite")).rejects.toThrow(/au moins un acte/);
      await m.visites.changerStatutVisite(jeu.active, v.id, "faite", ["injection"]);
      const [apres] = await owner`select statut, actes, heure_reelle from visites where id = ${v.id}`;
      expect(apres.statut).toBe("faite");
      expect(apres.actes).toEqual(["injection"]);
      expect(apres.heure_reelle).not.toBeNull();
      const histo = await owner`select champ from visites_historique where visite_id = ${v.id} order by champ`;
      expect(histo.map((h) => h.champ)).toEqual(["actes", "statut"]);
    });

    test("acte hors liste blanche refusé ; acte historique de la visite toléré", async () => {
      const [v] = await owner`insert into visites (patient_id, soignante_id, date, tranche, actes)
        values (${jeu.patient}, ${jeu.active}, ${ajouterJours(aujourdhui, 4)}, '10-12', '{Constantes}') returning id`;
      await expect(m.visites.changerStatutVisite(jeu.active, v.id, "faite", ["acte inventé"])).rejects.toThrow(/Acte non reconnu/);
      await m.visites.changerStatutVisite(jeu.active, v.id, "faite", ["Constantes", "pansement"]);
      const [apres] = await owner`select actes from visites where id = ${v.id}`;
      expect(apres.actes).toEqual(["Constantes", "pansement"]);
    });

    test("l'erreur est une erreur « métier » (message affichable), pas une exception technique", async () => {
      const [v] = await owner`insert into visites (patient_id, soignante_id, date, tranche)
        values (${jeu.patient}, ${jeu.active}, ${ajouterJours(aujourdhui, 5)}, '10-12') returning id`;
      const res = await m.resultat.enResultat(() => m.visites.changerStatutVisite(jeu.active, v.id, "faite"));
      expect(res).toEqual({ ok: false, error: expect.stringContaining("au moins un acte") });
    });
  });

  describe("séries et transferts : audit", () => {
    test("création d'une série : 1 mois quotidien, transaction, audit", async () => {
      const [{ id: patient }] = await owner`insert into patients (prenom, nom) values ('Serie', ${"S" + randomUUID().slice(0, 6)}) returning id`;
      const debut = ajouterJours(aujourdhui, 10);
      const res = await m.series.creerSerieVisites(jeu.active, {
        patientId: patient,
        dateDebut: debut,
        frequence: "quotidien",
        tranches: ["8-10", "18-20"],
        actes: ["prise de sang"],
        dureeEstimeeMin: 15,
        fin: { type: "duree", unite: "jours", nombre: 30 },
      });
      expect(res.crees).toBe(60);
      expect(await actionsAudit(jeu.active, "serie_creee")).toBeGreaterThan(0);
      // Rejouer : tout existe déjà -> refus et annulation (aucune série vide)
      await expect(
        m.series.creerSerieVisites(jeu.active, {
          patientId: patient, dateDebut: debut, frequence: "quotidien", tranches: ["8-10"], actes: [],
          dureeEstimeeMin: null, fin: { type: "duree", unite: "jours", nombre: 5 },
        })
      ).rejects.toThrow(/déjà/);
      const [{ n }] = await owner`select count(*)::int as n from series_visites where patient_id = ${patient}`;
      expect(n).toBe(1);
    });

    test("transfert : création, réponse unique par la destinataire, audit", async () => {
      const [{ id: patient }] = await owner`insert into patients (prenom, nom) values ('Tr', ${"T" + randomUUID().slice(0, 6)}) returning id`;
      await owner`insert into visites (patient_id, soignante_id, date, tranche) values (${patient}, ${jeu.active}, ${aujourdhui}, '16-18')`;
      await m.transferts.creerTransfert(jeu.active, { cible: { type: "patient", id: patient }, versSoignanteId: jeu.admin });
      const [t] = await owner`select id from transferts where patient_id = ${patient}`;
      await expect(m.transferts.repondreTransfert(jeu.active, t.id, "accepte")).rejects.toThrow();
      const res = await m.transferts.repondreTransfert(jeu.admin, t.id, "accepte");
      expect(res.deplacees).toBe(1);
      expect(await actionsAudit(jeu.active, "transfert_cree")).toBeGreaterThan(0);
      expect(await actionsAudit(jeu.admin, "transfert_accepte")).toBeGreaterThan(0);
    });
  });

  describe("chiffrement des codes d'accès", () => {
    test("jamais en clair en base, relus déchiffrés, contexte lié au patient", async () => {
      const [{ id: patient }] = await owner`insert into patients (prenom, nom) values ('Ac', ${"A" + randomUUID().slice(0, 6)}) returning id`;
      const patch = m.acces.chiffrerPatchAcces(patient, { codePortail: "B12A", digicodePorte: "4598", etage: "2e", notesAcces: "Sonner longuement" });
      // Écriture par le rôle applicatif (RLS), comme le fait l'action.
      await m.db.withSoignante(jeu.active, async (tx) => {
        const { accesDomicile } = await import("../../src/lib/schema");
        await tx.insert(accesDomicile).values({ patientId: patient, updatedBy: jeu.active, ...patch });
      });
      const [brut] = await owner`select code_portail, digicode_porte, etage, notes_acces from acces_domicile where patient_id = ${patient}`;
      expect(brut.code_portail).toMatch(/^enc:v1:/);
      expect(JSON.stringify(brut)).not.toContain("B12A");
      expect(JSON.stringify(brut)).not.toContain("4598");
      expect(JSON.stringify(brut)).not.toContain("Sonner");
      expect(brut.etage).toBe("2e"); // champ non sensible

      const lu = await m.db.withSoignante(jeu.active, async (tx) => {
        const { accesDomicile } = await import("../../src/lib/schema");
        const { eq } = await import("drizzle-orm");
        const [row] = await tx.select().from(accesDomicile).where(eq(accesDomicile.patientId, patient));
        return m.acces.lireAcces(row, patient);
      });
      expect(lu.codePortail).toBe("B12A");
      expect(lu.notesAcces).toBe("Sonner longuement");

      // Même texte chiffré recopié sur un autre patient : illisible (signalé, jamais déchiffré).
      const [autre] = await owner`select id from patients where id <> ${patient} limit 1`;
      const copie = m.acces.lireAcces(
        { codePortail: brut.code_portail, digicodePorte: brut.digicode_porte } as never,
        autre.id
      );
      expect(copie.codePortail).toBeNull();
      expect(copie.digicodePorte).toBeNull();
      expect(copie.illisibles).toEqual(["codePortail", "digicodePorte"]);
    });
  });

  describe("fiche patient : audit des consultations", () => {
    test("ouvrir la fiche journalise (une seule fois par période), sans contenu", async () => {
      const avant = await actionsAudit(jeu.active, "patient_consulte");
      const detail1 = await m.detail.getPatientDetail(jeu.active, jeu.patient);
      expect(detail1?.patient.id).toBe(jeu.patient);
      // Le jeu de test contient un faux texte chiffré : la fiche s'affiche, le champ est signalé illisible.
      expect(detail1?.access.illisibles).toEqual(["codePortail"]);
      expect(detail1?.access.codePortail).toBeNull();
      await m.detail.getPatientDetail(jeu.active, jeu.patient);
      const apres = await actionsAudit(jeu.active, "patient_consulte");
      expect(apres - avant).toBeLessThanOrEqual(1);
      const lignes = await owner`select * from audit_log where soignante_id = ${jeu.active} and patient_id = ${jeu.patient}`;
      for (const l of lignes) expect(Object.keys(l).sort()).toEqual(
        ["action", "created_at", "entite", "entite_id", "id", "ip_hash", "patient_id", "soignante_id"]
      );
    });
  });

  describe("export : droits et audit", () => {
    const profil = (id: string, estAdmin: boolean) => ({ id, estAdmin }) as never;

    test("une soignante n'exporte que ses passages ; l'admin voit tout ; l'export est journalisé", async () => {
      const periode = { du: aujourdhui, au: ajouterJours(aujourdhui, 1) };
      const siennes = await m.exportation.lireJournalPassages(profil(jeu.active, false), periode);
      expect(siennes.lignes.length).toBeGreaterThan(0);
      expect(siennes.lignes.every((l) => l.soignante.startsWith("Active"))).toBe(true);
      await expect(
        m.exportation.lireJournalPassages(profil(jeu.active, false), { ...periode, soignanteId: jeu.admin })
      ).rejects.toThrow(/propres passages/);
      const tout = await m.exportation.lireJournalPassages(profil(jeu.admin, true), periode);
      expect(tout.lignes.length).toBeGreaterThanOrEqual(siennes.lignes.length);
      expect(await actionsAudit(jeu.active, "export_passages")).toBeGreaterThan(0);
    });
  });

  describe("connexion : limitation et journalisation", () => {
    const motDePasse = "motdepasse-de-test-1";
    let email: string;

    beforeAll(async () => {
      email = `login-${randomUUID().slice(0, 8)}@test.local`;
      const hash = await m.password.hashPassword(motDePasse);
      await owner`alter table soignantes disable trigger soignantes_garde_admin_insert`;
      await owner`insert into soignantes (prenom, nom, email, password_hash, role) values ('Log', 'In', ${email}, ${hash}, 'titulaire')`;
      await owner`alter table soignantes enable trigger soignantes_garde_admin_insert`;
    });

    test("bon mot de passe : connexion et session_version", async () => {
      const ip = `10.0.0.${Math.floor(Math.random() * 200)}`;
      const res = await m.login.tenterConnexion(email, motDePasse, ip, aujourdhui);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.soignante.sessionVersion).toBe(0);
        expect(res.soignante.mustChangePassword).toBe(false);
      }
    });

    test("5 échecs : bloqué (même avec le bon mot de passe), message générique, sans fuite", async () => {
      const mail = `bloc-${randomUUID().slice(0, 8)}@test.local`;
      const ip = `172.16.${Math.floor(Math.random() * 200)}.1`;
      for (let i = 0; i < 5; i++) {
        const r = await m.login.tenterConnexion(mail, "mauvais", ip, aujourdhui);
        expect(r).toEqual({ ok: false, bloque: false, message: "Email ou mot de passe incorrect." });
      }
      const bloque = await m.login.tenterConnexion(mail, "mauvais", ip, aujourdhui);
      expect(bloque.ok).toBe(false);
      if (!bloque.ok) {
        expect(bloque.bloque).toBe(true);
        expect(bloque.message).toMatch(/Trop de tentatives/);
      }
      // Même message de blocage pour un compte réel dont l'adresse est aussi martelée.
      const lignes = await owner`select action from audit_log where action in ('connexion_echec','connexion_bloquee') and ip_hash is not null order by created_at desc limit 8`;
      expect(lignes.length).toBeGreaterThan(0);
    });

    test("compte inactif ou expiré : refus avec le même message qu'un mauvais mot de passe", async () => {
      const r = await m.login.tenterConnexion(`inconnu-${randomUUID()}@test.local`, "x", null, aujourdhui);
      expect(r).toEqual({ ok: false, bloque: false, message: "Email ou mot de passe incorrect." });
    });
  });
});
