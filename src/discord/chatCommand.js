const config = require('../../config.json');

class ChatCommand {

    name = '';
    params = [];

    setName = (name) => {
        this.name = name;
        return this;
    }

    setParams = (params = []) => {
        this.params = params;
        return this;
    }

    missingParams = (message) => {
        message.reply(
            `Usage: ${config.discord.commandSymbol}${this.name} ${this.params.map((param)=> `{${param}}`).join(' ')}`
        );
    }

    isAdmin(message) {
        return config.discord.adminIds.includes(message.author.id) || this.isOwner(message.author.id);
    }

    isOwner(message) {
        return message.author.id === config.discord.ownerId;
    }
}

module.exports = ChatCommand;