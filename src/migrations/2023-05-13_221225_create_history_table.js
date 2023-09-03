const BaseMigration = require('../migration');

class Migration extends BaseMigration {
    async up() {
        return this.database.run("CREATE TABLE 'history' (id INTEGER PRIMARY KEY, comment_id TEXT)");
    }
}

module.exports = Migration;