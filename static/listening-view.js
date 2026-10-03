/* global listeningEvents, records, makeDiv, joinParts, createCoverElement, makeSummaryCard, resolveListeningEventOnServer, loadListeningEvents, showMessage */
/* exported renderListeningHistory, renderRecentlyDetected, renderListeningSummary */

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

function renderRecentlyDetected() {
    recentlyDetectedArea.replaceChildren();

    const latestEvent = listeningEvents[0];

    if (!latestEvent) {
        recentlyDetectedArea.appendChild(
            makeDiv("listening-empty", "No recently detected records.")
        );
        return;
    }

    const card = createListeningEventElement(latestEvent);
    card.classList.add("recently-detected-card");

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