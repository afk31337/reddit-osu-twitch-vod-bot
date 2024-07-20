const Service = require('../service');
const { Client, Events, GatewayIntentBits, Partials, Collection, REST, Routes} = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
});
const config = require('../../config.json');
const fs = require('node:fs');
const path = require('node:path');
client.slashCommands = new Collection();
client.chatCommands = new Collection();

class DiscordService extends Service {
    constructor(publicDB, privateDB) {
        super('discord', publicDB, privateDB);
    }

    async setup(redditApi, osuApi, twitchApi) {
        if (!config.discord.api.token) {
            return;
        }

        this.apis = {redditApi, osuApi, twitchApi};

        try {
            await client.login(config.discord.api.token);

            client.once(Events.ClientReady, c => {
                this.print(`Ready! Logged in as ${c.user.tag}`);

                this.loadChatCommands();
                this.loadSlashCommands();

                c.users.fetch(config.discord.creatorId).then((user) => {
                    this.creator = user;

                    process.on('unhandledRejection', (error) => {
                        this.creator.send(`Error: ${error.message}`);
                    });
                }).catch(error => console.error(error));
            });
        } catch (error) {
            console.error(error);
            this.print('Error starting discord. Exiting...');
            process.exit(1);
        }
    }

    loadChatCommands() {
        for (const command of this.parseCommandFiles('chat')) {
            if ('data' in command.class && 'execute' in command.class) {
                client.chatCommands.set(command.class.data.name, command.class);
                this.print(`Chat command ${command.class.data.name} loaded`);
            } else {
                this.onError(`[WARNING] The command ${command.filePath} is missing a required "data" or "execute" property.`);
            }
        }

        client.on(Events.MessageCreate, async (message) => {
            if (!message.content.startsWith(config.discord.commandSymbol)) {
                return;
            }

            const commandName = message.content.substring(config.discord.commandSymbol.length).split(' ')[0];
            const params = message.content.substring(config.discord.commandSymbol.length + commandName.length + 1).split(' ');
            const command = client.chatCommands.get(commandName);

            if (command) {
                try {
                    await command.execute(this.apis, message, ...params);
                } catch (error) {
                    this.onError(error);
                    await message.reply('There was an error while executing this command.');
                }
            }
        });
    }

    loadSlashCommands() {
        const commands = [];

        for (const command of this.parseCommandFiles('slash')) {
            if ('data' in command.class && 'execute' in command.class) {
                command.class.apis = this.apis;
                client.slashCommands.set(command.class.data.name, command.class);
                this.print(`Slash command ${command.class.data.name} loaded`);
                commands.push(command.class.data.toJSON());
            } else {
                this.onError(`[WARNING] The command ${command.filePath} is missing a required "data" or "execute" property.`);
            }
        }

        (async () => {
            try {
                const rest = new REST().setToken(config.discord.api.token);
                await rest.put(
                    Routes.applicationGuildCommands(config.discord.api.clientId, config.discord.guildIds[0]),
                    { body: commands },
                );
            } catch (error) {
                this.onError(error);
            }
        })();

        client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const command = client.slashCommands.get(interaction.commandName);

            try {
                await command.execute(interaction);
            } catch (error) {
                this.onError(error);

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command.', ephemeral: true });
                }
            }
        });
    }

    parseCommandFiles(type) {
        const commands = [];
        const foldersPath = path.join(__dirname, `../discord/commands/${type}`);
        const commandFolders = fs.readdirSync(foldersPath);

        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                commands.push({class: require(filePath), filePath});
            }
        }

        return commands;
    }

    onError(error) {
        console.error(error);

        if (this.creator) {
            this.creator.send('error: ' + (error.message ?? error));
        }
    }
}

module.exports = DiscordService;