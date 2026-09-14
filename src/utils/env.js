const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'DATABASE_URL'];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function getTimezone() {
  return process.env.BOT_TIMEZONE || 'UTC';
}

module.exports = {
  getTimezone,
  validateEnv
};
