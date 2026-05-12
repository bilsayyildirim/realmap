/* --------------------------------------------------------------------
   correctPlaceIds.ts – 🔧 Correct Place IDs from Data Files
   --------------------------------------------------------------------
   Reads all JSON files from data/raw/ and updates place IDs based on
   name, continent, countryCode, and region (excluding id from key generation).
   ------------------------------------------------------------------ */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface Place {
  id?: string;
  name?: string;
  continent?: string;
  countryCode?: string;
  region?: string;
  [key: string]: unknown;
}

interface CorrectionResult {
  file: string;
  total: number;
  updated: number;
  failed: number;
  failedIds: string[];
}

/**
 * Creates a deterministic key from place properties (excluding id)
 */
function createPlaceKey(place: Place): string | null {
  const parts: string[] = [];

  if (place.name) {
    parts.push(place.name.trim());
  }

  if (place.continent) {
    parts.push(place.continent.trim());
  }

  if (place.countryCode) {
    parts.push(place.countryCode.trim());
  }

  if (place.region) {
    parts.push(place.region.trim());
  }

  // Filter out empty strings
  const validParts = parts.filter((p) => p.length > 0);

  if (validParts.length === 0) {
    return null;
  }

  // Join with double underscore to match pattern like "ES-MAD__madrid"
  return validParts.join('__').toLowerCase().replace(/\s+/g, '_');
}

/**
 * Processes a single JSON file
 */
function processFile(filePath: string): CorrectionResult {
  const fileName = path.basename(filePath);
  const result: CorrectionResult = {
    file: fileName,
    total: 0,
    updated: 0,
    failed: 0,
    failedIds: [],
  };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Check if data is an array
    if (!Array.isArray(data)) {
      console.error(`❌ ${fileName}: Not an array, skipping`);
      return result;
    }

    result.total = data.length;
    let hasChanges = false;

    // Process each place
    for (let i = 0; i < data.length; i++) {
      const place = data[i] as Place;

      // Validate required fields
      if (!place.id || !place.name) {
        console.error(
          `❌ ${fileName}[${i}]: Missing required field (id: ${!!place.id}, name: ${!!place.name})`,
        );
        result.failed++;
        if (place.id) {
          result.failedIds.push(place.id);
        } else if (place.name) {
          result.failedIds.push(`<no-id>:${place.name}`);
        } else {
          result.failedIds.push(`<no-id>:<no-name>`);
        }
        continue;
      }

      // Create new key from place properties
      const newKey = createPlaceKey(place);

      if (!newKey) {
        console.error(
          `❌ ${fileName}[${i}]: Could not generate key for place (id: ${place.id}, name: ${place.name})`,
        );
        result.failed++;
        result.failedIds.push(place.id);
        continue;
      }

      // Update id if different
      if (place.id !== newKey) {
        place.id = newKey;
        hasChanges = true;
        result.updated++;
      }
    }

    // Write back if there were changes
    if (hasChanges) {
      fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2) + '\n',
        'utf-8',
      );
    }
  } catch (error) {
    console.error(`❌ ${fileName}: Error processing file:`, error);
    result.failed = result.total;
  }

  return result;
}

/**
 * Main function
 */
function main(): void {
  // Use the same path pattern as buildClusters
  // In Docker: /app/data/raw
  // Locally: fallback to process.cwd()/data/raw
  const rawDataDir =
    process.env.REALMAP_DATA_DIR
      ? path.join(process.env.REALMAP_DATA_DIR, 'raw')
      : fs.existsSync('/app/data/raw')
        ? '/app/data/raw'
        : path.join(process.cwd(), 'data', 'raw');

  if (!fs.existsSync(rawDataDir)) {
    console.error(`❌ Directory not found: ${rawDataDir}`);
    process.exit(1);
  }

  // Find all JSON files
  const files = fs
    .readdirSync(rawDataDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(rawDataDir, f));

  if (files.length === 0) {
    console.error(`❌ No JSON files found in ${rawDataDir}`);
    process.exit(1);
  }

  console.log(`📁 Found ${files.length} JSON file(s) to process\n`);

  const allResults: CorrectionResult[] = [];
  let totalPlaces = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const allFailedIds: string[] = [];

  // Process each file
  for (const file of files) {
    const result = processFile(file);
    allResults.push(result);
    totalPlaces += result.total;
    totalUpdated += result.updated;
    totalFailed += result.failed;
    allFailedIds.push(...result.failedIds);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  for (const result of allResults) {
    if (result.updated > 0 || result.failed > 0) {
      console.log(
        `\n${result.file}: ${result.total} places, ${result.updated} updated, ${result.failed} failed`,
      );
      if (result.failedIds.length > 0) {
        console.log(`  Failed IDs: ${result.failedIds.join(', ')}`);
      }
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total places: ${totalPlaces}`);
  console.log(`✅ Successfully updated: ${totalUpdated}`);
  console.log(`❌ Failed: ${totalFailed}`);

  if (allFailedIds.length > 0) {
    console.log(`\n❌ Failed IDs (${allFailedIds.length}):`);
    allFailedIds.forEach((id) => console.log(`  - ${id}`));
  }

  console.log('\n' + '='.repeat(60));

  if (totalFailed > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

