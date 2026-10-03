from dotenv import load_dotenv

load_dotenv()
import json
import os
import sqlite3
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd
from flask import Flask, Response, g, jsonify, request

from discogs import fetch_cover
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
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def row_to_dict(row):
    return {key: row[key] for key in row.keys()}


def parse_listening_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Timestamp must be a non-empty string")

    timestamp = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=ZoneInfo("America/New_York"))

    return timestamp.astimezone(timezone.utc)


""" RECORD ROUTES """


# Get Record list from DB
@app.route("/api/records", methods=["GET"])
def get_records():
    rows = get_db().execute("SELECT * FROM records").fetchall()
    return jsonify([row_to_dict(row) for row in rows])


# Add New Record
@app.route("/api/records", methods=["POST"])
def create_record():
    record = request.get_json()

    if not isinstance(record, dict):
        return jsonify({"error": "Expected a record object"}), 400

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
    updated = request.get_json()

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
    cursor = db.execute("DELETE FROM records WHERE id = ?", (record_id,))
    db.commit()

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
    incoming = request.get_json()

    if not isinstance(incoming, list):
        return jsonify({"error": "Expected a list of records"}), 400

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

    event = request.get_json()
    record_id = event.get("recordId")
    if record_id is None:
        return jsonify({"error": "recordId is required"}), 400

    existing = db.execute(
        "SELECT id FROM records WHERE id = ?", (record_id,)
    ).fetchone()

    if existing is None:
        return jsonify({"error": "Record not found"}), 404

    now = datetime.now().isoformat()

    cursor = db.execute(
        """INSERT INTO listening_events (recordId, playedAt, lastSeenAt, source, matchStatus, notes)
       VALUES (?, ?, ?, ?, ?, ?)""",
        (record_id, now, now, "manual", "matched", event.get("notes")),
    )
    db.commit()

    row = db.execute(
        "SELECT * FROM listening_events WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()

    return jsonify(row_to_dict(row)), 201


# Get from DB Table
@app.route("/api/listening/events", methods=["GET"])
def get_listening_events():
    rows = (
        get_db()
        .execute("SELECT * FROM listening_events ORDER BY lastSeenAt DESC")
        .fetchall()
    )
    events = []

    for row in rows:
        event = row_to_dict(row)
        event["playedAt"] = parse_listening_timestamp(event["playedAt"]).isoformat()
        event["lastSeenAt"] = parse_listening_timestamp(event["lastSeenAt"]).isoformat()
        events.append(event)

    return jsonify(events)


# Receive event from Pi
@app.route("/api/listening/recognize", methods=["POST"])
def recognize_listening_event():
    db = get_db()

    if (
        PI_API_TOKEN
        and request.headers.get("Authorization") != f"Bearer {PI_API_TOKEN}"
    ):
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json()

    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON object"}), 400

    recognition_id = payload.get("recognitionId")

    if recognition_id is not None:
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
        if "capturedAt" in payload:
            now = parse_listening_timestamp(payload["capturedAt"])
        else:
            now = datetime.now(timezone.utc)
    except ValueError:
        db.rollback()
        return jsonify({"error": "capturedAt must be a valid ISO timestamp"}), 400

    now_str = now.isoformat()

    artist = (payload.get("artist") or "").strip()
    album = (payload.get("album") or "").strip()

    if not artist or not album:
        return jsonify({"error": "artist and album are required"}), 400

    matches = (
        get_db()
        .execute(
            """SELECT * FROM records
        WHERE status != 'want'
        AND LOWER(artist) = LOWER(?)
        AND LOWER(album) = LOWER(?)
        ORDER BY id""",
            (artist, album),
        )
        .fetchall()
    )

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
