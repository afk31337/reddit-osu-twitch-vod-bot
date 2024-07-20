const ChatCommand = require("../../../chatCommand");
const {EmbedBuilder} = require("discord.js");

const chatCommand = new ChatCommand()
    .setName('logs')
    .setParams([]);

module.exports = {
    data: chatCommand,
    execute: async (apis, message) => {
        if (!chatCommand.isAdmin(message)) {
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0xedaabb);

        apis.osuApi.getLogs().forEach(log => {
            embed.addFields({ name: ' ', value: log })
        });

        await message.reply({ embeds: [embed] });
    },
};