const GUILD_DEFAULT_CHANNEL_ID = '__pelibotti_guild_default__';

function normalizeChannelScopeId(channelId) {
  return channelId == null || channelId === GUILD_DEFAULT_CHANNEL_ID ? '' : channelId;
}

function getStoredChannelScopeId(channelId) {
  return channelId == null ? GUILD_DEFAULT_CHANNEL_ID : channelId;
}

module.exports = {
  GUILD_DEFAULT_CHANNEL_ID,
  getStoredChannelScopeId,
  normalizeChannelScopeId
};
