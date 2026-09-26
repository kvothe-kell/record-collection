/* global apiFetch, replaceAllOnServer, renderRecords, showMessage, editingId,
addRecord, saveEdit, stopEditing */
/* exported growthStats, overviewStats, statusFilterValue, genreFilterValue */


/* ============================================
   DOM REFERENCES
   ============================================ */
const addButton = document.getElementById("add-button");
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
let statusFilterValue = "all";
let genreFilterValue = "";
let overviewStats = null;
let growthStats = null;

// Replace the contents of the records array in place.
function replaceLocalRecords(list) {
    records.length = 0;

    for (const record of list) {
        records.push(record);
    }
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
   DATA LOADING
   ============================================ */

// Fetch the collection from the server into the records array.
async function loadRecords() {
    try {
        const loaded = await apiFetch("/api/records");
        replaceLocalRecords(loaded);

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

            replaceLocalRecords(loaded);

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


/* ============================================
   STARTUP
   ============================================ */

//Set the starting UI state and draw the collection
async function init() {
    showView("collection");
    stopEditing();

    await loadRecords();
    await loadOverviewStats();
    await loadGrowthStats();
    renderRecords();
}

init();