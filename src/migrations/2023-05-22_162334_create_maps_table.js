const BaseMigration = require('../migration');

class Migration extends BaseMigration {
    async up() {
        return this.database.run("CREATE TABLE 'maps' (id INTEGER  PRIMARY KEY, beatmap_set_id INTEGER, start_time INTEGER, end_time INTEGER, length INTEGER, filename TEXT)");
    }
}

module.exports = Migration;