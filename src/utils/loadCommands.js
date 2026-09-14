const fs = require('node:fs');
const path = require('node:path');

function loadCommands() {
  const commandsDirectory = path.join(__dirname, '..', 'commands');
  const categories = fs.readdirSync(commandsDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const commands = [];

  for (const category of categories) {
    const categoryDirectory = path.join(commandsDirectory, category.name);
    const commandFiles = fs.readdirSync(categoryDirectory).filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(path.join(categoryDirectory, file));
      commands.push(command);
    }
  }

  return commands;
}

module.exports = {
  loadCommands
};
