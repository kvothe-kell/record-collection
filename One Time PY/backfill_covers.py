import sqlite3
import time

from discogs import fetch_cover

DB_FILE = "records.db"


def main():
    connection = sqlite3.connect(DB_FILE)
    rows = connection.execute(
        "SELECT id, releaseId FROM records WHERE releaseId IS NOT NULL AND coverPath IS NULL"
    ).fetchall()

    print(f"Found {len(rows)} records missing a cover.")

    for row in rows:
        record_id, release_id = row
        cover_path = fetch_cover(release_id)

        if cover_path:
            connection.execute(
                "UPDATE records SET coverPath = ? WHERE id = ?",
                (cover_path, record_id),
            )
            connection.commit()
            print(f"Saved cover for record {record_id} (release {release_id})")
        else:
            print(f"No cover found for record {record_id} (release {release_id})")

        time.sleep(1)

    connection.close()


if __name__ == "__main__":
    main()
