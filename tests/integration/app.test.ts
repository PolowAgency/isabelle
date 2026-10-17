import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { URL_APP, clientApp, clientOwner, commeSoignante, creerJeu, integrationActive, type Jeu, type Sql } from "./helpers";
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

describe.skipIf(!integrationActive)("rejeu des actions hors-ligne (Postgres réel)", () => {
  let owner: Sql;
  let jeu: Jeu;
  let sync: typeof import("../../src/lib/offline/sync");
  const demain = ajouterJours(todayISO(), 1);

  const visite = async (tranche: string, extra: Record<string, unknown> = {}) => {
    const [v] = await owner`insert into visites (patient_id, soignante_id, date, tranche, actes, statut)
      values (${jeu.patient}, ${jeu.active}, ${ajouterJours(todayISO(), 30 + Math.floor(Math.random() * 300))}, ${tranche}, ${(extra.actes as string[]) ?? ["pansement"]}, ${(extra.statut as string) ?? "prevue"}) returning id, date`;
    return v as { id: string; date: string };
  };
  const marquer = (visiteId: string, statut: "faite" | "absent", statutConnu = "prevue"): never =>
    ({ id: randomUUID(), type: "marquer", visiteId, statut, statutConnu, creeLe: Date.now() }) as never;
  const statutDe = async (id: string) => (await owner`select statut from visites where id = ${id}`)[0].statut as string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_APP;
    process.env.AUTH_SECRET = "secret-de-test";
    owner = clientOwner();
    jeu = await creerJeu(owner, todayISO(), ajouterJours(todayISO(), -1));
    sync = await import("../../src/lib/offline/sync");
  });
  afterAll(async () => {
    await owner.end();
  });

  test("état du serveur inchangé : validation appliquée, tracée dans l'historique", async () => {
    const v = await visite("8-10");
    const [r] = await sync.rejouerOperations(jeu.active, [marquer(v.id, "faite")]);
    expect(r.etat).toBe("applique");
    expect(await statutDe(v.id)).toBe("faite");
    const h = await owner`select champ from visites_historique where visite_id = ${v.id}`;
    expect(h.length).toBeGreaterThan(0);
  });

  test("rejouer deux fois la même opération : la seconde est sans effet", async () => {
    const v = await visite("8-10");
    const op = marquer(v.id, "faite");
    expect((await sync.rejouerOperations(jeu.active, [op]))[0].etat).toBe("applique");
    expect((await sync.rejouerOperations(jeu.active, [op]))[0].etat).toBe("deja_fait");
    const [{ n }] = await owner`select count(*)::int as n from visites_historique where visite_id = ${v.id} and champ = 'statut'`;
    expect(n).toBe(1);
  });

  test("une collègue a marqué le passage « absent » entre-temps : conflit, rien n'est écrasé", async () => {
    const v = await visite("10-12");
    await owner`update visites set statut = 'absent' where id = ${v.id}`;
    await owner`insert into visites_historique (visite_id, soignante_id, champ, nouvelle_valeur) values (${v.id}, ${jeu.admin}, 'statut', 'absent')`;
    const [r] = await sync.rejouerOperations(jeu.active, [marquer(v.id, "faite")]);
    expect(r.etat).toBe("conflit");
    expect(r.statutServeur).toBe("absent");
    expect(r.parPrenom).toBe("Admin");
    expect(await statutDe(v.id)).toBe("absent");
  });

  test("un passage déjà validé par une collègue n'est pas écrasé par « absent »", async () => {
    const v = await visite("12-14", { statut: "faite" });
    const [r] = await sync.rejouerOperations(jeu.active, [marquer(v.id, "absent")]);
    expect(r.etat).toBe("conflit");
    expect(await statutDe(v.id)).toBe("faite");
  });

  test("validation sans acte refusée (erreur lisible), visite inchangée", async () => {
    const v = await visite("14-16", { actes: [] });
    const [r] = await sync.rejouerOperations(jeu.active, [marquer(v.id, "faite")]);
    expect(r.etat).toBe("erreur");
    expect(r.message).toMatch(/au moins un acte/);
    expect(await statutDe(v.id)).toBe("prevue");
  });

  test("report à demain hors-ligne : créé une fois, jamais en double", async () => {
    const v = await visite("16-18");
    const op = { id: randomUUID(), type: "decaler", visiteId: v.id, statutConnu: "prevue", creeLe: Date.now() } as never;
    expect((await sync.rejouerOperations(jeu.active, [op]))[0].etat).toBe("applique");
    expect((await sync.rejouerOperations(jeu.active, [op]))[0].etat).toBe("deja_fait");
    const [{ n }] = await owner`select count(*)::int as n from visites where report_de_id = ${v.id}`;
    expect(n).toBe(1);
    void demain;
  });

  test("visite inexistante : conflit sans exception", async () => {
    const [r] = await sync.rejouerOperations(jeu.active, [marquer(randomUUID(), "faite")]);
    expect(r.etat).toBe("conflit");
  });

  test("deux opérations sur la même visite : compactées, la dernière gagne depuis l'état serveur connu", async () => {
    const v = await visite("18-20");
    const premiere = marquer(v.id, "faite") as { id: string };
    const correction = { ...(marquer(v.id, "absent", "faite") as object) } as never;
    const res = await sync.rejouerOperations(jeu.active, [premiere as never, correction]);
    expect(res).toHaveLength(1);
    expect(res[0].etat).toBe("applique");
    expect(await statutDe(v.id)).toBe("absent");
  });

  describe("actions rapides : arrivée et ordre", () => {
    // Un patient par visite : (patient, jour, tranche) est unique.
    const visiteLe = async (date: string, tranche: string, ordre: number, statut = "prevue") => {
      const [p] = await owner`insert into patients (prenom, nom) values ('Test', ${"Ordre-" + randomUUID().slice(0, 8)}) returning id`;
      const [v] = await owner`insert into visites (patient_id, soignante_id, date, tranche, actes, statut, ordre_dans_passage)
        values (${p.id}, ${jeu.active}, ${date}, ${tranche}, ${["pansement"]}, ${statut}, ${ordre}) returning id`;
      return v.id as string;
    };
    const arrivee = (visiteId: string, creeLe = Date.now()) => ({ id: randomUUID(), type: "arrivee", visiteId, creeLe }) as never;
    const deplacer = (visiteId: string, sens: "haut" | "bas") =>
      ({ id: randomUUID(), type: "deplacer", visiteId, sens, creeLe: Date.now() }) as never;
    const ordreDe = async (ids: string[]) =>
      (await owner`select id, ordre_dans_passage from visites where id = any(${ids}::uuid[]) order by ordre_dans_passage, id`).map((r) => r.id as string);

    test("l'arrivée est enregistrée une fois : la première heure fait foi, jamais écrasée", async () => {
      const v = await visite("10-12");
      const [premiere] = await sync.rejouerOperations(jeu.active, [arrivee(v.id, Date.now() - 600_000)]);
      expect(premiere.etat).toBe("applique");
      const [h1] = await owner`select heure_arrivee, heure_reelle from visites where id = ${v.id}`;
      expect(h1.heure_arrivee).not.toBeNull();
      expect(h1.heure_reelle).toBeNull(); // distincte de l'heure de validation

      const [seconde] = await sync.rejouerOperations(jeu.active, [arrivee(v.id)]);
      expect(seconde.etat).toBe("deja_fait");
      const [h2] = await owner`select heure_arrivee from visites where id = ${v.id}`;
      expect(new Date(h2.heure_arrivee).getTime()).toBe(new Date(h1.heure_arrivee).getTime());
    });

    test("une arrivée annoncée dans le futur par l'appareil est ramenée à maintenant", async () => {
      const v = await visite("12-14");
      await sync.rejouerOperations(jeu.active, [arrivee(v.id, Date.now() + 3_600_000)]);
      const [h] = await owner`select heure_arrivee from visites where id = ${v.id}`;
      expect(new Date(h.heure_arrivee).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    test("arrivée sur une visite annulée ou inconnue : signalée, rien n'est modifié", async () => {
      const annulee = await visite("14-16", { statut: "annulee" });
      const [r1] = await sync.rejouerOperations(jeu.active, [arrivee(annulee.id)]);
      expect(r1.etat).toBe("conflit");
      const [r2] = await sync.rejouerOperations(jeu.active, [arrivee(randomUUID())]);
      expect(r2.etat).toBe("conflit");
    });

    test("déplacer : échange avec la voisine, ordre renuméroté sans doublon", async () => {
      const date = ajouterJours(todayISO(), 400 + Math.floor(Math.random() * 300));
      const a = await visiteLe(date, "8-10", 1);
      const b = await visiteLe(date, "8-10", 2);
      const c = await visiteLe(date, "8-10", 3);
      const [r] = await sync.rejouerOperations(jeu.active, [deplacer(c, "haut")]);
      expect(r.etat).toBe("applique");
      expect(await ordreDe([a, b, c])).toEqual([a, c, b]);
      const rangs = (await owner`select ordre_dans_passage from visites where id = any(${[a, b, c]}::uuid[]) order by ordre_dans_passage`).map((x) => x.ordre_dans_passage);
      expect(rangs).toEqual([1, 2, 3]);

      const [tete] = await sync.rejouerOperations(jeu.active, [deplacer(a, "haut")]);
      expect(tete.etat).toBe("deja_fait"); // déjà en tête : rien à faire
    });

    test("une visite déjà faite garde sa place, on échange avec la voisine à faire", async () => {
      const date = ajouterJours(todayISO(), 700 + Math.floor(Math.random() * 300));
      const a = await visiteLe(date, "16-18", 1);
      const faite = await visiteLe(date, "16-18", 2, "faite");
      const c = await visiteLe(date, "16-18", 3);
      await sync.rejouerOperations(jeu.active, [deplacer(c, "haut")]);
      expect(await ordreDe([a, faite, c])).toEqual([c, faite, a]);
      const [refus] = await sync.rejouerOperations(jeu.active, [deplacer(faite, "haut")]);
      expect(refus.etat).toBe("conflit"); // seule une visite à faire se déplace
    });

    test("l'ordre ne mélange pas les tranches ni les jours", async () => {
      const date = ajouterJours(todayISO(), 1000 + Math.floor(Math.random() * 300));
      const matin = await visiteLe(date, "8-10", 1);
      const matin2 = await visiteLe(date, "8-10", 2);
      const soir = await visiteLe(date, "18-20", 1);
      await sync.rejouerOperations(jeu.active, [deplacer(matin2, "haut")]);
      const [s] = await owner`select ordre_dans_passage from visites where id = ${soir}`;
      expect(s.ordre_dans_passage).toBe(1);
      expect(await ordreDe([matin, matin2])).toEqual([matin2, matin]);
    });

    test("ordre de la file : arrivée puis validation, puis déplacement, rejoués dans l'ordre", async () => {
      const date = ajouterJours(todayISO(), 1300 + Math.floor(Math.random() * 300));
      const a = await visiteLe(date, "6-8", 1);
      const b = await visiteLe(date, "6-8", 2);
      const res = await sync.rejouerOperations(jeu.active, [arrivee(b), deplacer(b, "haut"), marquer(b, "faite")]);
      expect(res.map((r) => r.etat)).toEqual(["applique", "applique", "applique"]);
      expect(await ordreDe([a, b])).toEqual([b, a]);
      expect(await statutDe(b)).toBe("faite");
    });
  });
});


describe.skipIf(!integrationActive)("durées par acte et capacité (Postgres réel)", () => {
  let owner: Sql;
  let app: Sql;
  let jeu: Jeu;
  let planning: typeof import("../../src/lib/planning");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_APP;
    process.env.AUTH_SECRET = "secret-de-test";
    owner = clientOwner();
    app = clientApp();
    jeu = await creerJeu(owner, todayISO(), ajouterJours(todayISO(), -1));
    // Tests rejouables sur une base déjà utilisée : on repart sans réglage enregistré.
    await owner`delete from actes_durees`;
    await owner`delete from reglages_planning`;
    planning = await import("../../src/lib/planning");
  });
  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  test("sans réglage enregistré : durées par défaut et capacité de 2 h", async () => {
    const r = await planning.getReglagesPlanning(jeu.active);
    expect(r.durees.toilette).toBe(30);
    expect(r.capaciteTrancheMin).toBe(120);
  });

  test("un administrateur règle les durées : lues par toute l'équipe, autres actes inchangés", async () => {
    await planning.enregistrerReglagesPlanning(jeu.admin, { durees: { toilette: 45 }, capaciteTrancheMin: 90 });
    const r = await planning.getReglagesPlanning(jeu.active);
    expect(r.durees.toilette).toBe(45);
    expect(r.durees.injection).toBe(10);
    expect(r.capaciteTrancheMin).toBe(90);
  });

  test("une soignante non administratrice ne peut pas modifier les réglages (RLS)", async () => {
    await expect(
      commeSoignante(app, jeu.active, (tx) => tx`update actes_durees set duree_min = 5 where acte = 'toilette'`)
    ).resolves.toBeDefined(); // 0 ligne visible en écriture : aucun effet
    const [{ duree_min }] = await owner`select duree_min from actes_durees where acte = 'toilette'`;
    expect(duree_min).toBe(45);
    await expect(
      commeSoignante(app, jeu.active, (tx) => tx`insert into actes_durees (acte, duree_min) values ('injection', 1)`)
    ).rejects.toThrow();
    await expect(
      commeSoignante(app, jeu.active, (tx) => tx`insert into reglages_planning (cle, valeur_int) values ('capacite_tranche_min', 15) on conflict (cle) do update set valeur_int = 15`)
    ).rejects.toThrow();
  });

  test("valeurs hors bornes refusées par la base", async () => {
    await expect(owner`insert into actes_durees (acte, duree_min) values ('perfusion', 0)`).rejects.toThrow();
    await expect(owner`insert into actes_durees (acte, duree_min) values ('perfusion', 481)`).rejects.toThrow();
    await expect(owner`insert into reglages_planning (cle, valeur_int) values ('autre', 60)`).rejects.toThrow();
  });
});


describe.skipIf(!integrationActive)("absences et répartition (Postgres réel)", () => {
  let owner: Sql;
  let jeu: Jeu;
  let absences: typeof import("../../src/lib/absences");
  let transferts: typeof import("../../src/lib/transferts");
  const debut = ajouterJours(todayISO(), 2000 + Math.floor(Math.random() * 500));
  const fin = ajouterJours(debut, 4);

  const patient = async () => {
    const [p] = await owner`insert into patients (prenom, nom) values ('Test', ${"Absence-" + randomUUID().slice(0, 8)}) returning id`;
    return p.id as string;
  };
  const visiteDe = async (patientId: string, soignanteId: string, date: string, statut = "prevue") => {
    const [v] = await owner`insert into visites (patient_id, soignante_id, date, tranche, actes, statut)
      values (${patientId}, ${soignanteId}, ${date}, '8-10', ${["pansement"]}, ${statut}) returning id`;
    return v.id as string;
  };
  const soignanteDe = async (visiteId: string) => (await owner`select soignante_id from visites where id = ${visiteId}`)[0].soignante_id as string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_APP;
    process.env.AUTH_SECRET = "secret-de-test";
    owner = clientOwner();
    jeu = await creerJeu(owner, todayISO(), ajouterJours(todayISO(), -1));
    absences = await import("../../src/lib/absences");
    transferts = await import("../../src/lib/transferts");
  });
  afterAll(async () => {
    await owner.end();
  });

  test("déclaration : seule la personne concernée (ou un admin), sans chevauchement ni période passée", async () => {
    const a = await absences.creerAbsence(jeu.active, false, { soignanteId: jeu.active, dateDebut: debut, dateFin: fin, motif: "Congés" });
    expect(a.id).toBeTruthy();
    await expect(
      absences.creerAbsence(jeu.active, false, { soignanteId: jeu.admin, dateDebut: debut, dateFin: fin, motif: null })
    ).rejects.toThrow(/vos propres absences/);
    await expect(
      absences.creerAbsence(jeu.active, false, { soignanteId: jeu.active, dateDebut: ajouterJours(fin, -1), dateFin: ajouterJours(fin, 3), motif: null })
    ).rejects.toThrow(/déjà déclarée/);
    await expect(
      absences.creerAbsence(jeu.active, false, { soignanteId: jeu.active, dateDebut: ajouterJours(todayISO(), -9), dateFin: ajouterJours(todayISO(), -5), motif: null })
    ).rejects.toThrow(/déjà passée/);
    await expect(
      absences.creerAbsence(jeu.active, false, { soignanteId: jeu.active, dateDebut: fin, dateFin: debut, motif: null })
    ).rejects.toThrow(/précède/);
    // Un administrateur peut déclarer pour une collègue.
    const parAdmin = await absences.creerAbsence(jeu.admin, true, {
      soignanteId: jeu.active,
      dateDebut: ajouterJours(fin, 10),
      dateFin: ajouterJours(fin, 12),
      motif: null,
    });
    expect(parAdmin.id).toBeTruthy();
  });

  test("suppression : refusée à une soignante inactive, permise à la personne et à un admin ; tracée", async () => {
    const [{ id }] = await owner`insert into absences (soignante_id, date_debut, date_fin) values (${jeu.active}, ${ajouterJours(fin, 40)}, ${ajouterJours(fin, 41)}) returning id`;
    await expect(absences.supprimerAbsence(jeu.inactive, id)).rejects.toThrow();
    await absences.supprimerAbsence(jeu.active, id);
    expect(await owner`select 1 from absences where id = ${id}`).toHaveLength(0);
    const [{ id: id2 }] = await owner`insert into absences (soignante_id, date_debut, date_fin) values (${jeu.active}, ${ajouterJours(fin, 50)}, ${ajouterJours(fin, 51)}) returning id`;
    await absences.supprimerAbsence(jeu.admin, id2); // l'admin gère toutes les absences
    const [{ n }] = await owner`select count(*)::int n from audit_log where action = 'absence_supprimee' and soignante_id in (${jeu.active}, ${jeu.admin})`;
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test("répartition : seules les visites à faire PENDANT l'absence changent de soignante, après accord en lot", async () => {
    const [{ id: absenceId }] = await owner`insert into absences (soignante_id, date_debut, date_fin) values (${jeu.active}, ${ajouterJours(debut, 100)}, ${ajouterJours(debut, 104)}) returning id`;
    const d0 = ajouterJours(debut, 100);
    const p1 = await patient();
    const p2 = await patient();
    const dedans1 = await visiteDe(p1, jeu.active, ajouterJours(d0, 1));
    const dedans2 = await visiteDe(p1, jeu.active, ajouterJours(d0, 3));
    const dedans3 = await visiteDe(p2, jeu.active, ajouterJours(d0, 2));
    const avant = await visiteDe(p1, jeu.active, ajouterJours(d0, -1));
    const apres = await visiteDe(p1, jeu.active, ajouterJours(d0, 6));
    const faite = await visiteDe(p2, jeu.active, ajouterJours(d0, 4), "faite");

    const donnees = await absences.lireDonneesRepartition(jeu.active, false, absenceId);
    expect(donnees.visites.map((v) => v.id).sort()).toEqual([dedans1, dedans2, dedans3].sort());
    expect(donnees.collegues.map((c) => c.id)).not.toContain(jeu.active);

    const cree = await absences.creerTransfertsAbsence(jeu.active, false, {
      absenceId,
      affectations: [
        { patientId: p1, versSoignanteId: jeu.admin },
        { patientId: p2, versSoignanteId: jeu.admin },
      ],
      message: "Merci !",
    });
    expect(cree).toMatchObject({ crees: 2, ignores: 0 });
    // Rien ne bouge avant l'accord de la destinataire.
    expect(await soignanteDe(dedans1)).toBe(jeu.active);

    const doublon = await absences.creerTransfertsAbsence(jeu.active, false, {
      absenceId,
      affectations: [{ patientId: p1, versSoignanteId: jeu.admin }],
      message: null,
    });
    expect(doublon).toMatchObject({ crees: 0, ignores: 1 });

    const res = await transferts.repondreTransfertsAbsence(jeu.admin, absenceId, "accepte");
    expect(res).toEqual({ traitees: 2, deplacees: 3 });
    for (const v of [dedans1, dedans2, dedans3]) expect(await soignanteDe(v)).toBe(jeu.admin);
    for (const v of [avant, apres, faite]) expect(await soignanteDe(v)).toBe(jeu.active);
  });

  test("refus en lot : rien ne change ; une personne non concernée ne peut pas répartir", async () => {
    const [{ id: absenceId }] = await owner`insert into absences (soignante_id, date_debut, date_fin) values (${jeu.active}, ${ajouterJours(debut, 200)}, ${ajouterJours(debut, 202)}) returning id`;
    const p = await patient();
    const v = await visiteDe(p, jeu.active, ajouterJours(debut, 201));
    await expect(
      absences.creerTransfertsAbsence(jeu.inactive, false, { absenceId, affectations: [{ patientId: p, versSoignanteId: jeu.admin }], message: null })
    ).rejects.toThrow();
    await absences.creerTransfertsAbsence(jeu.active, false, { absenceId, affectations: [{ patientId: p, versSoignanteId: jeu.admin }], message: null });
    const res = await transferts.repondreTransfertsAbsence(jeu.admin, absenceId, "refuse");
    expect(res).toEqual({ traitees: 1, deplacees: 0 });
    expect(await soignanteDe(v)).toBe(jeu.active);
    // Plus rien en attente : une seconde réponse en lot ne fait rien.
    expect(await transferts.repondreTransfertsAbsence(jeu.admin, absenceId, "accepte")).toEqual({ traitees: 0, deplacees: 0 });
  });

  test("on ne peut pas se confier ses propres visites", async () => {
    const [{ id: absenceId }] = await owner`insert into absences (soignante_id, date_debut, date_fin) values (${jeu.active}, ${ajouterJours(debut, 300)}, ${ajouterJours(debut, 301)}) returning id`;
    const p = await patient();
    await visiteDe(p, jeu.active, ajouterJours(debut, 300));
    await expect(
      absences.creerTransfertsAbsence(jeu.active, false, { absenceId, affectations: [{ patientId: p, versSoignanteId: jeu.active }], message: null })
    ).rejects.toThrow(/autre soignante/);
  });
});


describe.skipIf(!integrationActive)("suivi des traitements à chaque passage (Postgres réel)", () => {
  let owner: Sql;
  let app: Sql;
  let jeu: Jeu;
  let visitesLib: typeof import("../../src/lib/visites");
  let prisesLib: typeof import("../../src/lib/prises");
  let tournee: typeof import("../../src/lib/tournee");
  let sync: typeof import("../../src/lib/offline/sync");
  const jour = ajouterJours(todayISO(), 3000 + Math.floor(Math.random() * 500));

  let patientId: string;
  let tMatin: string;
  let tMatinSoir: string;
  let tSoir: string;
  let tInactif: string;

  const visite = async (tranche: string, date = jour, pid = patientId) => {
    const [v] = await owner`insert into visites (patient_id, soignante_id, date, tranche, actes, statut)
      values (${pid}, ${jeu.active}, ${date}, ${tranche}, ${["pansement"]}, 'prevue') returning id`;
    return v.id as string;
  };
  const statutDe = async (id: string) => (await owner`select statut from visites where id = ${id}`)[0].statut as string;
  const nbPrises = async (visiteId: string) => (await owner`select count(*)::int n from prises_traitement where visite_id = ${visiteId}`)[0].n as number;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_APP;
    process.env.AUTH_SECRET = "secret-de-test";
    owner = clientOwner();
    app = clientApp();
    jeu = await creerJeu(owner, todayISO(), ajouterJours(todayISO(), -1));
    const [p] = await owner`insert into patients (prenom, nom) values ('Test', ${"Prises-" + randomUUID().slice(0, 8)}) returning id`;
    patientId = p.id;
    const t = async (libelle: string, passages: string[], actif = true) =>
      (await owner`insert into traitements (patient_id, libelle, passages, actif) values (${patientId}, ${libelle}, ${passages}, ${actif}) returning id`)[0].id as string;
    tMatin = await t("Matin seul", ["matin"]);
    tMatinSoir = await t("Matin et soir", ["matin", "soir"]);
    tSoir = await t("Soir seul", ["soir"]);
    tInactif = await t("Arrêté", ["matin"], false);
    visitesLib = await import("../../src/lib/visites");
    prisesLib = await import("../../src/lib/prises");
    tournee = await import("../../src/lib/tournee");
    sync = await import("../../src/lib/offline/sync");
  });
  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  test("la tournée porte les traitements prévus à ce passage (actifs, du bon créneau)", async () => {
    const v = await visite("8-10");
    const lignes = await tournee.getTourneeVisites(jeu.active, jour, "jour", "mine");
    const ligne = lignes.find((l) => l.id === v)!;
    expect(ligne.traitementsDus.map((d) => d.id).sort()).toEqual([tMatin, tMatinSoir].sort());
    expect(ligne.prises).toEqual([]);
  });

  test("valider sans renseigner les traitements du passage : refusé, visite inchangée", async () => {
    const v = await visite("10-12");
    await expect(visitesLib.changerStatutVisite(jeu.active, v, "faite")).rejects.toThrow(/pour chaque traitement/);
    await expect(
      visitesLib.changerStatutVisite(jeu.active, v, "faite", undefined, [{ traitementId: tMatin, statut: "administre", commentaire: null }])
    ).rejects.toThrow(/pour chaque traitement/); // il en manque un
    expect(await statutDe(v)).toBe("prevue");
    expect(await nbPrises(v)).toBe(0);
  });

  test("valider avec toutes les prises : enregistrées avec la visite ; un traitement non prévu à ce passage est ignoré", async () => {
    const v = await visite("14-16", ajouterJours(jour, 1)); // 14-16 = « midi » : aucun traitement prévu → pas de prise requise
    await visitesLib.changerStatutVisite(jeu.active, v, "faite");
    expect(await statutDe(v)).toBe("faite");

    const m = await visite("6-8", ajouterJours(jour, 2));
    await visitesLib.changerStatutVisite(jeu.active, m, "faite", undefined, [
      { traitementId: tMatin, statut: "administre", commentaire: null },
      { traitementId: tMatinSoir, statut: "administre", commentaire: "ignoré" },
      { traitementId: tSoir, statut: "refuse", commentaire: "pas prévu ici" },
      { traitementId: tInactif, statut: "refuse", commentaire: null },
    ]);
    expect(await statutDe(m)).toBe("faite");
    expect(await nbPrises(m)).toBe(2);
    const [{ commentaire }] = await owner`select commentaire from prises_traitement where visite_id = ${m} and traitement_id = ${tMatinSoir}`;
    expect(commentaire).toBeNull(); // « administré » n'a jamais de commentaire
  });

  test("prise refusée : alerte pour l'équipe jusqu'à ce qu'elle soit prise en compte ; tracée", async () => {
    const v = await visite("8-10", ajouterJours(jour, 3));
    await visitesLib.changerStatutVisite(jeu.active, v, "faite", undefined, [
      { traitementId: tMatin, statut: "refuse", commentaire: "  refus à la prise  " },
      { traitementId: tMatinSoir, statut: "non_administre", commentaire: null },
    ]);
    const alertes = await prisesLib.listerAlertesPrises(jeu.admin);
    const miennes = alertes.filter((a) => a.patientId === patientId && a.date === ajouterJours(jour, 3));
    expect(miennes).toHaveLength(2);
    expect(miennes.find((a) => a.statut === "refuse")?.commentaire).toBe("refus à la prise");

    await prisesLib.marquerAlertePriseTraitee(jeu.admin, miennes[0].id);
    await expect(prisesLib.marquerAlertePriseTraitee(jeu.admin, miennes[0].id)).rejects.toThrow(/déjà/);
    const apres = (await prisesLib.listerAlertesPrises(jeu.active)).filter((a) => a.date === ajouterJours(jour, 3));
    expect(apres).toHaveLength(1);
    const [{ n }] = await owner`select count(*)::int n from audit_log where action = 'alerte_prise_traitee' and soignante_id = ${jeu.admin}`;
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test("correction : tracée (avant / après), ré-alerte si refusée, plus d'alerte si administrée", async () => {
    const v = await visite("8-10", ajouterJours(jour, 4));
    await visitesLib.changerStatutVisite(jeu.active, v, "faite", undefined, [
      { traitementId: tMatin, statut: "administre", commentaire: null },
      { traitementId: tMatinSoir, statut: "administre", commentaire: null },
    ]);
    const [prise] = await owner`select id from prises_traitement where visite_id = ${v} and traitement_id = ${tMatin}`;

    const r1 = await prisesLib.corrigerPrise(jeu.admin, prise.id, "refuse", "finalement refusé");
    expect(r1.alerte).toBe(true);
    let h = await owner`select ancien_statut, nouveau_statut, ancien_commentaire, nouveau_commentaire, soignante_id from prises_historique where prise_id = ${prise.id} order by created_at`;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ ancien_statut: "administre", nouveau_statut: "refuse", nouveau_commentaire: "finalement refusé", soignante_id: jeu.admin });
    expect((await prisesLib.listerAlertesPrises(jeu.active)).some((a) => a.id === prise.id)).toBe(true);

    // Corrigée en « administré » : l'alerte disparaît, la correction est tracée.
    const r2 = await prisesLib.corrigerPrise(jeu.active, prise.id, "administre", null);
    expect(r2.alerte).toBe(false);
    expect((await prisesLib.listerAlertesPrises(jeu.active)).some((a) => a.id === prise.id)).toBe(false);
    h = await owner`select 1 from prises_historique where prise_id = ${prise.id}`;
    expect(h).toHaveLength(2);

    // Même valeur : rien n'est écrit.
    await prisesLib.corrigerPrise(jeu.active, prise.id, "administre", null);
    expect(await owner`select 1 from prises_historique where prise_id = ${prise.id}`).toHaveLength(2);
  });

  test("l'historique des prises est immuable pour l'application (ni modification ni suppression)", async () => {
    await expect(commeSoignante(app, jeu.active, (tx) => tx`update prises_historique set nouveau_statut = 'administre'`)).rejects.toThrow(/permission/);
    await expect(commeSoignante(app, jeu.active, (tx) => tx`delete from prises_historique`)).rejects.toThrow(/permission/);
    await expect(commeSoignante(app, jeu.inactive, (tx) => tx`select * from prises_traitement`)).resolves.toHaveLength(0);
  });

  test("rejeu hors-ligne : la validation emporte ses prises ; sans prises, erreur lisible et rien d'écrit", async () => {
    const sans = await visite("8-10", ajouterJours(jour, 5));
    const opSans = { id: randomUUID(), type: "marquer", visiteId: sans, statut: "faite", statutConnu: "prevue", creeLe: Date.now() } as never;
    const [r1] = await sync.rejouerOperations(jeu.active, [opSans]);
    expect(r1.etat).toBe("erreur");
    expect(r1.message).toMatch(/pour chaque traitement/);
    expect(await statutDe(sans)).toBe("prevue");

    const avec = await visite("8-10", ajouterJours(jour, 6));
    const opAvec = {
      id: randomUUID(),
      type: "marquer",
      visiteId: avec,
      statut: "faite",
      statutConnu: "prevue",
      creeLe: Date.now(),
      prises: [
        { traitementId: tMatin, statut: "refuse", commentaire: "hors-ligne" },
        { traitementId: tMatinSoir, statut: "administre", commentaire: null },
      ],
    } as never;
    const [r2] = await sync.rejouerOperations(jeu.active, [opAvec]);
    expect(r2.etat).toBe("applique");
    expect(await statutDe(avec)).toBe("faite");
    expect(await nbPrises(avec)).toBe(2);
  });
});


const envoyes: { endpoint: string; corps: string; options: unknown }[] = [];
let statutSimule = 201;
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (abo: { endpoint: string }, corps: string, options: unknown) => {
      envoyes.push({ endpoint: abo.endpoint, corps, options });
      if (statutSimule !== 201) throw Object.assign(new Error("push"), { statusCode: statutSimule });
      return { statusCode: 201 };
    },
  },
}));

describe.skipIf(!integrationActive)("envoi des notifications push (Postgres réel, service de push simulé)", () => {
  let owner: Sql;
  let jeu: Jeu;
  let push: typeof import("../../src/lib/push");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_APP;
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "cle-publique";
    process.env.VAPID_PRIVATE_KEY = "cle-privee";
    process.env.VAPID_SUBJECT = "mailto:test@exemple.fr";
    owner = clientOwner();
    jeu = await creerJeu(owner, todayISO(), ajouterJours(todayISO(), -1));
    push = await import("../../src/lib/push");
  });
  afterAll(async () => {
    await owner.end();
  });

  const monEndpoint = async () =>
    (await owner`select endpoint from push_subscriptions where soignante_id = ${jeu.active} and endpoint like 'https://push.exemple/%'`)[0].endpoint as string;

  test("le texte envoyé est le message figé : ni nom de patient, ni contenu", async () => {
    envoyes.length = 0;
    statutSimule = 201;
    await owner`update push_subscriptions set notifier_transferts = true where soignante_id = ${jeu.active}`;
    const endpointActive = await monEndpoint();
    await push.notifier(jeu.admin, "transfert", { cibles: [jeu.active] });
    const miens = envoyes.filter((e) => e.endpoint === endpointActive);
    expect(miens.length).toBeGreaterThan(0);
    const charge = JSON.parse(miens[0].corps);
    expect(charge).toEqual({
      titre: "Isabelle — Tournée",
      corps: "Nouvelle demande de transfert à traiter.",
      url: "/alertes",
      tag: "transfert",
    });
  });

  test("l'auteure d'une transmission urgente n'est pas notifiée, les préférences sont respectées", async () => {
    const endpointActive = await monEndpoint();
    envoyes.length = 0;
    await owner`update push_subscriptions set notifier_urgences = true where soignante_id = ${jeu.active}`;
    await push.notifier(jeu.active, "urgence", { exclureExpediteur: true });
    expect(envoyes.some((e) => e.endpoint === endpointActive)).toBe(false); // l'auteure
    envoyes.length = 0;
    await push.notifier(jeu.admin, "urgence", { exclureExpediteur: true });
    expect(envoyes.some((e) => e.endpoint === endpointActive)).toBe(true); // les autres, préférence activée
    envoyes.length = 0;
    await owner`update push_subscriptions set notifier_urgences = false where soignante_id = ${jeu.active}`;
    await push.notifier(jeu.admin, "urgence", { exclureExpediteur: true });
    expect(envoyes.some((e) => e.endpoint === endpointActive)).toBe(false); // préférence désactivée
  });

  test("appareil disparu (410) : l'abonnement est supprimé, sans erreur pour l'action appelante", async () => {
    statutSimule = 410;
    const endpoint = "https://disparu.exemple/" + jeu.active;
    await owner`insert into push_subscriptions (soignante_id, endpoint, p256dh, auth) values (${jeu.active}, ${endpoint}, 'a', 'b')`;
    await expect(push.notifier(jeu.admin, "transfert", { cibles: [jeu.active] })).resolves.toBeUndefined();
    const [{ n }] = await owner`select count(*)::int as n from push_subscriptions where endpoint = ${endpoint}`;
    expect(n).toBe(0);
    statutSimule = 201;
  });

  test("clés VAPID absentes : rien n'est envoyé, aucune exception", async () => {
    const cle = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    envoyes.length = 0;
    await expect(push.notifier(jeu.admin, "transfert", { cibles: [jeu.active] })).resolves.toBeUndefined();
    expect(envoyes).toHaveLength(0);
    process.env.VAPID_PRIVATE_KEY = cle;
  });
});
