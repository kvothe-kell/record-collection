from dotenv import load_dotenv

load_dotenv()
import json
import os
import re
import sqlite3
from datetime import date, datetime, timedelta, timezone
from math import isfinite
from zoneinfo import ZoneInfo

import pandas as pd
from flask import Flask, Response, g, jsonify, request

from discogs import fetch_cover, fetch_tracklist
from recognition import track_matches
from stats import compute_growth, compute_overview, compute_spending

app = Flask(__name__, static_folder="static", static_url_path="")

DB_FILE = "records.db"
COLUMNS = [
    "releaseId",
    "artist",
    "album",
    "year",
    "genre",
    "subgenre",
    "label",
    "format",
    "rating",
    "status",
    "mediaCondition",
    "sleeveCondition",
    "purchasePrice",
    "purchaseLocation",
    "dateAdded",
    "coverPath",
]
DEDUP_WINDOW_MINUTES = 60
PI_API_TOKEN = os.environ.get("PI_API_TOKEN")


def get_db():
    """One connection per request, reused within it."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_FILE)
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def row_to_dict(row):
    return {key: row[key] for key in row.keys()}


def validate_record(record):
    for field in ("artist", "album"):
        value = record.get(field)
        if not isinstance(value, str) or not value.strip():
            return f"{field} must be a non-empty string"

    if record.get("status") not in ("owned", "want"):
        return "status must be owned or want"

    date_added = record.get("dateAdded")
    if date_added not in (None, ""):
        if not isinstance(date_added, str):
            return "dateAdded must be a date in YYYY-MM-DD format"

        try:
            parsed_date = date.fromisoformat(date_added)
        except ValueError:
            return "dateAdded must be a date in YYYY-MM-DD format"

        if parsed_date.isoformat() != date_added:
            return "dateAdded must be a date in YYYY-MM-DD format"

    for (
        field,
        minimum,
        maximum,
    ) in (
        ("year", 1, 9999),
        ("rating", 0, 5),
        ("releaseId", 1, 9223372036854775807),
    ):
        value = record.get(field)

        if value is not None and (
            type(value) is not int or not minimum <= value <= maximum
        ):
            return f"{field} must be an integer from {minimum} to {maximum}, or null"

    price = record.get("purchasePrice")

    if price is not None:
        if type(price) not in (int, float):
            return "purchasePrice must be a finite, non-negative number or null"

        try:
            valid_price = isfinite(price) and price >= 0
        except OverflowError:
            valid_price = False

        if not valid_price:
            return "purchasePrice must be a finite, non-negative number or null"

    for field in (
        "genre",
        "subgenre",
        "label",
        "format",
        "mediaCondition",
        "sleeveCondition",
        "purchaseLocation",
        "coverPath",
    ):
        value = record.get(field)

        if value is not None and not isinstance(value, str):
            return f"{field} must be a string or null"

    return None


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


def find_recognition_matches(db, artist, album):
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

    return [
        record
        for record in owned_records
        if normalize_recognition_name(record["artist"]) == artist_key
        and normalize_recognition_name(record["album"]) == album_key
    ]


def merge_record_sessions(db, record_id):
    events = [
        row_to_dict(row)
        for row in db.execute("SELECT * FROM listening_events").fetchall()
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


""" RECORD ROUTES """


# Get Record list from DB
@app.route("/api/records", methods=["GET"])
def get_records():
    rows = get_db().execute("SELECT * FROM records").fetchall()
    return jsonify([row_to_dict(row) for row in rows])


# Get Track Listing
@app.route("/api/records/<int:record_id>/tracklist", methods=["GET"])
def get_record_tracklist(record_id):
    db = get_db()
    record = db.execute(
        "SELECT releaseId FROM records WHERE id = ?", (record_id,)
    ).fetchone()

    if record is None:
        return jsonify({"error": "Record not found"}), 404

    release_id = record["releaseId"]

    if not release_id:
        return jsonify({"error": "No Discogs release ID for this record"}), 404

    cached = db.execute(
        "SELECT * FROM discogs_tracklists WHERE releaseId = ?",
        (release_id,),
    ).fetchone()

    if cached is None:
        tracklist = fetch_tracklist(release_id)

        if tracklist is None:
            return jsonify({"error": "Couldn't load tracks from Discogs"}), 502

        fetched_at = datetime.now(timezone.utc).isoformat()

        with db:
            db.execute(
                """INSERT INTO discogs_tracklists
                (releaseId, tracklist, fetchedAt)
                VALUES (?, ?, ?)
                ON CONFLICT(releaseId) DO NOTHING""",
                (release_id, json.dumps(tracklist), fetched_at),
            )

        cached = db.execute(
            "SELECT * FROM discogs_tracklists WHERE releaseId = ?",
            (release_id,),
        ).fetchone()

    return jsonify(
        {
            "releaseId": cached["releaseId"],
            "tracklist": json.loads(cached["tracklist"]),
            "fetchedAt": cached["fetchedAt"],
        }
    )


# Add New Record
@app.route("/api/records", methods=["POST"])
def create_record():
    record = request.get_json(silent=True)

    if not isinstance(record, dict):
        return jsonify({"error": "Expected a record object"}), 400

    error = validate_record(record)
    if error:
        return jsonify({"error": error}), 400

    placeholders = ", ".join(["?"] * len(COLUMNS))
    sql = (
        "INSERT INTO records (" + ", ".join(COLUMNS) + ") VALUES (" + placeholders + ")"
    )
    values = [record.get(column) for column in COLUMNS]

    db = get_db()

    try:
        cursor = db.execute(sql, values)
        db.commit()
    except sqlite3.IntegrityError as error:
        db.rollback()
        return jsonify({"error": str(error)}), 409

    release_id = record.get("releaseId")
    if release_id:
        cover_path = fetch_cover(release_id)
        if cover_path:
            db.execute(
                "UPDATE records SET coverPath = ? WHERE id =? ",
                (cover_path, cursor.lastrowid),
            )
            db.commit()

    row = db.execute(
        "SELECT * FROM records WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()

    return jsonify(row_to_dict(row)), 201


# Update/Edit Record
@app.route("/api/records/<int:record_id>", methods=["PUT"])
def update_record(record_id):
    updated = request.get_json(silent=True)

    if not isinstance(updated, dict):
        return jsonify({"error": "Expected a record object"}), 400

    error = validate_record(updated)
    if error:
        return jsonify({"error": error}), 400

    db = get_db()

    existing = db.execute(
        "SELECT releaseId, coverPath FROM records WHERE id = ?", (record_id,)
    ).fetchone()

    if existing is None:
        return jsonify({"error": "Record not found"}), 404

    assignments = ", ".join([column + " = ?" for column in COLUMNS])
    sql = "UPDATE records SET " + assignments + " WHERE id = ?"
    values = [updated.get(column) for column in COLUMNS] + [record_id]

    try:
        cursor = db.execute(sql, values)
        db.commit()
    except sqlite3.IntegrityError as error:
        db.rollback()
        return jsonify({"error": str(error)}), 409

    new_release_id = updated.get("releaseId")
    release_id_changed = new_release_id != existing["releaseId"]
    cover_missing = existing["coverPath"] is None

    if new_release_id and (release_id_changed or cover_missing):
        cover_path = fetch_cover(new_release_id)
        if cover_path:
            db.execute(
                "UPDATE records SET coverPath = ? WHERE id = ?",
                (cover_path, record_id),
            )
            db.commit()

    row = db.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
    return jsonify(row_to_dict(row))


# Delete Record
@app.route("/api/records/<int:record_id>", methods=["DELETE"])
def delete_record(record_id):
    db = get_db()

    with db:
        db.execute("BEGIN IMMEDIATE")

        referenced = db.execute(
            """SELECT 1 FROM listening_events WHERE recordId = ?
            UNION ALL
            SELECT 1 FROM listening_match_overrides WHERE recordId = ?
            LIMIT 1""",
            (record_id, record_id),
        ).fetchone()

        if referenced is not None:
            return (
                jsonify(
                    {
                        "error": "This record is referenced by listening history or saved matches"
                    }
                ),
                409,
            )

        cursor = db.execute(
            "DELETE FROM records WHERE id = ?",
            (record_id,),
        )

        if cursor.rowcount == 0:
            return jsonify({"error": "Record not found"}), 404

    return jsonify({"deleted": record_id})


""" EXPORT and IMPORT ROUTE"""


# Export Records
@app.route("/api/records/export", methods=["GET"])
def export_records():
    rows = get_db().execute("SELECT * FROM records").fetchall()
    text = json.dumps([row_to_dict(row) for row in rows], indent=2)

    response = Response(text, mimetype="application/json")

    filename = "records-" + date.today().isoformat() + ".json"
    response.headers["Content-Disposition"] = 'attachment; filename="' + filename + '"'

    return response


# Replace from IMPORT
@app.route("/api/records", methods=["PUT"])
def replace_records():
    incoming = request.get_json(silent=True)

    if not isinstance(incoming, list):
        return jsonify({"error": "Expected a list of records"}), 400

    if any(not isinstance(record, dict) for record in incoming):
        return jsonify({"error": "Each imported record must be an object"}), 400

    incoming_by_id = {}

    for record in incoming:
        record_id = record.get("id")

        error = validate_record(record)
        if error:
            return jsonify({"error": error}), 400

        if type(record_id) is not int or record_id <= 0:
            return (
                jsonify(
                    {"error": "Each imported record must have a positive integer id"}
                ),
                400,
            )
        if record_id in incoming_by_id:
            return jsonify({"error": "Imported record ids must be unique"}), 400

        incoming_by_id[record_id] = record

    import_columns = ["id"] + COLUMNS
    placeholders = ", ".join(["?"] * len(import_columns))
    sql = (
        "INSERT INTO records ("
        + ", ".join(import_columns)
        + ") VALUES ("
        + placeholders
        + ")"
    )

    db = get_db()

    try:
        db.execute("BEGIN IMMEDIATE")
        db.execute("PRAGMA defer_foreign_keys = ON")
        referenced_records = db.execute("""SELECT id, artist, album FROM records
            WHERE id IN (
            SELECT recordId FROM listening_events
            UNION
            SELECT recordId FROM listening_match_overrides
            )""").fetchall()

        for existing in referenced_records:
            imported = incoming_by_id.get(existing["id"])

            if (
                imported is None
                or imported.get("artist") != existing["artist"]
                or imported.get("album") != existing["album"]
            ):
                db.rollback()
                return (
                    jsonify(
                        {
                            "error": "Import must preserve the ids, artists, and albums referenced by listening history or saved matches"
                        }
                    ),
                    409,
                )

        db.execute("DELETE FROM records")
        for record in incoming:
            db.execute(sql, [record.get(column) for column in import_columns])
        db.commit()
    except sqlite3.IntegrityError as error:
        db.rollback()
        return jsonify({"error": str(error)}), 409

    rows = db.execute("SELECT * FROM records").fetchall()
    return jsonify([row_to_dict(row) for row in rows])


"""STATS ROUTES"""


@app.route("/api/stats/growth", methods=["GET"])
def stats_growth():
    df = pd.read_sql_query("SELECT * FROM records", get_db())
    return jsonify(compute_growth(df))


@app.route("/api/stats/overview", methods=["GET"])
def stats_overview():
    df = pd.read_sql_query("SELECT * FROM records", get_db())
    return jsonify(compute_overview(df))


@app.route("/api/stats/spending", methods=["GET"])
def stats_spending():
    df = pd.read_sql_query("SELECT * FROM records", get_db())
    return jsonify(compute_spending(df))


"""LISTENING EVENTS"""


# Manual entry
@app.route("/api/listening/events", methods=["POST"])
def log_listening_event():
    db = get_db()

    event = request.get_json(silent=True)

    if not isinstance(event, dict):
        return jsonify({"error": "Expected a JSON object"}), 400

    record_id = event.get("recordId")

    if type(record_id) is not int:
        return jsonify({"error": "recordId must be an integer"}), 400

    notes = event.get("notes")

    if notes is not None and not isinstance(notes, str):
        return jsonify({"error": "notes must be a string or null"}), 400

    existing = db.execute(
        "SELECT id FROM records WHERE id = ?", (record_id,)
    ).fetchone()

    if existing is None:
        return jsonify({"error": "Record not found"}), 404

    now = datetime.now(timezone.utc).isoformat()

    cursor = (
        db.execute(
            """INSERT INTO listening_events (recordId, playedAt, lastSeenAt, source, matchStatus, notes)
       VALUES (?, ?, ?, ?, ?, ?)""",
            (record_id, now, now, "manual", "matched", notes),
        ),
    )

    db.commit()

    row = db.execute(
        "SELECT * FROM listening_events WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()

    return jsonify(row_to_dict(row)), 201


# Get from DB Table
@app.route("/api/listening/events", methods=["GET"])
def get_listening_events():
    rows = get_db().execute("SELECT * FROM listening_events").fetchall()
    events = []

    for row in rows:
        event = row_to_dict(row)
        event["playedAt"] = parse_listening_timestamp(event["playedAt"]).isoformat()
        event["lastSeenAt"] = parse_listening_timestamp(event["lastSeenAt"]).isoformat()
        events.append(event)

    events.sort(
        key=lambda event: parse_listening_timestamp(event["lastSeenAt"]),
        reverse=True,
    )
    return jsonify(events)


@app.route("/api/listening/events/<int:event_id>/resolve", methods=["POST"])
def resolve_listening_event(event_id):
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON object"}), 400

    record_id = payload.get("recordId")

    if type(record_id) is not int:
        return jsonify({"error": "recordId must be an integer"}), 400

    db = get_db()

    with db:
        db.execute("BEGIN IMMEDIATE")

        event = db.execute(
            "SELECT * FROM listening_events WHERE id = ?",
            (event_id,),
        ).fetchone()

        if event is None:
            return jsonify({"error": "Listening event not found"}), 404

        if event["source"] != "automatic" or event["matchStatus"] not in (
            "unresolved",
            "ambiguous",
        ):
            return jsonify({"error": "This event does not need resolution"}), 409

        record = db.execute(
            "SELECT id FROM records WHERE id =? AND status != 'want'",
            (record_id,),
        ).fetchone()

        if record is None:
            return jsonify({"error": "Owned record not found"}), 404

        artist_key = normalize_recognition_name(event["recognizedArtist"] or "")
        album_key = normalize_recognition_name(event["recognizedAlbum"] or "")

        if not artist_key or not album_key:
            return jsonify({"error": "Recognition metadata is missing"}), 400

        db.execute(
            """INSERT INTO listening_match_overrides
               (recognizedArtist, recognizedAlbum, recordId)
               VALUES (?, ?, ?)
               ON CONFLICT (recognizedArtist, recognizedAlbum)
               DO UPDATE SET recordId = excluded.recordId""",
            (artist_key, album_key, record_id),
        )

        pending_events = db.execute("""SELECT * FROM listening_events
            WHERE source = 'automatic'
            AND matchStatus IN ('unresolved', 'ambiguous')""").fetchall()

        resolved_count = 0

        for pending in pending_events:
            same_artist = (
                normalize_recognition_name(pending["recognizedArtist"] or "")
                == artist_key
            )
            same_album = (
                normalize_recognition_name(pending["recognizedAlbum"] or "")
                == album_key
            )

            if same_artist and same_album:
                db.execute(
                    """UPDATE listening_events
                    SET recordId = ?, matchstatus = 'matched'
                    WHERE id = ?""",
                    (record_id, pending["id"]),
                )
                resolved_count += 1

        merge_record_sessions(db, record_id)

    return jsonify(
        {
            "recordId": record_id,
            "resolvedCount": resolved_count,
        }
    )


@app.route("/api/listening/state", methods=["POST"])
def update_listener_state():
    if not PI_API_TOKEN:
        return jsonify({"error": "Pi authentication is not configured"}), 503

    if request.headers.get("Authorization") != f"Bearer {PI_API_TOKEN}":
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON object"}), 400

    audio_state = payload.get("audioState")

    if audio_state not in ("active", "silent", "unknown"):
        return jsonify({"error": "Invalid audioState"}), 400

    timestamps = {}

    for field in ("observedAt", "audioStateSince"):
        value = payload.get(field)

        try:
            if not isinstance(value, str) or not value.strip():
                raise ValueError()

            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))

            if parsed.utcoffset() is None:
                raise ValueError()

            timestamps[field] = parsed.astimezone(timezone.utc)

        except ValueError:
            return (
                jsonify({"error": f"{field} must be an ISO timestamp with a timezone"}),
                400,
            )

    observed_at = timestamps["observedAt"]
    state_since = timestamps["audioStateSince"]
    received_at = datetime.now(timezone.utc)

    if state_since > observed_at:
        return jsonify({"error": "audioStateSince cannot follow observedAt"}), 400

    if observed_at > received_at + timedelta(seconds=30):
        return jsonify({"error": "observedAt is too far in the future"}), 400

    db = get_db()

    with db:
        db.execute("BEGIN IMMEDIATE")

        existing = db.execute(
            "SELECT observedAt FROM listener_state WHERE id = 1"
        ).fetchone()

        if existing and observed_at <= parse_listening_timestamp(
            existing["observedAt"]
        ):
            return jsonify({"accepted": False, "reason": "Not a newer observation"})

        db.execute(
            """INSERT INTO listener_state
               (id, observedAt, receivedAt, audioState, audioStateSince)
               VALUES (1, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   observedAt = excluded.observedAt,
                   receivedAt = excluded.receivedAt,
                   audioState = excluded.audioState,
                   audioStateSince = excluded.audioStateSince""",
            (
                observed_at.isoformat(),
                received_at.isoformat(),
                audio_state,
                state_since.isoformat(),
            ),
        )

    return jsonify({"accepted": True})


@app.route("/api/listening/state", methods=["GET"])
def get_listener_state():
    row = get_db().execute("SELECT * FROM listener_state WHERE id = 1").fetchone()

    response = jsonify(
        {
            "state": row_to_dict(row) if row is not None else None,
            "serverTime": datetime.now(timezone.utc).isoformat(),
        }
    )

    response.headers["Cache-Control"] = "no-store"

    return response


# Receive event from Pi
@app.route("/api/listening/recognize", methods=["POST"])
def recognize_listening_event():
    db = get_db()

    if (
        PI_API_TOKEN
        and request.headers.get("Authorization") != f"Bearer {PI_API_TOKEN}"
    ):
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON object"}), 400

    recognition_id = payload.get("recognitionId")

    if not isinstance(recognition_id, str) or not recognition_id.strip():
        return jsonify({"error": "recognitionId must be a non-empty string"}), 400

    recognition_id = recognition_id.strip()

    db.execute("BEGIN IMMEDIATE")

    if recognition_id is not None:
        processed = db.execute(
            """SELECT e.matchstatus, e.recordId
            FROM listening_recognitions as r
            JOIN listening_events AS e ON e.id = r.eventId
            WHERE r.recognitionId = ?""",
            (recognition_id,),
        ).fetchone()

        if processed is not None:
            db.rollback()
            return (
                jsonify(
                    {
                        "matchStatus": processed["matchStatus"],
                        "recordId": processed["recordId"],
                        "duplicate": True,
                    }
                ),
                200,
            )
    try:
        captured_at = payload.get("capturedAt")

        if not isinstance(captured_at, str) or not captured_at.strip():
            raise ValueError("capturedAt is required")

        captured_time = datetime.fromisoformat(
            captured_at.strip().replace("Z", "+00:00")
        )

        if captured_time.utcoffset() is None:
            raise ValueError("capturedAt must include a timezone")

        now = captured_time.astimezone(timezone.utc)
    except ValueError:
        db.rollback()
        return (
            jsonify(
                {"error": "capturedAt must be a valid ISO timestamp with a timezone"}
            ),
            400,
        )

    now_str = now.isoformat()

    artist = payload.get("artist")
    album = payload.get("album")

    if (
        not isinstance(artist, str)
        or not isinstance(album, str)
        or not artist.strip()
        or not album.strip()
    ):

        db.rollback()
        return jsonify({"error": "artist and album are required"}), 400

    artist = artist.strip()
    album = album.strip()

    matches = find_recognition_matches(db, artist, album)

    if len(matches) == 0:
        record_id = None
        match_status = "unresolved"
    elif len(matches) == 1:
        record_id = matches[0]["id"]
        match_status = "matched"
    else:
        record_id = matches[0]["id"]
        match_status = "ambiguous"

    if record_id is None:
        cursor = db.execute(
            """INSERT INTO listening_events (recordId, playedAt, lastSeenAt, source,
            matchStatus, recognizedArtist, recognizedAlbum, recognizedTrack ,confidence,
                    externalId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                None,
                now_str,
                now_str,
                "automatic",
                "unresolved",
                payload.get("artist"),
                payload.get("album"),
                payload.get("track"),
                payload.get("confidence"),
                payload.get("externalId"),
            ),
        )
        event_id = cursor.lastrowid
    else:
        events = db.execute("SELECT * FROM listening_events").fetchall()

        earlier_events = [
            event
            for event in events
            if parse_listening_timestamp(event["playedAt"]) <= now
        ]

        recent_event = max(
            earlier_events,
            key=lambda event: parse_listening_timestamp(event["playedAt"]),
            default=None,
        )

        if (
            recent_event is not None
            and match_status == "matched"
            and recent_event["matchStatus"] == "matched"
            and recent_event["source"] == "automatic"
            and recent_event["recordId"] == record_id
            and (now - parse_listening_timestamp(recent_event["lastSeenAt"]))
            < timedelta(minutes=DEDUP_WINDOW_MINUTES)
        ):
            last_seen = parse_listening_timestamp(recent_event["lastSeenAt"])

            if now > last_seen:
                db.execute(
                    """UPDATE listening_events
                       SET lastSeenAt = ?, recognizedTrack = ?, confidence = ?
                       WHERE id = ?""",
                    (
                        now_str,
                        payload.get("track"),
                        payload.get("confidence"),
                        recent_event["id"],
                    ),
                )

            event_id = recent_event["id"]
        else:
            cursor = db.execute(
                """INSERT INTO listening_events
                (recordId, playedAt, lastSeenAt, source, matchStatus,
                    recognizedArtist, recognizedAlbum, recognizedTrack, confidence, externalId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    record_id,
                    now_str,
                    now_str,
                    "automatic",
                    match_status,
                    payload.get("artist"),
                    payload.get("album"),
                    payload.get("track"),
                    payload.get("confidence"),
                    payload.get("externalId"),
                ),
            )
            event_id = cursor.lastrowid

    if recognition_id is not None:
        db.execute(
            """INSERT INTO listening_recognitions
            (recognitionId, eventId, capturedAt)
            VALUES (?, ?, ?)""",
            (recognition_id, event_id, now_str),
        )

    db.commit()

    return (
        jsonify(
            {"matchStatus": match_status, "recordId": record_id, "eventId": event_id}
        ),
        201,
    )


""" MAIN ROUTE """


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5002)
