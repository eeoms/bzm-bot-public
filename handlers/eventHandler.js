const commandHandler = require('./commandHandler');

module.exports = (client) => {
    client.on('interactionCreate', commandHandler);
};