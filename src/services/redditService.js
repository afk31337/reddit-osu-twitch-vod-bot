const Service = require('../service');
const config = require('../../config.json');
const querystring = require('querystring');

class RedditService extends Service {
    constructor(publicDB, privateDB) {
        super('reddit', publicDB, privateDB);
    }

    buildOauthRequest() {
        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('username', config.reddit.api.username);
        params.append('password', config.reddit.api.password);

        return this.axios.post('https://www.reddit.com/api/v1/access_token', params, {
            headers: {
                authorization: `Basic ${Buffer.from(`${config.reddit.api.appId}:${config.reddit.api.appSecret}`).toString('base64')}`,
                'user-agent': config.reddit.api.userAgent
            }
        });
    }

    async buildHeaders() {
        const token = await this.getOauthToken();
        this.headers.headers = {
            Authorization: 'Bearer ' + token.token,
            'user-agent': config.reddit.api.userAgent,
        };
    }

    async getComments() {
        const comments = [];

        await this.buildHeaders();

        return this.axios.get('https://oauth.reddit.com/user/osu-bot/comments?limit=' + config.reddit.limit, this.headers).then(async (response) => {
            for (let comment of response.data.data.children) {
                comment = comment.data;

                if (comment.link_author !== '[deleted]' && !await this.privateDB.findByColumn('history', 'comment_id', comment.id)) {
                    await this.privateDB.insert('history', {comment_id: comment.id});

                    if (comment.body.includes('https://osu.ppy.sh/u/') && comment.body.includes('https://osu.ppy.sh/b/')) {
                        const playerId = this.getPlayerIdFromComment(comment.body);
                        const player = await this.publicDB.findByColumn('players', 'osu_id', playerId);

                        if (player) {
                            comments.push({
                                beatMapId: this.getBeatMapIdFromComment(comment.body),
                                accuracy: this.getAccuracyFromTitle(comment.link_title),
                                player,
                                comment: {
                                    id: comment.id,
                                    duplicateId: null,
                                    threadUrl: comment.link_permalink,
                                    threadId: comment.link_id,
                                }
                            });
                        } else {
                            await this.log(
                                `player ${comment.link_title.split('|')[0].trim()} is not tracked`,
                                comment.id,
                                comment.link_id,
                                playerId
                            );
                        }
                    } else {
                        await this.log('not a score post or data is missing', comment.id, comment.link_id);
                    }
                }
            }

            return comments;
        });
    }

    getPlayerIdFromComment(comment) {
        let string = comment.split('https://osu.ppy.sh/u/');
        string = string[string.length - 1].split(')')[0];
        return string.split(' ')[0];
    }

    getBeatMapIdFromComment(comment) {
        const string = comment.split('https://osu.ppy.sh/b/');
        return Number(string[1].split('?')[0]);
    }

    getAccuracyFromTitle(title) {
        if (title.includes('%')) {
            let string = title.split('%');
            string = string[0].split(' ');
            let acc = Number(string[string.length - 1]);

            if (!Number.isNaN(acc) && acc > 0 && acc <= 100) {
                return  acc;
            }
        }

        return null;
    }

    async postComments(vods) {
        for (const vod of vods) {
            await this.log(vod.vod.url, vod.comment.id, vod.comment.threadId, vod.player.id, vod.score_id);
            const text = '[Stream VOD link](' + vod.vod.url + ') at ~' + vod.vod.timestamp;
            await this.postComment(vod.comment.threadId, text, vod.comment.threadUrl);
            await this.delay(5000);
        }
    }

    async postComment(thingId, text, threadUrl) {
        if (config.reddit.debug_thread_id) {
            text = `[thread link](${threadUrl})\n\n` + text;
            thingId = 't3_' + config.reddit.debug_thread_id;
        }
        text = text + `\n\n^[Source&#32;code](${config.source_code_url})&#32;|&#32;[Message&#32;creator](https://www.reddit.com/message/compose?to=u/${config.reddit.api.username}&subject=RE:${thingId})`;
        return await this.axios.post(`https://oauth.reddit.com/api/comment`, querystring.stringify({thing_id: thingId, text: text}), this.headers)
            .then(() => {})
            .catch(error => {
                console.error(error);
                this.print(`failed to post comment: ${thingId}: ${error.message}`);
            });
    }
}

module.exports = RedditService;