/* global replaceAllOnServer, renderRecords, showMessage, editingId, renderRecordList,
addRecord, saveEdit, setStatusFilter, stopEditing, replaceLocalRecords, records,
loadRecords, loadOverviewStats, loadGrowthStats, loadSpendingStats, setCurrentView, currentView */

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
   VIEWS
   ============================================ */

const navButtons = document.querySelectorAll(".nav-button");
const views = document.querySelectorAll(".view");

function renderCurrentView() {
    for (const view of views) {
        view.classList.toggle("active", view.id === "view-" + currentView);
    }
    for (const button of navButtons) {
        button.classList.toggle("nav-active", button.dataset.view === currentView);
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

            replaceLocalRecords(saved);

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

        setCurrentView(target);
        renderCurrentView();
    });
}

addButton.addEventListener("click", handleAddButtonClick);
searchInput.addEventListener("input", renderRecordList);
sortSelect.addEventListener("change", renderRecordList);
cancelButton.addEventListener("click", function () {
    stopEditing();
    setCurrentView("collection");
    renderCurrentView();
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
        setStatusFilter(tab.dataset.status);

        for (const t of statusTabs) {
            t.classList.toggle("tab-active", t === tab);
        }

        renderRecordList();
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

missingPriceToggle.addEventListener("change", renderRecordList);
exportButton.addEventListener("click", exportRecords);
importFileInput.addEventListener("change", handleImportFile);


/* ============================================
   STARTUP
   ============================================ */

//Set the starting UI state and draw the collection
async function init() {
    setCurrentView("collection");
    renderCurrentView();
    stopEditing();

    await loadRecords();
    await loadOverviewStats();
    await loadGrowthStats();
    await loadSpendingStats();
    renderRecords();
}

init();