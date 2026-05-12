import { Client } from '@elastic/elasticsearch';
import { IndexName } from '../../types';
import { clustersMapping } from './mappings/clusters';

const mappings = {
  [IndexName.CLUSTERS]: clustersMapping,
};

export async function buildIndices(client: Client): Promise<void> {
  for (const [indexName, mapping] of Object.entries(mappings)) {
    const indexExists = await client.indices.exists({ index: indexName });
    if (indexExists) {
      console.log(`Index ${indexName} already exists`);
    } else {
      console.log(`Creating index ${indexName}`);
      await client.indices.create(mapping);
    }
  }
}
