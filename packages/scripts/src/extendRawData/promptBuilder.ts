// Prompt builder for OpenAI API calls

import type { Place } from '@realmap/shared';
import type { ClusterContext, NormalizationRules } from './types';

interface PromptData {
  /** Source label for the prompt (e.g. filename "data.england.json"). */
  sourceLabel: string;
  cities: Place[];
  clusterContext: Record<number, ClusterContext>;
  canonicalIngredients: string[];
  canonicalMethods: string[];
  requiredIngredientKeys?: string[];
  requiredMethodKeys?: string[];
  normalizationRules: NormalizationRules;
}

const SYSTEM_PROMPT = `
You are a culinary data normalizer. Your ONLY job is to normalize and map messy inputs into the provided canonical schema. You do not add "typical dishes," use country/region stereotypes, fill missing data from vibes, or learn from cluster labels.

ALLOWED:
- Map raw ingredient/method names to the exact canonical keys provided (normalization rules apply).
- Fill or correct values only when clearly supported by the input data for that city.
- Optionally propose new canonical keys in "proposedNewKeys" only when there is overwhelming evidence the schema is missing a universal primitive needed to capture real variance (proposals are for human review and are NEVER applied automatically).

FORBIDDEN:
- Do NOT add ingredients or methods not present in the input or not mappable to a canonical key (use proposedNewKeys for candidates instead).
- Do NOT infer city cuisine from country or region.
- Do NOT use cluster IDs or cluster context to invent or adjust values.
- Do NOT add country- or region-stereotypical dishes or values.

CORE RULES:

1. **CANONICAL KEYS ONLY (in city data)**:
   - Use ONLY the exact keys from the provided lists (case-sensitive, underscore-separated).
   - Map variants to canonical keys using the normalization rules (plural→singular, diacritics removed, spaces→underscores, lowercase).
   - If the schema clearly lacks a key that would capture important variance, add a proposal in proposedNewKeys with key, reason, confidence (0-1), and optional mapTo (suggested canonical mappings).

2. **GLOBAL CONSISTENCY SCALE** (0.0–1.0):
   - 0.0 = never used; 0.25 = rarely; 0.5 = moderate; 0.75 = common; 1.0 = ubiquitous.
   - Be discriminative: avoid flat vectors (many values near 0.5). Values < 0.05 are dropped; max 35 ingredient keys and 12 method keys per city; max 60 total keys per city.

3. **FAMOUS DISHES**:
   - 1–5 dishes per city when supported by input; fewer or empty if uncertain. No invented or country-stereotypical dishes.

4. **BIAS PREVENTION**:
   - No country/region stereotypes. No filling gaps from "typical cuisine." Normalize only from the given city data and canonical schema.
   - Ex: You can not say they all eat kebap in Turkey. Every city has historical non-biased rich cousines.
   - Ex: In Izmir there is a lot of olive oil and wine production similar to Greece and Italy. Do not ignore these facts.
   - You are trying to create a unique never done before cultural map with local food data.
`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildFilePrompt(data: PromptData): string {
  const {
    sourceLabel,
    cities,
    clusterContext,
    canonicalIngredients,
    canonicalMethods,
    requiredIngredientKeys,
    requiredMethodKeys,
    normalizationRules,
  } = data;

  // Build cluster context summary
  const clusterSummary = Object.entries(clusterContext).map(
    ([clusterId, ctx]) => ({
      clusterId: Number(clusterId),
      topIngredients: ctx.topIngredients.slice(0, 5),
      topMethods: ctx.topMethods.slice(0, 5),
      cityCount: ctx.cities.length,
    }),
  );

  return `
Analyze and extend culinary data for the following places (source: ${sourceLabel}).

EXISTING DATA (for reference, may be incomplete):
${JSON.stringify(
  cities.map((c) => ({
    id: c.id,
    name: c.name,
    ...(c.clusterId != null && { clusterId: c.clusterId }),
    currentIngredients: c.ingredients || {},
    currentMethods: c.cookingMethods || {},
  })),
  null,
  2,
)}

CLUSTER CONTEXT (for consistency guidance):
${JSON.stringify(clusterSummary, null, 2)}

CANONICAL INGREDIENTS (use ONLY these keys):
${JSON.stringify(canonicalIngredients, null, 2)}

CANONICAL COOKING METHODS (use ONLY these keys):
${JSON.stringify(canonicalMethods, null, 2)}

NORMALIZATION RULES:
${JSON.stringify(normalizationRules, null, 2)}
${
  requiredIngredientKeys?.length || requiredMethodKeys?.length
    ? `
REQUIRED KEYS (every city MUST include these keys with a number 0–1; use 0 if not applicable):
${[
  requiredIngredientKeys?.length &&
    `ingredients: ${JSON.stringify(requiredIngredientKeys)}`,
  requiredMethodKeys?.length &&
    `cookingMethods: ${JSON.stringify(requiredMethodKeys)}`,
]
  .filter(Boolean)
  .join('\n')}
`
    : ''
}

TASK:
Normalize each city's ingredient and cooking method data into ONLY canonical keys. Fill or correct only where supported by the input. Do not infer from country or cluster.

OUTPUT FORMAT (JSON):
{
  "cities": [
    {
      "id": "existing-id-or-new-id",
      "name": "City Name",
      "ingredients": {
        "canonical_key": 0.0 to 1.0
      },
      "cookingMethods": {
        "canonical_key": 0.0 to 1.0
      },
      "famousDishes": ["Dish 1", "Dish 2"],
      "extendedAt": "ISO8601 date string e.g. 2026-02-17T00:00:00Z"
    }
  ],
  "newCities": [],
  "proposedNewKeys": {
    "ingredients": [
      { "key": "suggested_snake_case_key", "mapTo": ["existing_canonical_option"], "reason": "Brief rationale", "confidence": 0.9 }
    ],
    "cookingMethods": [
      { "key": "suggested_key", "mapTo": [], "reason": "Brief rationale", "confidence": 0.8 }
    ]
  }
}

RULES:
- In "cities", use ONLY canonical keys from the lists provided. Values 0.0–1.0. Omit keys with value 0. Values < 0.05 are dropped later; keep sparse and discriminative (max 35 ingredient keys, 12 method keys, 60 total per city).
- "proposedNewKeys" is optional. Use only when the schema clearly lacks a key needed to capture real variance. Proposals are for human review and are never applied automatically.
- famousDishes: 1–5 only when supported by input; no invented or country-stereotypical dishes.
- Do not use cluster context or region to invent or adjust values.
`;
}
