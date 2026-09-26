/* global apiFetch, showMessage */
/* exported statusFilterValue, setStatusFilter, genreFilterValue, setGenreFilter,
records, replaceLocalRecords, overviewStats, growthStats, loadRecords, currentView,
setCurrentView, loadOverviewStats, loadGrowthStats, spendingStats, loadSpendingStats */

/* ============================================
   STATE
   ============================================ */
let statusFilterValue = "all";
let genreFilterValue = "";
let overviewStats = null;
let growthStats = null;
let spendingStats = null;
let currentView = "collection";

/* ============================================
   VIEW
   ============================================ */
function setCurrentView(name) {
    currentView = name;
}

/* ============================================
   FILTERS
   ============================================ */

function setStatusFilter(value) {
    statusFilterValue = value;
}

function setGenreFilter(value) {
    genreFilterValue = value;
}

/* ============================================
   RECORDS
   ============================================ */
const records = [];

// Replace the contents of the records array in place. 
function replaceLocalRecords(list) {
    records.length = 0;

    for (const record of list) {
        records.push(record);
    }
}

// Fetch the collection from the server into the records array.
async function loadRecords() {
    try {
        const loaded = await apiFetch("/api/records");
        replaceLocalRecords(loaded);

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

async function loadSpendingStats() {
    try {
        spendingStats = await apiFetch("/api/stats/spending");
    } catch (error) {
        showMessage("Couldn't load spending stats: " + error.message);
    }
}