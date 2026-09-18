import json
import os
import sqlite3

DB_File = "records.db"
JSON_FILE = "records.json"

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


def main():
    if os.path.exists(DB_File):
        print(DB_File + " already exists. Delete it first if you want to start over.")
        return

    with open(JSON_FILE, "r", encoding="utf-8") as f:
        records = json.load(f)

    connection = sqlite3.connect(DB_File)

    with open("schema.sql", "r", encoding="utf-8") as f:
        connection.executescript(f.read())

    placeholders = ", ".join(["?"] * len(COLUMNS))
    sql = (
        "INSERT INTO records (" + ", ".join(COLUMNS) + ") VALUES (" + placeholders + ")"
    )

    for record in records:
        values = [record.get(column) for column in COLUMNS]
        connection.execute(sql, values)

    connection.commit()

    count = connection.execute("SELECT COUNT(*) FROM records").fetchone()[0]
    print("Migrated " + str(count) + " records.")

    connection.close()


if __name__ == "__main__":
    main()
