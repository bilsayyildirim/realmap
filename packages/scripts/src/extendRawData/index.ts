/* --------------------------------------------------------------------
   extendRawData.ts – AI-Powered Raw Data Extension
   --------------------------------------------------------------------
   Uses OpenAI to extend/curate raw place data with high-quality,
   globally consistent ingredient and cooking method values.

   Schema Extension & Resume:
   - Loads schemas from data/extended/*.extended.ts if exists (resume from
     previous run), else falls back to data/*.full.ts or data/*.ts
   - As we extend places, accumulates new keys from proposedNewKeys and
     encountered keys into a LiveSchema
   - Writes extended schemas incrementally after each batch (so we can resume if interrupted)
   - All extended data written to data/extended/ (never touches raw data)
   - Large files (>60 places) are automatically batched to avoid token limits

   Consistency across sessions:
   - REALMAP_OPENAI_SEED: optional integer (default 42). Same seed + same
     prompt/temp → more deterministic outputs (OpenAI best-effort).
   - Structured outputs: When model supports it (gpt-4o, gpt-4o-mini, etc.),
     uses response_format.type === 'json_schema' with a JSON Schema generated
     from LiveSchema. This ensures responses match ExtensionResponse structure
     exactly (cities array with ingredients/cookingMethods objects). Falls back
     to json_object mode for older models.
   - Required keys (data/config.json extend.requiredIngredientKeys /
     requiredMethodKeys) force every city to include those keys → stable
     feature dimensions across countries.
   ------------------------------------------------------------------ */

import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore - OpenAI SDK types
import { Place } from '@realmap/shared';
import { buildOpenAIClient } from '@realmap/shared/clients/openai';
import { buildFilePrompt, buildSystemPrompt } from './promptBuilder';
import type { ExtendedCity, ExtensionConfig, ExtensionResponse } from './types';
import {
  addExtendedTimestamp,
  applyCanonicalization,
  buildClusterContext,
  getNormalizationRules,
  isExtendedFilePresent,
  LiveSchema,
  loadCanonicalSchemas,
  loadClusterContext,
  loadExistingExtendedFile,
  loadRawDataFile,
  mergeExtendedData,
  writeExtendedDataFile,
  writeSchemaProposalsReport,
} from './utils';
import { parseAndValidateResponse } from './validator';

/**
 * Check if model supports OpenAI structured outputs (json_schema response_format).
 * Only gpt-4o / gpt-4o-mini support it; gpt-4-turbo-preview does not.
 * @see https://platform.openai.com/docs/guides/structured-outputs
 */
function supportsStructuredOutputs(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith('gpt-4o') || m.startsWith('gpt-4o-mini');
}

async function callOpenAI(
  client: any, // OpenAI client
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    seed?: number;
    jsonSchema?: ReturnType<LiveSchema['toOpenAIJsonSchema']>;
  },
): Promise<string> {
  try {
    // Use structured outputs (json_schema) if model supports it and schema provided
    // Otherwise fall back to json_object mode
    const useStructuredOutputs =
      options?.jsonSchema && supportsStructuredOutputs(model);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      ...(options?.seed != null && { seed: options.seed }),
      response_format: useStructuredOutputs
        ? options.jsonSchema
        : { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '';

    // Check for refusal (structured outputs may include refusal field)
    if (useStructuredOutputs && (response as any).refusal) {
      throw new Error(
        `OpenAI refused the request (safety/content policy): ${(response as any).refusal}`,
      );
    }

    return content;
  } catch (error: any) {
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

async function extendRawData(config: ExtensionConfig): Promise<void> {
  console.log('🚀 Starting AI-powered raw data extension...\n');

  // 1. Initialize OpenAI client
  const openai = buildOpenAIClient();
  const model =
    config.model || process.env.REALMAP_OPENAI_MODEL || 'gpt-4-turbo-preview';
  console.log(`📡 Using OpenAI model: ${model}\n`);

  // 2. Determine data directories (same pattern as buildClusters for Docker compatibility)
  // Use REALMAP_DATA_DIR if set, else default to /app/data (Docker) or ./data (local)
  const defaultDataDir = fs.existsSync('/app/data')
    ? '/app/data'
    : path.resolve(process.cwd(), 'data');
  const dataDir = process.env.REALMAP_DATA_DIR
    ? path.resolve(process.env.REALMAP_DATA_DIR)
    : defaultDataDir;
  const rawDir = path.join(dataDir, 'raw');
  const extendedDir = path.resolve(dataDir, 'extended'); // All extended outputs go here

  console.log(`📁 Raw data directory: ${rawDir}`);
  console.log(`📁 Data directory: ${dataDir}`);
  console.log(`📁 Extended output directory: ${extendedDir}`);
  if (process.env.REALMAP_DATA_DIR) {
    console.log(`📁 (Mounted to host: ${process.env.REALMAP_DATA_DIR})`);
  }
  console.log();

  if (!fs.existsSync(rawDir)) {
    throw new Error(`Raw data directory not found: ${rawDir}`);
  }

  // 3. Load the single raw file (errors if file does not exist)
  const filename = config.file;
  console.log(`📂 Loading raw file: ${filename}...`);
  const places = loadRawDataFile(rawDir, filename);
  console.log(`✅ Loaded ${places.length} places from ${filename}\n`);

  // 3b. Load same-name extended file (e.g. data.serbia.extended.json) and build a fast map of extended city ids
  let basePlaces: Place[] = places;
  const extendedCityIds = new Set<string>();
  if (isExtendedFilePresent(extendedDir, filename)) {
    const existing = loadExistingExtendedFile(extendedDir, filename);
    if (existing && existing.length === places.length) {
      basePlaces = existing;
      for (const p of existing) {
        if ((p as any).extendedAt) extendedCityIds.add(p.id);
      }
      console.log(
        `♻️  Resuming: ${extendedCityIds.size}/${basePlaces.length} places already extended (Set lookup)\n`,
      );
    }
  }

  // 4. Load cluster results for context
  console.log('📊 Loading cluster context...');
  const clusterData = await loadClusterContext(dataDir);
  if (clusterData) {
    console.log('✅ Cluster context loaded\n');
  } else {
    console.log('⚠️  No cluster context found (continuing without it)\n');
  }

  // 5. Load canonical schemas
  console.log('📋 Loading canonical schemas...');
  const { ingredients: initialIngredients, methods: initialMethods } =
    loadCanonicalSchemas(dataDir);
  const liveSchema = new LiveSchema(
    initialIngredients,
    initialMethods,
    extendedDir,
  );
  console.log(
    `✅ Loaded ${liveSchema.getIngredients().length} ingredients, ${liveSchema.getMethods().length} methods\n`,
  );

  const normalizationRules = getNormalizationRules();
  const systemPrompt = buildSystemPrompt();

  // 6. Which places still need extending (O(1) skip via extendedCityIds from same-name .extended file)
  const citiesToExtend =
    config.skipExtended
      ? places.filter((p) => !extendedCityIds.has(p.id))
      : places;
  if (citiesToExtend.length === 0) {
    console.log(`⏭️  No places to extend in ${filename}`);
    return;
  }

  // Per-city (batch size 1) avoids API truncation; use --batch-size=N for speed
  const batchSize = config.batchSize ?? 1;
  const needsBatching = citiesToExtend.length > batchSize;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing ${filename}: ${citiesToExtend.length} places to extend`);
  const numBatches = Math.ceil(citiesToExtend.length / batchSize);
  if (batchSize === 1) {
    console.log(`📦 Per-city mode (1 place per API call, avoids truncation)`);
  } else {
    console.log(
      `📦 ${numBatches} batches (${batchSize} places per batch)`,
    );
  }
  console.log('='.repeat(60));

  const allExtended: ExtendedCity[] = [];
  const seed =
    process.env.REALMAP_OPENAI_SEED != null
      ? parseInt(process.env.REALMAP_OPENAI_SEED, 10)
      : 42;
  const jsonSchema = liveSchema.toOpenAIJsonSchema();
  const useStructured = supportsStructuredOutputs(model);
  if (useStructured) {
    console.log(
      `📐 Using structured outputs (JSON Schema) - response will match ExtensionResponse schema exactly`,
    );
  }

  // Process in batches if needed
  const batches: Place[][] = [];
  for (let i = 0; i < citiesToExtend.length; i += batchSize) {
    batches.push(citiesToExtend.slice(i, i + batchSize));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchNum = batchIdx + 1;
    const totalBatches = batches.length;

    console.log(
      `\n📦 Batch ${batchNum}/${totalBatches}: ${batch.length} places`,
    );

    try {
      const clusterContext = buildClusterContext(batch);
      const userPrompt = buildFilePrompt({
        sourceLabel: `${filename} (batch ${batchNum}/${totalBatches})`,
        cities: batch,
        clusterContext,
        canonicalIngredients: liveSchema.getIngredients(),
        canonicalMethods: liveSchema.getMethods(),
        requiredIngredientKeys: config.requiredIngredientKeys,
        requiredMethodKeys: config.requiredMethodKeys,
        normalizationRules,
      });

      console.log(`🤖 Calling OpenAI API...`);
      const response = await callOpenAI(
        openai,
        model,
        systemPrompt,
        userPrompt,
        {
          seed,
          jsonSchema,
        },
      );

      console.log(`✅ Response received, validating...`);
      let extended: ExtendedCity[];
      let proposedNewKeys: ExtensionResponse['proposedNewKeys'];
      try {
        const result = parseAndValidateResponse(response, {
          canonicalIngredients: liveSchema.getIngredients(),
          canonicalMethods: liveSchema.getMethods(),
          requiredIngredientKeys: config.requiredIngredientKeys,
          requiredMethodKeys: config.requiredMethodKeys,
          normalizationRules,
        });
        extended = result.cities;
        proposedNewKeys = result.proposedNewKeys;
      } catch (error: any) {
        // Save raw response for debugging when JSON parsing fails
        if (error.message?.includes('Invalid JSON response')) {
          const debugPath = path.join(
            extendedDir,
            `debug_response_batch_${batchNum}_${Date.now()}.json`,
          );
          fs.writeFileSync(debugPath, response, 'utf-8');
          console.error(
            `\n💾 Raw response saved to ${debugPath} for debugging\n`,
          );
        }
        throw error;
      }

      // Accumulate new keys from proposedNewKeys into live schema (shared across batches)
      if (proposedNewKeys) {
        if (proposedNewKeys.ingredients?.length) {
          const newIngredientKeys = proposedNewKeys.ingredients
            .map((p) => p.key)
            .filter((key) => !liveSchema.hasIngredient(key));
          if (newIngredientKeys.length > 0) {
            liveSchema.addIngredients(newIngredientKeys);
            console.log(
              `📝 Added ${newIngredientKeys.length} new ingredient keys to live schema`,
            );
          }
        }
        if (proposedNewKeys.cookingMethods?.length) {
          const newMethodKeys = proposedNewKeys.cookingMethods
            .map((p) => p.key)
            .filter((key) => !liveSchema.hasMethod(key));
          if (newMethodKeys.length > 0) {
            liveSchema.addMethods(newMethodKeys);
            console.log(
              `📝 Added ${newMethodKeys.length} new method keys to live schema`,
            );
          }
        }
        writeSchemaProposalsReport(extendedDir, filename, proposedNewKeys);
      }

      // Safety net: add any encountered keys to live schema
      for (const city of extended) {
        for (const key of Object.keys(city.ingredients || {})) {
          if (!liveSchema.hasIngredient(key)) liveSchema.addIngredients([key]);
        }
        for (const key of Object.keys(city.cookingMethods || {})) {
          if (!liveSchema.hasMethod(key)) liveSchema.addMethods([key]);
        }
      }

      allExtended.push(...extended);
      console.log(
        `✅ Batch ${batchNum}/${totalBatches} complete: ${extended.length} places extended`,
      );

      // Incremental write after each batch so we never lose progress on failure
      if (!config.dryRun) {
        const canonicalizedSoFar = applyCanonicalization(
          allExtended,
          normalizationRules,
        );
        const timestampedSoFar = addExtendedTimestamp(canonicalizedSoFar);
        const mergedSoFar = mergeExtendedData(basePlaces, timestampedSoFar);
        await writeExtendedDataFile(mergedSoFar, extendedDir, filename);
      }

      if (!config.dryRun) {
        liveSchema.writeExtendedSchemas();
      }
    } catch (error: any) {
      console.error(
        `❌ Error processing batch ${batchNum}/${totalBatches}:`,
        error.message,
      );
      throw error;
    }
  }

  // Merge all extended results (basePlaces = raw or resumed extended)
  const canonicalized = applyCanonicalization(allExtended, normalizationRules);
  const timestamped = addExtendedTimestamp(canonicalized);
  const merged = mergeExtendedData(basePlaces, timestamped);

  if (!config.dryRun) {
    await writeExtendedDataFile(merged, extendedDir, filename);
    liveSchema.writeExtendedSchemas();
    console.log(`\n✅ Successfully extended ${allExtended.length} places`);
    console.log(
      `💾 Extended schemas written (${liveSchema.getIngredients().length} ingredients, ${liveSchema.getMethods().length} methods)`,
    );
  } else {
    const extendedFilename = filename.replace(/\.json$/, '.extended.json');
    console.log(
      `\n✅ [DRY RUN] Would extend ${allExtended.length} places to ${extendedDir}/${extendedFilename}`,
    );
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`File: ${filename}`);
  console.log(`Places extended: ${allExtended.length}`);
  if (needsBatching) {
    console.log(`Batches processed: ${batches.length}`);
  }
  console.log(
    `Final schema: ${liveSchema.getIngredients().length} ingredients, ${liveSchema.getMethods().length} methods`,
  );
  console.log('='.repeat(60));
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => arg.startsWith('--file='));
  const filename = fileArg?.split('=')[1]?.trim();

  if (!filename) {
    console.error('❌ Missing required argument: --file=<filename>');
    console.error('   Example: --file=data.england.json');
    console.error('   File must exist under data/raw/');
    console.error(
      '   Options: --batch-size=N (default 1 = per-city), --model=MODEL, --dry-run, --force',
    );
    process.exit(1);
  }

  // Require .json
  if (!filename.endsWith('.json')) {
    console.error('❌ File must be a .json file (e.g. data.england.json)');
    process.exit(1);
  }

  const defaultDataDir = fs.existsSync('/app/data')
    ? '/app/data'
    : path.resolve(process.cwd(), 'data');
  const dataDir = process.env.REALMAP_DATA_DIR
    ? path.resolve(process.env.REALMAP_DATA_DIR)
    : defaultDataDir;
  const configPath = path.join(dataDir, 'config.json');

  const batchSizeArg = args.find((arg) => arg.startsWith('--batch-size='));
  let config: ExtensionConfig = {
    dryRun: args.includes('--dry-run'),
    file: filename,
    skipExtended: !args.includes('--force'),
    model: args.find((arg) => arg.startsWith('--model='))?.split('=')[1],
    batchSize: batchSizeArg
      ? parseInt(batchSizeArg.split('=')[1], 10)
      : undefined,
  };

  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        extend?: {
          requiredIngredientKeys?: string[];
          requiredMethodKeys?: string[];
        };
      };
      if (data.extend?.requiredIngredientKeys?.length)
        config.requiredIngredientKeys = data.extend.requiredIngredientKeys;
      if (data.extend?.requiredMethodKeys?.length)
        config.requiredMethodKeys = data.extend.requiredMethodKeys;
    } catch {
      // ignore
    }
  }

  if (config.dryRun) {
    console.log('⚠️  DRY RUN MODE: No files will be modified\n');
  }

  try {
    await extendRawData(config);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
