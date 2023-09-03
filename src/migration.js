class BaseMigration {
    constructor(database) {
        this.database = database;
    }
    async up() {}
    async down() {}
}

module.exports = BaseMigration;