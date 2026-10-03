CREATE TABLE IF NOT EXISTS listening_events (
    id                INTEGER PRIMARY KEY,
    recordId          INTEGER REFERENCES records(id),
    playedAt          TEXT NOT NULL,
    lastSeenAt        TEXT NOT NULL,
    source            TEXT NOT NULL DEFAULT 'manual',
    recognizedArtist  TEXT,
    recognizedAlbum   TEXT,
    recognizedTrack   TEXT,
    confidence        REAL,
    externalId        TEXT,
    matchStatus       TEXT NOT NULL DEFAULT 'matched',
    notes             TEXT
);

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
    dateAdded         TEXT,
    coverPath         TEXT
);

CREATE TABLE IF NOT EXISTS listening_recognitions (
    recognitionId TEXT PRIMARY KEY NOT NULL,
    eventId       INTEGER NOT NULL REFERENCES listening_events(id),
    capturedAt    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listening_match_overrides (
    recognizedArtist TEXT NOT NULL,
    recognizedAlbum  TEXT NOT NULL,
    recordId         INTEGER NOT NULL REFERENCES records(id),
    PRIMARY KEY (recognizedArtist, recognizedAlbum)
);