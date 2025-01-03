const ChatCommand = require("../../../chatCommand");

const chatCommand = new ChatCommand()
    .setName('vod')
    .setParams(['score_id']);

module.exports = {
    data: chatCommand,
    execute: async (apis, message, scoreId) => {
        if (!scoreId) {
            return chatCommand.missingParams(message);
        }

        scoreId = apis.osuApi.parseScoreId(scoreId);

        if (!scoreId) {
            message.reply('Invalid score id or url');
            return;
        }

        let score = await apis.osuApi.getScore({scoreId});

        if (score.timings) {
            await apis.twitchApi.getVod(score);

            if (score.vod) {
                message.reply(score.vod.url);
                return;
            }
        }

        if (score.replyMessage) {
            message.reply(score.replyMessage);
        } else {
            message.reply('Something went wrong');
        }
    },
};