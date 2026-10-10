import os

import requests

DISCOGS_TOKEN = os.environ.get("DISCOGS_TOKEN")
COVERS_DIR = "static/covers"


def fetch_cover(release_id):
    headers = {
        "Authorization": f"Discogs token={DISCOGS_TOKEN}",
        "User-Agent": "VinylCatalogApp/1.0",
    }
    try:
        url = f"https://api.discogs.com/releases/{release_id}"
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code != 200:
            print(
                f"Discogs release lookup failed for {release_id}: {response.status_code}"
            )
            return None

        data = response.json()
        images = data.get("images")

        if not images:
            return None

        cover_url = images[0].get("uri")
        if not cover_url:
            return None

        image_response = requests.get(cover_url, headers=headers, timeout=10)

        if image_response.status_code != 200:
            print(f"No images found for release {release_id}")
            return None

        os.makedirs(COVERS_DIR, exist_ok=True)
        file_path = f"{COVERS_DIR}/{release_id}.jpg"

        with open(file_path, "wb") as f:
            f.write(image_response.content)

        return f"covers/{release_id}.jpg"
    except (requests.RequestException, ValueError, OSError) as error:
        print(f"Cover fetch failed for release {release_id}: {error}")
        return None


def fetch_tracklist(release_id):
    headers = {
        "Authorization": f"Discogs token={DISCOGS_TOKEN}",
        "User-Agent": "VinylCatalogApp/1.0",
    }

    try:
        url = f"https://api.discogs.com/releases/{release_id}"
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        data = response.json()
        tracklist = data.get("tracklist") if isinstance(data, dict) else None
        if not isinstance(tracklist, list):
            print(f"Invalid tracklist for release {release_id}")
            return None

        return tracklist

    except (requests.RequestException, ValueError) as error:
        print(f"Track list fetch failed for release {release_id}: {error}")
        return None
