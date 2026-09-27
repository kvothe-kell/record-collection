import os

import requests

DISCOGS_TOKEN = os.environ.get("DISCOGS_TOKEN")
COVERS_DIR = "static/covers"


def fetch_cover(release_id):
    headers = {
        "Authorization": f"Discogs token={DISCOGS_TOKEN}",
        "User-Agent": "VinylCatalogApp/1.0",
    }

    url = f"https://api.discogs.com/releases/{release_id}"
    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        print(f"Discogs release lookup failed for {release_id}: {response.status_code}")
        return None

    data = response.json()
    images = data.get("images")

    if not images:
        return None

    cover_url = images[0]["uri"]
    image_response = requests.get(cover_url, headers=headers)

    if image_response.status_code != 200:
        print(f"No images found for release {release_id}")
        return None

    os.makedirs(COVERS_DIR, exist_ok=True)
    file_path = f"{COVERS_DIR}/{release_id}.jpg"

    with open(file_path, "wb") as f:
        f.write(image_response.content)

    return f"covers/{release_id}.jpg"
