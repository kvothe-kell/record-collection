import sqlite3

from flask import Flask, g, jsonify, request

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


@app.route("/api/records", methods=["GET"])
def get_records():
    rows = get_db().execute("SELECT * FROM records").fetchall()
    return jsonify([row_to_dict(row) for row in rows])


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


@app.route("/api/records/<int:record_id>", methods=["DELETE"])
def delete_record(record_id):
    db = get_db()
    cursor = db.execute("DELETE FROM records WHERE id = ?", (record_id,))
    db.commit()

    if cursor.rowcount == 0:
        return jsonify({"error": "Record not found"}), 404

    return jsonify({"deleted": record_id})


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5002)
