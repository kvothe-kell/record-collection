/* global FIELDS, records, addButton, cancelButton, showView, showMessage, createRecordOnServer, updateRecordOnServer, deleteRecordOnServer, loadOverviewStats, loadGrowthStats, renderRecords */
/* exported addRecord, startEditing, saveEdit, deleteRecord */

let editingId = null;

for (const field of FIELDS) {
    field.input = document.getElementById(field.inputId);
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