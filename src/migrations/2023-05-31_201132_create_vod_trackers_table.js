const BaseMigration = require('../migration');

class Migration extends BaseMigration {
    async up() {
        return this.database.run("CREATE TABLE 'vod_trackers' (id INTEGER  PRIMARY KEY, thread_id TEXT, twitch_id INTEGER, timestamp TEXT, expires_at TEXT, data JSON)");
    }
}

module.exports = Migration;