/* global MONTH_NAMES, COVER_COLORS */
/* exported makeDiv, joinParts, formatPrice, formatRating, formatMonthLabel, coverColorFor */

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

// Join the values that actually exist, seperated by a dot.
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

// Rating to Stars
function formatRating(rating) {
    let stars = Number(rating) || 0;
    if (stars < 0) stars = 0;
    if (stars > 5) stars = 5;
    return "★".repeat(stars) + "☆".repeat(5 - stars);
}

function formatMonthLabel(monthKey) {
    const parts = monthKey.split("-");
    const year = parts[0];
    const monthIndex = Number(parts[1]) - 1;
    return MONTH_NAMES[monthIndex] + " " + year;
}


// Turn any string into a stable, non-negative number.
// Same input always produces the same output, so a given
// album always lands on the same color.
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = hash * 31 + str.charCodeAt(i) | 0;
    }
    return Math.abs(hash);
}

// Pick a cover color for a record, based on artist + album.
function coverColorFor(record) {
    const key = record.artist + record.album;
    const index = hashString(key) % COVER_COLORS.length;
    return COVER_COLORS[index];
}
