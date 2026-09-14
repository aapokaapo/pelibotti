const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DATABASE_URL', 'ADMIN_API_KEY'];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function getTimezone() {
  return process.env.BOT_TIMEZONE || 'UTC';
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
  return typeof candidate === 'string' && candidate.length > 0 && candidate === process.env.ADMIN_API_KEY;
}

module.exports = {
  getBotInviteUrl,
  getTimezone,
  getWebPort,
  isAdminKeyValid,
  validateEnv
};
