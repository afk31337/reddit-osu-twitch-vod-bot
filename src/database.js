const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const fs = require('fs');

class DB {
    constructor(name) {
		this.name = name;
        this.data = {
            status: 'starting',
        };

        process.on('UnhandledPromiseRejection', function(err) {
            console.error(err);
            console.log('exiting...');
            process.exit(1);
        });
    }

    async open() {
        this.database = await sqlite.open({
		  filename: this.name + '.sqlite',
		  driver: sqlite3.cached.Database
		});
    }

    async find(table, value) {
        return await this.findByColumn(table, 'id', value);
    }

    async findByColumn(table, column, value) {
        table = this.sanitizeString(table);
        column = this.sanitizeString(column);

        return await this.database.get(`SELECT * FROM ${table} WHERE ${column} = ?`, value).then((row) => {
            return row;
        });
    }

    async findManyByColumn(table, column, value) {
        table = this.sanitizeString(table);
        column = this.sanitizeString(column);

        return await this.database.all(`SELECT * FROM ${table} WHERE ${column} = ?`, value).then((rows) => {
            return rows;
        });
    }

    async all(table) {
        table = this.sanitizeString(table);

        return await this.database.all(`SELECT * FROM ${table}`).then((rows) => {
            return rows;
        });
    }

    async insert(table, data = {}) {
        table = this.sanitizeString(table);
        const keys = this.getKeys(data).join(', ');
        const placeholder = Object.keys(data).map(() => '?').join(', ');

        await this.database.run(`INSERT INTO ${table} (${keys}) VALUES (${placeholder})`, Object.values(data)).then((result) => {
            return result;
        }).catch(this.onError);
    }

    async insertMany(table, rows = []) {
        for (let row in rows) {
            await this.insert(table, row);
        }
    }

    async update(table, id, data) {
        return await this.updateByColumn(table, 'id', id, data);
    }

    async updateByColumn(table, column, value, data) {
        table = this.sanitizeString(table);
        column = this.sanitizeString(column);
        const keys = this.getKeys(data).join(' = ?, ') + ' = ?';

        await this.database.run(`UPDATE ${table} SET ${keys} WHERE ${column} = ?`, Object.values(data).concat(value)).then((result) => {
            return result;
        });
    }

    async delete(table, id) {
        return await this.deleteByColumn(table, 'id', id);
    }

    async deleteByColumn(table, column, value) {
        table = this.sanitizeString(table);
        column = this.sanitizeString(column);

        await this.database.run(`DELETE FROM ${table} WHERE ${column} = ?`, value).then((result) => {
            return result;
        });
    }

    async migrate() {
        //based on migrations in Laravel
        const migrationFiles = fs.readdirSync('./src/migrations/');
        let migrations = [];
        let migrated = false;

        await this.all('migrations').then((rows) => {
            migrations = rows;
        }).catch(async () => {
            await this.database.run("CREATE TABLE 'migrations' (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
        });

        for (const migration of migrationFiles) {
            if (!migrations.find((row) => row.name === migration)) {
                this.consoleLog('migrating: ' + migration);
                const module = await require('./migrations/' + migration);
                const moduleClass = new module(this.database);
                await moduleClass.up();

                await this.insert('migrations', {name: migration})
                this.consoleLog('migrated: ' + migration);
                migrated = true;
            }
        }

        this.consoleLog(migrated ? 'finished migrating' : 'nothing to migrate');
    }

    onError(error) {
        console.error(error.message);
        return Promise.reject();
    }

    getKeys(object) {
        let keys = Object.keys(object);
        return keys.map(value => this.sanitizeString(value));
    }

    sanitizeString(value) {
        return value.replace(/[^a-z_]/gi, '');
    }

    groupBy(values, key) {
        const groupedValues = {};
        for (let value of values) {
            if (groupedValues[value[key]]) {
                groupedValues[value[key]].push(value);
            } else {
                groupedValues[value[key]] = [value];
            }
        }
        return groupedValues;
    }

    consoleLog(message) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(message + '\n');
        process.stdout.write(this.data.status + '...');
    }
}

module.exports = DB;