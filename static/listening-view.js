/* global listeningEvents, records, makeDiv, joinParts, createCoverElement */
/* exported renderListeningHistory */

const listeningHistoryArea = document.getElementById("listening-history");

function formatListeningTimestamp(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Unknown time";
    }

    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
    });
}

function createListeningEventElement(event) {
    const record = records.find(function (record) {
        return record.id === event.recordId;
    });

    const artist = record
        ? record.artist
        : event.recognizedArtist || "Unknown artist";

    const album = record
        ? record.album
        : event.recognizedAlbum || "Unknown album";

    const item = document.createElement("article");
    item.className = "listening-event";

    const coverRecord = record || { artist: artist, album: album };
    item.appendChild(createCoverElement(coverRecord));

    const body = document.createElement("div");
    body.className = "listening-event-body";
    item.appendChild(body);

    const heading = document.createElement("h3");
    heading.textContent = artist + " - " + album;
    body.appendChild(heading);

    body.appendChild(
        makeDiv("listening-meta", joinParts([
            event.source,
            event.matchStatus
        ]))
    );

    body.appendChild(
        makeDiv(
            "listening-time",
            "Session Started: " + formatListeningTimestamp(event.playedAt)
        )
    );

    body.appendChild(
        makeDiv(
            "listening-time",
            "Last Detected: " + formatListeningTimestamp(event.lastSeenAt)
        )
    );

    return item;
}

function renderListeningHistory() {
    listeningHistoryArea.replaceChildren();

    if (listeningEvents.length === 0) {
        listeningHistoryArea.appendChild(
            makeDiv("listening-empty", "No listening history yet.")
        );
        return;
    }

    for (const event of listeningEvents) {
        listeningHistoryArea.appendChild(
            createListeningEventElement(event)
        );
    }
}