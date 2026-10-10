"""Resolve song metadata against owned albums without guessing from artist alone."""

import json
import re
from datetime import datetime, timezone

from discogs import fetch_tracklist


def name_key(value):
    return re.sub(r"[\W_]+", "", value.casefold()) if isinstance(value, str) else ""


def track_matches(db, artist, title):
    if not name_key(artist) or not name_key(title):
        return []
    candidates = [
        row for row in db.execute("SELECT * FROM records WHERE status != 'want'")
        if name_key(row["artist"]) == name_key(artist)
    ]
    db.execute("""CREATE TABLE IF NOT EXISTS discogs_tracklists (
        releaseId INTEGER PRIMARY KEY, tracklist TEXT NOT NULL, fetchedAt TEXT NOT NULL)""")
    matches = []
    for record in candidates:
        release_id = record["releaseId"]
        if not release_id:
            continue
        cached = db.execute(
            "SELECT tracklist FROM discogs_tracklists WHERE releaseId = ?", (release_id,)
        ).fetchone()
        if cached:
            try:
                tracks = json.loads(cached["tracklist"])
            except (ValueError, TypeError):
                tracks = None
        else:
            tracks = None
        if tracks is None:
            tracks = fetch_tracklist(release_id)
            if tracks is None:
                continue
            db.execute(
                "INSERT OR REPLACE INTO discogs_tracklists VALUES (?, ?, ?)",
                (release_id, json.dumps(tracks), datetime.now(timezone.utc).isoformat()),
            )
        if any(
            isinstance(track, dict) and track.get("type_", "track") == "track"
            and name_key(track.get("title")) == name_key(title)
            for track in tracks
        ):
            matches.append(record)
    return matches
