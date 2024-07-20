const moment = require('moment');
const axios = require('axios');
const logs = [];

class Service {
    constructor(name, publicDB, privateDB) {
        this.name = name;
        this.publicDB = publicDB;
        this.privateDB = privateDB;
        this.axios = axios;
        this.headers = { headers: {} };
    }

    buildOauthRequest() {
        return this.axios.post('');
    }

    async buildHeaders() {
        const token = await this.getOauthToken();
        this.headers.headers = {
            Authorization: 'Bearer ' + token.token,
        };
    }

    async getOauthToken() {
        const row = await this.privateDB.findByColumn('oauth_tokens', 'name', this.name);

        if (!row || moment(row.expires_in).isBefore(moment())) {
            const request = this.buildOauthRequest();

            return await request.then(async response => {
                const data = {
                    name: this.name,
                    token: response.data['access_token'],
                    expires_in: moment().add(response.data['expires_in'] - 120, 'seconds').format('YYYY-MM-DD HH:mm:ss')
                };

                if (row) {
                    await this.privateDB.updateByColumn('oauth_tokens', 'name', this.name, data);
                } else {
                    await this.privateDB.insert('oauth_tokens', data);
                }

                this.print(`Refreshed ${this.name} token`);
                return data;
            });
        } else {
            return row;
        }
    }

    async log(message, commentId, threadId, playerId = null, scoreId = null) {
        this.print(commentId + ': ' + message);
        await this.privateDB.insert('logs', {
            comment_id: commentId,
            thread_id: threadId,
            player_id: playerId,
            score_id: scoreId,
            message: message,
            created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
        });
    }

    async delay(ms = 500) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setStatus(status) {
        this.privateDB.data.status = status;
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`${status}...`);
    }

    print(message) {
        message = `${moment().format('YYYY-MM-DD HH:mm:ss')}: ${message}`;
        logs.push(message);

        if (logs.length > 20) {
            logs.shift();
        }

        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`${message}\n`);
        process.stdout.write(`${this.privateDB.data.status}...`);
    }

    getLogs() {
        return logs;
    }
}

module.exports = Service;