/* ============================================
   DOM REFERENCES
   ============================================ */
const artistInput = document.getElementById("artist");
const albumInput = document.getElementById("album");
const yearInput = document.getElementById("year");
const genreInput = document.getElementById("genre");
const ratingInput = document.getElementById("rating");

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
    return parts.filter(Boolean).join(" . ");
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
    artistInput.value = "";
    albumInput.value = "";
    yearInput.value = "";
    genreInput.value = "";
    ratingInput.value = "";
}

// True only when every field has something in it. 
function formIsValid() {
    return artistInput.value && albumInput.value && yearInput.value
        && genreInput.value && ratingInput.value;
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

    const newRecord = {
        id: Date.now(),
        artist: artistInput.value,
        album: albumInput.value,
        year: Number(yearInput.value),
        genre: genreInput.value,
        rating: Number(ratingInput.value)
    };

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

    artistInput.value = record.artist;
    albumInput.value = record.album;
    yearInput.value = record.year;
    genreInput.value = record.genre;
    ratingInput.value = record.rating;

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

    record.artist = artistInput.value;
    record.album = albumInput.value;
    record.year = Number(yearInput.value);
    record.genre = genreInput.value;
    record.rating = Number(ratingInput.value);

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