/* global overviewStats, growthStats, spendingStats, makeDiv, formatPrice, */
/* exported renderStatsPanel, renderSummaryCards, renderGrowthPanel, renderSpendingPanel */


/* ============================================
   DOM REFERENCES
   ============================================ */
const summaryCardsArea = document.getElementById("summary-cards");
const statsArea = document.getElementById("stats");
const growthPanelArea = document.getElementById("growth-panel");
const spendingStatsArea = document.getElementById("spending-panel")



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
        row.appendChild(makeDiv("stat-row-name", entry.name));
        row.appendChild(makeDiv("stat-row-count", entry.count));
        box.appendChild(row);
    }

    return box;
}

/* ============================================
   PANELS
   ============================================ */
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

//Bar Chart Creator
function makeBarChart(title, entries, formatValue) {
    const box = document.createElement("div");
    box.className = "stat-panel";
    box.appendChild(makeDiv("stat-label", title));

    const biggest = Math.max(...entries.map(function (e) { return e[1]; }));

    for (const entry of entries) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.appendChild(makeDiv("stat-row-name", entry[0]));

        const track = document.createElement("div");
        track.className = "bar-track";

        const bar = document.createElement("div");
        bar.className = "bar-fill";
        bar.style.width = (entry[1] / biggest * 100) + "%";
        track.appendChild(bar);

        row.appendChild(track);
        row.appendChild(makeDiv("stat-row-count", formatValue(entry[1])));
        box.appendChild(row);
    }

    return box;
}

/* ============================================
   RENDERING
   ============================================ */
//Draw the sumary cards on the main page.
function renderSummaryCards() {
    if (!overviewStats) {
        return;
    }

    const stats = overviewStats;

    summaryCardsArea.innerHTML = "";
    summaryCardsArea.appendChild(makeSummaryCard("Collection Size", stats.count));
    summaryCardsArea.appendChild(makeSummaryCard(
        "Total Spent", formatPrice(stats.totalSpent),
        "Avg " + formatPrice(stats.averagePrice) + " / record"));

    const topArtist = stats.topArtists[0];
    if (topArtist) {
        summaryCardsArea.appendChild(makeSummaryCard(
            "Top Artist", topArtist.name, topArtist.count + " / records"));
    }

    const topGenre = stats.topGenres[0];
    if (topGenre) {
        summaryCardsArea.appendChild(makeSummaryCard(
            "Top Genre", topGenre.name, topGenre.count + " / records"));
    }
}

//Draw the overview panel on the stats page.
function renderStatsPanel() {
    if (!overviewStats) {
        return;
    }

    const stats = overviewStats;

    statsArea.innerHTML = "";

    statsArea.appendChild(makeStat("Records", stats.count));
    statsArea.appendChild(makeStat("Total Spent", formatPrice(stats.totalSpent)))
    statsArea.appendChild(makeStat("Average Price", formatPrice(stats.averagePrice)));
    statsArea.appendChild(makeStat("Average Rating", stats.averageRating.toFixed(2)));
    // statsArea.appendChild(makeStat("Price Unknown", stats.missingPrice));
    statsArea.appendChild(makeStatList("Top Artists", stats.topArtists));
    statsArea.appendChild(makeStatList("Top Labels", stats.topLabels));
    statsArea.appendChild(makeBarChart("By Decade",
        Object.entries(stats.byDecade).sort(function (a, b) {
            return a[0].localeCompare(b[0]);
        }),
        function (v) { return v; }
    ));
    statsArea.appendChild(makeBarChart("By Genre",
        Object.entries(stats.byGenre).sort(function (a, b) {
            return b[1] - a[1];
        }).slice(0, 5),
        function (v) { return v; }
    ));
}


// Draw the growth panel on the stats page.
function renderGrowthPanel() {
    if (!growthStats) {
        return;
    }

    const stats = growthStats;

    growthPanelArea.innerHTML = "";
    growthPanelArea.appendChild(makeBarChart("Records Added by Month",
        Object.entries(stats.byMonth).sort(function (a, b) {
            return a[0].localeCompare(b[0]);
        }),
        function (v) { return v; }
    ));
}

// Draw the spending summary panel on the stats page. 
function renderSpendingPanel() {
    if (!spendingStats) {
        return;
    }

    const stats = spendingStats;

    spendingStatsArea.innerHTML = "";
    spendingStatsArea.appendChild(makeStat("Median Price", formatPrice(stats.medianPrice)));
    if (stats.mostExpensive) {
        spendingStatsArea.appendChild(makeStat(
            "Most Expensive: " + stats.mostExpensive.artist + " - " + stats.mostExpensive.album,
            formatPrice(stats.mostExpensive.price)
        ));
    }
    spendingStatsArea.appendChild(makeBarChart("Spending By Month",
        Object.entries(stats.spendingByMonth).sort(function (a, b) {
            return a[0].localeCompare(b[0]);
        }),
        formatPrice
    ));
}