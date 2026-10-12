export type Role = "titulaire" | "remplacante";
export type Tournee = "tournee_1" | "tournee_2";
export type Passage = "matin" | "midi" | "soir";
export type StatutVisite = "a_faire" | "en_cours" | "fait";

export type Soignante = {
  id: string;
  nom: string;
  initiales: string;
  couleur: string;
  role: Role;
  tournee: Tournee;
  remplace_soignante_id: string | null;
  date_debut: string;
  date_fin: string | null;
  actif: boolean;
  is_admin: boolean;
  created_at: string;
};

export type Patient = {
  id: string;
  nom: string;
  age: number | null;
  adresse: string | null;
  telephone: string | null;
  medecin_traitant: string | null;
  contact_famille: string | null;
  secteur: string | null;
  passage_habituel: string | null;
  pathologie_principale: string | null;
  allergies: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientSoignante = {
  patient_id: string;
  soignante_id: string;
};

export type Visite = {
  id: string;
  patient_id: string;
  soignante_id: string;
  date: string;
  passage: Passage;
  numero_passage: 1 | 2 | 3;
  statut: StatutVisite;
  motif: string | null;
  compte_rendu: string | null;
  created_at: string;
  updated_at: string;
};

export type Traitement = {
  id: string;
  patient_id: string;
  nom_medicament: string;
  dosage: string | null;
  matin: boolean;
  midi: boolean;
  soir: boolean;
  remarque: string | null;
  actif: boolean;
  created_at: string;
};

export type Ordonnance = {
  id: string;
  patient_id: string;
  fichier_url: string;
  nom_fichier: string;
  date_ajout: string;
  ajoutee_par: string | null;
  date_validite: string | null;
};

export type PhotoSuivi = {
  id: string;
  patient_id: string;
  fichier_url: string;
  date_prise: string;
  prise_par: string | null;
  note: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      soignantes: {
        Row: Soignante;
        Insert: Partial<Soignante> & { id: string; nom: string; initiales: string; role: Role; tournee: Tournee };
        Update: Partial<Soignante>;
        Relationships: [
          {
            foreignKeyName: "soignantes_remplace_soignante_id_fkey";
            columns: ["remplace_soignante_id"];
            isOneToOne: false;
            referencedRelation: "soignantes";
            referencedColumns: ["id"];
          }
        ];
      };
      patients: {
        Row: Patient;
        Insert: Partial<Patient> & { nom: string };
        Update: Partial<Patient>;
        Relationships: [];
      };
      patients_soignantes: {
        Row: PatientSoignante;
        Insert: PatientSoignante;
        Update: Partial<PatientSoignante>;
        Relationships: [
          {
            foreignKeyName: "patients_soignantes_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patients_soignantes_soignante_id_fkey";
            columns: ["soignante_id"];
            isOneToOne: false;
            referencedRelation: "soignantes";
            referencedColumns: ["id"];
          }
        ];
      };
      visites: {
        Row: Visite;
        Insert: Partial<Visite> & { patient_id: string; soignante_id: string; date: string; passage: Passage; numero_passage: 1 | 2 | 3 };
        Update: Partial<Visite>;
        Relationships: [
          {
            foreignKeyName: "visites_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visites_soignante_id_fkey";
            columns: ["soignante_id"];
            isOneToOne: false;
            referencedRelation: "soignantes";
            referencedColumns: ["id"];
          }
        ];
      };
      traitements: {
        Row: Traitement;
        Insert: Partial<Traitement> & { patient_id: string; nom_medicament: string };
        Update: Partial<Traitement>;
        Relationships: [
          {
            foreignKeyName: "traitements_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          }
        ];
      };
      ordonnances: {
        Row: Ordonnance;
        Insert: Partial<Ordonnance> & { patient_id: string; fichier_url: string; nom_fichier: string };
        Update: Partial<Ordonnance>;
        Relationships: [
          {
            foreignKeyName: "ordonnances_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordonnances_ajoutee_par_fkey";
            columns: ["ajoutee_par"];
            isOneToOne: false;
            referencedRelation: "soignantes";
            referencedColumns: ["id"];
          }
        ];
      };
      photos_suivi: {
        Row: PhotoSuivi;
        Insert: Partial<PhotoSuivi> & { patient_id: string; fichier_url: string };
        Update: Partial<PhotoSuivi>;
        Relationships: [
          {
            foreignKeyName: "photos_suivi_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_suivi_prise_par_fkey";
            columns: ["prise_par"];
            isOneToOne: false;
            referencedRelation: "soignantes";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      deactivate_if_expired: { Args: Record<string, never>; Returns: void };
      is_active_soignante: { Args: Record<string, never>; Returns: boolean };
      is_admin_soignante: { Args: Record<string, never>; Returns: boolean };
    };
  };
};
