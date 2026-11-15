import { DEFAULT_NEEDS, type CustomCategory, type KeywordRule, type Targets } from "./categories.ts";

/** Tout ce qui se règle dans l'onglet Réglages (stocké dans ff_settings.data). */
export type Settings = {
  // Profil bancaire
  ownerNames: string[];
  salaryKeywords: string[];
  partnerName: string;
  // Salaire versé fin de mois pour le mois suivant : à partir de ce jour, il compte pour le mois d'après (0 = désactivé)
  salaryShiftDay: number;
  // Tri
  keywordRules: KeywordRule[];
  // Catégories
  customCategories: CustomCategory[];
  colors: Record<string, string>;
  hidden: string[];
  needs: string[];
  // Repères
  targets: Targets;
  // Affichage
  theme: "auto" | "light" | "dark";
  privacy: boolean;
  cents: boolean;
  coach: boolean;
  startTab: "synthese" | "operations" | "budgets" | "analyse" | "commune";
  // Compte joint : « commune » = seuls tes versements comptent (Vie commune) ; « part » = ta part de chaque opération
  jointMode: "commune" | "part";
};

export const DEFAULT_SETTINGS: Settings = {
  ownerNames: [],
  salaryKeywords: [],
  partnerName: "",
  salaryShiftDay: 20,
  keywordRules: [],
  customCategories: [],
  colors: {},
  hidden: [],
  needs: DEFAULT_NEEDS,
  targets: { savings: 0.2, needs: 0.5, wants: 0.3 },
  theme: "light",
  privacy: false,
  cents: true,
  coach: true,
  startTab: "synthese",
  jointMode: "commune",
};

/** Complète des réglages partiels (anciens enregistrements) avec les valeurs par défaut. */
export function withDefaults(data: Partial<Settings> | null | undefined): Settings {
  const d = data ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...d,
    targets: { ...DEFAULT_SETTINGS.targets, ...(d.targets ?? {}) },
    colors: { ...(d.colors ?? {}) },
  };
}
