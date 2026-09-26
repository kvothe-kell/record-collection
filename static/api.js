/* exported apiFetch, createRecordOnServer, updateRecordOnServer, deleteRecordOnServer, replaceAllOnServer */
/* ============================================
   API CALLS
   ============================================ */

const JSON_HEADERS = { "Content-Type": "application/json" };


// Send one API request and throw if the server refuses it. 
async function apiFetch(url, options) {
    const response = await fetch(url, options || {});

    if (!response.ok) {
        throw new Error("Server returned " + response.status);
    }

    return response.json();
}

async function createRecordOnServer(record) {
    return apiFetch("/api/records", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(record)
    });
}

async function updateRecordOnServer(record) {
    return apiFetch("/api/records/" + record.id, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify(record)
    });
}


async function deleteRecordOnServer(id) {
    return apiFetch("/api/records/" + id, { method: "DELETE" });
}

async function replaceAllOnServer(list) {
    return apiFetch("/api/records", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify(list)
    });
}