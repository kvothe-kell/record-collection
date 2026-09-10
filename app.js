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
]

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
const statusFilter = document.getElementById("status-filter");
const missingPriceToggle = document.getElementById("missing-price");

/* ============================================
   STATE
   ============================================ */

const savedRecords = localStorage.getItem("records");

const records = savedRecords ? JSON.parse(savedRecords) : [];
let editingId = null;

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

// Build the <li> for one record
function createRecordElement(record) {
    const item = document.createElement("li");
    item.className = "record";

    const info = document.createElement("div");
    info.className = "record-info";

    info.appendChild(makeDiv("record-title", `${record.artist} - ${record.album}`));
    info.appendChild(makeDiv("record-details",
        joinParts([record.year, record.label, record.format])));
    info.appendChild(makeDiv("record-tags",
        joinParts([record.genre, record.subgenre])));
    info.appendChild(makeDiv("record-purchase",
        joinParts([formatPrice(record.purchasePrice), record.purchaseLocation, record.mediaCondition])));

    const side = document.createElement("div");
    side.className = "record-side"
    side.appendChild(makeDiv("record-rating", formatRating(record.rating)));

    const actions = document.createElement("div");
    actions.className = "record-actions"

    const editButton = document.createElement("button");
    editButton.className = "record-edit";
    editButton.textContent = "Edit"
    editButton.addEventListener("click", function () {
        startEditing(record.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "record-delete";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", function () {
        deleteRecord(record.id);
    });

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    side.appendChild(actions);

    item.appendChild(info);
    item.appendChild(side);

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
   RENDERING
   ============================================ */

function renderRecords() {
    collectionList.innerHTML = "";

    const query = searchInput.value.toLowerCase();
    const statusValue = statusFilter.value;

    const visibleRecords = records
        .filter(function (record) {
            return statusValue === "all" || (record.status || "owned") === statusValue;
        })
        .filter(function (record) {
            if (!missingPriceToggle.checked) {
                return true;
            };
            return record.purchasePrice === null || record.purchasePrice === undefined
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
function showMessage(text) {
    messageArea.textContent = text;

    setTimeout(function () {
        messageArea.textContent = "";
    }, 3000);
}

/* ============================================
   ADD & EDIT
   ============================================ */

//Build a record from the form and add it to the array.
function addRecord() {
    if (!formIsValid()) {
        showMessage("Hey Dummy, please fill in all fields.");
        return;
    }

    const newRecord = readForm();
    newRecord.id = Date.now();

    records.push(newRecord);
    saveRecords();
    clearForm();
    renderRecords();
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

    addButton.textContent = "Save Changes";
    cancelButton.style.display = "inline-block";
}

function saveEdit() {
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

    Object.assign(record, readForm());

    saveRecords();
    stopEditing();
    renderRecords();
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
function deleteRecord(id) {
    const index = records.findIndex(function (record) {
        return record.id === id;
    });

    if (index !== -1) {
        records.splice(index, 1);
        saveRecords();
        renderRecords();
    }
}


/* ============================================
   PERSISTENCE
   ============================================ */

//Convert the array to text and stash it in local storage.
function saveRecords() {
    const recordsString = JSON.stringify(records);
    localStorage.setItem("records", recordsString);
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


addButton.addEventListener("click", handleAddButtonClick);
searchInput.addEventListener("input", renderRecords);
sortSelect.addEventListener("change", renderRecords);
cancelButton.addEventListener("click", stopEditing);
statusFilter.addEventListener("change", renderRecords);
missingPriceToggle.addEventListener("change", renderRecords);

//Set the starting UI state and draw the collection
renderRecords();
stopEditing();