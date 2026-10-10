/* global listeningEvents, records, makeDiv, joinParts, createCoverElement, 
makeSummaryCard, resolveListeningEventOnServer, loadListeningEvents, showMessage,
listenerServerTime, listenerState, formatPrice, loadRecordTracklist */
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
        // hour: "numeric",
        // minute: "2-digit",
        // timeZoneName: "short"
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
            "Last Played: " + formatListeningTimestamp(event.lastSeenAt)
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

function createMyCopyDetails(record) {
    const section = document.createElement("section");
    section.className = "now-playing-copy";

    const heading = document.createElement("h4");
    heading.textContent = "Collection Copy";
    section.appendChild(heading);

    const fields = [
        ["Rating", record.rating != null ? record.rating + "/5" : ""],
        ["Purchase Price", formatPrice(record.purchasePrice)],
        ["Purchase Location", record.purchaseLocation],
        // ["Media Condition", record.mediaCondition],
        // ["Sleeve condition", record.sleeveCondition],
        ["Date Purchased", record.dateAdded]
    ];

    let detailCount = 0;

    for (const [label, value] of fields) {
        if (value === null || value === undefined || value === "") {
            continue;
        }

        section.appendChild(
            makeDiv("listening-meta", label + ": " + value)
        );
        detailCount++;
    }

    if (detailCount === 0) {
        section.appendChild(
            makeDiv("listening-meta", "No copy details added yet.")
        );
    }

    return section;
}

function createTrackListElement(tracks) {
    const list = document.createElement("div");
    list.className = "album-tracklist";

    for (const track of tracks) {
        if (!track || typeof track != "object") {
            continue;
        }

        const row = makeDiv(
            "album-track",
            joinParts([
                track.position,
                track.title || "Untitled track",
                track.duration
            ])
        );

        if (track.type_ === "heading") {
            row.classList.add("album-track-heading");
        }

        list.appendChild(row);

        if (Array.isArray(track.sub_tracks)) {
            const children = createTrackListElement(track.sub_tracks);
            children.classList.add("album-subtracks");
            list.appendChild(children);
        }
    }

    return list;
}

function createAlbumArtwork(record) {
    const panel = document.createElement("div");
    panel.className = "album-artwork-panel";

    panel.dataset.recordKey = JSON.stringify([record.id, record.releaseId]);

    const square = document.createElement("div");
    square.className = "album-artwork-square";
    panel.appendChild(square);

    const front = document.createElement("div");
    front.className = "album-artwork-front";
    front.appendChild(createCoverElement(record));
    square.appendChild(front);

    const back = document.createElement("div");
    back.className = "album-artwork-back";
    back.hidden = true;
    back.appendChild(makeDiv("listening-meta", "Track listing"));
    square.appendChild(back);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "album-artwork-toggle";
    button.textContent = "Show tracks";
    button.setAttribute("aria-expanded", "false");
    panel.appendChild(button);

    let tracksLoaded = false;
    let loading = false;

    if (!record.id || !record.releaseId) {
        button.disabled = true;
        button.textContent = "Tracks unavailable";
    }

    button.addEventListener("click", async function () {
        const showingTracks = back.hidden;

        square.classList.add("has-flipped");

        front.hidden = showingTracks;
        back.hidden = !showingTracks;
        button.textContent = showingTracks ? "Show artwork" : "Show Tracks";
        button.setAttribute("aria-expanded", String(showingTracks));

        if (!showingTracks || tracksLoaded || loading) {
            return;
        }

        loading = true;
        back.replaceChildren(makeDiv("listening-meta", "Loading tracks..."));

        try {
            const result = await loadRecordTracklist(record.id);

            if (result.tracklist.length === 0) {
                back.replaceChildren(
                    makeDiv("listening-meta", "No tracks listed for this pressing.")
                );
            } else {
                back.replaceChildren(createTrackListElement(result.tracklist));
            }

            tracksLoaded = true;
        } catch (error) {
            back.replaceChildren(
                makeDiv(
                    "listening-meta",
                    "Couldn't load tracks: " + error.message
                    + ". Switch to artwork and back to retry."
                )
            );
        } finally {
            loading = false;
        }
    });

    return panel;
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
        createAlbumArtwork(record || { artist: artist, album: album })
    );

    const body = document.createElement("div");
    body.className = "listening-event-body";
    card.appendChild(body);

    body.appendChild(makeDiv("now-playing-artist", artist));

    const heading = document.createElement("h3");
    heading.textContent = album;
    body.appendChild(heading);

    body.appendChild(
        makeDiv(
            "listening-time",
            "Last Played: " + formatListeningTimestamp(event.lastSeenAt)
        )
    );
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
    const previousPanel = recentlyDetectedArea.querySelector(".album-artwork-panel");
    const previousKey = previousPanel ? previousPanel.dataset.recordKey : null;
    const previousButton = previousPanel
        ? previousPanel.querySelector(".album-artwork-toggle")
        : null;
    const wasShowingTracks = previousButton
        && previousButton.getAttribute("aria-expanded") === "true";

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

            body.appendChild(createMyCopyDetails(record));
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

    const nextPanel = card.querySelector(".album-artwork-panel");

    if (wasShowingTracks && nextPanel.dataset.recordKey === previousKey) {
        nextPanel.querySelector(".album-artwork-toggle").click();
    }
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