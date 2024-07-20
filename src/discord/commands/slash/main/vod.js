const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    apis: {},
    data: new SlashCommandBuilder()
        .setName('vod')
        .setDescription('Finds Twitch VOD link for a score')
        .addStringOption(option =>
            option.setName('score')
                .setRequired(true)
                .setDescription('osu score id or url')),
    async execute(interaction) {
        let scoreId = this.apis.osuApi.parseScoreId(interaction.options.getString('score'));

        if (!scoreId) {
            interaction.reply('Invalid score id or url');
            return;
        }

        interaction.deferReply();

        let score = await this.apis.osuApi.getScore({scoreId});

        if (score.timings) {
            await this.apis.twitchApi.getVod(score);

            if (score.vod) {
                interaction.followUp(score.vod.url);
                return;
            }
        }

        if (score.replyMessage) {
            interaction.followUp(score.replyMessage);
        } else {
            interaction.followUp('Something went wrong');
        }
    },
};
