const ChatCommand = require("../../../chatCommand");

const chatCommand = new ChatCommand()
    .setName('history:delete')
    .setParams(['comment_id']);

module.exports = {
    data: chatCommand,
    execute: async (apis, message, commentId) => {
        if (!commentId) {
            return chatCommand.missingParams(message);
        }

        if (!chatCommand.isAdmin(message)) {
            return;
        }

        let result = await apis.osuApi.privateDB.deleteByColumn('history', 'comment_id', commentId);

        message.reply('Deleted history entries: ' + result.changes);
    },
};