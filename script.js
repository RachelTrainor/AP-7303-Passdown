/* =========================================================
   ASSET PROTECTION PASS-DOWN SYSTEM
   Version 1.0 — Browser Prototype

   Features:
   - S1–S5 shift rotation
   - Four AP posts
   - Pass-down submissions
   - Associate and manager acknowledgments
   - Seven-day history
   - Outstanding task management
   - Browser localStorage

   IMPORTANT:
   Prototype only. Use fictional workplace information.
   Records are NOT shared between computers.
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const POSTS = {
    "core-rover": "CORE Rover",
    "inbound": "Inbound",
    "outbound": "Outbound",
    "ap-office": "AP Office"
};

const SHIFTS = ["S1", "S2", "S3", "S4", "S5"];

const STORAGE_KEYS = {
    passdowns: "ap_passdowns_v1",
    tasks: "ap_tasks_v1",
    selectedShift: "ap_selected_shift_v1"
};

/*
    SHIFT SCHEDULE

    Tuesday–Friday:
    S1 -> S2 -> S3

    Saturday–Monday:
    S4 -> S5

    Special transitions:
    Friday S3 -> Saturday S4
    Monday S5 -> Tuesday S1
*/

const SHIFT_SCHEDULE = {
    0: ["S4", "S5"],       // Sunday
    1: ["S4", "S5"],       // Monday
    2: ["S1", "S2", "S3"], // Tuesday
    3: ["S1", "S2", "S3"], // Wednesday
    4: ["S1", "S2", "S3"], // Thursday
    5: ["S1", "S2", "S3"], // Friday
    6: ["S4", "S5"]        // Saturday
};

/* =========================================================
   APPLICATION STATE
========================================================= */

let passdowns = loadData(STORAGE_KEYS.passdowns);
let tasks = loadData(STORAGE_KEYS.tasks);

let selectedShift =
    localStorage.getItem(STORAGE_KEYS.selectedShift) || "";

let activePassdownId = null;
let activePost = null;

/* =========================================================
   STORAGE HELPERS
========================================================= */

function loadData(key) {
    try {
        const saved = localStorage.getItem(key);

        if (!saved) {
            return [];
        }

        const parsed = JSON.parse(saved);

        return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
        console.error("Unable to load saved data:", error);
        return [];
    }
}

function savePassdowns() {
    try {
        localStorage.setItem(
            STORAGE_KEYS.passdowns,
            JSON.stringify(passdowns)
        );
        return true;
    } catch (error) {
        showToast("Unable to save pass-down.");
        console.error(error);
        return false;
    }
}

function saveTasks() {
    try {
        localStorage.setItem(
            STORAGE_KEYS.tasks,
            JSON.stringify(tasks)
        );
        return true;
    } catch (error) {
        showToast("Unable to save tasks.");
        console.error(error);
        return false;
    }
}

/* =========================================================
   GENERAL HELPERS
========================================================= */

function createId() {
    if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2)
    );
}

function getElement(id) {
    return document.getElementById(id);
}

function getValue(id) {
    return getElement(id)?.value.trim() || "";
}

function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = value;
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Unknown date";
    }

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function formatDateTime(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Unknown time";
    }

    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function getStartOfDay(dateValue) {
    const date = new Date(dateValue);

    date.setHours(0, 0, 0, 0);

    return date;
}

function showToast(message) {
    const container = getElement("toast-container");

    if (!container) {
        alert(message);
        return;
    }

    const toast = document.createElement("div");

    toast.className = "toast";
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

/* =========================================================
   SHIFT ROTATION
========================================================= */

/*
    Returns the shift immediately before the
    selected shift on the selected date.

    Examples:
    Tuesday S1 -> Monday S5
    Wednesday S1 -> Tuesday S3
    Saturday S4 -> Friday S3
    Sunday S4 -> Saturday S5
*/

function getPreviousShift(shift, dateValue = new Date()) {
    const date = new Date(dateValue);

    const today = SHIFT_SCHEDULE[date.getDay()];

    const position = today.indexOf(shift);

    if (position === -1) {
        return null;
    }

    if (position > 0) {
        return {
            shift: today[position - 1],
            date: getStartOfDay(date)
        };
    }

    const previousDate = getStartOfDay(date);

    previousDate.setDate(previousDate.getDate() - 1);

    const yesterday =
        SHIFT_SCHEDULE[previousDate.getDay()];

    return {
        shift: yesterday[yesterday.length - 1],
        date: previousDate
    };
}

function isShiftScheduled(shift, dateValue) {
    const date = new Date(dateValue);

    return SHIFT_SCHEDULE[date.getDay()].includes(shift);
}

function isSameDay(first, second) {
    const date1 = getStartOfDay(first);
    const date2 = getStartOfDay(second);

    return date1.getTime() === date2.getTime();
}

/* =========================================================
   CURRENT PASS-DOWN LOOKUP
========================================================= */

/*
    If a shift is selected, show the pass-down
    from the immediately preceding scheduled shift.

    If no shift is selected, show the latest
    available entry for each post.

    We use the date and shift recorded on the
    pass-down rather than just the submission time.
*/

function getCurrentPassdown(post) {
    const matching = passdowns.filter(
        item => item.post === post
    );

    if (!selectedShift) {
        return matching.sort(
            (a, b) =>
                new Date(b.createdAt) -
                new Date(a.createdAt)
        )[0] || null;
    }

    const previous = getPreviousShift(selectedShift);

    if (!previous) {
        return null;
    }

    return matching
        .filter(item =>
            item.shift === previous.shift &&
            isSameDay(item.shiftDate, previous.date)
        )
        .sort(
            (a, b) =>
                new Date(b.createdAt) -
                new Date(a.createdAt)
        )[0] || null;
}

function findPassdown(id) {
    return passdowns.find(item => item.id === id);
}

/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {
    updateDate();
    renderCurrentPassdowns();
    renderRecentPassdowns();
    renderTasks();
    updateStatistics();
}

function updateDate() {
    setText(
        "current-date",
        new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        })
    );
}

function updateStatistics() {
    const recent = getRecentPassdowns();

    const outstanding = tasks.filter(
        task => task.status !== "Completed"
    );

    let pending = 0;

    Object.keys(POSTS).forEach(post => {
        const passdown = getCurrentPassdown(post);

        if (!passdown) {
            return;
        }

        if (!passdown.acknowledgments.associate) {
            pending++;
        }

        if (!passdown.acknowledgments.manager) {
            pending++;
        }
    });

    setText("pending-acknowledgments", pending);
    setText("outstanding-task-count", outstanding.length);
    setText("recent-passdown-count", recent.length);
}

/* =========================================================
   CURRENT PASS-DOWN CARDS
========================================================= */

function renderCurrentPassdowns() {
    Object.keys(POSTS).forEach(post => {
        const passdown = getCurrentPassdown(post);

        const preview = getElement(`${post}-preview`);
        const status = getElement(`${post}-status`);

        const card = document.querySelector(
            `.post-card[data-post="${post}"]`
        );

        if (!preview || !status || !card) {
            return;
        }

        const filter = getValue("post-filter") || "all";

        card.hidden =
            filter !== "all" && filter !== post;

        const viewButton = card.querySelector(
            ".view-passdown-btn"
        );

        const signButton = card.querySelector(
            ".acknowledge-btn"
        );

        if (!passdown) {
            preview.innerHTML = `
                <p class="empty-state">
                    No pass-down available for the
                    previous scheduled shift.
                </p>
            `;

            status.textContent = "No Entry";
            status.className = "badge badge-neutral";

            if (viewButton) {
                viewButton.disabled = true;
            }

            if (signButton) {
                signButton.disabled = true;
            }

            return;
        }

        const completed =
            passdown.tasksCompleted || "None reported";

        const handoff =
            passdown.tasksHandoff || "None reported";

        preview.innerHTML = `
            <div class="passdown-preview">

                <p>
                    <strong>Submitted By:</strong>
                    ${escapeHTML(passdown.employee)}
                </p>

                <p>
                    <strong>Shift:</strong>
                    ${escapeHTML(passdown.shift)}
                </p>

                <p>
                    <strong>Date:</strong>
                    ${formatDate(passdown.shiftDate)}
                </p>

                <p>
                    <strong>Tasks Completed:</strong><br>
                    ${escapeHTML(completed)}
                </p>

                <p>
                    <strong>Tasks Handed Off:</strong><br>
                    ${escapeHTML(handoff)}
                </p>

            </div>
        `;

        const associateSigned =
            Boolean(passdown.acknowledgments.associate);

        const managerSigned =
            Boolean(passdown.acknowledgments.manager);

        if (associateSigned && managerSigned) {
            status.textContent = "Acknowledged";
            status.className = "badge badge-success";
        } else {
            status.textContent = "Pending Sign-Off";
            status.className = "badge badge-warning";
        }

        if (viewButton) {
            viewButton.disabled = false;
        }

        if (signButton) {
            signButton.disabled = false;
        }
    });
}

/* =========================================================
   CREATE PASS-DOWN
========================================================= */

function openCreatePassdown(post = "") {
    const form = getElement("create-passdown-form");

    form.reset();

    getElement("passdown-shift").value =
        selectedShift || "";

    getElement("passdown-post").value = post;

    renderPostSpecificFields(post);

    openModal("create-passdown-modal");
}

/* =========================================================
   POST-SPECIFIC FIELDS
========================================================= */

function renderPostSpecificFields(post) {
    const container = getElement("post-specific-fields");

    if (!container) {
        return;
    }

    const commonFields = `
        <h3>Incident Reporting</h3>

        <div class="form-group">
            <label for="field-incidents">
                Incidents Logged into LSI
            </label>

            <textarea
                id="field-incidents"
                rows="3"
                placeholder="Incident details or none">
            </textarea>
        </div>
    `;

    let specific = "";

    if (post === "core-rover") {
        specific = `
            <h3>CORE Rover Checklist</h3>

            <div class="form-group">
                <label for="field-yard-check">
                    Yard Check Completed?
                </label>

                <select id="field-yard-check">
                    <option value="">Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                </select>
            </div>

            <div class="form-group">
                <label for="field-yard-reason">
                    If Not, Why?
                </label>

                <textarea
                    id="field-yard-reason"
                    rows="2">
                </textarea>
            </div>

            <h3>Start-Up Information</h3>

            <div class="form-group">
                <label for="field-startup-operations">
                    Operations
                </label>

                <input
                    type="text"
                    id="field-startup-operations">
            </div>

            <div class="form-group">
                <label for="field-startup-leader">
                    Leader
                </label>

                <input
                    type="text"
                    id="field-startup-leader">
            </div>

            <div class="form-group">
                <label for="field-startup-safety-team">
                    Safety Team
                </label>

                <input
                    type="text"
                    id="field-startup-safety-team">
            </div>

            <div class="form-group">
                <label for="field-startup-safety-topic">
                    Safety Topic
                </label>

                <textarea
                    id="field-startup-safety-topic"
                    rows="2">
                </textarea>
            </div>

            <div class="form-group">
                <label for="field-startup-safety-incident">
                    Safety Incident
                </label>

                <textarea
                    id="field-startup-safety-incident"
                    rows="2">
                </textarea>
            </div>

            <h3>PIT Training</h3>

            <div class="form-group">
                <label for="field-pit-training">
                    Associate / Pre-Test Logged / Certified
                </label>

                <textarea
                    id="field-pit-training"
                    rows="3"
                    placeholder="Enter training information">
                </textarea>
            </div>

            <h3>Collaterals</h3>

            <div class="form-group">
                <label for="field-collaterals">
                    APA Name / Collateral Completed
                </label>

                <textarea
                    id="field-collaterals"
                    rows="3">
                </textarea>
            </div>
        `;
    }

    if (post === "ap-office") {
        specific = `
            <h3>AP Office Checklist</h3>

            <div class="form-group">
                <label for="field-keys">
                    Keys Still Logged Out / Reason
                </label>

                <textarea
                    id="field-keys"
                    rows="3">
                </textarea>
            </div>

            <div class="form-group">
                <label for="field-lockers">
                    Lockers Issued / Tracker Updated
                </label>

                <textarea
                    id="field-lockers"
                    rows="3">
                </textarea>
            </div>

            <h3>Onboarding</h3>

            <div class="form-group">
                <label for="field-onboarding">
                    Files Filed / CCURE / Picture /
                    Locker / Axonify
                </label>

                <textarea
                    id="field-onboarding"
                    rows="4">
                </textarea>
            </div>

            <h3>Terminations</h3>

            <div class="form-group">
                <label for="field-terminations">
                    Lockers Cleared / CCURE /
                    Files Pulled / Axonify
                </label>

                <textarea
                    id="field-terminations"
                    rows="4">
                </textarea>
            </div>

            <h3>Contractor Safety</h3>

            <div class="form-group">
                <label for="field-contractors">
                    Contractor / Name / Reason /
                    File Filed
                </label>

                <textarea
                    id="field-contractors"
                    rows="3">
                </textarea>
            </div>

            <h3>Collaterals</h3>

            <div class="form-group">
                <label for="field-collaterals">
                    APA Name / Collateral Completed
                </label>

                <textarea
                    id="field-collaterals"
                    rows="3">
                </textarea>
            </div>
        `;
    }

    if (post === "inbound" || post === "outbound") {
        specific = `
            <h3>Additional Post Information</h3>

            <div class="form-group">
                <label for="field-post-activity">
                    Additional Activity / Notes
                </label>

                <textarea
                    id="field-post-activity"
                    rows="4">
                </textarea>
            </div>
        `;
    }

    container.innerHTML =
        post ? specific + commonFields : "";
}

function collectPostSpecificFields() {
    const container = getElement("post-specific-fields");

    const fields = {};

    container.querySelectorAll(
        "input, select, textarea"
    ).forEach(input => {
        fields[input.id] = input.value.trim();
    });

    return fields;
}

/* =========================================================
   SUBMIT PASS-DOWN
========================================================= */

function submitPassdown(event) {
    event.preventDefault();

    const employee = getValue("passdown-employee");
    const shift = getValue("passdown-shift");
    const post = getValue("passdown-post");

    if (!employee || !shift || !post) {
        showToast("Complete all required fields.");
        return;
    }

    if (!isShiftScheduled(shift, new Date())) {
        showToast(
            `${shift} is not scheduled for today.`
        );
        return;
    }

    const now = new Date();

    const passdown = {
        id: createId(),

        employee,
        shift,
        post,

        shiftDate: getStartOfDay(now).toISOString(),
        createdAt: now.toISOString(),

        tasksCompleted:
            getValue("passdown-completed"),

        tasksHandoff:
            getValue("passdown-handoff"),

        notes:
            getValue("passdown-notes"),

        postFields:
            collectPostSpecificFields(),

        acknowledgments: {
            associate: null,
            manager: null
        }
    };

    passdowns.push(passdown);

    if (!savePassdowns()) {
        passdowns.pop();
        return;
    }

    /*
        Automatically create an outstanding task
        from the handoff text.

        A later version can split this into
        individual tasks with separate owners.
    */

    if (passdown.tasksHandoff) {
        tasks.push({
            id: createId(),

            title: passdown.tasksHandoff,
            post: passdown.post,

            shift: passdown.shift,

            priority: "Normal",
            status: "Outstanding",

            createdAt: now.toISOString(),
            completedAt: null,

            sourcePassdownId: passdown.id
        });

        saveTasks();
    }

    closeModal("create-passdown-modal");

    updateDashboard();

    showToast("Pass-down submitted successfully.");
}

/* =========================================================
   VIEW PASS-DOWN DETAILS
========================================================= */

function openPassdownDetails(id) {
    const passdown = findPassdown(id);

    if (!passdown) {
        showToast("Pass-down not found.");
        return;
    }

    activePassdownId = id;

    setText(
        "passdown-modal-title",
        `${POSTS[passdown.post]} Pass-Down`
    );

    setText(
        "passdown-modal-subtitle",
        `${passdown.shift} | ${formatDate(passdown.shiftDate)}`
    );

    const associate =
        passdown.acknowledgments.associate;

    const manager =
        passdown.acknowledgments.manager;

    let extraFields = "";

    Object.entries(passdown.postFields || {}).forEach(
        ([key, value]) => {
            if (!value) {
                return;
            }

            const label = key
                .replace("field-", "")
                .replace(/-/g, " ")
                .replace(/\b\w/g, letter =>
                    letter.toUpperCase()
                );

            extraFields += `
                <p>
                    <strong>${escapeHTML(label)}:</strong><br>
                    ${escapeHTML(value)}
                </p>
            `;
        }
    );

    getElement("passdown-modal-content").innerHTML = `
        <div class="passdown-details">

            <h3>Shift Information</h3>

            <p>
                <strong>APA:</strong>
                ${escapeHTML(passdown.employee)}
            </p>

            <p>
                <strong>Post:</strong>
                ${escapeHTML(POSTS[passdown.post])}
            </p>

            <p>
                <strong>Shift:</strong>
                ${escapeHTML(passdown.shift)}
            </p>

            <p>
                <strong>Date:</strong>
                ${formatDate(passdown.shiftDate)}
            </p>

            <p>
                <strong>Submitted:</strong>
                ${formatDateTime(passdown.createdAt)}
            </p>

            <hr>

            <h3>Tasks Completed</h3>

            <p>
                ${escapeHTML(
                    passdown.tasksCompleted || "None reported"
                )}
            </p>

            <h3>Tasks Being Handed Off</h3>

            <p>
                ${escapeHTML(
                    passdown.tasksHandoff || "None reported"
                )}
            </p>

            <h3>Additional Notes</h3>

            <p>
                ${escapeHTML(passdown.notes || "None")}
            </p>

            <hr>

            <h3>Post-Specific Information</h3>

            ${extraFields || "<p>None recorded.</p>"}

            <hr>

            <h3>Acknowledgments</h3>

            <p>
                <strong>Associate:</strong>
                ${
                    associate
                        ? `${escapeHTML(associate.name)}
                           (${formatDateTime(associate.signedAt)})`
                        : "Pending"
                }
            </p>

            <p>
                <strong>Manager:</strong>
                ${
                    manager
                        ? `${escapeHTML(manager.name)}
                           (${formatDateTime(manager.signedAt)})`
                        : "Pending"
                }
            </p>

        </div>
    `;

    openModal("passdown-modal");
}

/* =========================================================
   ACKNOWLEDGMENTS
========================================================= */

function openAcknowledgment(id) {
    const passdown = findPassdown(id);

    if (!passdown) {
        showToast("No pass-down available.");
        return;
    }

    activePassdownId = id;

    const form = getElement("acknowledgment-form");

    form.reset();

    getElement("acknowledgment-passdown-id").value = id;

    getElement("acknowledgment-shift").value =
        selectedShift || "";

    closeModal("passdown-modal");
    openModal("acknowledgment-modal");
}

function submitAcknowledgment(event) {
    event.preventDefault();

    const id =
        getValue("acknowledgment-passdown-id");

    const type =
        getValue("acknowledgment-type");

    const name =
        getValue("acknowledgment-name");

    const shift =
        getValue("acknowledgment-shift");

    const passdown = findPassdown(id);

    if (!passdown) {
        showToast("Pass-down not found.");
        return;
    }

    if (!name || !shift) {
        showToast("Enter your name and shift.");
        return;
    }

    if (!["associate", "manager"].includes(type)) {
        showToast("Invalid acknowledgment type.");
        return;
    }

    /*
        Check the shift rotation against the
        original pass-down date.

        This verifies that the selected shift
        is the next scheduled shift.

        It does NOT verify the person's identity.
    */

    const expected = getPreviousShift(
        shift,
        new Date()
    );

    const correctShift =
        expected &&
        expected.shift === passdown.shift &&
        isSameDay(expected.date, passdown.shiftDate);

    if (!correctShift) {
        showToast(
            "This pass-down is not assigned to your " +
            "selected shift for acknowledgment."
        );
        return;
    }

    if (passdown.acknowledgments[type]) {
        showToast(
            "This acknowledgment has already been completed."
        );
        return;
    }

    passdown.acknowledgments[type] = {
        name,
        shift,
        signedAt: new Date().toISOString()
    };

    if (!savePassdowns()) {
        passdown.acknowledgments[type] = null;
        return;
    }

    closeModal("acknowledgment-modal");

    updateDashboard();

    showToast(
        `${type === "manager" ? "Manager" : "Associate"} ` +
        "acknowledgment recorded."
    );
}

/* =========================================================
   SEVEN-DAY HISTORY
========================================================= */

function getRecentPassdowns() {
    const cutoff = getStartOfDay(new Date());

    cutoff.setDate(cutoff.getDate() - 6);

    return passdowns
        .filter(item =>
            new Date(item.shiftDate) >= cutoff
        )
        .sort(
            (a, b) =>
                new Date(b.createdAt) -
                new Date(a.createdAt)
        );
}

function renderRecentPassdowns() {
    const tbody = getElement("recent-passdowns-body");

    if (!tbody) {
        return;
    }

    const recent = getRecentPassdowns();

    if (!recent.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-table-message">
                    No recent pass-downs available.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = recent.map(item => {
        const associate =
            item.acknowledgments.associate;

        const manager =
            item.acknowledgments.manager;

        return `
            <tr>

                <td>
                    ${formatDate(item.shiftDate)}
                </td>

                <td>
                    ${escapeHTML(POSTS[item.post])}
                </td>

                <td>
                    ${escapeHTML(item.shift)}
                </td>

                <td>
                    ${escapeHTML(item.employee)}
                </td>

                <td>
                    ${
                        associate
                            ? `<span class="badge badge-success">
                                   Signed
                               </span>`
                            : `<span class="badge badge-warning">
                                   Pending
                               </span>`
                    }
                </td>

                <td>
                    ${
                        manager
                            ? `<span class="badge badge-success">
                                   Signed
                               </span>`
                            : `<span class="badge badge-warning">
                                   Pending
                               </span>`
                    }
                </td>

                <td>
                    <button
                        type="button"
                        class="btn btn-secondary history-view-btn"
                        data-id="${escapeHTML(item.id)}">
                        View
                    </button>
                </td>

            </tr>
        `;
    }).join("");
}

/* =========================================================
   TASK MANAGEMENT
========================================================= */

function createTask() {
    const title = prompt(
        "Enter the task that needs to be completed:"
    );

    if (!title || !title.trim()) {
        return;
    }

    const postOptions =
        Object.entries(POSTS)
            .map(([key, value]) => `${key} = ${value}`)
            .join("\n");

    const post = prompt(
        "Which post is this task for?\n\n" +
        postOptions,
        "core-rover"
    );

    if (!post || !POSTS[post.trim()]) {
        showToast("Invalid post selected.");
        return;
    }

    const priority = prompt(
        "Task priority: Low, Normal, or High",
        "Normal"
    );

    if (priority === null) {
        return;
    }

    const normalizedPriority =
        priority.trim().toLowerCase();

    const priorityOptions = {
        low: "Low",
        normal: "Normal",
        high: "High"
    };

    if (!priorityOptions[normalizedPriority]) {
        showToast("Invalid priority.");
        return;
    }

    const task = {
        id: createId(),

        title: title.trim(),
        post: post.trim(),

        shift: selectedShift || "Unassigned",

        priority:
            priorityOptions[normalizedPriority],

        status: "Outstanding",

        createdAt: new Date().toISOString(),
        completedAt: null,

        sourcePassdownId: null
    };

    tasks.push(task);

    if (!saveTasks()) {
        tasks.pop();
        return;
    }

    updateDashboard();

    showToast("Task created.");
}

function renderTasks() {
    const tbody = getElement("outstanding-tasks-body");

    if (!tbody) {
        return;
    }

    const outstanding = tasks.filter(
        task => task.status !== "Completed"
    );

    if (!outstanding.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-table-message">
                    No outstanding tasks.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = outstanding.map(task => `
        <tr>

            <td>
                ${escapeHTML(task.title)}
            </td>

            <td>
                ${escapeHTML(POSTS[task.post])}
            </td>

            <td>
                ${escapeHTML(task.shift)}
            </td>

            <td>
                <span class="badge ${
                    task.priority === "High"
                        ? "badge-warning"
                        : "badge-neutral"
                }">
                    ${escapeHTML(task.priority)}
                </span>
            </td>

            <td>
                <span class="badge badge-warning">
                    ${escapeHTML(task.status)}
                </span>
            </td>

            <td>
                <button
                    type="button"
                    class="btn btn-secondary complete-task-btn"
                    data-id="${escapeHTML(task.id)}">
                    Complete
                </button>
            </td>

        </tr>
    `).join("");
}

function completeTask(id) {
    const task = tasks.find(item => item.id === id);

    if (!task) {
        return;
    }

    if (!confirm("Mark this task as completed?")) {
        return;
    }

    task.status = "Completed";
    task.completedAt = new Date().toISOString();

    if (!saveTasks()) {
        task.status = "Outstanding";
        task.completedAt = null;
        return;
    }

    updateDashboard();

    showToast("Task marked as completed.");
}

/* =========================================================
   MODAL MANAGEMENT
========================================================= */

function openModal(id) {
    const modal = getElement(id);

    if (!modal) {
        return;
    }

    modal.hidden = false;

    document.body.style.overflow = "hidden";
}

function closeModal(id) {
    const modal = getElement(id);

    if (!modal) {
        return;
    }

    modal.hidden = true;

    const anotherModalOpen =
        document.querySelector(
            ".modal-overlay:not([hidden])"
        );

    if (!anotherModalOpen) {
        document.body.style.overflow = "";
    }
}

function closeAllModals() {
    document.querySelectorAll(
        ".modal-overlay"
    ).forEach(modal => {
        modal.hidden = true;
    });

    document.body.style.overflow = "";
}

/* =========================================================
   SIDEBAR NAVIGATION
========================================================= */

function setActiveNavigation(link) {
    document.querySelectorAll(
        ".sidebar-nav .nav-item"
    ).forEach(item => {
        item.classList.remove("active");
    });

    link.classList.add("active");
}

function handleNavigation(link) {
    setActiveNavigation(link);

    const post = link.dataset.post;

    if (post) {
        getElement("post-filter").value = post;

        renderCurrentPassdowns();

        getElement("passdowns").scrollIntoView({
            behavior: "smooth"
        });

    } else {
        const page = link.dataset.page;

        const section = getElement(page);

        if (section) {
            section.scrollIntoView({
                behavior: "smooth"
            });
        }
    }

    document.querySelector(
        ".sidebar"
    )?.classList.remove("open");
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

function initializeEventListeners() {

    /* SHIFT SELECTOR */

    getElement("current-shift").addEventListener(
        "change",
        event => {
            selectedShift = event.target.value;

            localStorage.setItem(
                STORAGE_KEYS.selectedShift,
                selectedShift
            );

            updateDashboard();

            if (selectedShift) {
                const previous =
                    getPreviousShift(selectedShift);

                if (previous) {
                    showToast(
                        `${selectedShift} reviews ` +
                        `${previous.shift} pass-downs.`
                    );
                }
            }
        }
    );

    /* POST FILTER */

    getElement("post-filter").addEventListener(
        "change",
        renderCurrentPassdowns
    );

    /* CREATE PASS-DOWN */

    getElement("create-passdown-btn").addEventListener(
        "click",
        () => openCreatePassdown()
    );

    getElement("create-passdown-form").addEventListener(
        "submit",
        submitPassdown
    );

    getElement("passdown-post").addEventListener(
        "change",
        event => {
            renderPostSpecificFields(event.target.value);
        }
    );

    /* ACKNOWLEDGMENTS */

    getElement("acknowledgment-form").addEventListener(
        "submit",
        submitAcknowledgment
    );

    getElement("modal-acknowledge-btn").addEventListener(
        "click",
        () => {
            if (activePassdownId) {
                openAcknowledgment(activePassdownId);
            }
        }
    );

    /* TASK CREATION */

    getElement("create-task-btn").addEventListener(
        "click",
        createTask
    );

    /* FULL HISTORY BUTTON */

    getElement("view-all-history-btn").addEventListener(
        "click",
        () => {
            showToast(
                "Full searchable history will be added " +
                "in the next version."
            );
        }
    );

    /* MOBILE MENU */

    getElement("mobile-menu-button").addEventListener(
        "click",
        () => {
            document.querySelector(
                ".sidebar"
            )?.classList.toggle("open");
        }
    );

    /* SIDEBAR LINKS */

    document.querySelectorAll(
        ".sidebar-nav .nav-item"
    ).forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();

            handleNavigation(link);
        });
    });

    /* DYNAMIC BUTTONS */

    document.addEventListener("click", event => {

        const closeButton = event.target.closest(
            "[data-close-modal]"
        );

        if (closeButton) {
            closeModal(closeButton.dataset.closeModal);
            return;
        }

        const viewButton = event.target.closest(
            ".view-passdown-btn"
        );

        if (viewButton) {
            const passdown = getCurrentPassdown(
                viewButton.dataset.post
            );

            if (passdown) {
                openPassdownDetails(passdown.id);
            }

            return;
        }

        const acknowledgeButton = event.target.closest(
            ".acknowledge-btn"
        );

        if (acknowledgeButton) {
            const passdown = getCurrentPassdown(
                acknowledgeButton.dataset.post
            );

            if (passdown) {
                openAcknowledgment(passdown.id);
            }

            return;
        }

        const historyButton = event.target.closest(
            ".history-view-btn"
        );

        if (historyButton) {
            openPassdownDetails(historyButton.dataset.id);
            return;
        }

        const completeButton = event.target.closest(
            ".complete-task-btn"
        );

        if (completeButton) {
            completeTask(completeButton.dataset.id);
            return;
        }
    });

    /* CLOSE MODALS BY CLICKING BACKDROP */

    document.querySelectorAll(
        ".modal-overlay"
    ).forEach(modal => {
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    /* CLOSE MODALS WITH ESCAPE */

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeAllModals();
        }
    });
}

/* =========================================================
   INITIALIZE APPLICATION
========================================================= */

function initializeApplication() {
    console.log("AP Pass-Down System initializing...");

    const shiftSelector = getElement("current-shift");

    if (shiftSelector) {
        shiftSelector.value = selectedShift;
    }

    initializeEventListeners();

    updateDashboard();

    /*
        Refresh the displayed date periodically.

        The dashboard also updates when the
        browser tab becomes active again.
    */

    setInterval(() => {
        updateDashboard();
    }, 60000);

    document.addEventListener(
        "visibilitychange",
        () => {
            if (!document.hidden) {
                updateDashboard();
            }
        }
    );

    console.log("AP Pass-Down System ready.");
}

document.addEventListener(
    "DOMContentLoaded",
    initializeApplication
);
