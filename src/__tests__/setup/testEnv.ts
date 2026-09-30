// Runs before any module import in every test file.
// Provides the minimum env vars needed for tests without a real .env file.
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.META_WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
process.env.META_GRAPH_API_VERSION = 'v19.0';
process.env.ASSEMBLYAI_API_KEY = 'test-assemblyai-key';

// Pin to MongoDB 6.x — compatible with mongoose 9 / mongodb-driver 6.
// The binary is cached in node_modules/.cache/mongodb-memory-server/ and
// does not re-download between runs.
process.env.MONGOMS_VERSION = '6.0.14';
