export const EXPENSE_CATEGORIES = [
  "Logement & charges",
  "Courses",
  "Restos & sorties",
  "Voiture – financement",
  "Carburant & péages",
  "Entretien véhicule",
  "Assurances",
  "Abonnements & téléphone",
  "Sport & compétitions",
  "Matos musique / photo",
  "Santé",
  "Shopping & vêtements",
  "Loisirs & jeux",
  "Voyages",
  "Cadeaux",
  "Divers",
] as const;

export const INCOME_CATEGORIES = ["Salaire", "Prestas SBSAX / photo", "Remboursements", "Autres revenus"] as const;

export const SAVINGS = "Épargne & placements";
export const INTERNAL = "Virement interne";

export const ALL_CATEGORIES: string[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, SAVINGS, INTERNAL];

export const isExpense = (c: string) => (EXPENSE_CATEGORIES as readonly string[]).includes(c);
export const isIncome = (c: string) => (INCOME_CATEGORIES as readonly string[]).includes(c);

/** Pastilles pastel par catégorie (le texte reste en encre, la couleur ne porte jamais seule l'information). */
export const CATEGORY_COLORS: Record<string, string> = {
  "Logement & charges": "#E3A869",
  Courses: "#D6BE4F",
  "Restos & sorties": "#E58FA8",
  "Voiture – financement": "#7FA3E0",
  "Carburant & péages": "#8DB8E8",
  "Entretien véhicule": "#6F8FD1",
  Assurances: "#6CC3B5",
  "Abonnements & téléphone": "#A99BE3",
  "Sport & compétitions": "#EE8E7E",
  "Matos musique / photo": "#C49BE0",
  Santé: "#7CCFC0",
  "Shopping & vêtements": "#E99AC7",
  "Loisirs & jeux": "#F2B07E",
  Voyages: "#79C2D9",
  Cadeaux: "#E6CF7A",
  Divers: "#B9BCC4",
  Salaire: "#7CC59A",
  "Prestas SBSAX / photo": "#9AD3A8",
  Remboursements: "#B6DDB0",
  "Autres revenus": "#8CC9A0",
  [SAVINGS]: "#7FBFB3",
  [INTERNAL]: "#C9CCD3",
};

/** Fond très léger dérivé de la pastille. */
export const tint = (c: string) => `color-mix(in srgb, ${CATEGORY_COLORS[c] ?? "#C9CCD3"} 18%, white)`;

/**
 * Mots-clés testés dans l'ordre sur le libellé normalisé (majuscules, sans accents, tirets → espaces).
 * Pour Virement interne et Épargne, seul le libellé principal est testé (pas les lignes de détail).
 */
/**
 * Mots-clés personnels, hors du code (le dépôt peut être public) :
 *   NEXT_PUBLIC_OWNER_NAMES="PRENOM NOM,NOM PRENOM"  → virements à ton nom = virements internes
 *   NEXT_PUBLIC_SALARY_KEYWORDS="NOM EMPLOYEUR"       → rentrées classées en Salaire
 */
const fromEnv = (v: string | undefined) =>
  (v ?? "").split(",").map((x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()).filter(Boolean);
const OWNER_NAMES = fromEnv(process.env.NEXT_PUBLIC_OWNER_NAMES);
/** Chaque nom du titulaire découpé en mots : « VIREMENT A : X & PRENOM 2E-PRENOM NOM » contient PRENOM et NOM. */
export const OWNER_TOKENS: string[][] = OWNER_NAMES.map((n) => n.split(/\s+/).filter((w) => w.length > 1));
const SALARY_KEYWORDS = fromEnv(process.env.NEXT_PUBLIC_SALARY_KEYWORDS);

const INTERNAL_KEYWORDS = [
  "VIREMENT INTERNE", "VIR INTERNE", "COMPTE A COMPTE",
  "VIR DE COMPTE", "VIR VERS COMPTE", "VERS COMPTE", "DE COMPTE", "COMPTE CHEQUE", "COMPTE COURANT", "REVOLUT",
  "TOP UP", "EXCHANGED TO", "RECHARGE",
];
const SAVINGS_KEYWORDS = [
  "VERS LIVRET", "DE LIVRET", "LIVRET A", "LDDS", "LEP ", "PEL ", "CEL ", "EPARGNE",
  "ALLIANZ VIE", "ALLIANZ RETRAITE", "ARCALIS", "TRADE REPUBLIC", "BOURSORAMA",
  "COMPTE D INVESTISSEMENT", "INVESTISSEMENT", "ROBO PORTFOLIO", "INVESTMENT", "SAVINGS", "VAULT",
];

export const EXPENSE_RULES: [string, string[]][] = [
  [INTERNAL, INTERNAL_KEYWORDS],
  [SAVINGS, SAVINGS_KEYWORDS],
  ["Carburant & péages", ["CARBU", "SHELL", "TOTALENERGIES STATION", "TOTAL ACCESS", "ESSO", "AVIA", "EASYPARK", "PARKING", "PEAGE", "SANEF", "APRR", "VINCI AUTOROUTE", "INDIGO", "Q PARK", "DATS 24", "Q8"]],
  ["Courses", ["AUCHAN", "LIDL", "CARREFOUR", "LECLERC", "MATCH", "INTERMARCHE", "ALDI", "MARIE BLACHERE", "BOULANG", "FRANPRIX", "MONOPRIX", "PICARD", "GRAND FRAIS", "SUPER U", "HYPER U", "COLRUYT", "DELHAIZE", "NETTO", "CORA"]],
  ["Restos & sorties", ["MCDO", "MC DO", "MCDONALD", "BURGER KING", "OTACOS", "O TACOS", "PIZZ", "KFC", "SUBWAY", "RESTAU", "RESTO", "FRITERIE", "MAXICOFFEE", "BRASSERIE", "L ENVERS", "UBER EATS", "UBER *EATS", "DELIVEROO", "RELAIS", "CHTITE", "SUSHI", "KEBAB", "BURGER", "CAFE", "BAR ", "STARBUCKS", "QUICK", "FIVE GUYS", "TACOS"]],
  ["Abonnements & téléphone", ["SPOTIFY", "NETFLIX", "CANAL", "APPLE.COM", "APPLE COM", "BOUYGUES", "ORANGE", "SFR", "FREE MOBILE", "FREE TELECOM", "AMAZON PRIME", "PRIME FR", "ANTHROPIC", "CLAUDE.AI", "ADOBE", "TOMPLAY", "DISNEY", "DEEZER", "YOUTUBE", "GOOGLE ONE", "GOOGLE STORAGE", "CHATGPT", "OPENAI", "MICROSOFT", "ICLOUD", "DROPBOX", "PS PLUS", "PLAYSTATION PLUS", "STRAVA", "ZWIFT"]],
  ["Sport & compétitions", ["FITNESS", "BASIC FIT", "DECATHLON", "GARMIN", "SPORTSFITALITY", "HYROX", "INTERSPORT", "GO SPORT", "RUNNING", "ASICS", "NIKE", "ADIDAS", "IRONMAN", "NJUKO", "ATHLE", "TRIATHLON", "MYPROTEIN", "NUTRIMUSCLE", "SPORT"]],
  ["Loisirs & jeux", ["PLAYSTATION", "SONY INTERACTIVE", "STEAM", "NINTENDO", "XBOX", "EA SPORTS", "PECHE", "CINEMA", "PATHE", "KINEPOLIS", "UGC", "FNAC", "BOWLING", "TICKETMASTER"]],
  ["Voyages", ["SNCF", "RYANAIR", "AIRBNB", "BOOKING", "EASYJET", "HOTEL", "TRAINLINE", "FLIXBUS", "BLABLACAR", "TRANSAVIA", "AIR FRANCE", "ITALO", "TRENITALIA", "VOLOTEA"]],
  ["Santé", ["PHARMA", "DR ", "DOCTEUR", "MEDECIN", "KINE", "DENTIST", "OPTIC", "LABORATOIRE", "CLINIQUE", "HOPITAL", "DOCTOLIB"]],
  ["Entretien véhicule", ["MERCEDES", "BMW", "NORAUTO", "FEU VERT", "SPEEDY", "MIDAS", "CONTROLE TECH", "AUTOBACS", "POINT S", "CARGLASS", "LAVAGE", "WASH"]],
  ["Assurances", ["MATMUT", "MAIF", "MACIF", " AXA", "ASSURANCE", "ALLIANZ IARD", "GROUPAMA", "MMA IARD", "MMA ASSUR", "GMF"]],
  ["Voiture – financement", ["AVANCE", "CREDIT AUTO", "BMW FINANCE", "MERCEDES FINANCE", "CETELEM", "COFIDIS", "DIAC", "LOA "]],
  ["Logement & charges", ["LOYER", "EDF", "ENGIE", "TOTALENERGIES ELEC", "VEOLIA", "EAU ", "FONCIA", "NEXITY", "SUEZ", "OHM ENERGIE", "MINT ENERGIE", "TAXE"]],
  ["Matos musique / photo", ["THOMANN", "WOODBRASS", "MUSIC", "CANON", "NIKON", "SONY EUROPE", "PHOTO", "BANDCAMP", "BEATPORT", "SPLICE", "NATIVE INSTRUMENTS", "PLUGIN"]],
  ["Shopping & vêtements", ["AMAZON", "AMZN", "CONFORAMA", "IKEA", "ZARA", "H&M", "H & M", "ZALANDO", "FUVI", "PRIMARK", "ACTION", "KIABI", "CELIO", "JD SPORTS", "SNIPES", "VINTED", "LEROY MERLIN", "CASTORAMA", "BOULANGER", "DARTY", "CDISCOUNT"]],
  ["Cadeaux", ["CADEAU", "NATURE ET DECOUVERTES", "INTERFLORA", "FLEUR"]],
  ["Divers", ["HAIR", "COIFF", "BARBER", "BUREAUTI", "LA POSTE", "TABAC"]],
];

export const INCOME_RULES: [string, string[]][] = [
  [INTERNAL, INTERNAL_KEYWORDS],
  ["Autres revenus", ["INTERETS", "INTEREST"]],
  [SAVINGS, ["DE LIVRET", "LIVRET A", "LDDS", "LEP ", "PEL ", "EPARGNE", "INVESTISSEMENT", "ROBO PORTFOLIO", "SAVINGS", "VAULT"]],
  ["Salaire", [...SALARY_KEYWORDS, "SALAIRE", "PAIE "]],
  ["Remboursements", ["CPAM", "MUTUELLE", "PRESTATIONS SANTE", "REMB", "REFUND", "REMBOURSEMENT", "AMELI"]],
  ["Prestas SBSAX / photo", ["SBSAX", "PRESTATION", "FACTURE", "MARIAGE", "STRIPE", "SUMUP"]],
];
