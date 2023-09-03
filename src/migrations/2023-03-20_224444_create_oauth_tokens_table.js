const BaseMigration = require('../migration');

class Migration extends BaseMigration {
    async up() {
        return this.database.run("CREATE TABLE 'oauth_tokens' (name TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL, expires_in DATE NOT NULL)");
    }
}

module.exports = Migration;