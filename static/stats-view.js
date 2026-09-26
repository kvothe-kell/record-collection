/* global overviewStats, growthStats, spendingStats, makeDiv, formatPrice, formatMonthLabel */
/* exported renderStats, renderSummaryCards, renderGrowthPanel, renderSpendingPanel */


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

function makeGenreChart(counts) {
    const box = document.createElement("div");
    box.className = "stat-panel";
    box.appendChild(makeDiv("stat-label", "By Genre"));

    const genres = Object.entries(counts).sort(function (a, b) {
        return b[1] - a[1];
    }).slice(0, 5);

    const biggest = Math.max(...genres.map(function (d) { return d[1]; }));

    for (const genre of genres) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.appendChild(makeDiv("stat-row-name", genre[0]));

        const track = document.createElement("div");
        track.className = "bar-track";

        const bar = document.createElement("div");
        bar.className = "bar-fill";
        bar.style.width = (genre[1] / biggest * 100) + "%";
        track.appendChild(bar);

        row.appendChild(track);
        row.appendChild(makeDiv("stat-row-count", genre[1]));
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
function renderStats() {
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
    statsArea.appendChild(makeDecadeChart(stats.byDecade));
    statsArea.appendChild(makeGenreChart(stats.byGenre))
}

// Draw the growth panel on the stats page.
function renderGrowthPanel() {
    if (!growthStats) {
        return;
    }

    growthPanelArea.innerHTML = "";
    growthPanelArea.appendChild(makeDiv("stat-label", "Records Added by Month"));

    const months = Object.entries(growthStats).sort(function (a, b) {
        return a[0].localeCompare(b[0]);
    });

    const biggest = Math.max(...months.map(function (m) { return m[1]; }));

    for (const month of months) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.appendChild(makeDiv("stat-row-name", formatMonthLabel(month[0])));

        const track = document.createElement("div");
        track.className = "bar-track";

        const bar = document.createElement("div");
        bar.className = "bar-fill";
        bar.style.width = (month[1] / biggest * 100) + "%";
        track.appendChild(bar);

        row.appendChild(track);
        row.appendChild(makeDiv("stat-row-count", month[1]));
        growthPanelArea.appendChild(row);
    }
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


    const months = Object.entries(stats.spendingByMonth).sort(function (a, b) {
        return a[0].localeCompare(b[0]);
    });

    const biggest = Math.max(...months.map(function (m) { return m[1]; }));

    const box = document.createElement("div");
    box.className = "stat-panel";
    box.appendChild(makeDiv("stat-label", "Spending by Month"));

    for (const month of months) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.appendChild(makeDiv("stat-row-name", formatMonthLabel(month[0])));

        const track = document.createElement("div");
        track.className = "bar-track";

        const bar = document.createElement("div");
        bar.className = "bar-fill";
        bar.style.width = (month[1] / biggest * 100) + "%";
        track.appendChild(bar);

        row.appendChild(track);
        row.appendChild(makeDiv("stat-row-count", formatPrice(month[1])));
        box.appendChild(row);
    }

    spendingStatsArea.appendChild(box);
}