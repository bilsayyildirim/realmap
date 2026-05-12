# AI-Powered Raw Data Extension Plan

## Executive Summary

**Goal**: Use OpenAI to extend/curate raw place data files with high-quality, globally consistent ingredient and cooking method values, maintaining city-to-city precision while respecting regional culinary patterns. **CRITICAL: Avoid country stereotypes and biases - focus on actual local cuisine with deep research.**

**Key Constraints**:
- **NO COUNTRY BIAS**: Research actual local dishes, not stereotypes (e.g., not just "kebap" for Turkish cities, but specific regional dishes)
- Global consistency: 0 = never used, 1 = always used
- Regional precision: Athens vs Oslo vs Izmir (olive oil example)
- City-level depth: Include top 5 famous dishes per city (optional field)
- One-time processing: Add `extendedAt` timestamp to prevent re-processing
- Use canonicalized keys from buildClusters normalization
- Quality is paramount, cost is secondary

---

## 1. Architecture & Strategy

### 1.1 Processing Unit: Country-by-Country (RECOMMENDED)

**Why Country-by-Country:**
- ✅ **Better context**: AI can understand regional patterns within a country
- ✅ **Cost efficiency**: Fewer API calls (one per country vs 5500+ per city)
- ✅ **Consistency**: Easier to maintain global consistency when processing related cities together
- ✅ **Regional awareness**: AI can better understand "Athens vs Izmir" when seeing all Greek cities together
- ✅ **Session context**: Can maintain context across cities in same country

**Alternative: City-by-City**
- ❌ 5500+ API calls (expensive, slow)
- ❌ Harder to maintain global consistency
- ❌ No regional context for AI
- ✅ Only advantage: Can parallelize more easily

**Recommendation**: **Country-by-Country with batch processing**

### 1.2 Data Flow

```
1. Load all raw data files (data/raw/*.json)
2. Group by country
3. For each country:
   a. Filter out cities with extendedAt (already processed)
   b. Load cluster results for context
   c. Build prompt with:
      - All cities in country (for regional context)
      - Cluster assignments (for consistency)
      - Canonical ingredient/method schemas
      - Normalization rules
   d. Call OpenAI API
   e. Parse and validate response
   f. Apply canonicalization
   g. Add extendedAt timestamp
   h. Write back to file
4. Validate global consistency
5. Report statistics
```

---

## 2. Prompt Engineering Strategy

### 2.1 System Context (Critical for Quality)

```typescript
const SYSTEM_PROMPT = `
You are a culinary data expert specializing in local, city-level cuisine analysis with deep research capabilities.

CORE PRINCIPLES (Fundamental Rules):

1. **INDEPENDENCE PRINCIPLE - Each City is Unique**:
   - Every city must be analyzed INDEPENDENTLY, not as part of a country
   - DO NOT infer city cuisine from country-level knowledge
   - DO NOT assume cities in the same country share cuisine
   - DO NOT use country stereotypes to fill gaps
   - If you don't know a city's specific cuisine, research it or mark as uncertain
   - Example: Bilecik (Turkey) may have completely different dishes than Istanbul (Turkey)
   - Example: Kabul (Afghanistan) may emphasize different ingredients than Herat (Afghanistan)

2. **RESEARCH DEPTH REQUIREMENT**:
   - For each city, you must consider:
     a. What are the ACTUAL famous dishes of this specific city? (not country)
     b. What ingredients are locally available/important in THIS city?
     c. What cooking methods are traditional in THIS city's cuisine?
     d. What are the historical/geographical factors affecting THIS city?
   - Research means: Use your knowledge of actual local cuisine, not assumptions
   - If a city is known for a specific dish, that dish should drive ingredient values
   - If a city is coastal, seafood should be higher (but verify actual usage)
   - If a city is inland, local agriculture should drive values (but verify actual usage)

3. **GLOBAL CONSISTENCY SCALE** (Critical for Clustering):
   - 0.0 = This ingredient/method is NEVER used in this city's cuisine
   - 0.25 = Rarely used, appears in few dishes
   - 0.5 = Moderately used, appears in some dishes
   - 0.75 = Commonly used, appears in many dishes
   - 1.0 = Ubiquitous, appears in almost all/most dishes
   - This scale must be CONSISTENT across ALL cities globally
   - Example: If olive_oil = 0.95 in Athens, it means olive oil is in 95% of dishes
   - Example: If olive_oil = 0.1 in Oslo, it means olive oil is in 10% of dishes (rare)
   - The SAME ingredient should have DIFFERENT values in different cities based on actual usage

4. **REGIONAL PRECISION REQUIREMENT**:
   - Cities must reflect REAL, measurable differences
   - Athens (Greece): olive_oil = 0.95 (Mediterranean, ubiquitous)
   - Oslo (Norway): olive_oil = 0.1 (Nordic, rare/imported)
   - Izmir (Turkey): olive_oil = 0.85 (Aegean coast, very common)
   - These differences MUST be accurate and reflect actual culinary reality
   - Small differences (0.05-0.1) matter and should reflect real variations

5. **CANONICAL KEY REQUIREMENT**:
   - You MUST use ONLY these exact keys (case-sensitive, underscore-separated):
   Ingredients: ${JSON.stringify(CANONICAL_INGREDIENTS)}
   Methods: ${JSON.stringify(CANONICAL_METHODS)}
   - DO NOT invent new keys
   - DO NOT use variations (e.g., "olive oil" instead of "olive_oil")
   - If a city uses an ingredient not in the list, map it to the closest canonical key

6. **NORMALIZATION RULES** (Apply Before Using Keys):
   - Plural → singular: "tomatoes" → "tomato"
   - Diacritics removed: "jalapeño" → "jalapeno"
   - Spaces → underscores: "olive oil" → "olive_oil"
   - All lowercase
   - Special characters removed/replaced

7. **CLUSTER CONTEXT GUIDANCE**:
   - Cities in the same cluster should have SIMILAR but NOT IDENTICAL profiles
   - Use cluster context to understand general patterns
   - But still maintain city-level distinctions
   - Example: If cluster has high olive_oil, but city is in Norway, still use 0.1 (not 0.9)

8. **FAMOUS DISHES REQUIREMENT**:
   - For each city, provide 1-5 famous dishes (fewer is better if uncertain)
   - Must be ACTUAL dishes from that specific city (not country-level)
   - Research-based: What is THIS city actually known for?
   - Format: Array of strings, local name preferred
   - Quality over quantity: Better to have 2 accurate dishes than 5 generic ones
   - If you don't know city-specific dishes, provide fewer or empty array

9. **QUALITY STANDARDS**:
   - Every value must be JUSTIFIABLE based on actual local cuisine
   - No assumptions without basis
   - No country-level generalizations
   - Consider: geography, history, local ingredients, cultural influences
   - Be precise: 0.05 difference reflects real variation
   - HONEST: If uncertain, use lower confidence values (0.5-0.75 range)

10. **BIAS PREVENTION CHECKLIST** (Before Finalizing):
    - [ ] Did I research THIS city specifically, not the country?
    - [ ] Are my ingredient values based on THIS city's actual dishes?
    - [ ] Are my famous dishes specific to THIS city?
    - [ ] Would a local person recognize these dishes as from THIS city?
    - [ ] Have I avoided country-level stereotypes?
    - [ ] Are my values consistent with the global scale (0.0-1.0)?
`;
```

### 2.2 Per-Country Prompt Structure

```typescript
const buildCountryPrompt = (countryData: {
  countryCode: string;
  countryName: string;
  cities: Place[];
  clusterContext: ClusterContext;
  canonicalIngredients: string[];
  canonicalMethods: string[];
}) => {
  return `
Analyze and extend culinary data for ${countryData.countryName} (${countryData.countryCode}).

EXISTING DATA (for reference, may be incomplete):
${JSON.stringify(countryData.cities.map(c => ({
  name: c.name,
  region: c.region,
  clusterId: c.clusterId,
  currentIngredients: c.ingredients,
  currentMethods: c.cookingMethods
})), null, 2)}

CLUSTER CONTEXT:
${JSON.stringify(countryData.clusterContext, null, 2)}

TASK:
For each city, provide COMPLETE ingredient and cooking method profiles using ONLY canonical keys.

CRITICAL REQUIREMENTS - APPLY CORE PRINCIPLES:

1. **INDEPENDENT CITY ANALYSIS**:
   - Analyze each city as a UNIQUE entity, not as part of a country
   - For each city, ask: "What are the ACTUAL dishes and ingredients used in THIS city?"
   - Do NOT use country-level knowledge to infer city-level data
   - Do NOT assume cities in the same country share cuisine
   - Research each city's specific culinary identity independently

2. **RESEARCH METHODOLOGY**:
   - Start with: "What is [City Name] actually known for?"
   - Consider: Local geography, history, available ingredients, cultural influences
   - Verify: Are these dishes/ingredients actually used in THIS city?
   - Validate: Would a local person recognize this as their city's cuisine?
   - If uncertain, use moderate values (0.5-0.75) rather than extreme (0.9-1.0)

3. **FAMOUS DISHES REQUIREMENT**:
   - Provide 1-5 famous dishes per city (fewer if uncertain)
   - Must be dishes SPECIFIC to this city, not country-level
   - Research question: "What dishes is [City Name] specifically known for?"
   - Quality check: Would someone from this city say "Yes, that's our dish"?
   - If you only know country-level dishes, provide fewer or empty array
   - Better to have 2 accurate city-specific dishes than 5 generic country dishes

3. **Fill missing values** (if city has partial data)
4. **Correct inconsistent values** (if city has wrong data)
5. **Add new cities** if you know of important culinary cities missing
6. **Maintain city-to-city precision** (e.g., coastal vs inland differences)
7. **Use ONLY canonical keys** from provided schemas
8. **Values must be 0.0-1.0** with global consistency
9. **HONEST and ACCURATE** - no assumptions, no stereotypes

OUTPUT FORMAT (JSON):
{
  "cities": [
    {
      "id": "existing-id-or-new-id",
      "name": "City Name",
      "ingredients": {
        "olive_oil": 0.95,
        "tomato": 0.85,
        ...
      },
      "cookingMethods": {
        "stewing": 0.9,
        "grilling": 0.7,
        ...
      },
      "famousDishes": [
        "Dish Name 1 (local name if different)",
        "Dish Name 2",
        "Dish Name 3",
        "Dish Name 4",
        "Dish Name 5"
      ],
      "extendedAt": "2026-02-03T00:00:00Z"
    }
  ],
  "newCities": [
    // Optional: suggest important cities missing from dataset
  ]
}

IMPORTANT:
- famousDishes must be ACTUAL dishes from that specific city
- Research each city individually - don't copy country-level dishes
- If you don't know specific dishes for a city, provide fewer (or empty array)
- Quality over quantity - better to have 2 accurate dishes than 5 generic ones
`;
};
```

### 2.3 Session Context Strategy

**Option A: Single Request per Country (RECOMMENDED)**
- Send all cities in country in one request
- AI maintains context across cities
- Cost: ~1 request per country (~200 countries = ~200 requests)
- Quality: High (AI sees full regional picture)

**Option B: Batch Cities (10-20 per request)**
- Split large countries into batches
- Cost: More requests but still manageable
- Quality: Good (still has regional context)

**Option C: Streaming/Conversational**
- Use OpenAI streaming API for large countries
- Maintain conversation context
- More complex but allows iterative refinement

**Recommendation**: **Option A** for most countries, **Option B** for countries with >50 cities

---

## 3. Implementation Details

### 3.1 Package Structure

**New Files to Create:**
```
packages/shared/src/clients/openai/
  ├── index.ts              # Export OpenAI client
  ├── buildOpenAIClient.ts  # Client factory (reads from env)
  └── types.ts              # OpenAI-related types

packages/scripts/src/extendRawData/
  ├── index.ts              # Main script
  ├── promptBuilder.ts      # Prompt construction
  ├── validator.ts          # Response validation
  └── types.ts              # Extension types
```

**Dependencies to Add:**
```json
// packages/shared/package.json
{
  "dependencies": {
    "openai": "^4.20.0"  // Official OpenAI SDK
  }
}

// packages/scripts/package.json
{
  "dependencies": {
    "@realmap/shared": "workspace:*"  // Already exists, will use OpenAI client
  }
}
```

### 3.2 Environment Variables

**Convention**: Use `REALMAP_*` prefix (matching existing pattern)

```bash
# .env or docker-compose.env
REALMAP_OPENAI_API_KEY=sk-...
REALMAP_OPENAI_MODEL=gpt-4-turbo-preview  # Optional, defaults to gpt-4-turbo-preview
```

**Client Implementation:**
```typescript
// packages/shared/src/clients/openai/buildOpenAIClient.ts
import OpenAI from 'openai';

export function buildOpenAIClient(): OpenAI {
  const apiKey = process.env.REALMAP_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('REALMAP_OPENAI_API_KEY environment variable is required');
  }

  return new OpenAI({
    apiKey,
    // Optional: configure timeout, retries, etc.
  });
}
```

### 3.3 Script Structure

```typescript
// packages/scripts/src/extendRawData/index.ts

interface ExtensionConfig {
  // No openaiApiKey here - read from env via shared client
  model?: string; // Optional, defaults to env or 'gpt-4-turbo-preview'
  dryRun: boolean;
  countryFilter?: string[]; // Process only these countries
  skipExtended: boolean; // Skip cities with extendedAt
}

interface ClusterContext {
  clusterId: number;
  topIngredients: Array<{ingredient: string; avgValue: number}>;
  topMethods: Array<{method: string; avgValue: number}>;
  cities: string[]; // City names in this cluster
}

interface ExtendedCity {
  id: string;
  name: string;
  ingredients: Record<string, number>;
  cookingMethods: Record<string, number>;
  famousDishes?: string[]; // Top 5 (or fewer) famous dishes
  extendedAt: string;
}

async function extendRawData(config: ExtensionConfig) {
  // 1. Initialize OpenAI client (from shared package)
  const openai = buildOpenAIClient(); // From @realmap/shared/clients/openai

  // 2. Load all raw files
  const rawFiles = await loadRawDataFiles();

  // 3. Load cluster results for context
  const clusterContext = await loadClusterContext();

  // 4. Load canonical schemas
  const canonicalIngredients = await loadCanonicalIngredients();
  const canonicalMethods = await loadCanonicalMethods();

  // 5. Load normalization rules (from buildClusters)
  const normalizationRules = {
    canonicalizeFunction: canonicalizeFeatureKey.toString(),
    ingredientAliases: INGREDIENT_ALIAS,
    methodAliases: METHOD_ALIAS,
  };

  // 6. Group by country
  const byCountry = groupByCountry(rawFiles);

  // 7. Process each country
  for (const [countryCode, cities] of Object.entries(byCountry)) {
    if (config.countryFilter && !config.countryFilter.includes(countryCode)) {
      continue;
    }

    // Filter out already extended cities
    const citiesToExtend = config.skipExtended
      ? cities.filter(c => !c.extendedAt)
      : cities;

    if (citiesToExtend.length === 0) continue;

    // Build cluster context for this country's cities
    const countryClusterContext = buildClusterContext(
      citiesToExtend,
      clusterContext
    );

    // Build prompt (emphasizing no country bias, deep research)
    const prompt = buildCountryPrompt({
      countryCode,
      countryName: getCountryName(countryCode),
      cities: citiesToExtend,
      clusterContext: countryClusterContext,
      canonicalIngredients,
      canonicalMethods,
      normalizationRules,
    });

    // Call OpenAI using shared client
    const model = config.model || process.env.REALMAP_OPENAI_MODEL || 'gpt-4-turbo-preview';
    const response = await callOpenAI(openai, model, prompt);

    // Parse and validate
    const extended = parseAndValidateResponse(response, {
      canonicalIngredients,
      canonicalMethods,
      normalizationRules,
    });

    // Apply canonicalization
    const canonicalized = applyCanonicalization(extended, normalizationRules);

    // Add extendedAt timestamp
    const timestamped = addExtendedTimestamp(canonicalized);

    // Merge back into original data
    const merged = mergeExtendedData(cities, timestamped);

    // Write back to file
    if (!config.dryRun) {
      await writeRawDataFile(countryCode, merged);
    }
  }

  // 8. Global consistency validation
  await validateGlobalConsistency(byCountry);

  // 9. Report
  generateReport(byCountry);
}

// OpenAI API call wrapper
async function callOpenAI(
  client: OpenAI,
  model: string,
  prompt: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3, // Lower temperature for more consistent, factual output
    response_format: { type: 'json_object' }, // Force JSON output
  });

  return response.choices[0]?.message?.content || '';
}
```

### 3.4 Validation & Quality Checks

```typescript
function validateGlobalConsistency(allData: Map<string, Place[]>) {
  // Check 1: No values outside 0.0-1.0
  // Check 2: Same ingredient across cities makes sense
  //   (e.g., olive_oil in Mediterranean vs Nordic)
  // Check 3: Cluster consistency (cities in same cluster should be similar)
  // Check 4: Regional patterns (coastal cities similar, etc.)
  // Check 5: All keys are canonical
  // Check 6: famousDishes is array of strings (max 5, can be empty)
  // Check 7: No country-level stereotypes (e.g., all Turkish cities having same dishes)
}

function parseAndValidateResponse(
  response: string,
  constraints: ValidationConstraints
): ExtendedCity[] {
  // 1. Parse JSON
  const parsed = JSON.parse(response);

  // 2. Validate structure
  if (!parsed.cities || !Array.isArray(parsed.cities)) {
    throw new Error('Invalid response: missing cities array');
  }

  // 3. Validate each city
  return parsed.cities.map((city: any) => {
    // Validate ingredients
    validateIngredients(city.ingredients, constraints.canonicalIngredients);

    // Validate methods
    validateMethods(city.cookingMethods, constraints.canonicalMethods);

    // Validate famousDishes (optional)
    if (city.famousDishes) {
      if (!Array.isArray(city.famousDishes)) {
        throw new Error(`Invalid famousDishes for ${city.name}: must be array`);
      }
      if (city.famousDishes.length > 5) {
        console.warn(`City ${city.name} has ${city.famousDishes.length} dishes, limiting to 5`);
        city.famousDishes = city.famousDishes.slice(0, 5);
      }
      // Validate all are strings
      city.famousDishes.forEach((dish: any, i: number) => {
        if (typeof dish !== 'string') {
          throw new Error(`Invalid famousDishes[${i}] for ${city.name}: must be string`);
        }
      });
    }

    return city as ExtendedCity;
  });
}

function parseAndValidateResponse(
  response: string,
  constraints: ValidationConstraints
): ExtendedCity[] {
  // 1. Parse JSON
  // 2. Validate all keys are canonical
  // 3. Validate all values are 0.0-1.0
  // 4. Check for missing required fields
  // 5. Apply canonicalization
  // 6. Return validated data
}
```

### 3.5 Canonicalization Application

```typescript
function applyCanonicalization(
  extended: ExtendedCity[],
  rules: NormalizationRules
): ExtendedCity[] {
  return extended.map(city => ({
    ...city,
    ingredients: normalizeIngredients(city.ingredients, rules),
    cookingMethods: normalizeMethods(city.cookingMethods, rules),
  }));
}

function normalizeIngredients(
  ingredients: Record<string, number>,
  rules: NormalizationRules
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
      normalized[resolved] = value;
    }
  }

  return normalized;
}
```

---

## 4. Cost Estimation

### 4.1 Model Selection

**Option 1: GPT-4 Turbo (RECOMMENDED for Quality)**
- Input: $10 per 1M tokens
- Output: $30 per 1M tokens
- Quality: Highest, best at following complex instructions
- Context: 128k tokens (can fit entire countries)

**Option 2: GPT-4**
- Input: $30 per 1M tokens
- Output: $60 per 1M tokens
- Quality: High, but more expensive

**Option 3: GPT-3.5 Turbo**
- Input: $0.50 per 1M tokens
- Output: $1.50 per 1M tokens
- Quality: Lower, may not follow complex rules as well
- **NOT RECOMMENDED** for this use case (quality is paramount)

### 4.2 Token Estimation

**Per Country Request:**
- System prompt: ~2,000 tokens
- Country data (50 cities avg): ~15,000 tokens
- Cluster context: ~3,000 tokens
- Schemas: ~1,000 tokens
- **Total input**: ~21,000 tokens per country

- Output (50 cities with full profiles): ~25,000 tokens
- **Total output**: ~25,000 tokens per country

**Total per country**: ~46,000 tokens

**For 200 countries:**
- Total tokens: 200 × 46,000 = 9,200,000 tokens
- Input cost (GPT-4 Turbo): 9.2M × $10/1M = **$92**
- Output cost (GPT-4 Turbo): 9.2M × $30/1M = **$276**
- **Total: ~$368**

**For 5500 cities (assuming 110 countries avg 50 cities):**
- Similar calculation: **~$400-450**

### 4.3 Cost Optimization Strategies

1. **Skip already-extended cities**: Reduces token count
2. **Batch small countries**: Combine 2-3 small countries per request
3. **Use GPT-4 Turbo**: Best quality/price ratio
4. **Cache responses**: Save API responses for re-validation
5. **Incremental processing**: Process countries over time

---

## 5. Quality Assurance

### 5.1 Pre-Processing Checks

- [ ] All canonical keys loaded correctly
- [ ] Normalization rules match buildClusters
- [ ] Cluster context loaded and accurate
- [ ] Raw data files are valid JSON

### 5.2 Post-Processing Validation

- [ ] All values are 0.0-1.0
- [ ] All keys are canonical
- [ ] No duplicate cities
- [ ] Regional patterns make sense (e.g., Mediterranean cities have high olive_oil)
- [ ] Cluster consistency (cities in same cluster are similar)
- [ ] City-to-city precision (Athens vs Oslo olive_oil difference preserved)

### 5.3 Manual Review Checklist

For each country, spot-check:
- [ ] 2-3 cities for accuracy
- [ ] Regional differences (coastal vs inland)
- [ ] Cluster assignments make sense
- [ ] No obvious errors (e.g., Nordic city with 0.95 olive_oil)

---

## 6. Error Handling & Recovery

### 6.1 API Failures

- Retry with exponential backoff (3 attempts)
- Log failed countries for manual review
- Continue processing other countries

### 6.2 Validation Failures

- Log validation errors
- Save partial results (cities that passed validation)
- Flag cities that need manual review

### 6.3 Data Corruption

- Backup original files before processing
- Validate JSON before writing
- Use atomic writes (write to temp file, then rename)

---

## 9. Makefile Integration

```makefile
# Extend raw data using OpenAI
extend-raw-data:
	@echo "🔧 Extending raw data with AI curation..."
	@echo "⚠️  This will modify data/raw/*.json files"
	@read -p "Continue? (y/N) " confirm && [ "$$confirm" = "y" ] || exit 1
	docker-compose -f docker-compose.dev.yml run --rm server \
		pnpm --filter @realmap/scripts run extend-raw-data

# Dry run (no modifications)
extend-raw-data-dry-run:
	docker-compose -f docker-compose.dev.yml run --rm server \
		pnpm --filter @realmap/scripts run extend-raw-data --dry-run

# Extend specific country
extend-raw-data-country:
	@read -p "Country code (e.g., GR): " code && \
	docker-compose -f docker-compose.dev.yml run --rm server \
		pnpm --filter @realmap/scripts run extend-raw-data --country $$code
```

---

## 10. Recommendations Summary

### ✅ DO:
1. **Process country-by-country** (better context, lower cost)
2. **Use GPT-4 Turbo** (best quality/price)
3. **Include full cluster context** (helps AI maintain consistency)
4. **Validate rigorously** (canonical keys, value ranges, regional patterns)
5. **Add extendedAt timestamp** (prevent re-processing)
6. **Backup before processing** (safety first)
7. **Process incrementally** (test on 1-2 countries first)

### ❌ DON'T:
1. **Don't process city-by-city** (too expensive, loses context)
2. **Don't use GPT-3.5** (quality too low for this task)
3. **Don't skip validation** (data quality is critical)
4. **Don't process without backup** (risky)
5. **Don't ignore regional patterns** (Athens vs Oslo must be different)

---

## 11. Estimated Timeline

- **Development**: 2-3 days
- **Testing (5-10 countries)**: 1 day
- **Full processing (200 countries)**: 1-2 days (with rate limits)
- **Validation & fixes**: 1-2 days
- **Total**: ~1 week

---

## 12. Success Metrics

- ✅ All 5500 cities have complete ingredient/method profiles
- ✅ Global consistency maintained (0.0-1.0 range, logical patterns)
- ✅ Regional precision preserved (Athens 0.95 vs Oslo 0.1 olive_oil)
- ✅ All keys are canonical (passes buildClusters validation)
- ✅ Cluster consistency (cities in same cluster are similar)
- ✅ Cost under $500
- ✅ Processing time under 48 hours

---

## 13. Installation Steps

### 13.1 Install OpenAI Package

```bash
# In packages/shared
cd packages/shared
pnpm add openai

# Verify it's available in scripts (via workspace dependency)
cd ../scripts
pnpm list openai  # Should show it's available via @realmap/shared
```

### 13.2 Set Environment Variable

```bash
# Add to .env or docker-compose.dev.yml
REALMAP_OPENAI_API_KEY=sk-your-key-here
REALMAP_OPENAI_MODEL=gpt-4-turbo-preview  # Optional
```

### 13.3 Verify Setup

```bash
# Test OpenAI client
docker-compose -f docker-compose.dev.yml run --rm server \
  node -e "const {buildOpenAIClient} = require('@realmap/shared/clients/openai'); console.log('Client ready:', !!buildOpenAIClient());"
```

## 14. Next Steps

1. ✅ Review and approve this plan
2. ⏳ Implement core script structure
3. ⏳ Test on 1-2 countries (Greece, Norway for olive_oil test case)
4. ⏳ Validate results manually
5. ⏳ Scale to all countries
6. ⏳ Run buildClusters to verify data quality
7. ⏳ Document any issues/learnings

