import fs from 'node:fs';
import { MongoClient } from 'mongodb';

const SYSTEM_DATABASES = new Set(['admin', 'config', 'local']);

function loadDotEnv(path = '.env') {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function uriFromEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function inspectMongo(label, uri, requestedDatabase) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  try {
    await client.connect();
    const databaseInfos = await client.db().admin().listDatabases();
    const databaseNames = requestedDatabase
      ? [requestedDatabase]
      : databaseInfos.databases
          .map((database) => database.name)
          .filter((name) => !SYSTEM_DATABASES.has(name));

    const databases = [];

    for (const databaseName of databaseNames) {
      const db = client.db(databaseName);
      const collections = await db.listCollections().toArray();
      const collectionReports = [];

      for (const collection of collections) {
        const model = db.collection(collection.name);
        const [documentCount, indexes] = await Promise.all([
          model.countDocuments({}),
          model.indexes(),
        ]);

        collectionReports.push({
          name: collection.name,
          documents: documentCount,
          indexes: indexes.map((index) => ({
            name: index.name,
            key: index.key,
            unique: Boolean(index.unique),
            sparse: Boolean(index.sparse),
            expireAfterSeconds: index.expireAfterSeconds,
          })),
        });
      }

      databases.push({
        name: databaseName,
        collections: collectionReports.sort((left, right) => left.name.localeCompare(right.name)),
      });
    }

    return {
      label,
      databaseCount: databases.length,
      databases: databases.sort((left, right) => left.name.localeCompare(right.name)),
    };
  } finally {
    await client.close();
  }
}

function collectionKey(database, collection) {
  return `${database.name}.${collection.name}`;
}

function compareReports(source, target) {
  const sourceCollections = new Map();
  const targetCollections = new Map();

  for (const database of source.databases) {
    for (const collection of database.collections) {
      sourceCollections.set(collectionKey(database, collection), collection);
    }
  }

  for (const database of target.databases) {
    for (const collection of database.collections) {
      targetCollections.set(collectionKey(database, collection), collection);
    }
  }

  const mismatches = [];
  const keys = [...new Set([...sourceCollections.keys(), ...targetCollections.keys()])].sort();

  for (const key of keys) {
    const sourceCollection = sourceCollections.get(key);
    const targetCollection = targetCollections.get(key);

    if (!sourceCollection || !targetCollection) {
      mismatches.push({
        collection: key,
        sourceDocuments: sourceCollection?.documents ?? null,
        targetDocuments: targetCollection?.documents ?? null,
        reason: 'collection_missing',
      });
      continue;
    }

    if (sourceCollection.documents !== targetCollection.documents) {
      mismatches.push({
        collection: key,
        sourceDocuments: sourceCollection.documents,
        targetDocuments: targetCollection.documents,
        reason: 'document_count_mismatch',
      });
    }

    if (sourceCollection.indexes.length !== targetCollection.indexes.length) {
      mismatches.push({
        collection: key,
        sourceIndexes: sourceCollection.indexes.length,
        targetIndexes: targetCollection.indexes.length,
        reason: 'index_count_mismatch',
      });
    }
  }

  return mismatches;
}

function printReport(report) {
  console.log(`${report.label}: databases=${report.databaseCount}`);
  for (const database of report.databases) {
    console.log(`\n${database.name}: collections=${database.collections.length}`);
    for (const collection of database.collections) {
      console.log(
        `  ${collection.name}: documents=${collection.documents} indexes=${collection.indexes.length}`,
      );
      for (const index of collection.indexes) {
        const flags = [
          index.unique ? 'unique' : '',
          index.sparse ? 'sparse' : '',
          index.expireAfterSeconds !== undefined ? `ttl=${index.expireAfterSeconds}` : '',
        ]
          .filter(Boolean)
          .join(',');
        console.log(`    - ${index.name} ${JSON.stringify(index.key)}${flags ? ` (${flags})` : ''}`);
      }
    }
  }
}

loadDotEnv();

try {
  const database = argValue('--database') ?? process.env.MONGODB_DATABASE ?? process.env.MONGO_DB_NAME;
  const sourceEnv = argValue('--source-env');
  const targetEnv = argValue('--target-env');

  if (sourceEnv && targetEnv) {
    const source = await inspectMongo('source', uriFromEnv(sourceEnv), database);
    const target = await inspectMongo('target', uriFromEnv(targetEnv), database);
    printReport(source);
    console.log('\n---');
    printReport(target);

    const mismatches = compareReports(source, target);
    if (mismatches.length > 0) {
      console.error('\nMismatches:');
      console.error(JSON.stringify(mismatches, null, 2));
      process.exitCode = 1;
    } else {
      console.log('\nComparison OK: document and index counts match.');
    }
  } else {
    const envName =
      argValue('--uri-env') ?? (process.env.MONGODB_URI ? 'MONGODB_URI' : 'MONGO_URI');
    const report = await inspectMongo(envName, uriFromEnv(envName), database);
    printReport(report);
  }
} catch (error) {
  console.error(`Mongo audit failed: ${error.name}: ${error.message}`);
  process.exitCode = 1;
}
