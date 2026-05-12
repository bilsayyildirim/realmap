// Validator for OpenAI responses

import type {
  ExtendedCity,
  ExtensionResponse,
  ProposedKey,
  ValidationConstraints,
} from './types';

const MIN_VALUE = 0.05;
const MAX_INGREDIENT_KEYS = 35;
const MAX_METHOD_KEYS = 12;
const MAX_TOTAL_KEYS_PER_CITY = 60;
const FLAT_BAND: [number, number] = [0.45, 0.55];
const FLAT_RATIO_THRESHOLD = 0.5; // reject if >= 50% of values fall in flat band

export interface ParseResult {
  cities: ExtendedCity[];
  proposedNewKeys?: ExtensionResponse['proposedNewKeys'];
}

export function parseAndValidateResponse(
  response: string,
  constraints: ValidationConstraints,
): ParseResult {
  let parsed: ExtensionResponse;
  try {
    parsed = JSON.parse(response);
  } catch (error: any) {
    // Log response snippet for debugging (last 500 chars usually contains the error)
    const snippet = response.length > 500 
      ? `...${response.slice(-500)}` 
      : response;
    const errorMsg = error?.message || String(error);
    throw new Error(
      `Invalid JSON response: ${errorMsg}\n` +
      `Response snippet (last 500 chars):\n${snippet}\n` +
      `Full response length: ${response.length} chars`
    );
  }

  if (!parsed.cities || !Array.isArray(parsed.cities)) {
    throw new Error('Invalid response: missing cities array');
  }

  const cities: ExtendedCity[] = [];

  for (let index = 0; index < parsed.cities.length; index++) {
    const city = parsed.cities[index] as any;

    if (!city.id || typeof city.id !== 'string') {
      throw new Error(`City ${index}: missing or invalid id`);
    }
    if (!city.name || typeof city.name !== 'string') {
      throw new Error(`City ${index}: missing or invalid name`);
    }

    if (!city.ingredients || typeof city.ingredients !== 'object') {
      throw new Error(`City ${city.name}: missing or invalid ingredients`);
    }
    validateIngredients(city.ingredients, city.name);
    ensureRequiredKeys(
      city.ingredients,
      constraints.requiredIngredientKeys,
      city.name,
      'ingredients',
    );

    if (!city.cookingMethods || typeof city.cookingMethods !== 'object') {
      throw new Error(`City ${city.name}: missing or invalid cookingMethods`);
    }
    validateMethods(city.cookingMethods, city.name);
    ensureRequiredKeys(
      city.cookingMethods,
      constraints.requiredMethodKeys,
      city.name,
      'cookingMethods',
    );

    if (city.famousDishes !== undefined) {
      if (!Array.isArray(city.famousDishes)) {
        throw new Error(`City ${city.name}: famousDishes must be array`);
      }
      if (city.famousDishes.length > 5) {
        city.famousDishes = city.famousDishes.slice(0, 5);
      }
      city.famousDishes.forEach((dish: any, i: number) => {
        if (typeof dish !== 'string') {
          throw new Error(
            `City ${city.name}: famousDishes[${i}] must be string, got ${typeof dish}`,
          );
        }
      });
    }

    if (!city.extendedAt || typeof city.extendedAt !== 'string') {
      throw new Error(`City ${city.name}: missing or invalid extendedAt`);
    }

    // Realism guards: drop < MIN_VALUE, cap key counts, reject flat/dense
    const ingredients = dropSmallAndCapKeys(
      city.ingredients,
      MAX_INGREDIENT_KEYS,
      city.name,
      'ingredients',
    );
    const cookingMethods = dropSmallAndCapKeys(
      city.cookingMethods,
      MAX_METHOD_KEYS,
      city.name,
      'cookingMethods',
    );

    const totalKeys = Object.keys(ingredients).length + Object.keys(cookingMethods).length;
    if (totalKeys > MAX_TOTAL_KEYS_PER_CITY) {
      throw new Error(
        `City ${city.name}: too many keys (${totalKeys}). Max ${MAX_TOTAL_KEYS_PER_CITY} total (ingredients + methods).`,
      );
    }

    const allValues = [...Object.values(ingredients), ...Object.values(cookingMethods)] as number[];
    if (allValues.length > 0) {
      const inFlatBand = allValues.filter(
        (v) => v >= FLAT_BAND[0] && v <= FLAT_BAND[1],
      ).length;
      if (inFlatBand / allValues.length >= FLAT_RATIO_THRESHOLD) {
        throw new Error(
          `City ${city.name}: vector too flat (${inFlatBand}/${allValues.length} values in [0.45, 0.55]). Use more discriminative values.`,
        );
      }
    }

    cities.push({
      ...city,
      ingredients,
      cookingMethods,
    } as ExtendedCity);
  }

  // proposedNewKeys is never applied to data; caller writes to report only
  const proposedNewKeys = parsed.proposedNewKeys;
  if (proposedNewKeys) {
    validateProposedKeys(proposedNewKeys.ingredients, 'ingredients');
    validateProposedKeys(proposedNewKeys.cookingMethods, 'cookingMethods');
  }

  return { cities, proposedNewKeys };
}

function dropSmallAndCapKeys(
  obj: Record<string, number>,
  maxKeys: number,
  cityName: string,
  _label: string,
): Record<string, number> {
  const afterDrop = Object.entries(obj).filter(
    ([, v]) => typeof v === 'number' && v >= MIN_VALUE,
  );
  const entries = afterDrop
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, maxKeys);
  if (afterDrop.length > maxKeys) {
    console.warn(
      `City ${cityName}: ${_label} capped to ${maxKeys} keys (had ${afterDrop.length} after dropping < ${MIN_VALUE})`,
    );
  }
  return Object.fromEntries(entries);
}

function ensureRequiredKeys(
  obj: Record<string, number>,
  requiredKeys: string[] | undefined,
  cityName: string,
  label: string,
): void {
  if (!requiredKeys?.length) return;
  for (const key of requiredKeys) {
    if (!(key in obj) || typeof obj[key] !== 'number') {
      throw new Error(
        `City ${cityName}: missing required ${label} key "${key}". Required keys must be present with a number value 0–1.`,
      );
    }
  }
}

function validateProposedKeys(arr: ProposedKey[] | undefined, label: string): void {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (!p || typeof p.key !== 'string') {
      throw new Error(`proposedNewKeys.${label}[${i}]: missing or invalid key`);
    }
    if (p.mapTo !== undefined && !Array.isArray(p.mapTo)) {
      throw new Error(`proposedNewKeys.${label}[${i}]: mapTo must be array`);
    }
    if (typeof p.reason !== 'string') {
      throw new Error(`proposedNewKeys.${label}[${i}]: reason must be string`);
    }
    if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) {
      throw new Error(`proposedNewKeys.${label}[${i}]: confidence must be 0-1`);
    }
  }
}

function validateIngredients(
  ingredients: Record<string, any>,
  cityName: string,
): void {
  for (const [key, value] of Object.entries(ingredients)) {
    if (typeof value !== 'number') {
      throw new Error(
        `City ${cityName}: ingredient "${key}" value must be number, got ${typeof value}`,
      );
    }
    if (value < 0 || value > 1) {
      throw new Error(
        `City ${cityName}: ingredient "${key}" value must be 0.0-1.0, got ${value}`,
      );
    }
    if (!Number.isFinite(value)) {
      throw new Error(
        `City ${cityName}: ingredient "${key}" value must be finite, got ${value}`,
      );
    }
  }
}

function validateMethods(
  methods: Record<string, any>,
  cityName: string,
): void {
  for (const [key, value] of Object.entries(methods)) {
    if (typeof value !== 'number') {
      throw new Error(
        `City ${cityName}: method "${key}" value must be number, got ${typeof value}`,
      );
    }
    if (value < 0 || value > 1) {
      throw new Error(
        `City ${cityName}: method "${key}" value must be 0.0-1.0, got ${value}`,
      );
    }
    if (!Number.isFinite(value)) {
      throw new Error(
        `City ${cityName}: method "${key}" value must be finite, got ${value}`,
      );
    }
  }
}
