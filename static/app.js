/* ============================================
   FORM FIELD CONFIG
   ============================================ */
const FIELDS = [
    { key: "artist", inputId: "artist", type: "text", required: true },
    { key: "album", inputId: "album", type: "text", required: true },
    { key: "year", inputId: "year", type: "number", required: true },
    { key: "label", inputId: "label", type: "text" },
    { key: "format", inputId: "format", type: "text" },
    { key: "genre", inputId: "genre", type: "text", required: true },
    { key: "subgenre", inputId: "subgenre", type: "text" },
    { key: "releaseId", inputId: "release-id", type: "number" },
    { key: "status", inputId: "status", type: "text", defaultValue: "owned" },
    { key: "rating", inputId: "rating", type: "number" },
    { key: "mediaCondition", inputId: "media-condition", type: "text" },
    { key: "sleeveCondition", inputId: "sleeve-condition", type: "text" },
    { key: "purchasePrice", inputId: "purchase-price", type: "number" },
    { key: "purchaseLocation", inputId: "purchase-location", type: "text" },
    { key: "dateAdded", inputId: "date-added", type: "text" }
];

for (const field of FIELDS) {
    field.input = document.getElementById(field.inputId);
};

/* ============================================
   DOM REFERENCES
   ============================================ */
const addButton = document.getElementById("add-button");
const messageArea = document.getElementById("message");
const collectionList = document.getElementById("collection");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const cancelButton = document.getElementById("cancel-button");
const statsArea = document.getElementById("stats");
const summaryCardsArea = document.getElementById("summary-cards");
const statusTabs = document.querySelectorAll(".status-tab");
const missingPriceToggle = document.getElementById("missing-price");
const exportButton = document.getElementById("export-button")
const importFileInput = document.getElementById("import-file");
const dialogContent = document.getElementById("dialog-content");
const recordDialog = document.getElementById("record-dialog");
const recordDialogClose = document.getElementById("dialog-close-button");
const genreListArea = document.getElementById("genre-list");

/* ============================================
   STATE
   ============================================ */

const records = [];
let editingId = null;
let statusFilterValue = "all";
let genreFilterValue = "";

/* ============================================
   DISPLAY HELPERS
   ============================================ */

// Create div with a class and some text. 
function makeDiv(className, text) {
    const div = document.createElement("div")
    div.className = className;
    div.textContent = text;
    return div;
}

// Join the values that actually exisit, seperated by a dot.
function joinParts(parts) {
    return parts.filter(Boolean).join(" · ");
}

// 90 -> $90.00, null ->""
function formatPrice(price) {
    if (price === null || price === undefined) {
        return "";
    }
    return price.toLocaleString("en-US", {
        style: "currency",
        currency: "USD"
    });
}

// Rating 3 to Stars
function formatRating(rating) {
    let stars = Number(rating) || 0;
    if (stars < 0) stars = 0;
    if (stars > 5) stars = 5;
    return "★".repeat(stars) + "☆".repeat(5 - stars);
}

// A small set of muted, "album cover" background colors.
const COVER_COLORS = [
    "#c97b63",
    "#c9a63d",
    "#8fa66b",
    "#5f9ea0",
    "#7b8fc9",
    "#a66bb0",
    "#c96b8f",
    "#6b9e8f"
];

// Turn any string into a stable, non-negative number.
// Same input always produces the same output, so a given
// album always lands on the same color.
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = hash * 31 + str.charCodeAt(i) | 0;
    }
    return Math.abs(hash);
}

// Pick a cover color for a record, based on artist + album.
function coverColorFor(record) {
    const key = record.artist + record.album;
    const index = hashString(key) % COVER_COLORS.length;
    return COVER_COLORS[index];
}

// Build the <li> for one record
function createRecordElement(record) {
    const item = document.createElement("li");
    item.className = "record-card";

    const cover = document.createElement("div");
    cover.className = "record-cover";
    cover.style.backgroundColor = coverColorFor(record);
    cover.appendChild(makeDiv("record-cover-title", record.album));

    const body = document.createElement("div");
    body.className = "record-body";
    body.appendChild(makeDiv("record-title", record.artist));
    body.appendChild(makeDiv("record-meta", joinParts([record.year, record.genre])));

    const actions = document.createElement("div");
    actions.className = "record-actions"

    const editButton = document.createElement("button");
    editButton.className = "record-edit";
    editButton.textContent = "Edit"
    editButton.addEventListener("click", function (event) {
        event.stopPropagation()
        startEditing(record.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "record-delete";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", function (event) {
        event.stopPropagation();
        deleteRecord(record.id);
    });

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);

    item.appendChild(cover);
    item.appendChild(body);
    item.appendChild(actions);

    item.addEventListener("click", function () {
        openRecordDialog(record);
    });

    return item;
}

/* ============================================
   STATS
   ============================================ */

// Work out the headline numbers for a set of records.
function computeStats(list) {
    const owned = list.filter(function (record) {
        return record.status !== "want";
    });

    const totalSpent = owned.reduce(function (sum, record) {
        return sum + (record.purchasePrice || 0);
    }, 0);

    const rated = owned.filter(function (record) {
        return record.rating > 0;
    });

    const ratingTotal = rated.reduce(function (sum, record) {
        return sum + record.rating;
    }, 0);

    const withPrice = owned.filter(function (record) {
        return record.purchasePrice !== null && record.purchasePrice !== undefined;
    });

    const byArtist = countBy(owned, function (r) { return r.artist; });
    const byGenre = countBy(owned, function (r) { return r.genre; });
    const byLabel = countBy(owned, function (r) { return r.label; });
    const byDecade = countBy(owned, function (r) {
        return r.year ? Math.floor(r.year / 10) * 10 + "s" : "";
    });

    return {
        count: owned.length,
        totalSpent: totalSpent,
        averagePrice: withPrice.length ? totalSpent / withPrice.length : 0,
        averageRating: rated.length ? ratingTotal / rated.length : 0,
        missingPrice: owned.length - withPrice.length,
        topArtists: topEntries(byArtist, 5),
        topLabels: topEntries(byLabel, 5),
        topGenres: topEntries(byGenre, 5),
        byGenre: byGenre,
        byDecade: byDecade
    };
}

//Draw the stats panel.
function renderStats(list) {
    const stats = computeStats(list);

    statsArea.innerHTML = "";

    statsArea.appendChild(makeStat("Records", stats.count));
    statsArea.appendChild(makeStat("Total Spent", formatPrice(stats.totalSpent)))
    statsArea.appendChild(makeStat("Average Price", formatPrice(stats.averagePrice)));
    statsArea.appendChild(makeStat("Average Rating", stats.averageRating.toFixed(2)));
    statsArea.appendChild(makeStat("Price Unknown", stats.missingPrice));

    statsArea.appendChild(makeStatList("Top Artists", stats.topArtists));
    statsArea.appendChild(makeStatList("Top Labels", stats.topLabels));
    statsArea.appendChild(makeDecadeChart(stats.byDecade));
}
//Draw the summary cards
function makeSummaryCard(label, value, sub) {
    const card = document.createElement("div");
    card.className = "summary-card";
    card.appendChild(makeDiv("summary-card-label", label));
    card.appendChild(makeDiv("summary-card-value", value));
    if (sub) {
        card.appendChild(makeDiv("summary-card-sub", sub));
    }
    return card;
}
function renderSummaryCards(list) {
    const stats = computeStats(list);

    summaryCardsArea.innerHTML = "";
    summaryCardsArea.appendChild(makeSummaryCard("Collection Size", stats.count));
    summaryCardsArea.appendChild(makeSummaryCard(
        "Total Spent", formatPrice(stats.totalSpent),
        "Avg " + formatPrice(stats.averagePrice) + " / record"));

    const topArtist = stats.topArtists[0];
    if (topArtist) {
        summaryCardsArea.appendChild(makeSummaryCard(
            "Top Artist", topArtist[0], topArtist[1] + " records"));
    }

    const topGenre = stats.topGenres[0];
    if (topGenre) {
        summaryCardsArea.appendChild(makeSummaryCard(
            "Top Genre", topGenre[0], topGenre[1] + " records"));
    }
}

function renderGenreList() {
    const stats = computeStats(records);
    const genres = Object.entries(stats.byGenre).sort(function (a, b) {
        return b[1] - a[1];
    });

    genreListArea.innerHTML = "";

    for (const entry of genres) {
        const name = entry[0];
        const count = entry[1];

        const chip = document.createElement("button");
        chip.className = "genre-chip";
        chip.textContent = name + " (" + count + ")";
        chip.classList.toggle("chip-active", name === genreFilterValue);

        chip.addEventListener("click", function () {
            genreFilterValue = (genreFilterValue === name) ? "" : name;
            renderRecords();
        });

        genreListArea.appendChild(chip)
    }
}

// One label-and-value block.
function makeStat(label, value) {
    const box = document.createElement("div");
    box.className = "stat";
    box.appendChild(makeDiv("stat-value", value));
    box.appendChild(makeDiv("stat-label", label));
    return box;
}

function makeStatList(title, entries) {
    const box = document.createElement("div");
    box.className = "stat-panel";
    box.appendChild(makeDiv("stat-label", title));

    for (const entry of entries) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.appendChild(makeDiv("stat-row-name", entry[0]));
        row.appendChild(makeDiv("stat-row-count", entry[1]));
        box.appendChild(row);
    }

    return box;
}

function makeDecadeChart(counts) {
    const box = document.createElement("div");
    box.className = "stat-panel";
    box.appendChild(makeDiv("stat-label", "By Decade"));

    const decades = Object.entries(counts).sort(function (a, b) {
        return a[0].localeCompare(b[0]);
    });

    const biggest = Math.max(...decades.map(function (d) { return d[1]; }));

    for (const decade of decades) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.appendChild(makeDiv("stat-row-name", decade[0]));

        const track = document.createElement("div");
        track.className = "bar-track";

        const bar = document.createElement("div");
        bar.className = "bar-fill";
        bar.style.width = (decade[1] / biggest * 100) + "%";
        track.appendChild(bar);

        row.appendChild(track);
        row.appendChild(makeDiv("stat-row-count", decade[1]));
        box.appendChild(row);
    }

    return box;
}

function countBy(list, getKey) {
    return list.reduce(function (counts, record) {
        const key = getKey(record);

        if (key) {
            counts[key] = (counts[key] || 0) + 1;
        }

        return counts;
    }, {});
}

function topEntries(counts, limit) {
    return Object.entries(counts)
        .sort(function (a, b) {
            return b[1] - a[1];
        })
        .slice(0, limit);
}


/* ============================================
   RECORD DETAIL DIALOG
   ============================================ */

// One "Label: value" row for the detail dialog.
function makeDialogRow(label, value) {
    const row = document.createElement("div");
    row.className = "dialog-row";

    const isEmpty = value === null || value === undefined || value === "";
    row.appendChild(makeDiv("dialog-row-label", label));
    row.appendChild(makeDiv("dialog-row-value", isEmpty ? "-" : value));

    return row;
}

function renderRecordDialog(record) {
    dialogContent.innerHTML = "";

    dialogContent.appendChild(makeDiv("dialog-title", record.album));
    dialogContent.appendChild(makeDiv("dialog-subtitle", record.artist));

    dialogContent.appendChild(makeDialogRow("Year", record.year));
    dialogContent.appendChild(makeDialogRow("Label", record.label));
    dialogContent.appendChild(makeDialogRow("Format", record.format));
    dialogContent.appendChild(makeDialogRow("Genre", record.genre));
    dialogContent.appendChild(makeDialogRow("Subgenre", record.subgenre));

    dialogContent.appendChild(makeDialogRow("Status", record.status));
    dialogContent.appendChild(makeDialogRow("Rating", record.rating ? formatRating(record.rating) : null));
    dialogContent.appendChild(makeDialogRow("Media Condition", record.mediaCondition));
    dialogContent.appendChild(makeDialogRow("Sleeve Condition", record.sleeveCondition));

    dialogContent.appendChild(makeDialogRow("Price Paid", record.purchasePrice === null ? null : formatPrice(record.purchasePrice)));
    dialogContent.appendChild(makeDialogRow("Bought From", record.purchaseLocation));
    dialogContent.appendChild(makeDialogRow("Date Added", record.dateAdded));

    dialogContent.appendChild(makeDialogRow("Discogs ID", record.releaseId));
}

// Fill the dialog with a record and show it.
function openRecordDialog(record) {
    renderRecordDialog(record);
    recordDialog.showModal();
}


/* ============================================
   VIEWS
   ============================================ */

const navButtons = document.querySelectorAll(".nav-button");
const views = document.querySelectorAll(".view");

//Show one view and higlight it's nav button.
function showView(name) {
    for (const view of views) {
        view.classList.toggle("active", view.id === "view-" + name);
    }

    for (const button of navButtons) {
        button.classList.toggle("nav-active", button.dataset.view === name);
    }
}


/* ============================================
   RENDERING
   ============================================ */

function updateStatusTabsCounts() {
    const ownedCount = records.filter(function (record) {
        return (record.status || "owned") !== "want";
    }).length;

    const wantCount = records.length - ownedCount;

    for (const tab of statusTabs) {
        const status = tab.dataset.status;
        let count;

        if (status === "all") {
            count = records.length;
        } else if (status === "owned") {
            count = ownedCount;
        } else {
            count = wantCount;
        }

        tab.textContent = tab.dataset.label + " " + count;
    }
}

function renderRecords() {
    collectionList.innerHTML = "";

    const query = searchInput.value.toLowerCase();
    updateStatusTabsCounts();
    renderSummaryCards(records);
    renderGenreList();
    const statusValue = statusFilterValue;

    const visibleRecords = records
        .filter(function (record) {
            return statusValue === "all" || (record.status || "owned") === statusValue;
        })
        .filter(function (record) {
            return genreFilterValue === "" || record.genre === genreFilterValue;
        })
        .filter(function (record) {
            if (!missingPriceToggle.checked) {
                return true;
            }
            return record.purchasePrice === null || record.purchasePrice === undefined;
        })
        .filter(function (record) {
            return (record.artist || "").toLowerCase().includes(query)
                || (record.album || "").toLowerCase().includes(query)
                || (record.genre || "").toLowerCase().includes(query)
                || (record.subgenre || "").toLowerCase().includes(query)
                || (record.label || "").toLowerCase().includes(query)
                || (record.purchaseLocation || "").toLowerCase().includes(query);
        });

    const sortBy = sortSelect.value;
    visibleRecords.sort(function (a, b) {
        if (sortBy === "year") {
            return a.year - b.year;
        }
        if (sortBy === "rating") {
            return b.rating - a.rating;
        }
        if (sortBy === "added") {
            return b.id - a.id;
        }

        const primary = (a[sortBy] || "").localeCompare(b[sortBy] || "");
        if (primary !== 0) {
            return primary;
        }
        return (a.album || "").localeCompare(b.album || "");
    });

    renderStats(visibleRecords);

    if (visibleRecords.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "No records found.";
        empty.className = "empty-state";
        collectionList.appendChild(empty);
        return;
    }

    for (const record of visibleRecords) {
        collectionList.appendChild(createRecordElement(record));
    }
}


/* ============================================
   FORM HELPERS
   ============================================ */

// Empty every input in the form. 
function clearForm() {
    for (const field of FIELDS) {
        field.input.value = field.defaultValue || "";
    }
}

// True only when every required field has something in it. 
function formIsValid() {
    return FIELDS.every(function (field) {
        return !field.required || field.input.value.trim() !== "";
    });
}

// Build a record object from the current form values.
function readForm() {
    const record = {};
    for (const field of FIELDS) {
        const raw = field.input.value.trim();

        if (field.type === "number") {
            record[field.key] = raw === "" ? null : Number(raw);
        } else {
            record[field.key] = raw;
        }
    }

    return record;
}

// Put a record's values into the form.
function fillForm(record) {
    for (const field of FIELDS) {
        const value = record[field.key];
        field.input.value = value === null || value === undefined ? "" : value;
    }
}

//Show message, then clear after a few seconds.
function showMessage(text, tone) {
    messageArea.textContent = text;
    messageArea.className = "message-" + (tone || "error");

    setTimeout(function () {
        messageArea.textContent = "";
        messageArea.className = "";
    }, 3000);
}

/* ============================================
   ADD & EDIT
   ============================================ */

//Build a record from the form and add it to the array.
async function addRecord() {
    if (!formIsValid()) {
        showMessage("Hey Dummy, please fill in all fields.");
        return;
    }

    const newRecord = readForm();

    try {
        const saved = await createRecordOnServer(newRecord);
        records.push(saved);
        clearForm();
        renderRecords();
    } catch (error) {
        showMessage("Couldn't save: " + error.message);
    }
}

// Fill the form with a record's values and switch to edit mode.
function startEditing(id) {
    const record = records.find(function (r) {
        return r.id === id;
    });

    if (!record) {
        return;
    }

    editingId = id;
    fillForm(record);
    showView("add");

    addButton.textContent = "Save Changes";
    cancelButton.style.display = "inline-block";
}

async function saveEdit() {
    if (!formIsValid()) {
        showMessage("Hey Dummy, please fill in all fields.");
        return;
    }

    const record = records.find(function (r) {
        return r.id === editingId;
    });

    if (!record) {
        return;
    }

    const updated = { ...record, ...readForm() };

    try {
        await updateRecordOnServer(updated);
        Object.assign(record, updated);
        stopEditing();
        showView("collection");
        renderRecords();
    } catch (error) {
        showMessage("Couldn't save: " + error.message);
    }
}

function stopEditing() {
    editingId = null;
    clearForm();
    addButton.textContent = "Add Record";
    cancelButton.style.display = "none";
}

/* ============================================
   DELETE
   ============================================ */

// Delete a record from the array and redraw the list.
async function deleteRecord(id) {
    const index = records.findIndex(function (record) {
        return record.id === id;
    });

    if (index === -1) {
        return;
    }

    try {
        await deleteRecordOnServer(id);
        records.splice(index, 1);
        renderRecords();
    } catch (error) {
        showMessage("Couldn't delete: " + error.message);
    }
}

/* ============================================
   PERSISTENCE
   ============================================ */

const JSON_HEADERS = { "Content-Type": "application/json" };

// Send one API request and throw if the server refuses it. 
async function apiFetch(url, options) {
    const response = await fetch(url, options || {});

    if (!response.ok) {
        throw new Error("Server returned " + response.status);
    }

    return response.json();
}

async function createRecordOnServer(record) {
    return apiFetch("/api/records", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(record)
    });
}

async function updateRecordOnServer(record) {
    return apiFetch("/api/records/" + record.id, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify(record)
    });
}


async function deleteRecordOnServer(id) {
    return apiFetch("/api/records/" + id, { method: "DELETE" });
}

async function replaceAllOnServer(list) {
    return apiFetch("/api/records", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify(list)
    });
}

// Fetch the collection from the server into the records array.
async function loadRecords() {
    try {
        const response = await fetch("/api/records");

        if (!response.ok) {
            throw new Error("Server returned " + response.status);
        }

        const loaded = await response.json();
        records.length = 0;

        for (const record of loaded) {
            records.push(record);
        }
    } catch (error) {
        showMessage("Couldn't load records: " + error.message);
    }
}


/* ============================================
   IMPORT AND EXPORT
   ============================================ */

//Download the collection as a JSON file. 
function exportRecords() {
    window.location.href = "/api/records/export";
}

//Read a JSON backup file and replace the collection with it. 
function handleImportFile(event) {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    const reader = new FileReader();

    reader.onload = async function () {
        try {
            const loaded = JSON.parse(reader.result);

            if (!Array.isArray(loaded)) {
                showMessage("That file doesn't contain a record array.");
                return;
            }

            const saved = await replaceAllOnServer(loaded);

            records.length = 0;

            for (const record of saved) {
                records.push(record);
            }

            renderRecords();

            showMessage("Loaded " + records.length + " records.", "success");
        } catch (error) {
            showMessage("Couldn't read that file: " + error.message);
        }
    };

    reader.onerror = function () {
        showMessage("Couldn't read that file.");
    };

    reader.readAsText(file);

    importFileInput.value = "";
}

/* ============================================
   EVENTS
   ============================================ */

function handleAddButtonClick() {
    if (editingId === null) {
        addRecord();
    } else {
        saveEdit();
    }
}

for (const button of navButtons) {
    button.addEventListener("click", function () {
        const target = button.dataset.view;
        if (editingId !== null && target !== "add") {
            stopEditing();
        }

        showView(target);
    });
}

addButton.addEventListener("click", handleAddButtonClick);
searchInput.addEventListener("input", renderRecords);
sortSelect.addEventListener("change", renderRecords);
cancelButton.addEventListener("click", function () {
    stopEditing();
    showView("collection");
});
recordDialogClose.addEventListener("click", function () {
    recordDialog.close()
});
recordDialog.addEventListener("click", function (event) {
    if (event.target === recordDialog) {
        recordDialog.close();
    }
});

for (const tab of statusTabs) {
    tab.addEventListener("click", function () {
        statusFilterValue = tab.dataset.status;

        for (const t of statusTabs) {
            t.classList.toggle("tab-active", t === tab);
        }

        renderRecords();
    });
}

document.addEventListener("keydown", function (event) {
    if (event.key !== "/") {
        return;
    }

    const active = document.activeElement;
    const isTpying = active.tagName === "INPUT"
        || active.tagName === "TEXTAREA"
        || active.tagName === "SELECT";
    if (isTpying) {
        return;
    }

    event.preventDefault();
    searchInput.focus();
})

missingPriceToggle.addEventListener("change", renderRecords);
exportButton.addEventListener("click", exportRecords);
importFileInput.addEventListener("change", handleImportFile);

//Set the starting UI state and draw the collection
showView("collection");
stopEditing();

async function init() {
    await loadRecords();
    renderRecords();
}

init();