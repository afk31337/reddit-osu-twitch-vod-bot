const Service = require('../service');
const config = require('../../config.json');
const axios = require('axios');
const fs = require('fs');
const streamZip = require('node-stream-zip');
const moment = require('moment');

class OsuService extends Service {
    constructor(publicDB, privateDB) {
        super('osu', publicDB, privateDB);
    }

    buildOauthRequest() {
        return this.axios.post('https://osu.ppy.sh/oauth/token', {
            client_id: config.osu.api.client_id,
            client_secret: config.osu.api.client_secret,
            grant_type: 'client_credentials',
            scope: 'public',
        });
    }

    async getScores(comments) {
        const duplicates = [];
        const scores = [];

        await this.buildHeaders();

        for (const comment of comments) {
            const duplicate = duplicates.find(duplicate =>
                duplicate.player.osu_id === comment.player.osu_id
                && duplicate.beatMapId === comment.beatMapId
                && duplicate.comment.id !== comment.comment.id
                && this.accuracyMatches(duplicate.accuracy, comment.accuracy)
            );

            if (duplicate && duplicate.timings) {
                comment.comment.duplicateId = duplicate.comment.id;
                scores.push(comment);
            } else {
                await axios.get(
                    'https://osu.ppy.sh/api/v2/users/' + comment.player.osu_id + '/scores/recent?mode=osu&limit=' + config.osu.limit,
                    this.headers
                ).then(async (res) => {
                    let found = false;

                    if (res.data.length) {
                        await this.checkIfNameChanged(comment, res.data[0].user.username);
                    }

                    for (const score of res.data) {
                        if (score['beatmap']['id'] === comment.beatMapId) {
                            if (!comment.accuracy || this.accuracyMatches(score['accuracy'] * 100, comment.accuracy)) {
                                comment.timings = await this.getTimings(comment, score);
                                comment.score_id = score['id'];

                                found = true;
                                break;
                            }
                        }
                    }

                    if (!found) {
                        await this.log('osu score not found', comment.comment.id, comment.comment.threadId, comment.player.osu_id, comment.score_id);
                    } else {
                        scores.push(comment);
                    }
                });

                duplicates.push(comment);
                await this.delay();
            }
        }

        return scores;
    }

    async checkIfNameChanged(comment, username) {
        if (comment.player.osu_name !== username && await this.publicDB.find('players', comment.player.id).osu_name !== username) {
            await this.publicDB.update('players', comment.player.id, {osu_name: username});
            this.print(comment.player.osu_name + "'s osu name has changed to: " + username);
        }
    }

    async getTimings(comment, score) {
        const beatmapID = score.beatmap.id;
        let mapLength = score.beatmap.hit_length;
        let map = await this.privateDB.find('maps', beatmapID);

        if (map) {
            this.print('existing map length: ' + map.length + ' vs ' +mapLength);
            mapLength = map.length;
        } else {
            await this.downloadMap(score.beatmap.beatmapset_id, beatmapID, score.beatmap.version);
            await this.delay();
            map = await this.privateDB.find('maps', beatmapID);
            if (map) {
                this.print('downloaded map length: ' + map.length + ' vs ' +mapLength);
                mapLength = map.length;
            } else {
                this.print('map download failed: ' + beatmapID);
            }
        }

        mapLength = this.getMapLength(mapLength, score.mods);
        return {
            mapLength,
            startTime: new moment(score.created_at).subtract(mapLength, 'seconds'),
        };
    }

    accuracyMatches(accuracy1, accuracy2) {
        return (accuracy1 > accuracy2 * 0.99 && accuracy1 < accuracy2 * 1.01);
    }

    getMapLength(totalLength, mods) {
        if (mods.includes('DT') || mods.includes('NC')) {
            return Math.round(totalLength / 1.5);
        }

        if (mods.includes('HT')) {
            return Math.round(totalLength / 0.75);
        }

        return totalLength;
    }

    //osu api's beatmap_length includes skippable intros which players usually skip and that messes up the timings so we have to download the map to get more accurate map length
    async downloadMap(beatmapSetID, beatmapID, version) {
        this.print('downloading mapset:' + beatmapSetID);
        return await axios.get('https://api.chimu.moe/v1/download/' + beatmapSetID, {responseType: 'arraybuffer'}).then(async (res) => {
            await fs.writeFileSync(`./temp/${beatmapSetID}.osz`, res.data);
            const zip = new streamZip({ file: `./temp/${beatmapSetID}.osz` });

            try {
                zip.on('ready', async () => {
                    for (const entry of Object.values(zip.entries())) {
                        if (entry.name.endsWith('.osu')) {
                            const data = zip.entryDataSync(entry).toString();
                            const info = this.getMapInfo(data, beatmapID, beatmapSetID, version);

                            if (info) {
                                await this.privateDB.insert('maps', {
                                    id: info.beatmapID,
                                    beatmap_set_id: info.beatmapSetID,
                                    start_time: info.startTime,
                                    end_time: info.endTime,
                                    length: Math.round((info.endTime - info.startTime) / 1000),
                                }).then(() => {
                                    this.print('inserted map: ' + info.beatmapID);
                                }).catch(() => {
                                    this.print('failed to insert map: ' + info.beatmapID);
                                });
                            } else {
                                this.print('failed to get map info: ' + beatmapID);
                            }
                        }
                    }
                    zip.close();
                    fs.unlinkSync(`./temp/${beatmapSetID}.osz`);
                });
            } catch (error) {
                console.error(error);
                fs.unlinkSync(`./temp/${beatmapSetID}.osz`);
            }
        }).catch((error) => {
            this.print(`map ${beatmapSetID} download failed: ${error.message}`);
        });
    }

    getMapInfo(data, mainBeatmapID, mainBeatmapSetID, mainVersion) {
        //https://osu.ppy.sh/wiki/en/Client/File_formats/Osu_(file_format)
        try {
            let beatmapID = this.getMapParameter(data, 'BeatmapID');
            let beatmapSetID = this.getMapParameter(data, 'BeatmapSetID');

            if ((!beatmapID && beatmapID < 2) || (!beatmapSetID && beatmapSetID < 2)) {
                const version = this.getMapParameter(data, 'Version');

                if (version === mainVersion) {
                    beatmapID = mainBeatmapID;
                    beatmapSetID = mainBeatmapSetID;
                } else {
                    return null;
                }
            }

            const hitObjects = data.split('[HitObjects]')[1].split('\n');
            const startTime = parseInt(hitObjects[1].split(',')[2]);
            const lastObject = hitObjects[hitObjects.length - 2].split(',');
            //object type 3 = spinner
            const endTime = parseInt(lastObject[lastObject[3] === '3' ? 4 : 2]);

            return {
                beatmapID,
                beatmapSetID,
                startTime: startTime,
                endTime: endTime,
            };
        } catch (e) {
            console.error(e);
            this.print('map info could not be parsed: ' + mainBeatmapID);
            return null;
        }
    }

    getMapParameter(data, parameter) {
        if (data.includes(parameter + ':')) {
            return data.split(parameter + ':')[1].split('\n')[0].replace('\r', '');
        }
        return null;
    }

    async isPlayerTracked(osuId, twitchName) {
        return await this.publicDB.findByColumn('players', 'osu_id', osuId)
            || await this.publicDB.findByColumn('players', 'twitch_name', twitchName);
    }

    async getPlayerName(osuId) {
        return await axios.get(`https://osu.ppy.sh/api/v2/users/${osuId}`, this.headers).then(async (res) => {
            return res.data.username;
        }).catch(() => {
            return false;
        });
    }
}

module.exports = OsuService;