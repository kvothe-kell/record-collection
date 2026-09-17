import json
import os

from flask import Flask, jsonify

app = Flask(__name__, static_folder="static", static_url_path="")

DATA_FILE = "records.json"


def load_records():
    """Read the collection from disk, or return and empty list."""
    if not os.path.exists(DATA_FILE):
        return []

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/api/records")
def get_records():
    return jsonify(load_records())


if __name__ == "__main__":
    app.run(debug=True, port=5002)
