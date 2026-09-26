/* global FIELDS, apiFetch, createRecordOnServer, updateRecordOnServer, deleteRecordOnServer, replaceAllOnServer, renderRecords */
/* exported growthStats, overviewStats, statusFilterValue, genreFilterValue, startEditing, deleteRecord */

for (const field of FIELDS) {
    field.input = document.getElementById(field.inputId);
}


/* ============================================
   DOM REFERENCES
   ============================================ */
const addButton = document.getElementById("add-button");
const messageArea = document.getElementById("message");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const cancelButton = document.getElementById("cancel-button");
const statusTabs = document.querySelectorAll(".status-tab");
const missingPriceToggle = document.getElementById("missing-price");
const exportButton = document.getElementById("export-button");
const importFileInput = document.getElementById("import-file");
const recordDialog = document.getElementById("record-dialog");
const recordDialogClose = document.getElementById("dialog-close-button");

/* ============================================
   STATE
   ============================================ */

const records = [];
let editingId = null;
let statusFilterValue = "all";
let genreFilterValue = "";
let overviewStats = null;
let growthStats = null;


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