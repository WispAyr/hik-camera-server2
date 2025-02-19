const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'events.db');
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Error connecting to database:', err);
            } else {
                console.log('Connected to SQLite database');
                this.initializeDatabase();
            }
        });
    }

    initializeDatabase() {
        const createSitesTableSQL = `
            CREATE TABLE IF NOT EXISTS sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createCamerasTableSQL = `
            CREATE TABLE IF NOT EXISTS cameras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channelID TEXT NOT NULL,
                macAddress TEXT,
                name TEXT,
                description TEXT,
                site_id INTEGER,
                status TEXT DEFAULT 'active',
                last_seen TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (site_id) REFERENCES sites(id),
                UNIQUE(channelID)
            )
        `;

        const createEventsTableSQL = `
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channelID TEXT NOT NULL,
                dateTime TEXT NOT NULL,
                eventType TEXT NOT NULL,
                country TEXT,
                licensePlate TEXT NOT NULL,
                lane TEXT,
                direction TEXT,
                confidenceLevel TEXT,
                macAddress TEXT,
                licensePlateImage TEXT,
                vehicleImage TEXT,
                detectionImage TEXT,
                site_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (site_id) REFERENCES sites(id)
            )
        `;


        this.db.serialize(() => {
            this.db.run(createSitesTableSQL, (err) => {
                if (err) {
                    console.error('Error creating sites table:', err);
                } else {
                    console.log('Sites table initialized');
                }
            });

            this.db.run(createCamerasTableSQL, (err) => {
                if (err) {
                    console.error('Error creating cameras table:', err);
                } else {
                    console.log('Cameras table initialized');
                }
            });

            this.db.run(createEventsTableSQL, (err) => {
                if (err) {
                    console.error('Error creating events table:', err);
                } else {
                    console.log('Events table initialized');
                }
            });
        });
    }

    insertEvent(event) {
        return new Promise(async (resolve, reject) => {
            try {
                // Store camera details if not exists
                const insertCameraSQL = `
                    INSERT OR IGNORE INTO cameras (channelID, macAddress)
                    VALUES (?, ?)
                `;
                await new Promise((resolve, reject) => {
                    this.db.run(insertCameraSQL, [event.channelID, event.macAddress], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
                const sql = `
                    INSERT INTO events (
                        channelID, dateTime, eventType, country, licensePlate,
                        lane, direction, confidenceLevel, macAddress,
                        licensePlateImage, vehicleImage, detectionImage,
                        site_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const params = [
                    event.channelID,
                    event.dateTime,
                    event.eventType,
                    event.country,
                    event.licensePlate,
                    event.lane,
                    event.direction,
                    event.confidenceLevel,
                    event.macAddress,
                    event.images?.licensePlate,
                    event.images?.vehicle,
                    event.images?.detection,
                    null  // site_id is not assigned automatically
                ];

                this.db.run(sql, params, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    getAllEvents(options = {}) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM events';
            const params = [];
            const conditions = [];

            if (options.licensePlate) {
                conditions.push('licensePlate LIKE ?');
                params.push(`%${options.licensePlate}%`);
            }

            if (options.dateFrom) {
                conditions.push('dateTime >= ?');
                params.push(options.dateFrom);
            }

            if (options.dateTo) {
                conditions.push('dateTime <= ?');
                params.push(options.dateTo);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }

            sql += ' ORDER BY dateTime DESC';

            if (options.limit) {
                sql += ' LIMIT ?';
                params.push(options.limit);
            }

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async createOrGetSite(channelID) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR IGNORE INTO sites (name) 
                VALUES (?)
                RETURNING id;
            `;
            
            this.db.get(sql, [channelID], (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve(row.id);
                } else {
                    // If no id returned, get the existing site id
                    this.db.get('SELECT id FROM sites WHERE name = ?', [channelID], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.id);
                        }
                    });
                }
            });
        });
    }

    getSiteStats() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    s.id,
                    s.name,
                    COUNT(e.id) as eventCount,
                    MAX(e.dateTime) as lastDetection,
                    (SELECT vehicleImage 
                     FROM events e2 
                     WHERE e2.site_id = s.id 
                     ORDER BY e2.dateTime DESC 
                     LIMIT 1) as lastVehicleImage
                FROM sites s
                LEFT JOIN events e ON s.id = e.site_id
                GROUP BY s.id, s.name
                ORDER BY s.name
            `;

            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getEventStats() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as totalEvents,
                    COUNT(DISTINCT licensePlate) as uniqueVehicles,
                    COUNT(DISTINCT channelID) as activeChannels,
                    COUNT(DISTINCT site_id) as totalSites,
                    MAX(dateTime) as lastDetection
                FROM events
            `;

            this.db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async addCamera(camera) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO cameras (channelID, macAddress, name, description, site_id)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [
                camera.channelID,
                camera.macAddress,
                camera.name,
                camera.description,
                camera.site_id
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async updateCamera(id, camera) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE cameras
                SET name = ?, description = ?, site_id = ?
                WHERE id = ?
            `;
            
            this.db.run(sql, [
                camera.name,
                camera.description,
                camera.site_id,
                id
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deleteCamera(id) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM cameras WHERE id = ?';
            
            this.db.run(sql, [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async getCameras(siteId = null) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM cameras';
            const params = [];
            
            if (siteId) {
                sql += ' WHERE site_id = ?';
                params.push(siteId);
            }
            
            sql += ' ORDER BY name';
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async deleteSite(id) {
        return new Promise((resolve, reject) => {
            const deleteEvents = () => {
                return new Promise((resolveEvents, rejectEvents) => {
                    this.db.run('DELETE FROM events WHERE site_id = ?', [id], (err) => {
                        if (err) rejectEvents(err);
                        else resolveEvents();
                    });
                });
            };

            const deleteCameras = () => {
                return new Promise((resolveCameras, rejectCameras) => {
                    this.db.run('DELETE FROM cameras WHERE site_id = ?', [id], (err) => {
                        if (err) rejectCameras(err);
                        else resolveCameras();
                    });
                });
            };

            const deleteSiteRecord = () => {
                return new Promise((resolveSite, rejectSite) => {
                    this.db.run('DELETE FROM sites WHERE id = ?', [id], function(err) {
                        if (err) rejectSite(err);
                        else resolveSite(this.changes);
                    });
                });
            };

            this.db.run('BEGIN TRANSACTION', async (err) => {
                if (err) {
                    return reject(err);
                }

                try {
                    await deleteEvents();
                    await deleteCameras();
                    const changes = await deleteSiteRecord();
                    
                    this.db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            this.db.run('ROLLBACK', () => reject(commitErr));
                        } else {
                            resolve(changes);
                        }
                    });
                } catch (error) {
                    this.db.run('ROLLBACK', () => reject(error));
                }
            });
        });
    }

    async updateSite(id, name, description) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE sites
                SET name = ?, description = ?
                WHERE id = ?
            `;
            
            this.db.run(sql, [name, description, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async getSiteById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM sites WHERE id = ?';
            this.db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

module.exports = new Database();