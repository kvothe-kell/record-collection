/* global FIELDS, makeDiv, joinParts, formatPrice, formatRating, coverColorFor, apiFetch, createRecordOnServer, updateRecordOnServer, deleteRecordOnServer, replaceAllOnServer, renderStats, renderSummaryCards, renderGrowthPanel */
/* exported growthStats */

for (const field of FIELDS) {
    field.input = document.getElementById(field.inputId);
}


/* ============================================
   DOM REFERENCES
   ============================================ */
const addButton = document.getElementById("add-button");
const messageArea = document.getElementById("message");
const collectionList = document.getElementById("collection");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const cancelButton = document.getElementById("cancel-button");
const statusTabs = document.querySelectorAll(".status-tab");
const missingPriceToggle = document.getElementById("missing-price");
const exportButton = document.getElementById("export-button");
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
let overviewStats = null;
let growthStats = null;


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
            genreFilterValue = (genreFilterValue === name) ? "" : name;
            renderRecords();
        });

        genreListArea.appendChild(chip)
    }
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

//Show one view and higlight its nav button.
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
        await loadOverviewStats();
        await loadGrowthStats();
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
        await loadOverviewStats();
        await loadGrowthStats();
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
        await loadOverviewStats();
        await loadGrowthStats();
        renderRecords();
    } catch (error) {
        showMessage("Couldn't delete: " + error.message);
    }
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

async function loadOverviewStats() {
    try {
        overviewStats = await apiFetch("/api/stats/overview");
    } catch (error) {
        showMessage("Couldn't load stats: " + error.message);
    }
}

async function loadGrowthStats() {
    try {
        growthStats = await apiFetch("/api/stats/growth");
    } catch (error) {
        showMessage("Couldn't load growth stats: " + error.message);
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

            await loadOverviewStats();
            await loadGrowthStats();

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
    const isTyping = active.tagName === "INPUT"
        || active.tagName === "TEXTAREA"
        || active.tagName === "SELECT";
    if (isTyping) {
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
    await loadOverviewStats();
    await loadGrowthStats();
    renderRecords();
}

init();