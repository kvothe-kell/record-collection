/* global records, overviewStats, statusFilterValue, genreFilterValue,
setGenreFilter, searchInput, sortSelect, missingPriceToggle, statusTabs, recordDialog,
makeDiv, joinParts, formatPrice, formatRating, coverColorFor,
renderStats, renderSummaryCards, renderGrowthPanel, startEditing, deleteRecord */
/* exported renderRecords */

/* ============================================
   DOM REFERENCES
   ============================================ */
const dialogContent = document.getElementById("dialog-content");
const genreListArea = document.getElementById("genre-list");
const collectionList = document.getElementById("collection");


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


function renderGenreList() {
    if (!overviewStats) {
        return;
    }

    const genres = Object.entries(overviewStats.byGenre).sort(function (a, b) {
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
            setGenreFilter(genreFilterValue === name ? "" : name);
            renderRecords();
        });

        genreListArea.appendChild(chip)
    }
}

function renderRecords() {
    collectionList.innerHTML = "";

    const query = searchInput.value.toLowerCase();
    updateStatusTabsCounts();
    renderSummaryCards();
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

    renderStats();
    renderGrowthPanel();

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