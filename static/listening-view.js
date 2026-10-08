/* global listeningEvents, records, makeDiv, joinParts, createCoverElement, 
makeSummaryCard, resolveListeningEventOnServer, loadListeningEvents, showMessage,
listenerServerTime, listenerState */
/* exported renderListeningHistory, renderRecentlyDetected, renderListeningSummary,
renderPlaybackStatus, getPlaybackStatus, refreshListeningTile */

const listeningHistoryArea = document.getElementById("listening-history");
const recentlyDetectedArea = document.getElementById("recently-detected");
const listeningSummaryArea = document.getElementById("listening-summary");

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

function getPlaybackStatus(stateLoaded) {
    if (!stateLoaded) {
        return "Playback status unavailable";
    }

    if (!listenerState) {
        return "Waiting for listener";
    }

    const serverTime = Date.parse(listenerServerTime);
    const observedAt = Date.parse(listenerState.observedAt);
    const receivedAt = Date.parse(listenerState.receivedAt)

    if (![serverTime, observedAt, receivedAt].every(Number.isFinite)) {
        return "Playback status unavailable";
    }

    const freshnessLimit = 4 * 60 * 1000;

    if (
        serverTime - observedAt >= freshnessLimit
        || serverTime - receivedAt >= freshnessLimit
    ) {
        return "Listener unavailable";
    }

    switch (listenerState.audioState) {
        case "active":
            return "Audio detected";
        case "silent":
            return "No audio detected";
        default:
            return "Playback unknown";
    }
}

function renderPlaybackStatus(stateloaded) {
    const statusArea = document.getElementById("playback-status");
    statusArea.textContent = getPlaybackStatus(stateloaded);
}

function createListeningMatchForm(event) {
    const form = document.createElement("form");
    form.className = "listening-match-form";

    const label = document.createElement("label");
    label.appendChild(document.createTextNode("Choose record: "));

    const select = document.createElement("select");
    select.required = true;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select the album you played";
    select.appendChild(placeholder);

    const ownedRecords = records.filter(function (record) {
        return (record.status || "owned") !== "want";
    });

    ownedRecords.sort(function (a, b) {
        return (a.artist + " " + a.album).localeCompare(b.artist + " " + b.album);
    });

    for (const record of ownedRecords) {
        const option = document.createElement("option");
        option.value = record.id;
        option.textContent = record.artist + " — " + record.album
            + " (record #" + record.id + ")";
        select.appendChild(option);
    }

    label.appendChild(select);
    form.appendChild(label);

    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Save match";
    form.appendChild(button);

    form.addEventListener("submit", async function (submitEvent) {
        submitEvent.preventDefault();
        select.disabled = true;
        button.disabled = true;
        button.textContent = "Saving...";

        try {
            await resolveListeningEventOnServer(event.id, Number(select.value));
        } catch (error) {
            showMessage("Couldn't save match: " + error.message);
            select.disabled = false;
            button.disabled = false;
            button.textContent = "Save match";
            return;
        }

        const refreshed = await loadListeningEvents();

        if (!refreshed) {
            button.textContent = "Saved";
            showMessage("Match saved. Refresh the page to load updated history.");
            return;
        }

        renderRecentlyDetected();
        renderListeningSummary();
        renderListeningHistory();
        showMessage("Match saved and remembered.", "success");
    });

    return form;
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

    if (
        event.source === "automatic"
        && (event.matchStatus === "unresolved" || event.matchStatus === "ambiguous")
    ) {
        body.appendChild(createListeningMatchForm(event));
    }

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

function createNowPlayingCard(event) {
    const record = event.matchStatus === "matched"
        ? records.find(function (record) {
            return record.id === event.recordId;
        })
        : null;

    const artist = record
        ? record.artist
        : event.recognizedArtist || "Unknown artist";

    const album = record
        ? record.album
        : event.recognizedAlbum || "Unknown album";

    const card = document.createElement("article");
    card.className = "listening-event recently-detected-card";

    card.appendChild(
        createCoverElement(record || { artist: artist, album: album })
    );

    const body = document.createElement("div");
    body.className = "listening-event-body";
    card.appendChild(body);

    body.appendChild(makeDiv("listening-meta", "Last detected album"));
    body.appendChild(makeDiv("now-playing-artist", artist));
    if (record) {
        const artistKey = record.artist.trim().replace(/\s+/g, " ").toLowerCase();

        const artistRecordCount = records.filter(function (ownedRecord) {
            return ownedRecord.status === "owned"
                && ownedRecord.artist.trim().replace(/\s+/g, " ").toLowerCase()
                === artistKey;
        }).length;
        const recordLabel = artistRecordCount === 1 ? "Record" : "Records";

        body.appendChild(
            makeDiv(
                "listening-meta",
                artistRecordCount + " " + recordLabel + " Owned " + " by this Artist"
            )
        );
    }

    const heading = document.createElement("h3");
    heading.textContent = album;
    body.appendChild(heading);

    body.appendChild(
        makeDiv(
            "listening-time",
            "Last detected: " + formatListeningTimestamp(event.lastSeenAt)
        )
    );

    if (
        event.matchStatus === "unresolved"
        || event.matchStatus === "ambiguous"
    ) {
        body.appendChild(
            makeDiv("listening-meta", "Choose your collection copy.")
        );
        body.appendChild(createListeningMatchForm(event));
    }

    return card;
}

function renderRecentlyDetected() {
    recentlyDetectedArea.replaceChildren();

    const latestEvent = listeningEvents.find(function (event) {
        return event.source === "automatic"
    });

    recentlyDetectedArea.dataset.eventKey = JSON.stringify(latestEvent || null);

    if (!latestEvent) {
        recentlyDetectedArea.appendChild(
            makeDiv("listening-empty", "No recently detected records.")
        );
        return;
    }

    const card = createNowPlayingCard(latestEvent);

    const body = card.querySelector(".listening-event-body");

    if (latestEvent.matchStatus === "matched" && latestEvent.recordId != null) {
        const recordSessions = listeningEvents.filter(function (event) {
            return event.recordId === latestEvent.recordId
                && event.matchStatus === "matched";
        });

        body.appendChild(
            makeDiv(
                "listening-meta",
                "Recorded Sessions: " + recordSessions.length
            )
        );

        const record = records.find(function (record) {
            return record.id === latestEvent.recordId;
        });

        if (record) {
            const details = joinParts([
                record.year,
                record.genre,
                record.subgenre,
                record.label,
                record.format
            ]);

            if (details) {
                body.appendChild(
                    makeDiv("listening-meta", details)
                );
            }
        }

    } else {
        body.appendChild(
            makeDiv(
                "listening-meta",
                "Match this recognition to a collection record to show listening stats."
            )
        );
    }

    recentlyDetectedArea.appendChild(card);
}

async function refreshListeningTile() {
    const loaded = await loadListeningEvents();

    if (!loaded) {
        return;
    }

    const latestEvent = listeningEvents.find(function (event) {
        return event.source === "automatic";
    });

    const nextKey = JSON.stringify(latestEvent || null);

    if (nextKey === recentlyDetectedArea.dataset.eventKey) {
        return;
    }

    const form = recentlyDetectedArea.querySelector(".listening-match-form");

    if (form) {
        const select = form.querySelector("select");
        const button = form.querySelector("button");

        if (
            form.contains(document.activeElement)
            || select.value != ""
            || button.disabled
        ) {
            return;
        }
    }
    renderRecentlyDetected();
}


function renderListeningSummary() {
    listeningSummaryArea.replaceChildren();

    const matchedSessions = listeningEvents.filter(function (event) {
        return event.matchStatus === "matched"
            && event.recordId != null;
    });

    const recordsPlayed = new Set(
        matchedSessions.map(function (event) {
            return event.recordId;
        })
    );

    const needsReview = listeningEvents.filter(function (event) {
        return event.matchStatus === "unresolved"
            || event.matchStatus === "ambiguous";
    });

    listeningSummaryArea.appendChild(
        makeSummaryCard("Confirmed sessions", matchedSessions.length)
    );

    listeningSummaryArea.appendChild(
        makeSummaryCard("Unique records played", recordsPlayed.size)
    );

    listeningSummaryArea.appendChild(
        makeSummaryCard("Needs review", needsReview.length)
    );
}