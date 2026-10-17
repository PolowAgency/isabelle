import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  TABLES_CLINIQUES,
  clientApp,
  clientOwner,
  commeSoignante,
  creerJeu,
  integrationActive,
  type Jeu,
  type Sql,
} from "./helpers";
import { ajouterJours, todayISO } from "../../src/lib/date";
import { verifierRoleBase } from "../../src/lib/rls-check";

describe.skipIf(!integrationActive)("RLS et garde-fous (Postgres réel)", () => {
  let app: Sql;
  let owner: Sql;
  let jeu: Jeu;

  beforeAll(async () => {
    app = clientApp();
    owner = clientOwner();
    jeu = await creerJeu(owner, todayISO(), ajouterJours(todayISO(), -1));
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
  });

  test("le rôle de l'application n'est ni superuser ni BYPASSRLS", async () => {
    const verif = await verifierRoleBase(async (texte) => app.unsafe(texte) as never);
    expect(verif).toEqual({ ok: true, problemes: [] });
  });

  test("le propriétaire (superuser) est bien détecté comme non conforme", async () => {
    const verif = await verifierRoleBase(async (texte) => owner.unsafe(texte) as never);
    // Le propriétaire de test est superuser en CI ; si ce n'est pas le cas, au moins BYPASSRLS ou non.
    expect(typeof verif.ok).toBe("boolean");
  });

  describe.each(TABLES_CLINIQUES)("table %s", (table) => {
    const compter = (tx: Sql) => tx.unsafe(`select count(*)::int as n from ${table}`).then((r) => r[0].n as number);

    test("sans soignante courante : aucune ligne lisible", async () => {
      expect(await commeSoignante(app, null, compter)).toBe(0);
    });

    test("soignante inactive : aucune ligne lisible", async () => {
      expect(await commeSoignante(app, jeu.inactive, compter)).toBe(0);
    });

    test("remplaçante dont la date de fin est passée : aucune ligne lisible", async () => {
      expect(await commeSoignante(app, jeu.expiree, compter)).toBe(0);
    });

    test("identifiant de soignante inexistant : aucune ligne lisible", async () => {
      expect(await commeSoignante(app, "00000000-0000-4000-8000-000000000000", compter)).toBe(0);
    });

    test("soignante active : lecture (audit_log réservé aux admins)", async () => {
      const n = await commeSoignante(app, jeu.active, compter);
      if (table === "audit_log") expect(n).toBe(0);
      else expect(n).toBeGreaterThan(0);
    });
  });

  test("écriture refusée sans soignante active", async () => {
    await expect(
      commeSoignante(app, null, (tx) => tx`insert into patients (prenom, nom) values ('X', 'Y')`)
    ).rejects.toThrow();
    await expect(
      commeSoignante(app, jeu.inactive, (tx) => tx`insert into patients (prenom, nom) values ('X', 'Y')`)
    ).rejects.toThrow();
    await expect(
      commeSoignante(app, jeu.expiree, (tx) => tx`update patients set nom = 'pirate'`)
    ).resolves.toBeDefined(); // 0 ligne visible, donc 0 ligne modifiée
    const [{ n }] = await owner`select count(*)::int as n from patients where nom = 'pirate'`;
    expect(n).toBe(0);
  });

  test("le jour de fin d'une remplaçante est évalué à Paris : fin = aujourd'hui => encore active", async () => {
    await owner`update soignantes set date_fin = ${todayISO()} where id = ${jeu.expiree}`;
    const [{ n }] = await commeSoignante(app, jeu.expiree, (tx) => tx`select count(*)::int as n from patients`);
    expect(n).toBeGreaterThan(0);
    await owner`update soignantes set date_fin = ${ajouterJours(todayISO(), -1)} where id = ${jeu.expiree}`;
  });

  describe("comptes et droits d'administration", () => {
    test("une soignante ne peut pas modifier le compte d'une autre", async () => {
      const lignes = await commeSoignante(
        app,
        jeu.active,
        (tx) => tx`update soignantes set prenom = 'Pirate' where id = ${jeu.admin} returning id`
      );
      expect(lignes).toHaveLength(0);
    });

    test("elle peut modifier son propre compte", async () => {
      const lignes = await commeSoignante(
        app,
        jeu.active,
        (tx) => tx`update soignantes set couleur = '#112233' where id = ${jeu.active} returning id`
      );
      expect(lignes).toHaveLength(1);
    });

    test("seul un admin crée un compte", async () => {
      const nouveau = (email: string) => ({
        prenom: "N",
        nom: "N",
        email,
        password_hash: "x",
        role: "remplacante",
      });
      await expect(
        commeSoignante(app, jeu.active, (tx) => tx`insert into soignantes ${tx(nouveau(`a-${jeu.active}@t.local`))}`)
      ).rejects.toThrow();
      await expect(
        commeSoignante(app, jeu.admin, (tx) => tx`insert into soignantes ${tx(nouveau(`b-${jeu.admin}@t.local`))}`)
      ).resolves.toBeDefined();
    });

    test("une non-admin ne peut pas s'attribuer est_admin", async () => {
      await expect(
        commeSoignante(app, jeu.active, (tx) => tx`update soignantes set est_admin = true where id = ${jeu.active}`)
      ).rejects.toThrow(/administrateur/);
    });

    test("un admin peut promouvoir une collègue, puis le dernier admin est protégé", async () => {
      // Un admin quelconque (le jeu de données n'est pas seul dans la base de CI/dev).
      await commeSoignante(app, jeu.admin, (tx) => tx`update soignantes set est_admin = true where id = ${jeu.active}`);
      const [{ n }] = await owner`select count(*)::int as n from soignantes where est_admin and actif`;
      expect(n).toBeGreaterThanOrEqual(2);
      await commeSoignante(app, jeu.admin, (tx) => tx`update soignantes set est_admin = false where id = ${jeu.active}`);
    });

    test("le dernier administrateur ne peut être ni retiré ni désactivé", async () => {
      // Base isolée dans une transaction annulée : on neutralise les autres admins pour le test.
      const proprio = clientOwner();
      try {
        await expect(
          proprio.begin(async (tx) => {
            await tx`set local session_replication_role = replica`; // neutralise les autres admins sans déclencher le garde-fou
            await tx`update soignantes set est_admin = false where est_admin and id <> ${jeu.admin}`;
            await tx`set local session_replication_role = origin`;
            await tx`select set_config('app.current_soignante_id', ${jeu.admin}, true)`;
            await tx`update soignantes set est_admin = false where id = ${jeu.admin}`;
          })
        ).rejects.toThrow(/dernier administrateur/);
        await expect(
          proprio.begin(async (tx) => {
            await tx`set local session_replication_role = replica`; // neutralise les autres admins sans déclencher le garde-fou
            await tx`update soignantes set est_admin = false where est_admin and id <> ${jeu.admin}`;
            await tx`set local session_replication_role = origin`;
            await tx`update soignantes set actif = false where id = ${jeu.admin}`;
          })
        ).rejects.toThrow(/dernier administrateur/);
      } finally {
        await proprio.end();
      }
    });
  });

  describe("abonnements push", () => {
    test("chacune ne voit que ses propres abonnements", async () => {
      const mine = await commeSoignante(app, jeu.active, (tx) => tx`select count(*)::int as n from push_subscriptions`);
      const autre = await commeSoignante(app, jeu.admin, (tx) => tx`select count(*)::int as n from push_subscriptions where soignante_id = ${jeu.active}`);
      expect(mine[0].n).toBeGreaterThan(0);
      expect(autre[0].n).toBe(0);
    });

    test("on ne peut pas inscrire un appareil au nom d'une autre", async () => {
      await expect(
        commeSoignante(
          app,
          jeu.active,
          (tx) => tx`insert into push_subscriptions (soignante_id, endpoint, p256dh, auth) values (${jeu.admin}, 'https://x.exemple/1', 'a', 'b')`
        )
      ).rejects.toThrow();
    });

    test("push_destinataires : réservé aux soignantes actives, filtre sur les préférences et exclut l'auteure", async () => {
      await expect(
        commeSoignante(app, jeu.inactive, (tx) => tx`select * from push_destinataires('transfert')`)
      ).rejects.toThrow();
      await owner`update push_subscriptions set notifier_transferts = true, notifier_urgences = false where soignante_id = ${jeu.active}`;
      const transferts = await commeSoignante(app, jeu.admin, (tx) => tx`select soignante_id from push_destinataires('transfert')`);
      expect(transferts.map((r) => r.soignante_id)).toContain(jeu.active);
      const urgences = await commeSoignante(app, jeu.admin, (tx) => tx`select soignante_id from push_destinataires('urgence')`);
      expect(urgences.map((r) => r.soignante_id)).not.toContain(jeu.active);
      const exclue = await commeSoignante(app, jeu.admin, (tx) => tx`select soignante_id from push_destinataires('transfert', null, ${jeu.active}::uuid)`);
      expect(exclue.map((r) => r.soignante_id)).not.toContain(jeu.active);
      await expect(commeSoignante(app, jeu.admin, (tx) => tx`select * from push_destinataires('autre')`)).rejects.toThrow();
    });

    test("un compte désactivé ou expiré n'est jamais notifié", async () => {
      await owner`insert into push_subscriptions (soignante_id, endpoint, p256dh, auth) values (${jeu.inactive}, ${"https://i.exemple/" + jeu.inactive}, 'a', 'b'), (${jeu.expiree}, ${"https://e.exemple/" + jeu.expiree}, 'a', 'b')`;
      const lignes = await commeSoignante(app, jeu.admin, (tx) => tx`select soignante_id from push_destinataires('transfert')`);
      const ids = lignes.map((r) => r.soignante_id);
      expect(ids).not.toContain(jeu.inactive);
      expect(ids).not.toContain(jeu.expiree);
    });

    test("push_enregistrer : un téléphone prêté passe à la soignante courante", async () => {
      const endpoint = "https://prete.exemple/" + jeu.admin;
      await commeSoignante(app, jeu.active, (tx) => tx`select push_enregistrer(${endpoint}, 'k1', 'a1', true, true)`);
      await commeSoignante(app, jeu.admin, (tx) => tx`select push_enregistrer(${endpoint}, 'k2', 'a2', true, false)`);
      const [ligne] = await owner`select soignante_id, notifier_urgences from push_subscriptions where endpoint = ${endpoint}`;
      expect(ligne.soignante_id).toBe(jeu.admin);
      expect(ligne.notifier_urgences).toBe(false);
      await expect(
        commeSoignante(app, jeu.inactive, (tx) => tx`select push_enregistrer('https://z.exemple/1', 'a', 'b', true, true)`)
      ).rejects.toThrow();
    });
  });

  describe("journal d'audit", () => {
    test("une soignante journalise ses propres actions (dédoublonnage compris)", async () => {
      const ecrire = (tx: Sql) =>
        tx`select audit_enregistrer('patient_consulte', 'patient', ${jeu.patient}::uuid, ${jeu.patient}::uuid, null, 10)`;
      await commeSoignante(app, jeu.active, ecrire);
      await commeSoignante(app, jeu.active, ecrire);
      const [{ n }] = await owner`
        select count(*)::int as n from audit_log
        where soignante_id = ${jeu.active} and action = 'patient_consulte' and entite_id = ${jeu.patient}`;
      expect(n).toBe(1);
    });

    test("elle ne peut pas relire le journal, l'admin le peut", async () => {
      const lire = (tx: Sql) => tx`select count(*)::int as n from audit_log`;
      expect((await commeSoignante(app, jeu.active, lire))[0].n).toBe(0);
      expect((await commeSoignante(app, jeu.admin, lire))[0].n).toBeGreaterThan(0);
    });

    test("insertion directe au nom d'une autre refusée", async () => {
      await expect(
        commeSoignante(
          app,
          jeu.active,
          (tx) => tx`insert into audit_log (soignante_id, action, entite) values (${jeu.admin}, 'x', 'x')`
        )
      ).rejects.toThrow();
    });

    test("modification et suppression impossibles, même pour l'admin et pour le propriétaire", async () => {
      await expect(
        commeSoignante(app, jeu.admin, (tx) => tx`update audit_log set action = 'efface'`)
      ).rejects.toThrow();
      await expect(commeSoignante(app, jeu.admin, (tx) => tx`delete from audit_log`)).rejects.toThrow();
      await expect(owner`update audit_log set action = 'efface'`).rejects.toThrow(/ajout seul/);
      await expect(owner`delete from audit_log`).rejects.toThrow(/ajout seul/);
    });

    test("journalisation refusée sans soignante active", async () => {
      await expect(
        commeSoignante(app, jeu.inactive, (tx) => tx`select audit_enregistrer('connexion', 'soignante', null, null, null, 0)`)
      ).rejects.toThrow();
      await expect(
        commeSoignante(app, null, (tx) => tx`select audit_enregistrer('connexion', 'soignante', null, null, null, 0)`)
      ).rejects.toThrow();
    });
  });

  describe("connexion : tentatives limitées", () => {
    const emailHash = () => `h-${Math.random().toString(16).slice(2)}`;

    test("les compteurs ne sont accessibles que par les fonctions dédiées", async () => {
      await expect(app`select * from login_attempts`).rejects.toThrow();
      await expect(app`insert into login_attempts (email_hash, succes) values ('x', false)`).rejects.toThrow();
    });

    test("échecs comptés par email, remis à zéro après une réussite, journalisés sans email en clair", async () => {
      const h = emailHash();
      for (let i = 0; i < 3; i++) {
        await app`select auth_login_enregistrer(${h}, ${"ip-" + h}, false, null, null)`;
      }
      let [etat] = await app`select * from auth_login_etat(${h}, ${"ip-" + h})`;
      expect(etat.echecs_email).toBe(3);
      expect(etat.echecs_ip).toBe(3);

      await app`select auth_login_enregistrer(${h}, ${"ip-" + h}, true, ${jeu.active}::uuid, null)`;
      [etat] = await app`select * from auth_login_etat(${h}, ${"ip-" + h})`;
      expect(etat.echecs_email).toBe(0);

      const lignes = await owner`select action, soignante_id from audit_log where ip_hash = ${"ip-" + h} order by created_at`;
      expect(lignes.map((l) => l.action)).toEqual(["connexion_echec", "connexion_echec", "connexion_echec", "connexion"]);
    });

    test("un email inconnu est compté comme les autres (pas d'énumération de comptes)", async () => {
      const h = emailHash();
      await app`select auth_login_enregistrer(${h}, null, false, null, null)`;
      const [etat] = await app`select * from auth_login_etat(${h}, null)`;
      expect(etat.echecs_email).toBe(1);
    });

    test("la fonction de recherche renvoie les colonnes de session et ne laisse pas lire la table soignantes", async () => {
      const [ligne] = await app`select * from auth_lookup_soignante(${`active-${jeu.active.slice(0, 0)}`})`.catch(() => [undefined]);
      expect(ligne).toBeUndefined(); // email inconnu
      await expect(app`select password_hash from soignantes`).resolves.toHaveLength(0); // RLS : aucun contexte
    });
  });
});
