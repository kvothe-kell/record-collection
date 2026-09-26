
/* exported FIELDS, MONTH_NAMES, COVER_COLORS */
/* ============================================
   CONSTANTS
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

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// A small set of muted, "album cover" background colors.
const COVER_COLORS = [
    "#c97b63",
    "#c9a63d",
    "#8fa66b",
    "#5f9ea0",
    "#7b8fc9",
    "#a66bb0",
    "#c96b8f",
    "#6b9e8f"
];