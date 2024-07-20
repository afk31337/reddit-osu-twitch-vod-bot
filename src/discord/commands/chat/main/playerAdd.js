const ChatCommand = require("../../../chatCommand");
const {EmbedBuilder} = require("discord.js");

const chatCommand = new ChatCommand()
    .setName('player:add')
    .setParams(['osu_id', 'twitch_name']);

module.exports = {
    data: chatCommand,
    execute: async (apis, message, osuId, twitchName) => {
        if (!osuId) {
            return chatCommand.missingParams(message);
        }

        if (!chatCommand.isAdmin(message)) {
            return;
        }

        if (await apis.osuApi.isPlayerTracked(osuId, twitchName)) {
            message.reply('Player already tracked');
        } else {
            let osuName = await apis.osuApi.getPlayerName(osuId);

            if (!osuName) {
                message.reply('Invalid osu id');
            } else {
                const player = await apis.twitchApi.addPlayer(osuId, osuName, twitchName);

                if (!player) {
                    message.reply('Invalid twitch name');
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(0xedaabb)
                        .setTitle('Player added')
                        .addFields({ name: ' ', value: `osu id: ${player.osu_id}` })
                        .addFields({ name: ' ', value: `osu name: ${player.osu_name}` })
                        .addFields({ name: ' ', value: `twitch id: ${player.twitch_id}` })
                        .addFields({ name: ' ', value: `twitch name: ${player.twitch_name}` });
                    await message.reply({ embeds: [embed] });
                }
            }
        }
    },
};