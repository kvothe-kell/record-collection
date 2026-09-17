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
    """Write the collection to disk."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)


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
    app.run(debug=True, port=5002)
