// Utility functions for data extension

import type { Place } from '@realmap/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    ClusterContext,
    ExtensionResponse,
    ExtendedCity,
    NormalizationRules,
} from './types';

// Canonicalization function (matches buildClusters)
function canonicalizeFeatureKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}


// Alias maps (matches buildClusters - keep in sync!)
const INGREDIENT_ALIAS: Record<string, string> = {
  saltfish: 'salt_fish',
  sugarcane: 'sugar_cane',
  rosewater: 'rose_water',
  bananas: 'banana',
  chestnuts: 'chestnut',
  peaches: 'peach',
  cucumbers: 'cucumber',
  walnuts: 'walnut',
  tomatoes: 'tomato',
  chickpeas: 'chickpea',
  mussels: 'mussel',
  tropical_fruits: 'tropical_fruit',
  carrots: 'carrot',
  peanuts: 'peanut',
  leeks: 'leek',
  beans: 'bean',
  fruits: 'fruit',
  melons: 'melon',
  groundnuts: 'groundnut',
  eggs: 'egg',
  bamboo_shoots: 'bamboo_shoot',
  sweet_potatoes: 'sweet_potato',
  potatoes: 'potato',
  barberries: 'barberry',
  pistachios: 'pistachio',
  green_bananas: 'green_banana',
  peppers: 'pepper',
  hazelnuts: 'hazelnut',
  lemons: 'lemon',
  cherries: 'cherry',
  plantains: 'plantain',
  lingonberries: 'lingonberry',
  anchovies: 'anchovy',
  limes: 'lime',
  pears: 'pear',
  plums: 'plum',
  apricots: 'apricot',
  grapes: 'grape',
  dates: 'date',
  prunes: 'prune',
  raisins: 'raisin',
  mulberries: 'mulberry',
  blueberries: 'blueberry',
  cranberries: 'cranberry',
  figs: 'fig',
  olives: 'olive',
  onions: 'onion',
  chile: 'chili',
  chilies: 'chili',
  chili_pepers: 'chili_peppers',
};

const METHOD_ALIAS: Record<string, string> = {
  rosting: 'roasting',
  strewing: 'stewing',
};

// Reverse alias: normalized form → schema key (e.g. chickpea → chickpeas).
// Used to normalize AI response keys to match schema file keys before validation.
function buildReverseAlias(alias: Record<string, string>): Record<string, string> {
  const reverse: Record<string, string> = {};
  for (const [k, v] of Object.entries(alias)) {
    if (k !== v) reverse[v] = k;
  }
  return reverse;
}
const REVERSE_INGREDIENT_ALIAS = buildReverseAlias(INGREDIENT_ALIAS);
const REVERSE_METHOD_ALIAS = buildReverseAlias(METHOD_ALIAS);

export interface NormalizeToCanonicalResult {
  normalized: Record<string, number>;
  newKeys: string[];
}

/**
 * Normalize ingredient keys from AI response to schema keys (e.g. chickpea → chickpeas).
 * Keys not in canonical set are kept and returned as newKeys (caller can add to live schema).
 */
export function normalizeIngredientKeysToCanonical(
  ingredients: Record<string, number>,
  canonicalIngredients: string[],
): NormalizeToCanonicalResult {
  const canonicalSet = new Set(canonicalIngredients);
  const normalized: Record<string, number> = {};
  const newKeys: string[] = [];

  for (const [key, value] of Object.entries(ingredients)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const resolved =
      REVERSE_INGREDIENT_ALIAS[key] ?? INGREDIENT_ALIAS[key] ?? key;
    const prev = normalized[resolved];
    normalized[resolved] =
      prev === undefined ? value : Math.min(1, Math.max(prev, value));
  }

  for (const key of Object.keys(normalized)) {
    if (!canonicalSet.has(key)) newKeys.push(key);
  }
  return { normalized, newKeys };
}

/**
 * Normalize method keys from AI response to schema keys.
 * Keys not in canonical set are kept and returned as newKeys.
 */
export function normalizeMethodKeysToCanonical(
  methods: Record<string, number>,
  canonicalMethods: string[],
): NormalizeToCanonicalResult {
  const canonicalSet = new Set(canonicalMethods);
  const normalized: Record<string, number> = {};
  const newKeys: string[] = [];

  for (const [key, value] of Object.entries(methods)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const resolved = REVERSE_METHOD_ALIAS[key] ?? METHOD_ALIAS[key] ?? key;
    const prev = normalized[resolved];
    normalized[resolved] =
      prev === undefined ? value : Math.min(1, Math.max(prev, value));
  }

  for (const key of Object.keys(normalized)) {
    if (!canonicalSet.has(key)) newKeys.push(key);
  }
  return { normalized, newKeys };
}

export function getNormalizationRules(): NormalizationRules {
  return {
    canonicalizeFunction: canonicalizeFeatureKey.toString(),
    ingredientAliases: INGREDIENT_ALIAS,
    methodAliases: METHOD_ALIAS,
  };
}

export function applyCanonicalization(
  extended: ExtendedCity[],
  rules: NormalizationRules,
): ExtendedCity[] {
  return extended.map((city) => ({
    ...city,
    ingredients: normalizeIngredients(city.ingredients, rules),
    cookingMethods: normalizeMethods(city.cookingMethods, rules),
  }));
}

function normalizeIngredients(
  ingredients: Record<string, number>,
  rules: NormalizationRules,
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const [rawKey, value] of Object.entries(ingredients)) {
    // Apply canonicalization
    const canonical = canonicalizeFeatureKey(rawKey);
    const resolved = rules.ingredientAliases[canonical] ?? canonical;

    // Merge if key already exists (sum values, then cap at 1.0)
    if (normalized[resolved]) {
      normalized[resolved] = Math.min(1.0, normalized[resolved] + value);
    } else {
      normalized[resolved] = Math.min(1.0, value);
    }
  }

  return normalized;
}

function normalizeMethods(
  methods: Record<string, number>,
  rules: NormalizationRules,
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const [rawKey, value] of Object.entries(methods)) {
    // Apply canonicalization
    const canonical = canonicalizeFeatureKey(rawKey);
    const resolved = rules.methodAliases[canonical] ?? canonical;

    // For methods, use max (binary behavior)
    if (normalized[resolved]) {
      normalized[resolved] = Math.max(normalized[resolved], value);
    } else {
      normalized[resolved] = Math.min(1.0, value);
    }
  }

  return normalized;
}

export function addExtendedTimestamp(
  extended: ExtendedCity[],
): ExtendedCity[] {
  const timestamp = new Date().toISOString();
  return extended.map((city) => ({
    ...city,
    extendedAt: timestamp,
  }));
}

export function mergeExtendedData(
  originalCities: Place[],
  extended: ExtendedCity[],
): Place[] {
  const extendedMap = new Map<string, ExtendedCity>();
  extended.forEach((city) => extendedMap.set(city.id, city));

  return originalCities.map((original) => {
    const extended = extendedMap.get(original.id);
    if (extended) {
      // Preserve ALL original properties, only update extended fields
      return {
        ...original, // Copy all original properties first
        ingredients: extended.ingredients, // Override with extended
        cookingMethods: extended.cookingMethods, // Override with extended
        famousDishes: extended.famousDishes, // Add/override famous dishes
        extendedAt: extended.extendedAt, // Add extended timestamp
      } as Place;
    }
    return original;
  });
}

export function groupByCountry(
  places: Place[],
): Map<string, Place[]> {
  const byCountry = new Map<string, Place[]>();

  for (const place of places) {
    const countryCode = place.countryCode || 'UNKNOWN';
    if (!byCountry.has(countryCode)) {
      byCountry.set(countryCode, []);
    }
    byCountry.get(countryCode)!.push(place);
  }

  return byCountry;
}

export function buildClusterContext(
  cities: Place[],
): Record<number, ClusterContext> {
  const context: Record<number, ClusterContext> = {};

  // Group cities by cluster
  const byCluster = new Map<number, Place[]>();
  for (const city of cities) {
    const clusterId = city.clusterId;
    if (clusterId !== undefined && clusterId !== null) {
      if (!byCluster.has(clusterId)) {
        byCluster.set(clusterId, []);
      }
      byCluster.get(clusterId)!.push(city);
    }
  }

  // Build context for each cluster
  for (const [clusterId, clusterCities] of byCluster.entries()) {
    // Aggregate ingredients
    const ingredientSums = new Map<string, number>();
    const methodSums = new Map<string, number>();

    for (const city of clusterCities) {
      if (city.ingredients) {
        for (const [key, value] of Object.entries(city.ingredients)) {
          ingredientSums.set(key, (ingredientSums.get(key) || 0) + (value as number));
        }
      }
      if (city.cookingMethods) {
        for (const [key, value] of Object.entries(city.cookingMethods)) {
          methodSums.set(key, (methodSums.get(key) || 0) + (value as number));
        }
      }
    }

    const cityCount = clusterCities.length;
    const topIngredients = Array.from(ingredientSums.entries())
      .map(([ingredient, sum]) => ({
        ingredient,
        avgValue: sum / cityCount,
      }))
      .sort((a, b) => b.avgValue - a.avgValue)
      .slice(0, 10);

    const topMethods = Array.from(methodSums.entries())
      .map(([method, sum]) => ({
        method,
        avgValue: sum / cityCount,
      }))
      .sort((a, b) => b.avgValue - a.avgValue)
      .slice(0, 10);

    context[clusterId] = {
      clusterId,
      topIngredients,
      topMethods,
      cities: clusterCities.map((c) => c.name),
    };
  }

  return context;
}

/** Load a single raw data file. Throws if file does not exist or is invalid. */
export function loadRawDataFile(rawDir: string, filename: string): Place[] {
  const filepath = path.join(rawDir, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(
      `Raw file not found: ${filepath}. Ensure ${filename} exists under data/raw.`,
    );
  }
  const content = fs.readFileSync(filepath, 'utf-8');
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filename}: ${error}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`${filename} must contain a JSON array of places.`);
  }
  return data as Place[];
}

export async function loadClusterContext(
  dataDir: string,
): Promise<any> {
  const clusterQualityPath = path.join(dataDir, 'cluster_quality.json');
  if (fs.existsSync(clusterQualityPath)) {
    return JSON.parse(fs.readFileSync(clusterQualityPath, 'utf-8'));
  }
  return null;
}

// Single source of truth: full schemas (max variance for clustering). No hand-curated extended schema.
const SCHEMA_KEY_RE = /"([^"]+)":\s*Type\.Optional/g;

function extractKeysFromSchemaFile(filePath: string): string[] {
  const keys: string[] = [];
  if (!fs.existsSync(filePath)) return keys;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const match of content.matchAll(SCHEMA_KEY_RE)) {
    keys.push(match[1]);
  }
  return keys;
}

/**
 * Load canonical ingredient and method keys from data dir.
 * Priority: data/extended/*.extended.ts (resume from previous run) > data/*.full.ts > data/*.ts
 * Uses absolute paths for Docker compatibility.
 */
export function loadCanonicalSchemas(dataDir: string): {
  ingredients: string[];
  methods: string[];
} {
  const dataDirResolved = path.resolve(dataDir); // Ensure absolute path
  const extendedDir = path.join(dataDirResolved, 'extended');
  const ingredientsExtended = path.join(extendedDir, 'IngredientsSchema.extended.ts');
  const methodsExtended = path.join(extendedDir, 'CookingMethodsSchema.extended.ts');
  const ingredientsFull = path.join(dataDirResolved, 'IngredientsSchema.full.ts');
  const methodsFull = path.join(dataDirResolved, 'CookingMethodsSchema.full.ts');
  const ingredientsFallback = path.join(dataDirResolved, 'IngredientsSchema.ts');
  const methodsFallback = path.join(dataDirResolved, 'CookingMethodsSchema.ts');

  const ingredients = fs.existsSync(ingredientsExtended)
    ? extractKeysFromSchemaFile(ingredientsExtended)
    : fs.existsSync(ingredientsFull)
      ? extractKeysFromSchemaFile(ingredientsFull)
      : extractKeysFromSchemaFile(ingredientsFallback);

  const methods = fs.existsSync(methodsExtended)
    ? extractKeysFromSchemaFile(methodsExtended)
    : fs.existsSync(methodsFull)
      ? extractKeysFromSchemaFile(methodsFull)
      : extractKeysFromSchemaFile(methodsFallback);

  return { ingredients, methods };
}

export function getCountryName(countryCode: string): string {
  // Simple mapping - could be enhanced
  const countryNames: Record<string, string> = {
    AF: 'Afghanistan',
    TR: 'Turkey',
    GR: 'Greece',
    NO: 'Norway',
    ES: 'Spain',
    // Add more as needed
  };
  return countryNames[countryCode] || countryCode;
}

/**
 * Get extended filename from original filename (preserves original name, adds .extended).
 * Example: "data.al.json" -> "data.al.extended.json"
 */
function getExtendedFilename(originalFilename: string): string {
  const ext = path.extname(originalFilename); // .json
  const basename = path.basename(originalFilename, ext); // data.al
  return `${basename}.extended${ext}`; // data.al.extended.json
}

export async function writeExtendedDataFile(
  places: Place[],
  extendedDir: string,
  sourceFilename: string, // e.g. "data.england.json"
): Promise<void> {
  if (!fs.existsSync(extendedDir)) {
    fs.mkdirSync(extendedDir, { recursive: true });
  }
  const extendedFilename = getExtendedFilename(sourceFilename);
  const filepath = path.join(extendedDir, extendedFilename);
  fs.writeFileSync(filepath, JSON.stringify(places, null, 2) + '\n', 'utf-8');
  console.log(`✅ Wrote ${places.length} extended places to ${filepath}`);
}

/** True if data/extended/{basename}.extended.json already exists for this source file. */
export function isExtendedFilePresent(
  extendedDir: string,
  sourceFilename: string,
): boolean {
  const extendedFilename = getExtendedFilename(sourceFilename);
  const filepath = path.join(extendedDir, extendedFilename);
  return fs.existsSync(filepath);
}

/**
 * Load existing extended file for this source if present.
 * Returns array of places (with extendedAt where already extended) or null if missing/invalid.
 */
export function loadExistingExtendedFile(
  extendedDir: string,
  sourceFilename: string,
): Place[] | null {
  const extendedFilename = getExtendedFilename(sourceFilename);
  const filepath = path.join(extendedDir, extendedFilename);
  if (!fs.existsSync(filepath)) return null;
  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data as Place[];
  } catch {
    return null;
  }
}

/** True if the given raw file already contains extendedAt on any place. */
export function isRawFileExtended(rawDir: string, filename: string): boolean {
  const filepath = path.join(rawDir, filename);
  if (!fs.existsSync(filepath)) return false;
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data.some((place: any) => place.extendedAt);
    }
  } catch (error) {
    console.error(`Error checking extended status for ${filename}:`, error);
  }
  return false;
}

/**
 * Live schema tracker: accumulates new keys as we extend and writes to data/extended/*.extended.ts
 * Ensures we don't lose schema extensions across runs and can resume.
 */
export class LiveSchema {
  private ingredients: Set<string>;
  private methods: Set<string>;
  private extendedDir: string; // Absolute path to data/extended

  constructor(initialIngredients: string[], initialMethods: string[], extendedDir: string) {
    this.ingredients = new Set(initialIngredients);
    this.methods = new Set(initialMethods);
    this.extendedDir = extendedDir; // Already resolved absolute path
  }

  /** Get current ingredient keys (sorted). */
  getIngredients(): string[] {
    return Array.from(this.ingredients).sort();
  }

  /** Get current method keys (sorted). */
  getMethods(): string[] {
    return Array.from(this.methods).sort();
  }

  /** Add new ingredient keys (if not already present). */
  addIngredients(keys: string[]): void {
    for (const key of keys) {
      if (key && typeof key === 'string') {
        this.ingredients.add(key);
      }
    }
  }

  /** Add new method keys (if not already present). */
  addMethods(keys: string[]): void {
    for (const key of keys) {
      if (key && typeof key === 'string') {
        this.methods.add(key);
      }
    }
  }

  /** Check if an ingredient key exists. */
  hasIngredient(key: string): boolean {
    return this.ingredients.has(key);
  }

  /** Check if a method key exists. */
  hasMethod(key: string): boolean {
    return this.methods.has(key);
  }

  /**
   * Generate JSON Schema for OpenAI structured outputs (response_format.json_schema).
   * Defines ExtensionResponse structure with dynamic ingredients/cookingMethods objects.
   */
  toOpenAIJsonSchema(): {
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: boolean;
      schema: Record<string, any>;
    };
  } {
    // Schema for ingredients/cookingMethods: object with any string keys -> number [0,1]
    const dynamicNumberObjectSchema = {
      type: 'object' as const,
      additionalProperties: {
        type: 'number' as const,
        minimum: 0,
        maximum: 1,
      },
      description: 'Object with string keys (ingredient/method names) mapping to number values 0-1',
    };

    const citySchema = {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const },
        name: { type: 'string' as const },
        ingredients: dynamicNumberObjectSchema,
        cookingMethods: dynamicNumberObjectSchema,
        famousDishes: {
          type: 'array' as const,
          items: { type: 'string' as const },
          maxItems: 5,
          description: 'Optional array of 1-5 famous dishes',
        },
        extendedAt: { type: 'string' as const, format: 'date-time' },
      },
      required: ['id', 'name', 'ingredients', 'cookingMethods', 'extendedAt'] as const,
      additionalProperties: false,
    };

    const proposedKeySchema = {
      type: 'object' as const,
      properties: {
        key: { type: 'string' as const },
        mapTo: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Optional array of suggested canonical mappings',
        },
        reason: { type: 'string' as const },
        confidence: { type: 'number' as const, minimum: 0, maximum: 1 },
      },
      required: ['key', 'reason', 'confidence'] as const,
      additionalProperties: false,
    };

    return {
      type: 'json_schema',
      json_schema: {
        name: 'extension_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            cities: {
              type: 'array',
              items: citySchema,
              description: 'Array of extended city objects',
            },
            newCities: {
              type: 'array',
              items: {
                ...citySchema,
                properties: {
                  ...citySchema.properties,
                  countryCode: { type: 'string' },
                  region: { type: 'string' },
                },
                required: [...citySchema.required, 'countryCode'],
              },
              description: 'Optional array of new cities to add',
            },
            proposedNewKeys: {
              type: 'object',
              properties: {
                ingredients: {
                  type: 'array',
                  items: proposedKeySchema,
                  description: 'Optional proposals for new ingredient keys',
                },
                cookingMethods: {
                  type: 'array',
                  items: proposedKeySchema,
                  description: 'Optional proposals for new method keys',
                },
              },
              additionalProperties: false,
            },
          },
          required: ['cities'],
          additionalProperties: false,
        },
      },
    };
  }

  /**
   * Write extended schemas to data/extended/*.extended.ts (TypeScript format matching buildClusters).
   * Called after each successful country extension to persist schema incrementally.
   * Uses absolute path (extendedDir) for Docker compatibility.
   */
  writeExtendedSchemas(): void {
    // Ensure directory exists (extendedDir is already absolute path)
    if (!fs.existsSync(this.extendedDir)) {
      fs.mkdirSync(this.extendedDir, { recursive: true });
    }

    const ingredientsPath = path.join(this.extendedDir, 'IngredientsSchema.extended.ts');
    const methodsPath = path.join(this.extendedDir, 'CookingMethodsSchema.extended.ts');

    const sortedIngredients = this.getIngredients();
    const sortedMethods = this.getMethods();

    // Write IngredientsSchema.extended.ts (matches buildClusters format)
    const ingredientsContent = `import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const IngredientsSchema = Type.Object({
${sortedIngredients.map((key) => `  "${key}": Type.Optional(Type.Number()),`).join('\n')}
});

export type Ingredients = Static<typeof IngredientsSchema>;
`;

    // Write CookingMethodsSchema.extended.ts (matches buildClusters format)
    const methodsContent = `import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const CookingMethodsSchema = Type.Object({
${sortedMethods.map((key) => `  "${key}": Type.Optional(Type.Number()),`).join('\n')}
});

export type CookingMethods = Static<typeof CookingMethodsSchema>;
`;

    fs.writeFileSync(ingredientsPath, ingredientsContent, 'utf-8');
    fs.writeFileSync(methodsPath, methodsContent, 'utf-8');
  }
}

/** Append proposedNewKeys to report file (for review only; never applied automatically). */
export function writeSchemaProposalsReport(
  extendedDir: string,
  sourceFile: string, // e.g. "data.england.json"
  proposedNewKeys: NonNullable<ExtensionResponse['proposedNewKeys']>,
): void {
  if (!fs.existsSync(extendedDir)) {
    fs.mkdirSync(extendedDir, { recursive: true });
  }
  const reportPath = path.join(extendedDir, 'schema_proposals.json');
  type Entry = { sourceFile: string; at: string; proposedNewKeys: typeof proposedNewKeys };
  let entries: Entry[] = [];
  if (fs.existsSync(reportPath)) {
    try {
      const raw = fs.readFileSync(reportPath, 'utf-8');
      entries = JSON.parse(raw) as Entry[];
    } catch {
      entries = [];
    }
  }
  entries.push({
    sourceFile,
    at: new Date().toISOString(),
    proposedNewKeys,
  });
  fs.writeFileSync(reportPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}
