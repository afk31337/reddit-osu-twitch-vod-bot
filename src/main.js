const fs = require('fs');
const path = require('node:path');
let config = {};

async function start() {
    loadConfig();

    const database = require('./database');
    const privateDB = new database('private');
    const publicDB = new database('public');

    await publicDB.open();
    await privateDB.open();
    await privateDB.migrate();

    const redditService = require('./services/redditService');
    const redditApi = new redditService(publicDB, privateDB);
    await redditApi.buildHeaders();

    const osuService = require('./services/osuService');
    const osuApi = new osuService(publicDB, privateDB);
    await osuApi.buildHeaders();

    const twitchService = require('./services/twitchService');
    const twitchApi = new twitchService(publicDB, privateDB);
    await twitchApi.buildHeaders();

    await processCommands(redditApi, osuApi, twitchApi);

    while(true) {
        redditApi.setStatus('running');

        const comments = await redditApi.getComments();

        if (comments.length) {
            const scores = await osuApi.getScores(comments);

            if (scores.length) {
                const vods = await twitchApi.getVods(scores);

                if (vods.length) {
                    await redditApi.postComments(vods);
                }
            }
        }

        const queuedVods = await twitchApi.getVodQueue();
        if (queuedVods.length) {
            await redditApi.postComments(queuedVods);
        }

        await sleep(redditApi);
    }
}

function loadConfig() {
    process.stdout.write('starting...');
    if (!fs.existsSync(path.join(__dirname, '../config.json'))) {
        console.error('config.json not found. check README');
        console.log('exiting...');
        process.exit(1);
    }
    config = require('../config.json');
}

async function sleep(api) {
    for (let secondsLeft = config.update_frequency; secondsLeft > 0; secondsLeft--) {
        api.setStatus(`sleeping for ${secondsLeft}s`);
        await api.delay(1000);
    }
}

async function processCommands(redditApi, osuApi, twitchApi) {
    if (process.argv[2] === 'player:add') {
        if (!process.argv[3] || !process.argv[4]) {
            osuApi.print('usage: player:add {osu_id} {twitch_name}');
        } else {
            const osuId = process.argv[3];
            const twitchName = process.argv[4];

            if (await osuApi.isPlayerTracked(osuId, twitchName)) {
                osuApi.print('player already tracked');
            } else {
                let osuName = await osuApi.getPlayerName(osuId);

                if (!osuName) {
                    osuApi.print('invalid osu id');
                } else {
                    const player = await twitchApi.addPlayer(osuId, osuName, twitchName)

                    if (!player) {
                        osuApi.print('invalid twitch name');
                    } else {
                        osuApi.print(`player added`);
                        osuApi.print(`osu id: ${player.osu_id}`);
                        osuApi.print(`osu name: ${player.osu_name}`);
                        osuApi.print(`twitch id: ${player.twitch_id}`);
                        osuApi.print(`twitch name: ${player.twitch_name}`);
                    }
                }
            }
        }
    }
}

process.on('unhandledRejection', (error) => {
    console.error(error);
    console.log('exiting...');
    process.exit(1);
});

start();
