/* exported apiFetch, createRecordOnServer, updateRecordOnServer,resolveListeningEventOnServer,
deleteRecordOnServer, replaceAllOnServer, createListeningEventOnServer */
/* ============================================
   API CALLS
   ============================================ */

const JSON_HEADERS = { "Content-Type": "application/json" };


// Send one API request and throw if the server refuses it. 
async function apiFetch(url, options) {
    const response = await fetch(url, options || {});

    if (!response.ok) {
        let message = "Server returned " + response.status;

        try {
            const body = await response.json();
            if (body && typeof body.error === "string") {
                message = body.error;
            }
        } catch {
            // Keep the fallback message if the response isn't JSON.
        }

        throw new Error(message);
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

/* ============================================
   LISTENING EVENTS
   ============================================ */

async function createListeningEventOnServer(event) {
    return apiFetch("/api/listening/events", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(event)
    });
}

async function resolveListeningEventOnServer(eventId, recordId) {
    return apiFetch("/api/listening/events/" + eventId + "/resolve", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ recordId: recordId })
    });
}