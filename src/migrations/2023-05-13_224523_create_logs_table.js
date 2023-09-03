const BaseMigration = require('../migration');

class Migration extends BaseMigration {
    async up() {
        return this.database.run("CREATE TABLE 'logs' (id INTEGER  PRIMARY KEY, comment_id TEXT, thread_id INTEGER NULL, player_id INTEGER NULL, score_id INTEGER NULL, message TEXT NULL, timestamp TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    }
}

module.exports = Migration;