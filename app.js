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

for (const field of FIELDS) {
    if (!field.input) console.error("Missing input for", field.inputId);
}

const addButton = document.getElementById("add-button");
const messageArea = document.getElementById("message");
const collectionList = document.getElementById("collection");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const cancelButton = document.getElementById("cancel-button");


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

// Join the values that actaully exisit, seperated by a dot.
function joinParts(parts) {
    return parts.filter(Boolean).join(" · ");
}

// 90 -> $90.00, null ->""
function formatPrice(price) {
    if (price === null || price === undefined) {
        return "";
    }
    return "$" + price.toFixed(2);
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
   RENDERING
   ============================================ */

function renderRecords() {
    collectionList.innerHTML = "";

    const query = searchInput.value.toLowerCase();

    const visibleRecords = records.filter(function (record) {
        return (record.artist || "").toLowerCase().includes(query)
            || (record.album || "").toLowerCase().includes(query)
            || (record.genre || "").toLowerCase().includes(query)
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
        return a[sortBy].localeCompare(b[sortBy]);
    });

    if (visibleRecords.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "No records found.";
        collectionList.appendChild(empty);
        return;
    }

    for (const record of visibleRecords) {
        collectionList.appendChild(createRecordElement(record))
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

// True only when every field has something in it. 
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

//Set the starting UI state and draw the collection
renderRecords();
stopEditing();