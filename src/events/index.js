const readyEvent = require('./ready');
const interactionCreateEvent = require('./interactionCreate');

function registerEventHandlers(client) {
  for (const event of [readyEvent, interactionCreateEvent]) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

module.exports = {
  registerEventHandlers
};
