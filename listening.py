import json
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

DEDUP_WINDOW_MINUTES = 60


def parse_listening_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Timestamp must be a non-empty string")

    timestamp = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=ZoneInfo("America/New_York"))

    return timestamp.astimezone(timezone.utc)


def normalize_recognition_name(value):
    normalized = " ".join(value.casefold().split())
    return re.sub(r"\s*/\s*", "/", normalized)


def find_track_matches(db, artist, track):
    if not isinstance(track, str) or not track.strip():
        return []

    artist_key = normalize_recognition_name(artist)
    track_key = normalize_recognition_name(track)

    def contains_track(entries):
        for entry in entries:
            if not isinstance(entry, dict):
                continue

            title = entry.get("title")

            if (
                entry.get("type_") == "track"
                and isinstance(title, str)
                and normalize_recognition_name(title) == track_key
            ):
                return True

            sub_tracks = entry.get("sub_tracks")

            if isinstance(sub_tracks, list) and contains_track(sub_tracks):
                return True

        return False

    rows = db.execute("""SELECT r.*, t.tracklist
           FROM records AS r
           JOIN discogs_tracklists AS t ON t.releaseId = r.releaseId
           WHERE r.status = 'owned'
           ORDER BY r.id""").fetchall()

    matches = []

    for record in rows:
        if normalize_recognition_name(record["artist"]) != artist_key:
            continue

        try:
            entries = json.loads(record["tracklist"])
        except (TypeError, ValueError):
            continue

        if isinstance(entries, list) and contains_track(entries):
            matches.append(record)

    return matches


def find_recognition_matches(db, artist, album, album_candidates=None, track=None):
    artist_key = normalize_recognition_name(artist)
    album_key = normalize_recognition_name(album)

    override = db.execute(
        """SELECT r.*
           FROM listening_match_overrides AS o
           JOIN records AS r ON r.id = o.recordId
           WHERE o.recognizedArtist = ?
             AND o.recognizedAlbum = ?
             AND r.status != 'want'""",
        (artist_key, album_key),
    ).fetchone()

    if override is not None:
        return [override]

    owned_records = db.execute(
        "SELECT * FROM records WHERE status != 'want' ORDER BY id"
    ).fetchall()

    direct_matches = [
        record
        for record in owned_records
        if normalize_recognition_name(record["artist"]) == artist_key
        and normalize_recognition_name(record["album"]) == album_key
    ]

    if direct_matches:
        return direct_matches

    candidate_matches = {}

    if not isinstance(album_candidates, list):
        album_candidates = []

    for candidate in album_candidates:
        if not isinstance(candidate, dict):
            continue

        candidate_artist = candidate.get("artist")
        candidate_album = candidate.get("album")

        if (
            not isinstance(candidate_artist, str)
            or not candidate_artist.strip()
            or not isinstance(candidate_album, str)
            or not candidate_album.strip()
        ):
            continue

        candidate_artist_key = normalize_recognition_name(candidate_artist)
        candidate_album_key = normalize_recognition_name(candidate_album)

        for record in owned_records:
            if (
                normalize_recognition_name(record["artist"]) == candidate_artist_key
                and normalize_recognition_name(record["album"]) == candidate_album_key
            ):
                candidate_matches[record["id"]] = record

    if candidate_matches:
        return list(candidate_matches.values())

    return find_track_matches(db, artist, track)


def merge_record_sessions(db, record_id):
    events = [
        dict(row) for row in db.execute("SELECT * FROM listening_events").fetchall()
    ]

    events.sort(
        key=lambda event: (
            parse_listening_timestamp(event["playedAt"]),
            event["id"],
        )
    )

    previous = None

    for event in events:
        eligible = (
            event["recordId"] == record_id
            and event["matchStatus"] == "matched"
            and event["source"] == "automatic"
        )

        if not eligible:
            previous = None
            continue

        if previous is not None:
            gap = parse_listening_timestamp(
                event["playedAt"]
            ) - parse_listening_timestamp(previous["lastSeenAt"])

            if gap < timedelta(minutes=DEDUP_WINDOW_MINUTES):
                last_seen = max(
                    parse_listening_timestamp(previous["lastSeenAt"]),
                    parse_listening_timestamp(event["lastSeenAt"]),
                ).isoformat()

                db.execute(
                    "UPDATE listening_events SET lastSeenAt = ? WHERE id = ?",
                    (last_seen, previous["id"]),
                )

                db.execute(
                    "UPDATE listening_recognitions SET eventId = ? WHERE eventId = ?",
                    (previous["id"], event["id"]),
                )

                db.execute(
                    "DELETE FROM listening_events WHERE id = ?",
                    (event["id"],),
                )

                previous["lastSeenAt"] = last_seen
                continue

        previous = event
