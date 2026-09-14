const crypto = require('node:crypto');

const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DATABASE_URL', 'ADMIN_API_KEY'];
const SUPPORTED_DATABASE_PROVIDERS = new Set(['postgresql', 'sqlite']);
const DEFAULT_AUTO_SCHEDULE_CRON = '0 12 * * 0';

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  getDatabaseProvider();
}

function getDatabaseProvider() {
  const provider = process.env.DATABASE_PROVIDER || 'postgresql';

  if (!SUPPORTED_DATABASE_PROVIDERS.has(provider)) {
    throw new Error(`DATABASE_PROVIDER must be one of: ${[...SUPPORTED_DATABASE_PROVIDERS].join(', ')}`);
  }

  return provider;
}

function getTimezone() {
  return process.env.BOT_TIMEZONE || 'UTC';
}

function getAutoScheduleCron() {
  return process.env.AUTO_SCHEDULE_CRON || DEFAULT_AUTO_SCHEDULE_CRON;
}

function getWebPort() {
  const port = Number.parseInt(process.env.WEB_PORT || '3000', 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('WEB_PORT must be a valid TCP port number.');
  }

  return port;
}

function getBotInviteUrl() {
  const permissions = process.env.DISCORD_BOT_PERMISSIONS || '274877991936';
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    permissions,
    scope: 'bot applications.commands'
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function isAdminKeyValid(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }

  const expected = Buffer.from(process.env.ADMIN_API_KEY || '', 'utf8');
  const received = Buffer.from(candidate, 'utf8');

  if (expected.length === 0) {
    return false;
  }

  if (received.length !== expected.length) {
    const padded = Buffer.alloc(expected.length);
    received.copy(padded, 0, 0, Math.min(received.length, expected.length));
    crypto.timingSafeEqual(expected, padded);
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

module.exports = {
  getBotInviteUrl,
  getAutoScheduleCron,
  getDatabaseProvider,
  getTimezone,
  getWebPort,
  isAdminKeyValid,
  validateEnv
};
