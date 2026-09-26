import json
import sqlite3
from datetime import date

import pandas as pd
from flask import Flask, Response, g, jsonify, request

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
]


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

    row = db.execute(
        "SELECT * FROM records WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(row_to_dict(row)), 201


# Update/Edit Record
@app.route("/api/records/<int:record_id>", methods=["PUT"])
def update_record(record_id):
    updated = request.get_json()

    assignments = ", ".join([column + " = ?" for column in COLUMNS])
    sql = "UPDATE records SET " + assignments + " WHERE id = ?"
    values = [updated.get(column) for column in COLUMNS] + [record_id]

    db = get_db()

    try:
        cursor = db.execute(sql, values)
        db.commit()
    except sqlite3.IntegrityError as error:
        return jsonify({"error": str(error)}), 409

    if cursor.rowcount == 0:
        return jsonify({"error": "Record not found"}), 404

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


""" MAIN ROUTE """


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5002)
