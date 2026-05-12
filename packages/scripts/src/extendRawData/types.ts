// Types for raw data extension

export interface ExtensionConfig {
  model?: string; // Optional, defaults to env or 'gpt-4-turbo-preview'
  dryRun: boolean;
  /** Raw filename under data/raw (e.g. "data.england.json"). Required. */
  file: string;
  skipExtended: boolean; // Skip if extended output already exists
  /** Places per batch (default 60). Large files are split into batches to avoid token limits. */
  batchSize?: number;
  /** If set, every extended city must include these ingredient keys (0–1). Keeps vectors globally consistent. */
  requiredIngredientKeys?: string[];
  /** If set, every extended city must include these method keys (0–1). Keeps vectors globally consistent. */
  requiredMethodKeys?: string[];
}

export interface ClusterContext {
  clusterId: number;
  topIngredients: Array<{ ingredient: string; avgValue: number }>;
  topMethods: Array<{ method: string; avgValue: number }>;
  cities: string[]; // City names in this cluster
}

export interface ExtendedCity {
  id: string;
  name: string;
  ingredients: Record<string, number>;
  cookingMethods: Record<string, number>;
  famousDishes?: string[]; // Top 1-5 famous dishes
  extendedAt: string;
}

/** Proposal for a new canonical key (never applied automatically; review only). */
export interface ProposedKey {
  key: string;
  mapTo?: string[];
  reason: string;
  confidence: number;
}

export interface ExtensionResponse {
  cities: ExtendedCity[];
  newCities?: Array<{
    id: string;
    name: string;
    countryCode: string;
    region?: string;
    ingredients: Record<string, number>;
    cookingMethods: Record<string, number>;
    famousDishes?: string[];
  }>;
  /** AI may propose new keys to improve clustering variance; pipeline does NOT apply these. */
  proposedNewKeys?: {
    ingredients?: ProposedKey[];
    cookingMethods?: ProposedKey[];
  };
}

export interface ValidationConstraints {
  canonicalIngredients: string[];
  canonicalMethods: string[];
  /** If set, every extended city must include these ingredient keys (value 0–1). Ensures global consistency. */
  requiredIngredientKeys?: string[];
  /** If set, every extended city must include these method keys (value 0–1). Ensures global consistency. */
  requiredMethodKeys?: string[];
  normalizationRules: NormalizationRules;
}

export interface NormalizationRules {
  canonicalizeFunction: string; // Function code as string
  ingredientAliases: Record<string, string>;
  methodAliases: Record<string, string>;
}
