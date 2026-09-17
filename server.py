import json
import os

from flask import Flask, jsonify, request

app = Flask(__name__, static_folder="static", static_url_path="")

DATA_FILE = "records.json"


def load_records():
    """Read the collection from disk, or return and empty list."""
    if not os.path.exists(DATA_FILE):
        return []

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.route("/api/records", methods=["GET"])
def get_records():
    return jsonify(load_records())


def save_records(records):
    """Write the collection to disk atomically."""
    temp = DATA_FILE + ".tmp"

    with open(temp, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    os.replace(temp, DATA_FILE)


@app.route("/api/records", methods=["POST"])
def create_record():
    record = request.get_json()

    if not isinstance(record, dict):
        return jsonify({"error": "Expected a record object"}), 400

    records = load_records()
    records.append(record)
    save_records(records)

    return jsonify(record), 201


@app.route("/api/records/<int:record_id>", methods=["PUT"])
def update_record(record_id):
    updated = request.get_json()
    records = load_records()

    for i, record in enumerate(records):
        if record.get("id") == record_id:
            records[i] = updated
            save_records(records)
            return jsonify(updated)

    return jsonify({"error": "Record not found"}), 404


@app.route("/api/records/<int:record_id>", methods=["DELETE"])
def delete_record(record_id):
    records = load_records()
    remaining = [r for r in records if r.get("id") != record_id]

    if len(remaining) == len(records):
        return jsonify({"error": "Record not found"}), 404

    save_records(remaining)
    return jsonify({"deleted": record_id})


@app.route("/api/records", methods=["PUT"])
def put_records():
    records = request.get_json()

    if not isinstance(records, list):
        return jsonify({"error": "Expected a list of records"}), 400

    save_records(records)
    return jsonify({"saved": len(records)})


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5002)
