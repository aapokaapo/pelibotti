const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { getDatabaseProvider } = require('../src/utils/env');

const provider = getDatabaseProvider();
const prismaArguments = process.argv.slice(2);
const schemaPath = provider === 'sqlite'
  ? 'prisma/schema.sqlite.prisma'
  : 'prisma/schema.prisma';
const hasSchemaArgument = prismaArguments.some((argument) => argument === '--schema' || argument.startsWith('--schema='));
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'prisma',
    ...prismaArguments,
    ...(hasSchemaArgument ? [] : [`--schema=${schemaPath}`])
  ],
  {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit'
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
