const Service = require('../service');
const config = require('../../config.json');
const moment = require('moment');
let vodQueueTimestamp = moment().add(config.twitch.vod_queue_update_frequency, 'seconds');

class TwitchService extends Service {
    constructor(publicDB, privateDB) {
        super('twitch', publicDB, privateDB);
    }

    buildOauthRequest() {
        return this.axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: config.twitch.api.client_id,
            client_secret: config.twitch.api.client_secret,
            grant_type: 'client_credentials',
        });
    }

    async buildHeaders() {
        const token = await this.getOauthToken();
        this.headers.headers = {
            Authorization: 'Bearer ' + token.token,
            'Client-Id': config.twitch.api.client_id,
        };
    }

    async getVods(scores) {
        const videos = [];

        await this.buildHeaders();

        for (const score of scores) {
            if (score.comment.duplicateId) {
                const duplicate = scores.find(duplicate => duplicate.comment.id === score.comment.duplicateId);
                if (duplicate && duplicate.vod) {
                    score.vod = duplicate.vod;
                    videos.push(score);
                }
            } else {
                await this.axios.get('https://api.twitch.tv/helix/videos?type=archive&user_id=' + score.player.twitch_id, this.headers).then(async (res) => {
                    let found = false;
                    let lastStreamDate = null;

                    if (res.data.data.length) {
                        await this.checkIfNameChanged(score, res.data.data[0].user_login);
                        lastStreamDate = res.data.data[0].created_at;
                    }

                    for (let vod of res.data.data) {
                        score.vod = this.getVodData(score.timings.startTime, vod);
                        if (score.vod) {
                            videos.push(score);
                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        await this.log('twitch video not found', score.comment.id, score.comment.threadId, score.player.osu_id, score.score_id);

                        if (lastStreamDate && moment(lastStreamDate).isAfter(moment().subtract(14, 'days'))) {
                            if (await this.isLive(score)) {
                                score.vod = {shouldTrack: true};
                                videos.push(score);

                                await this.privateDB.insert('vod_trackers', {
                                    thread_id: score.comment.threadId,
                                    twitch_id: score.player.twitch_id,
                                    timestamp: score.timings.startTime.format('YYYY-MM-DD HH:mm:ss'),
                                    expires_at: moment().add(config.twitch.vod_track_expiration_hours, 'hours').format('YYYY-MM-DD HH:mm:ss'),
                                    data: JSON.stringify(score),
                                });
                                this.print(score.comment.id + ': added vod tracker');
                            } else {
                                this.print(score.comment.id + ': not live');
                            }
                            await this.delay();
                        }
                    }
                });
                await this.delay();
            }
        }

        return videos.filter(video => !video.vod.shouldTrack);
    }

    async getVod(score) {
        await this.axios.get('https://api.twitch.tv/helix/videos?type=archive&user_id=' + score.player.twitch_id, this.headers).then(async (res) => {
            let found = false;

            if (res.data.data.length) {
                await this.checkIfNameChanged(score, res.data.data[0].user_login);
            }

            for (let vod of res.data.data) {
                score.vod = this.getVodData(score.timings.startTime, vod);
                if (score.vod) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                score.replyMessage = 'Vod not found';
            }

            return score;
        });
    }

    async checkIfNameChanged(score, username) {
        if (score.player.twitch_name !== username && await this.publicDB.find('players', score.player.id).twitch_name !== username) {
            await this.publicDB.update('players', score.player.id, {twitch_name: username});
            this.print(score.player.twitch_name + "'s twitch name has changed to: " + username);
        }
    }

    getVodData(scoreStartTime, video) {
        const vodStartTime = new moment(video['created_at']);
        let duration = video['duration'];
        let durationSeconds = 0;

        if (duration.includes('h')) {
            durationSeconds += parseInt(duration.split('h')[0]) * 60 * 60;
            duration = duration.split('h')[1];
        }

        if (duration.includes('m')) {
            durationSeconds += parseInt(duration.split('m')[0]) * 60;
            duration = duration.split('m')[1];
        }

        if (duration.includes('s')) {
            durationSeconds += parseInt(duration.split('s')[0]);
        }

        const endDatetime = new moment(vodStartTime).add(durationSeconds + 30, 'seconds');

        if (scoreStartTime.isBetween(vodStartTime, endDatetime)) {
            let totalSeconds = scoreStartTime.diff(vodStartTime, 'seconds') + config.twitch.timeOffset;
            const hours = Math.floor(totalSeconds / 3600);
            totalSeconds %= 3600;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;

            return {
                shouldTrack: false,
                timestamp: hours + 'h ' + minutes + 'm ' + seconds + 's',
                url: video['url'] + '?t=' + hours + 'h' + minutes + 'm' + seconds + 's',
            };
        }

        return null;
    }

    async isLive(score) {
        if (await this.privateDB.findByColumn('vod_trackers', 'twitch_id', score.player.twitch_id)) {
            return true;
        } else {
            return await this.axios.get('https://api.twitch.tv/helix/streams?user_id=' + score.player.twitch_id, this.headers).then(async (res) => {
                return !!res.data.data.length;
            }).catch((error) => {
                console.error(error);
                return false;
            });
        }
    }

    async getVodQueue() {
        if (vodQueueTimestamp.isAfter(moment())) {
            return [];
        }

        vodQueueTimestamp = moment().add(config.twitch.vod_queue_update_frequency, 'seconds');

        const foundVods = [];

        await this.privateDB.database.run(`DELETE FROM vod_trackers WHERE expires_at < "${ moment().format('YYYY-MM-DD HH:mm:ss') }"`);

        const vods = await this.privateDB.all('vod_trackers');
        if (vods.length) {
            const groupedVods = this.privateDB.groupBy(vods, 'twitch_id');

            for (let twitch_id of Object.keys(groupedVods)) {
                await this.axios.get('https://api.twitch.tv/helix/videos?type=archive&user_id=' + twitch_id, this.headers).then(async (res) => {
                    for (let vodQueue of groupedVods[twitch_id]) {
                        for (let video of res.data.data) {
                            const vodData = this.getVodData(moment(vodQueue.timestamp), video);

                            if (vodData) {
                                this.print(`new vod published: ${vodData.url}`);
                                await this.privateDB.deleteByColumn('vod_trackers', 'thread_id', vodQueue.thread_id);

                                const oldData = JSON.parse(vodQueue.data);
                                oldData.vod = vodData;
                                foundVods.push(oldData);
                                break;
                            }
                        }
                    }
                });
                await this.delay();
            }
        }

        return foundVods;
    }

    async addPlayer(osuId, osuName, twitchName) {
        return await this.axios.get(`https://api.twitch.tv/helix/users?login=${twitchName}`, this.headers).then(async (res) => {
            if (res.data.data.length) {
                const data = {
                    osu_id: osuId,
                    osu_name: osuName,
                    twitch_name: twitchName,
                    twitch_id: res.data.data[0].id,
                };

                await this.publicDB.insert('players', data);

                return data;
            } else {
                return null;
            }
        }).catch(() => {
            return null;
        });
    }
}

module.exports = TwitchService;