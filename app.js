// --- Audio Engine ---
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playBeep(frequency = 800, duration = 0.1, volume = 0.2) {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    setTimeout(() => oscillator.stop(), duration * 1000);
}

// --- Storage Wrapper ---
const storage = {
    loadWorkouts() {
        return JSON.parse(localStorage.getItem('workouts')) || [];
    },
    saveWorkouts(workouts) {
        localStorage.setItem('workouts', JSON.stringify(workouts));
    }
};

// --- State & Constants ---
const appState = {
    workouts: storage.loadWorkouts(),
    view: 'library',
    hub: {
        currentWorkout: null,
        index: 0,
        timeLeft: 0,
        isPaused: true,
        lastTick: Date.now(),
        lastBeep: null
    },
    builder: null
};

// --- Sample Data Initializer ---
if (appState.workouts.length === 0) {
    appState.workouts = [
        {
            id: 'sample-1',
            name: 'KINETIC BEGINNER',
            goal: 'Endurance',
            intervals: [
                { type: 'prep', name: 'PREP', duration: 60, power: { type: 'fixed', value: 100 }, hrZone: 'Z1', cadence: { min: 80, max: 90 } },
                { type: 'work', name: 'WORK', duration: 300, power: { type: 'range', min: 210, max: 230 }, hrZone: 'Z3', cadence: { min: 85, max: 95 } },
                { type: 'cooldown', name: 'COOLDOWN', duration: 60, power: { type: 'fixed', value: 100 }, hrZone: 'Z1', cadence: { min: 80, max: 90 } }
            ]
        }
    ];
    storage.saveWorkouts(appState.workouts);
}

// --- Global ID Migration (Stability) ---
appState.workouts.forEach(workout => {
    workout.intervals.forEach(interval => {
        if (!interval.id) interval.id = crypto.randomUUID();
    });
});

// --- DOM Elements ---
const libraryView = document.getElementById('library-view');
const builderView = document.getElementById('builder-view');
const hubView = document.getElementById('hub-view');

const timerDisplay = document.getElementById('timer-display');
const intervalTitle = document.getElementById('interval-title');
const intervalCounter = document.getElementById('interval-counter');
const powerValue = document.getElementById('power-value');
const cadenceValueElement = document.getElementById('cadence-value');
const hrValueElement = document.getElementById('hr-value');

const toggleBtn = document.getElementById('toggle-btn');
const skipBtn = document.getElementById('skip-btn');
const resetBtn = document.getElementById('reset-btn');
const endWorkoutBtn = document.getElementById('end-workout-btn');
const intervalList = document.getElementById('interval-list');

const mainProgressBar = document.getElementById('main-progress-bar');
const totalProgressBar = document.getElementById('total-progress-bar');
const totalProgressText = document.getElementById('total-progress-text');
const toggleIcon = document.getElementById('toggle-icon');
const toggleLabel = document.getElementById('toggle-label');
const pauseOverlay = document.getElementById('pause-overlay');

// --- Navigation ---
function switchView(viewName) {
    appState.view = viewName;
    [libraryView, builderView, hubView].forEach(v => v.classList.remove('active'));

    if (viewName === 'library') {
        libraryView.classList.add('active');
        renderLibrary();
    } else if (viewName === 'builder') {
        builderView.classList.add('active');
        renderBuilder();
    } else if (viewName === 'hub') {
        hubView.classList.add('active');
    }
}

// --- Library Logic ---
function renderLibrary() {
    libraryView.innerHTML = `
        <header class="library-header">
            <h1 class="library-title">WORKOUT LIBRARY</h1>
            <button class="builder-btn add" onclick="openBuilder()">+ NEW WORKOUT</button>
        </header>
        <div class="workout-grid">
            ${appState.workouts.map(w => {
        const totalDuration = w.intervals.reduce((acc, i) => acc + (parseInt(i.duration) || 0), 0);
        return `
                <div class="workout-card">
                    <div class="workout-goal">${w.goal}</div>
                    <h3>${w.name}</h3>
                    <div class="workout-stats">
                        <div class="stat-item">
                            <span class="stat-label">TIME</span>
                            <span class="stat-value">${formatTime(totalDuration)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">STEPS</span>
                            <span class="stat-value">${w.intervals.length}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="card-btn run" onclick="startWorkoutById('${w.id}')">RUN WORKOUT</button>
                        <div class="card-secondary-actions">
                            <button class="card-btn edit" onclick="openBuilder('${w.id}')">EDIT</button>
                            <button class="card-btn delete" onclick="deleteWorkout('${w.id}')">DELETE</button>
                        </div>
                    </div>
                </div>
                `;
    }).join('')}
        </div>
    `;
}

function deleteWorkout(id) {
    const workout = appState.workouts.find(w => w.id === id);
    if (!workout) return;

    if (confirm(`Delete "${workout.name}"? This cannot be undone.`)) {
        appState.workouts = appState.workouts.filter(w => w.id !== id);
        storage.saveWorkouts(appState.workouts);
        renderLibrary();
    }
}

// --- Builder Logic ---
function openBuilder(id = null) {
    if (id) {
        const workout = appState.workouts.find(w => w.id === id);
        appState.builder = JSON.parse(JSON.stringify(workout));
        appState.builder.isNew = false;
        // Backward compatibility: Assign IDs to intervals that don't have them
        appState.builder.intervals.forEach(interval => {
            if (!interval.id) interval.id = crypto.randomUUID();
        });
    } else {
        appState.builder = {
            id: crypto.randomUUID(),
            name: 'NEW WORKOUT',
            goal: 'Endurance',
            intervals: [createDefaultInterval()],
            isNew: true
        };
    }
    appState.builder.isDirty = false;
    switchView('builder');
}

function createDefaultInterval() {
    return {
        id: crypto.randomUUID(),
        type: 'work',
        name: 'WORK',
        duration: 300,
        power: { type: 'fixed', value: 200 },
        hrZone: 'Z3',
        cadence: { min: 85, max: 95 }
    };
}

function renderBuilder() {
    if (!appState.builder) return;
    builderView.innerHTML = `
        <header class="builder-header">
            <h1 class="library-title">${appState.builder.isNew ? 'CREATE' : 'EDIT'} WORKOUT</h1>
        </header>
        <div class="builder-form">
            <div class="form-group builder-main-settings">
                <div class="field-item">
                    <label class="form-label">WORKOUT NAME</label>
                    <input type="text" class="builder-input" value="${appState.builder.name}" onchange="appState.builder.name = this.value">
                </div>
                <div class="field-item">
                    <label class="form-label">GOAL</label>
                    <select class="builder-select" onchange="appState.builder.goal = this.value">
                        <option value="Endurance" ${appState.builder.goal === 'Endurance' ? 'selected' : ''}>Endurance</option>
                        <option value="Power" ${appState.builder.goal === 'Power' ? 'selected' : ''}>Power</option>
                        <option value="Climbing" ${appState.builder.goal === 'Climbing' ? 'selected' : ''}>Climbing</option>
                        <option value="Recovery" ${appState.builder.goal === 'Recovery' ? 'selected' : ''}>Recovery</option>
                    </select>
                </div>
            </div>
            
            <div class="form-group intervals-section">
                <label class="form-label section-label">WORKOUT INTERVALS</label>
                <div class="interval-list-editor" id="interval-editor-list">
                    ${appState.builder.intervals.map((interval) => `
                        <div class="interval-editor-item">
                            <div class="editor-row row-primary">
                                <div class="interval-field">
                                    <label>TYPE</label>
                                    <select onchange="updateInterval('${interval.id}', 'type', this.value)">
                                        <option value="prep" ${interval.type === 'prep' ? 'selected' : ''}>PREP</option>
                                        <option value="work" ${interval.type === 'work' ? 'selected' : ''}>WORK</option>
                                        <option value="rest" ${interval.type === 'rest' ? 'selected' : ''}>REST</option>
                                        <option value="cooldown" ${interval.type === 'cooldown' ? 'selected' : ''}>COOLDOWN</option>
                                    </select>
                                </div>
                                <div class="interval-field">
                                    <label>TIME (SEC)</label>
                                    <input type="number" value="${interval.duration}" onchange="updateInterval('${interval.id}', 'duration', parseInt(this.value))">
                                </div>
                                <div class="interval-field">
                                    <label>HR ZONE</label>
                                    <select onchange="updateInterval('${interval.id}', 'hrZone', this.value)">
                                        <option value="Z1" ${interval.hrZone === 'Z1' ? 'selected' : ''}>Z1</option>
                                        <option value="Z2" ${interval.hrZone === 'Z2' ? 'selected' : ''}>Z2</option>
                                        <option value="Z3" ${interval.hrZone === 'Z3' ? 'selected' : ''}>Z3</option>
                                        <option value="Z4" ${interval.hrZone === 'Z4' ? 'selected' : ''}>Z4</option>
                                        <option value="Z5" ${interval.hrZone === 'Z5' ? 'selected' : ''}>Z5</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="editor-row row-secondary">
                                <div class="interval-field power-field-container group-field">
                                    <label>POWER (W)</label>
                                    <div class="power-inputs-row">
                                        <select class="power-type-select" onchange="updateInterval('${interval.id}', 'power.type', this.value)">
                                            <option value="fixed" ${interval.power.type === 'fixed' ? 'selected' : ''}>FIXED</option>
                                            <option value="range" ${interval.power.type === 'range' ? 'selected' : ''}>RANGE</option>
                                        </select>
                                        ${interval.power.type === 'fixed' ? `
                                            <input type="number" class="power-input-fixed" placeholder="Watts" value="${interval.power.value || ''}" onchange="updateInterval('${interval.id}', 'power.value', parseInt(this.value))">
                                        ` : `
                                            <div class="range-group power-range">
                                                <input type="number" placeholder="Min" value="${interval.power.min || ''}" onchange="updateInterval('${interval.id}', 'power.min', parseInt(this.value))">
                                                <input type="number" placeholder="Max" value="${interval.power.max || ''}" onchange="updateInterval('${interval.id}', 'power.max', parseInt(this.value))">
                                            </div>
                                        `}
                                    </div>
                                </div>

                                <div class="interval-field cadence-field-container group-field">
                                    <label>CADENCE (RPM)</label>
                                    <div class="range-group cadence-range">
                                        <input type="number" placeholder="Min" value="${interval.cadence.min}" onchange="updateInterval('${interval.id}', 'cadence.min', parseInt(this.value))">
                                        <input type="number" placeholder="Max" value="${interval.cadence.max}" onchange="updateInterval('${interval.id}', 'cadence.max', parseInt(this.value))">
                                    </div>
                                </div>

                                <button class="remove-interval-btn" onclick="removeInterval('${interval.id}')" title="Delete Step">✖</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="builder-btn add" onclick="addInterval()">+ ADD INTERVAL</button>
            </div>

            <div class="builder-actions">
                <button class="builder-btn save" onclick="saveWorkout()">SAVE WORKOUT</button>
                <button class="builder-btn cancel" onclick="cancelBuilder()">CANCEL</button>
            </div>
        </div>
    `;
}

function updateInterval(id, path, value) {
    const keys = path.split('.');
    let target = appState.builder.intervals.find(i => i.id === id);
    if (!target) return;

    for (let i = 0; i < keys.length - 1; i++) {
        // Ensure child objects exist without overwriting
        if (typeof target[keys[i]] === 'undefined') {
            target[keys[i]] = {};
        }
        target = target[keys[i]];
    }

    target[keys[keys.length - 1]] = value;

    appState.builder.isDirty = true;

    if (path === 'type') {
        target.name = value.toUpperCase();
    }

    if (path === 'power.type') {
        // Refresh to show/hide fixed vs range inputs
        renderBuilder();
    }
}

function addInterval() {
    appState.builder.intervals.push(createDefaultInterval());
    appState.builder.isDirty = true;
    renderBuilder();
}

function removeInterval(id) {
    if (appState.builder.intervals.length <= 1) {
        alert('At least one interval required.');
        return;
    }
    appState.builder.intervals = appState.builder.intervals.filter(i => i.id !== id);
    appState.builder.isDirty = true;
    renderBuilder();
}

function validateWorkout(workout) {
    if (!workout.name || workout.name.trim() === '') return false;
    if (!workout.intervals || workout.intervals.length === 0) return false;

    for (const interval of workout.intervals) {
        if (!interval.duration || interval.duration <= 0) return false;
        if (!interval.power) return false;

        // Strict Numeric & NaN checks
        if (interval.power.type === 'fixed') {
            const val = interval.power.value;
            if (typeof val !== 'number' || isNaN(val)) return false;
        } else {
            const min = interval.power.min;
            const max = interval.power.max;
            if (typeof min !== 'number' || isNaN(min)) return false;
            if (typeof max !== 'number' || isNaN(max)) return false;
            if (min > max) return false;
        }

        if (!interval.cadence || typeof interval.cadence.min !== 'number' || isNaN(interval.cadence.min) || typeof interval.cadence.max !== 'number' || isNaN(interval.cadence.max)) {
            return false;
        }
        if (!interval.hrZone) return false;
    }
    return true;
}

function saveWorkout() {
    if (!validateWorkout(appState.builder)) {
        alert('Invalid Workout. Ensure name exists, at least 1 interval, and all durations/ranges are valid.');
        return;
    }

    const cleanWorkout = structuredClone(appState.builder);
    delete cleanWorkout.isDirty;
    delete cleanWorkout.isNew;

    const existingIdx = appState.workouts.findIndex(w => w.id === cleanWorkout.id);
    if (existingIdx >= 0) {
        appState.workouts[existingIdx] = cleanWorkout;
    } else {
        appState.workouts.push(cleanWorkout);
    }
    storage.saveWorkouts(appState.workouts);
    appState.builder.isDirty = false;
    switchView('library');
}

function cancelBuilder() {
    if (appState.builder?.isDirty) {
        if (!confirm('Discard unsaved changes?')) return;
    }
    switchView('library');
}

// --- Hub Logic (Refactored) ---
function startWorkoutById(id) {
    const workout = appState.workouts.find(w => w.id === id);
    if (!workout || !validateWorkout(workout)) return;
    if (!workout.intervals || workout.intervals.length === 0) return;

    appState.hub = {
        currentWorkout: workout,
        index: 0,
        timeLeft: workout.intervals[0].duration,
        isPaused: true,
        lastTick: Date.now(),
        lastBeep: null
    };

    switchView('hub');
    updateUI();
}

function updateUI() {
    if (!appState.hub.currentWorkout) return;
    const current = appState.hub.currentWorkout.intervals[appState.hub.index];
    if (!current) return;
    const totalWorkoutTime = appState.hub.currentWorkout.intervals.reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
    const workIntervalsTotal = appState.hub.currentWorkout.intervals.filter(i => i.type === 'work').length;

    // Timer & Status
    timerDisplay.textContent = formatTime(appState.hub.timeLeft);
    intervalTitle.textContent = current.display || current.name;

    // Interval Counter Logic
    if (current.type === 'work') {
        const currentWorkIdx = appState.hub.currentWorkout.intervals.slice(0, appState.hub.index + 1).filter(i => i.type === 'work').length;
        intervalCounter.textContent = `INTERVAL ${currentWorkIdx}/${workIntervalsTotal}`;
    } else {
        intervalCounter.textContent = `${current.name} PHASE`;
    }

    // Metrics
    let powerDisplay = '';
    if (current.power.type === 'fixed') {
        powerDisplay = `${current.power.value}`;
    } else {
        powerDisplay = `${current.power.min}-${current.power.max}`;
    }
    powerValue.textContent = powerDisplay;

    cadenceValueElement.textContent = `${current.cadence.min}-${current.cadence.max}`;
    hrValueElement.textContent = current.hrZone;

    // Progress Bars
    const currentProgress = ((current.duration - appState.hub.timeLeft) / current.duration) * 100;
    mainProgressBar.style.width = `${currentProgress}%`;

    const timeBeforeCurrent = appState.hub.currentWorkout.intervals.slice(0, appState.hub.index).reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
    const totalElapsed = timeBeforeCurrent + (current.duration - appState.hub.timeLeft);
    const totalProgress = (totalElapsed / totalWorkoutTime) * 100;
    totalProgressBar.style.width = `${totalProgress}%`;
    totalProgressText.textContent = `${Math.floor(totalProgress)}%`;

    // Controls
    toggleIcon.textContent = appState.hub.isPaused ? '▶' : '⏸';
    toggleLabel.textContent = appState.hub.isPaused ? 'RESUME' : 'PAUSE';
    pauseOverlay.style.display = appState.hub.isPaused ? 'flex' : 'none';

    // Next Interval Preview
    const nextInterval = appState.hub.currentWorkout.intervals[appState.hub.index + 1];
    const nextSummary = document.getElementById('next-interval-summary');
    if (nextInterval) {
        const p = nextInterval.power;
        const powerStr = p.type === 'fixed' ? `${p.value}W` : `${p.min}-${p.max}W`;
        const cadenceStr = `${nextInterval.cadence.min}-${nextInterval.cadence.max} RPM`;
        nextSummary.textContent = `${nextInterval.type.toUpperCase()} • ${powerStr} • ${cadenceStr} • ${formatTime(nextInterval.duration)}`;
    } else {
        nextSummary.textContent = 'FINAL INTERVAL';
    }

    renderSidebar();
    scrollToActiveInterval();
}

function isMobile() {
    return window.innerWidth <= 768;
}

function scrollToActiveInterval() {
    if (isMobile()) return;

    const active = document.querySelector('.step-item.active');
    if (!active) return;

    active.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
}

function renderSidebar() {
    if (!appState.hub.currentWorkout) return;
    intervalList.innerHTML = '';
    appState.hub.currentWorkout.intervals.forEach((interval, idx) => {
        const li = document.createElement('li');
        let statusText = 'PENDING';
        let className = 'step-item';

        if (idx < appState.hub.index) {
            className += ' done';
            statusText = 'DONE';
        } else if (idx === appState.hub.index) {
            className += ' active';
            statusText = 'ACTIVE';
        } else if (idx === appState.hub.index + 1) {
            className += ' next-step';
            statusText = 'NEXT UP';
        }

        li.className = className;
        li.innerHTML = `
            <span class="index">0${idx + 1}</span>
            <div class="step-info">
                <header>
                    <span class="step-name">${interval.name}</span>
                    <span class="step-duration">${formatTime(interval.duration)}</span>
                </header>
                <div class="step-status">${statusText}</div>
            </div>
        `;
        intervalList.appendChild(li);
    });
}

function tick() {
    if (appState.hub.isPaused) return;

    const now = Date.now();
    const delta = (now - appState.hub.lastTick) / 1000;

    if (delta >= 1) {
        appState.hub.timeLeft -= Math.floor(delta);
        appState.hub.lastTick = now - ((delta % 1) * 1000);

        // Countdown Beeps (3, 2, 1)
        const secondsLeft = Math.ceil(appState.hub.timeLeft);
        if (secondsLeft <= 3 && secondsLeft > 0 && !appState.hub.isPaused) {
            if (appState.hub.lastBeep !== secondsLeft) {
                playBeep(1000, 0.08, 0.25);
                appState.hub.lastBeep = secondsLeft;
            }
        }

        if (appState.hub.timeLeft <= 0) {
            advanceInterval();
        }

        updateUI();
    }
}

function advanceInterval() {
    if (!appState.hub.currentWorkout) return;
    appState.hub.index++;
    if (appState.hub.index >= appState.hub.currentWorkout.intervals.length) {
        endWorkout();
        return;
    }

    const next = appState.hub.currentWorkout.intervals[appState.hub.index];
    appState.hub.timeLeft = next.duration;
    appState.hub.lastBeep = null; // Reset for next countdown
    playBeep(600, 0.15, 0.3); // Transition Sound
    updateUI();
}

function endWorkout() {
    appState.hub.isPaused = true;
    playBeep(800, 0.2, 0.3); // Success Sound
    setTimeout(() => playBeep(1000, 0.2, 0.3), 150);
    switchView('library');
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// --- Event Listeners ---
toggleBtn.addEventListener('click', () => {
    if (!appState.hub.currentWorkout) return;
    appState.hub.isPaused = !appState.hub.isPaused;
    if (!appState.hub.isPaused) appState.hub.lastTick = Date.now();
    updateUI();
});

skipBtn.addEventListener('click', () => {
    if (!appState.hub.currentWorkout) return;
    advanceInterval();
    updateUI();
});

resetBtn.addEventListener('click', () => {
    if (!appState.hub.currentWorkout) return;
    if (confirm('Reset workout?')) {
        appState.hub.index = 0;
        appState.hub.timeLeft = appState.hub.currentWorkout.intervals[0].duration;
        appState.hub.isPaused = true;
        updateUI();
    }
});

endWorkoutBtn.addEventListener('click', () => {
    if (confirm('End and exit workout?')) {
        endWorkout();
    }
});

// --- Init ---
switchView('library');
setInterval(tick, 200);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.log('SW error:', err));
    });
}

// --- Pull-to-Refresh Suppression (Mobile Safety) ---
let touchStartY = 0;
window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY;

    // Prevent default refresh ONLY if:
    // 1. At very top of page (window.scrollY === 0)
    // 2. Swiping DOWN (deltaY > 10)
    if (window.scrollY === 0 && deltaY > 10) {
        e.preventDefault();
    }
}, { passive: false });