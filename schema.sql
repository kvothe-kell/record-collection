CREATE TABLE IF NOT EXISTS records (
    id                INTEGER PRIMARY KEY,
    releaseId         INTEGER UNIQUE,
    artist            TEXT NOT NULL,
    album             TEXT NOT NULL,
    year              INTEGER,
    genre             TEXT,
    subgenre          TEXT,
    label             TEXT,
    format            TEXT,
    rating            INTEGER,
    status            TEXT NOT NULL DEFAULT 'owned',
    mediaCondition    TEXT,
    sleeveCondition   TEXT,
    purchasePrice     REAL,
    purchaseLocation  TEXT,
    dateAdded         TEXT
);