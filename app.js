// --- Audio Engine ---
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// --- State & Settings ---
let settings = JSON.parse(localStorage.getItem('kinetic_settings')) || { sound: true };
let schedule = JSON.parse(localStorage.getItem('kinetic_schedule')) || {};

function getLocalDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function getCurrentWeekDates() {
    const dates = [];
    const now = new Date();
    const day = now.getDay() || 7; 
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for(let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push({
            label: days[i],
            dateStr: getLocalDateStr(d)
        });
    }
    return dates;
}

function assignWorkoutToDate(id, dateStr) {
    if (!schedule[dateStr]) schedule[dateStr] = [];
    
    // Toggle Logic
    const idx = schedule[dateStr].indexOf(id);
    if (idx > -1) {
        schedule[dateStr].splice(idx, 1);
    } else {
        if (schedule[dateStr].length >= 3) {
            console.log("Max 3 workouts per day reached.");
            return;
        }
        schedule[dateStr].push(id);
    }
    
    localStorage.setItem('kinetic_schedule', JSON.stringify(schedule));
    renderLibrary(); // Re-render to show updated active state
}

function toggleSchedulePanel(id) {
    if (appState.activeSchedulePanel === id) {
        appState.activeSchedulePanel = null;
    } else {
        appState.activeSchedulePanel = id;
    }
    renderLibrary();
}

function toggleSound() {
    settings.sound = !settings.sound;
    localStorage.setItem('kinetic_settings', JSON.stringify(settings));
    if (appState.view === 'library') renderLibrary();
}

function playBeep(frequency = 800, duration = 0.1, volume = 0.2) {
    if (!settings.sound) return;
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

// --- Drag & Drop Handlers ---
let draggedItemIndex = null;
let dragType = null;

function handleDragStart(e, el, index, type) {
    if (['button', 'input', 'select'].includes(e.target.tagName.toLowerCase())) {
        e.preventDefault();
        return;
    }
    draggedItemIndex = index;
    dragType = type;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDragEnter(e, el, type) {
    e.preventDefault();
    if (dragType === type) {
        el.classList.add('drag-over');
    }
}

function handleDragLeave(e, el, type) {
    if (dragType === type) {
        el.classList.remove('drag-over');
    }
}

function handleDrop(e, dropIndex, type) {
    e.preventDefault();
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    
    if (dragType !== type || draggedItemIndex === null || draggedItemIndex === dropIndex) return;

    if (type === 'workout') {
        const item = appState.workouts.splice(draggedItemIndex, 1)[0];
        appState.workouts.splice(dropIndex, 0, item);
        storage.saveWorkouts(appState.workouts);
        renderLibrary();
    } else if (type === 'interval') {
        const item = appState.builder.intervals.splice(draggedItemIndex, 1)[0];
        appState.builder.intervals.splice(dropIndex, 0, item);
        appState.builder.isDirty = true;
        renderBuilder();
    } else if (type === 'exercise') {
        const item = appState.builder.exercises.splice(draggedItemIndex, 1)[0];
        appState.builder.exercises.splice(dropIndex, 0, item);
        appState.builder.isDirty = true;
        renderBuilder();
    }
}

function handleDragEnd(e, el) {
    el.classList.remove('dragging');
    draggedItemIndex = null;
    dragType = null;
    document.querySelectorAll('.drag-over').forEach(elem => elem.classList.remove('drag-over'));
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
    libraryFilter: 'all',
    hub: {
        currentWorkout: null,
        index: 0,
        timeLeft: 0,
        timeLeft: 0,
        isPaused: true,
        isCompleted: false,
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
    if (!workout.type) workout.type = 'cycling';
    if (workout.type === 'cycling' && workout.intervals) {
        workout.intervals.forEach(interval => {
            if (!interval.id) interval.id = crypto.randomUUID();
        });
    } else if (workout.exercises) {
        workout.exercises.forEach(ex => {
            if (!ex.id) ex.id = crypto.randomUUID();
        });
    }
});

// --- DOM Elements ---
const libraryView = document.getElementById('library-view');
const builderView = document.getElementById('builder-view');
const hubView = document.getElementById('hub-view');
const weekView = document.getElementById('week-view');
const importInput = document.getElementById('import-input');

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
    [libraryView, builderView, hubView, weekView].forEach(v => v.classList.remove('active'));

    if (viewName === 'library') {
        libraryView.classList.add('active');
        renderLibrary();
    } else if (viewName === 'builder') {
        builderView.classList.add('active');
        renderBuilder();
    } else if (viewName === 'hub') {
        hubView.classList.add('active');
    } else if (viewName === 'week') {
        weekView.classList.add('active');
        renderWeekView();
    }
}

// --- Library Logic ---
function renderLibrary() {
    libraryView.innerHTML = `
        <header class="library-header">
            <h1 class="library-title">WORKOUT LIBRARY</h1>
            <div class="header-actions">
                <select class="builder-select" style="width: auto; padding: 0.5rem; margin-right: 1rem;" onchange="appState.libraryFilter = this.value; renderLibrary()">
                    <option value="all" ${appState.libraryFilter === 'all' ? 'selected' : ''}>All Types</option>
                    <option value="cycling" ${appState.libraryFilter === 'cycling' ? 'selected' : ''}>Cycling</option>
                    <option value="stretching" ${appState.libraryFilter === 'stretching' ? 'selected' : ''}>Stretching</option>
                    <option value="mobility" ${appState.libraryFilter === 'mobility' ? 'selected' : ''}>Mobility</option>
                </select>
                <button class="builder-btn add" onclick="switchView('week')" title="Weekly Planner" style="margin-right: 1rem;">
                    <span class="btn-icon">📅</span>
                    <span class="btn-label">PLANNER</span>
                </button>
                <button class="builder-btn add" onclick="openBuilder()" title="New Workout">
                    <span class="btn-icon">+</span>
                    <span class="btn-label">NEW WORKOUT</span>
                </button>
                    <button class="builder-btn secondary" onclick="toggleSound()" title="Toggle Sound">
                        <span class="btn-icon">${settings.sound ? '🔊' : '🔇'}</span>
                        <span class="btn-label">SOUND: ${settings.sound ? 'ON' : 'OFF'}</span>
                    </button>
                    <button class="builder-btn secondary" onclick="triggerImport()" title="Import Workouts">
                        <span class="btn-icon">↑</span>
                        <span class="btn-label">IMPORT</span>
                    </button>
                    <button class="builder-btn secondary" onclick="exportWorkouts()" title="Export Workouts">
                        <span class="btn-icon">↓</span>
                        <span class="btn-label">EXPORT</span>
                    </button>
                </div>
            </div>
        </header>
        <div class="workout-grid">
            ${appState.workouts
                .map((w, index) => ({ w, index }))
                .filter(item => appState.libraryFilter === 'all' || item.w.type === appState.libraryFilter)
                .map(({ w, index }) => {
        const totalDuration = w.type === 'cycling' && w.intervals 
            ? w.intervals.reduce((acc, i) => acc + (parseInt(i.duration) || 0), 0)
            : w.exercises ? w.exercises.reduce((acc, i) => acc + (parseInt(i.duration) || 0), 0) : 0;
            
        const stepCount = w.type === 'cycling' ? (w.intervals?.length || 0) : (w.exercises?.length || 0);

        const weekDates = getCurrentWeekDates();
        const isOpen = appState.activeSchedulePanel === w.id;
        const schedulePanelHTML = `
            <div id="schedule-panel-${w.id}" class="inline-schedule-panel" style="display: ${isOpen ? 'flex' : 'none'};">
                ${weekDates.map(d => {
                    const isScheduled = (schedule[d.dateStr] || []).includes(w.id);
                    const btnClass = isScheduled ? 'day-btn active' : 'day-btn';
                    return `<button class="${btnClass}" onclick="assignWorkoutToDate('${w.id}', '${d.dateStr}')">${d.label}</button>`;
                }).join('')}
            </div>
        `;

        return `
                <div class="workout-card fade-in" draggable="true"
                     ondragstart="handleDragStart(event, this, ${index}, 'workout')"
                     ondragover="handleDragOver(event)"
                     ondragenter="handleDragEnter(event, this, 'workout')"
                     ondragleave="handleDragLeave(event, this, 'workout')"
                     ondrop="handleDrop(event, ${index}, 'workout')"
                     ondragend="handleDragEnd(event, this)">
                    <div class="workout-goal">${w.goal}</div>
                    <h3>${w.name} <span style="font-size: 0.5em; opacity: 0.5;">(${w.type.toUpperCase()})</span></h3>
                    <div class="workout-stats">
                        <div class="stat-item">
                            <span class="stat-label">TIME</span>
                            <span class="stat-value">${formatTime(totalDuration)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">STEPS</span>
                            <span class="stat-value">${stepCount}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="card-btn run" onclick="startWorkoutById('${w.id}')" ${w.type === 'mobility' && (!w.exercises || w.exercises.length === 0) ? 'disabled' : ''}>RUN WORKOUT</button>
                        <div class="card-secondary-actions">
                            <button class="card-btn assign" onclick="toggleSchedulePanel('${w.id}')">SCHEDULE</button>
                            <button class="card-btn edit" onclick="openBuilder('${w.id}')">EDIT</button>
                            <button class="card-btn duplicate" onclick="duplicateWorkout('${w.id}')">DUPLICATE</button>
                            <button class="card-btn delete" onclick="deleteWorkout('${w.id}')">DELETE</button>
                        </div>
                        ${schedulePanelHTML}
                    </div>
                </div>
                `;
    }).join('')}
        </div>
    `;
}

// --- Week View Logic ---
function renderWeekView() {
    const weekDates = getCurrentWeekDates();
    
    // Build select dropdown of all workouts
    const workoutOptions = appState.workouts.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    
    let gridHTML = weekDates.map(day => {
        const plannedItems = (schedule[day.dateStr] || []).map(id => {
            const w = appState.workouts.find(work => work.id === id);
            if (!w) return '';
            return `<div class="planned-item" onclick="startWorkoutById('${w.id}')">${w.name} <span style="opacity: 0.5; font-size: 0.8em; float: right;">▶</span></div>`;
        }).join('');
        
        return `
            <div class="day-column">
                <h3>${day.label}</h3>
                <div style="font-size: 0.75rem; text-align: center; color: rgba(255,255,255,0.4); margin-bottom: 0.5rem;">${day.dateStr}</div>
                ${plannedItems}
                ${(schedule[day.dateStr] || []).length < 3 ? `
                <div style="margin-top: auto;">
                    <select class="minimal-select" onchange="if(this.value) { assignWorkoutToDate(this.value, '${day.dateStr}'); switchView('week'); }">
                        <option value="">+ Add Workout</option>
                        ${workoutOptions}
                    </select>
                </div>
                ` : '<div style="margin-top: auto; text-align: center; font-size: 0.8rem; color: rgba(255,255,255,0.3);">MAX 3 REACHED</div>'}
            </div>
        `;
    }).join('');

    weekView.innerHTML = `
        <header class="library-header" style="margin-bottom: 0;">
            <h1 class="library-title">WEEK PLAN</h1>
            <div class="header-actions">
                <button class="builder-btn secondary" onclick="switchView('library')">
                    <span class="btn-icon">←</span>
                    <span class="btn-label">BACK TO LIBRARY</span>
                </button>
            </div>
        </header>
        <div class="week-grid">
            ${gridHTML}
        </div>
    `;
}

function deleteWorkout(id) {
    const workout = appState.workouts.find(w => w.id === id);
    if (!workout) return;

    if (confirm(`Delete "${workout.name}"? This cannot be undone.`)) {
        appState.workouts = appState.workouts.filter(w => w.id !== id);
        storage.saveWorkouts(appState.workouts);
        
        // Clean schedule ghosts
        Object.keys(schedule).forEach(date => {
            schedule[date] = schedule[date].filter(workoutId => workoutId !== id);
        });
        localStorage.setItem('kinetic_schedule', JSON.stringify(schedule));
        
        renderLibrary();
    }
}

function duplicateWorkout(id) {
    const workout = appState.workouts.find(w => w.id === id);
    if (!workout) return;
    
    const clone = structuredClone(workout);
    clone.id = crypto.randomUUID();
    clone.name = clone.name + ' (Copy)';
    clone.intervals.forEach(i => i.id = crypto.randomUUID());
    
    appState.workouts.push(clone);
    storage.saveWorkouts(appState.workouts);
    renderLibrary();
}

// --- Builder Logic ---
function openBuilder(id = null) {
    if (id) {
        const workout = appState.workouts.find(w => w.id === id);
        appState.builder = JSON.parse(JSON.stringify(workout));
        appState.builder.isNew = false;
        if (!appState.builder.type) appState.builder.type = 'cycling';
        if (!appState.builder.exercises) appState.builder.exercises = [];
        
        // Backward compatibility: Assign IDs to intervals that don't have them
        if (appState.builder.intervals) {
            appState.builder.intervals.forEach(interval => {
                if (!interval.id) interval.id = crypto.randomUUID();
            });
        }
    } else {
        appState.builder = {
            id: crypto.randomUUID(),
            name: 'NEW WORKOUT',
            goal: 'Endurance',
            type: 'cycling',
            intervals: [createDefaultInterval()],
            exercises: [],
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
                    <label class="form-label">GOAL / TAG</label>
                    <select class="builder-select" onchange="appState.builder.goal = this.value">
                        <option value="Endurance" ${appState.builder.goal === 'Endurance' ? 'selected' : ''}>Endurance</option>
                        <option value="Power" ${appState.builder.goal === 'Power' ? 'selected' : ''}>Power</option>
                        <option value="Climbing" ${appState.builder.goal === 'Climbing' ? 'selected' : ''}>Climbing</option>
                        <option value="Recovery" ${appState.builder.goal === 'Recovery' ? 'selected' : ''}>Recovery</option>
                    </select>
                </div>
                <div class="field-item">
                    <label class="form-label">TYPE</label>
                    <select class="builder-select" onchange="appState.builder.type = this.value; if(!appState.builder.exercises.length) { appState.builder.exercises.push({id: crypto.randomUUID(), name:'NEW', duration: 60, reps: 10, sets: 3, instructions: ''}); } renderBuilder()">
                        <option value="cycling" ${appState.builder.type === 'cycling' ? 'selected' : ''}>Cycling</option>
                        <option value="stretching" ${appState.builder.type === 'stretching' ? 'selected' : ''}>Stretching</option>
                        <option value="mobility" ${appState.builder.type === 'mobility' ? 'selected' : ''}>Mobility</option>
                    </select>
                </div>
            </div>

            ${appState.builder.type === 'cycling' ? `
            <div class="form-group intervals-section">
                <label class="form-label section-label">WORKOUT INTERVALS</label>
                <div class="interval-list-editor" id="interval-editor-list">
                    ${appState.builder.intervals.map((interval, idx) => `
                        <div class="interval-editor-item fade-in" draggable="true"
                             ondragstart="handleDragStart(event, this, ${idx}, 'interval')"
                             ondragover="handleDragOver(event)"
                             ondragenter="handleDragEnter(event, this, 'interval')"
                             ondragleave="handleDragLeave(event, this, 'interval')"
                             ondrop="handleDrop(event, ${idx}, 'interval')"
                             ondragend="handleDragEnd(event, this)">
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

                                <div class="interval-actions-group">
                                    <button class="icon-action-btn" onclick="moveIntervalUp(${idx})" title="Move Up">↑</button>
                                    <button class="icon-action-btn" onclick="moveIntervalDown(${idx})" title="Move Down">↓</button>
                                    <button class="icon-action-btn" onclick="duplicateInterval('${interval.id}')" title="Duplicate">⧉</button>
                                    <button class="remove-interval-btn" onclick="removeInterval('${interval.id}')" title="Delete Step">✖</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="builder-btn add" onclick="addInterval()">+ ADD INTERVAL</button>
            </div>
            ` : ''}

            ${appState.builder.type === 'stretching' ? `
            <div class="form-group intervals-section">
                <label class="form-label section-label">STRETCHING EXERCISES</label>
                <div class="interval-list-editor" id="interval-editor-list">
                    ${appState.builder.exercises.map((ex, idx) => `
                        <div class="interval-editor-item fade-in" draggable="true"
                             ondragstart="handleDragStart(event, this, ${idx}, 'exercise')"
                             ondragover="handleDragOver(event)"
                             ondragenter="handleDragEnter(event, this, 'exercise')"
                             ondragleave="handleDragLeave(event, this, 'exercise')"
                             ondrop="handleDrop(event, ${idx}, 'exercise')"
                             ondragend="handleDragEnd(event, this)">
                            <div class="editor-row row-primary">
                                <div class="interval-field" style="flex:2">
                                    <label>EXERCISE NAME</label>
                                    <input type="text" value="${ex.name || ''}" onchange="updateExercise('${ex.id}', 'name', this.value)">
                                </div>
                                <div class="interval-field">
                                    <label>TIME (SEC)</label>
                                    <input type="number" value="${ex.duration || 60}" onchange="updateExercise('${ex.id}', 'duration', parseInt(this.value))">
                                </div>
                            </div>
                            
                            <div class="editor-row row-secondary">
                                <div class="interval-field" style="flex:1">
                                    <label>INSTRUCTIONS</label>
                                    <input type="text" value="${ex.instructions || ''}" placeholder="e.g. Hold deep squat" onchange="updateExercise('${ex.id}', 'instructions', this.value)">
                                </div>
                                <div class="interval-actions-group">
                                    <button class="icon-action-btn" onclick="moveExerciseUp(${idx})" title="Move Up">↑</button>
                                    <button class="icon-action-btn" onclick="moveExerciseDown(${idx})" title="Move Down">↓</button>
                                    <button class="icon-action-btn" onclick="duplicateExercise('${ex.id}')" title="Duplicate">⧉</button>
                                    <button class="remove-interval-btn" onclick="removeExercise('${ex.id}')" title="Delete Step">✖</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="builder-btn add" onclick="addStretchingExercise()">+ ADD EXERCISE</button>
            </div>
            ` : ''}

            ${appState.builder.type === 'mobility' ? `
            <div class="form-group intervals-section">
                <label class="form-label section-label">MOBILITY EXERCISES</label>
                <div class="interval-list-editor" id="interval-editor-list">
                    ${appState.builder.exercises.map((ex, idx) => `
                        <div class="interval-editor-item fade-in" draggable="true"
                             ondragstart="handleDragStart(event, this, ${idx}, 'exercise')"
                             ondragover="handleDragOver(event)"
                             ondragenter="handleDragEnter(event, this, 'exercise')"
                             ondragleave="handleDragLeave(event, this, 'exercise')"
                             ondrop="handleDrop(event, ${idx}, 'exercise')"
                             ondragend="handleDragEnd(event, this)">
                            <div class="editor-row row-primary">
                                <div class="interval-field">
                                    <label>EXERCISE NAME</label>
                                    <input type="text" value="${ex.name || ''}" onchange="updateExercise('${ex.id}', 'name', this.value)">
                                </div>
                                <div class="interval-field">
                                    <label>REPS</label>
                                    <input type="number" value="${ex.reps || 10}" onchange="updateExercise('${ex.id}', 'reps', parseInt(this.value))">
                                </div>
                                <div class="interval-field">
                                    <label>SETS</label>
                                    <input type="number" value="${ex.sets || 3}" onchange="updateExercise('${ex.id}', 'sets', parseInt(this.value))">
                                </div>
                            </div>
                            
                            <div class="editor-row row-secondary">
                                <div class="interval-field" style="flex:1">
                                    <label>INSTRUCTIONS</label>
                                    <input type="text" value="${ex.instructions || ''}" placeholder="e.g. 3 sets of 10 controlled reps" onchange="updateExercise('${ex.id}', 'instructions', this.value)">
                                </div>
                                <div class="interval-actions-group">
                                    <button class="icon-action-btn" onclick="moveExerciseUp(${idx})" title="Move Up">↑</button>
                                    <button class="icon-action-btn" onclick="moveExerciseDown(${idx})" title="Move Down">↓</button>
                                    <button class="icon-action-btn" onclick="duplicateExercise('${ex.id}')" title="Duplicate">⧉</button>
                                    <button class="remove-interval-btn" onclick="removeExercise('${ex.id}')" title="Delete Step">✖</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="builder-btn add" onclick="addMobilityExercise()">+ ADD EXERCISE</button>
            </div>
            ` : ''}

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

function moveIntervalUp(idx) {
    if (idx === 0) return;
    const intervals = appState.builder.intervals;
    [intervals[idx - 1], intervals[idx]] = [intervals[idx], intervals[idx - 1]];
    appState.builder.isDirty = true;
    renderBuilder();
}

function moveIntervalDown(idx) {
    const intervals = appState.builder.intervals;
    if (idx === intervals.length - 1) return;
    [intervals[idx], intervals[idx + 1]] = [intervals[idx + 1], intervals[idx]];
    appState.builder.isDirty = true;
    renderBuilder();
}

function duplicateInterval(id) {
    const intervals = appState.builder.intervals;
    const idx = intervals.findIndex(i => i.id === id);
    if (idx === -1) return;
    const clone = structuredClone(intervals[idx]);
    clone.id = crypto.randomUUID();
    intervals.splice(idx + 1, 0, clone);
    appState.builder.isDirty = true;
    renderBuilder();
}

// --- Exercise Builder Logic (Stretching/Mobility) ---
function updateExercise(id, path, value) {
    let target = appState.builder.exercises.find(e => e.id === id);
    if (!target) return;
    target[path] = value;
    appState.builder.isDirty = true;
}

function addStretchingExercise() {
    appState.builder.exercises.push({
        id: crypto.randomUUID(),
        name: 'NEW STRETCH',
        duration: 60,
        instructions: ''
    });
    appState.builder.isDirty = true;
    renderBuilder();
}

function addMobilityExercise() {
    appState.builder.exercises.push({
        id: crypto.randomUUID(),
        name: 'NEW EXERCISE',
        reps: 10,
        sets: 3,
        instructions: ''
    });
    appState.builder.isDirty = true;
    renderBuilder();
}

function removeExercise(id) {
    if (appState.builder.exercises.length <= 1) {
        alert('At least one exercise required.');
        return;
    }
    appState.builder.exercises = appState.builder.exercises.filter(e => e.id !== id);
    appState.builder.isDirty = true;
    renderBuilder();
}

function moveExerciseUp(idx) {
    if (idx === 0) return;
    const arr = appState.builder.exercises;
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    appState.builder.isDirty = true;
    renderBuilder();
}

function moveExerciseDown(idx) {
    const arr = appState.builder.exercises;
    if (idx === arr.length - 1) return;
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    appState.builder.isDirty = true;
    renderBuilder();
}

function duplicateExercise(id) {
    const arr = appState.builder.exercises;
    const idx = arr.findIndex(e => e.id === id);
    if (idx === -1) return;
    const clone = structuredClone(arr[idx]);
    clone.id = crypto.randomUUID();
    arr.splice(idx + 1, 0, clone);
    appState.builder.isDirty = true;
    renderBuilder();
}

function validateWorkout(workout) {
    if (!workout.name || workout.name.trim() === '') return false;
    
    if (workout.type === 'cycling') {
        if (!workout.intervals || workout.intervals.length === 0) return false;

        for (const interval of workout.intervals) {
            if (!interval.duration || interval.duration <= 0) return false;
            if (!interval.power) return false;

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
    } else {
        if (!workout.exercises || workout.exercises.length === 0) return false;
        // Simple validation for stretching/mobility
        for (const ex of workout.exercises) {
            if (!ex.name || ex.name.trim() === '') return false;
            if (workout.type === 'stretching' && (!ex.duration || ex.duration <= 0)) return false;
            if (workout.type === 'mobility' && (!ex.reps || ex.reps <= 0 || !ex.sets || ex.sets <= 0)) return false;
        }
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

    if (workout.type === 'cycling') {
        startCyclingWorkout(workout);
    } else if (workout.type === 'stretching') {
        startStretchingWorkout(workout);
    } else if (workout.type === 'mobility') {
        startMobilityWorkout(workout);
    }
}

function startCyclingWorkout(workout) {
    if (!workout.intervals || workout.intervals.length === 0) return;
    const prev = appState.view;
    appState.hub = {
        mode: 'cycling',
        currentWorkout: workout,
        index: 0,
        timeLeft: workout.intervals[0].duration,
        isPaused: true,
        isCompleted: false,
        lastTick: Date.now(),
        lastBeep: null,
        previousView: prev
    };
    switchView('hub');
    updateUI();
}

function startStretchingWorkout(workout) {
    if (!workout.exercises || workout.exercises.length === 0) return;
    const sequence = [];
    workout.exercises.forEach((ex, idx) => {
        sequence.push({
            type: 'stretch',
            name: ex.name,
            duration: ex.duration,
            instructions: ex.instructions || ''
        });
        if (idx !== workout.exercises.length - 1) {
            sequence.push({
                type: 'rest',
                name: 'REST',
                duration: 10,
                instructions: 'Prepare for next sequence',
                isRest: true
            });
        }
    });

    const prev = appState.view;
    appState.hub = {
        mode: 'stretching',
        currentWorkout: workout,
        sequence: sequence,
        index: 0,
        timeLeft: sequence[0].duration,
        isPaused: true,
        isCompleted: false,
        lastTick: Date.now(),
        lastBeep: null,
        previousView: prev
    };
    switchView('hub');
    updateUI();
}

function startMobilityWorkout(workout) {
    if (!workout.exercises || workout.exercises.length === 0) return;
    const prev = appState.view;
    appState.hub = {
        mode: 'mobility',
        currentWorkout: workout,
        index: 0,
        isPaused: true,
        isCompleted: false,
        lastTick: Date.now(),
        lastBeep: null,
        previousView: prev
    };
    switchView('hub');
    updateUI();
}

function updateUI() {
    if (!appState.hub.currentWorkout) return;

    if (appState.hub.isCompleted) {
        timerDisplay.textContent = "00:00";
        intervalTitle.textContent = "DONE";
        intervalCounter.textContent = "WORKOUT COMPLETE";
        
        pauseOverlay.style.display = 'none';

        toggleIcon.textContent = '🏠';
        toggleLabel.textContent = 'FINISH';
        
        mainProgressBar.style.width = `100%`;
        totalProgressBar.style.width = `100%`;
        totalProgressText.textContent = `100%`;

        document.getElementById('next-interval-summary').textContent = '--';
        
        renderSidebar();
        return;
    }

    let current = null;
    let titleStr = '';
    let currDuration = 0;
    
    if (appState.hub.mode === 'cycling') {
        current = appState.hub.currentWorkout.intervals[appState.hub.index];
        titleStr = current.display || current.name;
        currDuration = current.duration;
    } else if (appState.hub.mode === 'stretching') {
        current = appState.hub.sequence[appState.hub.index];
        titleStr = current.name;
        currDuration = current.duration;
    } else if (appState.hub.mode === 'mobility') {
        current = appState.hub.currentWorkout.exercises[appState.hub.index];
        titleStr = current.name;
    }

    if (!current) return;

    const instructionDisplay = document.getElementById('instruction-display');
    instructionDisplay.style.display = 'none';
    timerDisplay.classList.remove('timer-shrink');

    // Timer & Status
    if (appState.hub.mode === 'mobility') {
        timerDisplay.style.display = 'none';
    } else {
        timerDisplay.style.display = 'block';
        timerDisplay.textContent = formatTime(appState.hub.timeLeft);
    }
    intervalTitle.textContent = titleStr;

    // Interval Counter Logic
    if (appState.hub.mode === 'cycling') {
        const workIntervalsTotal = appState.hub.currentWorkout.intervals.filter(i => i.type === 'work').length;
        if (current.type === 'work') {
            const currentWorkIdx = appState.hub.currentWorkout.intervals.slice(0, appState.hub.index + 1).filter(i => i.type === 'work').length;
            intervalCounter.textContent = `INTERVAL ${currentWorkIdx}/${workIntervalsTotal}`;
        } else {
            intervalCounter.textContent = `${current.name} PHASE`;
        }
    } else if (appState.hub.mode === 'stretching') {
        intervalCounter.textContent = current.isRest ? 'RECOVERY' : 'ACTIVE STRETCH';
        if (current.instructions) {
            instructionDisplay.textContent = current.instructions;
            instructionDisplay.style.display = 'block';
        }
        timerDisplay.classList.add('timer-shrink');
    } else if (appState.hub.mode === 'mobility') {
        intervalCounter.textContent = `${current.reps} REPS × ${current.sets} SETS`;
        if (current.instructions) {
            instructionDisplay.textContent = current.instructions;
            instructionDisplay.style.display = 'block';
        }
    }

    // Metrics Visibility
    const metricsSection = document.getElementById('metrics-section');
    if (appState.hub.mode === 'cycling') {
        if (metricsSection) metricsSection.style.display = 'flex';
        let powerDisplay = '';
        if (current.power.type === 'fixed') {
            powerDisplay = `${current.power.value}`;
        } else {
            powerDisplay = `${current.power.min}-${current.power.max}`;
        }
        powerValue.textContent = powerDisplay;
        cadenceValueElement.textContent = `${current.cadence.min}-${current.cadence.max}`;
        hrValueElement.textContent = current.hrZone;
    } else {
        if (metricsSection) metricsSection.style.display = 'none'; // Hide metrics for stretching/mobility
    }

    // Progress Bars
    if (appState.hub.mode === 'mobility') {
        mainProgressBar.style.width = `100%`;
        const totalProgress = ((appState.hub.index) / appState.hub.currentWorkout.exercises.length) * 100;
        totalProgressBar.style.width = `${totalProgress}%`;
        totalProgressText.textContent = `${Math.floor(totalProgress)}%`;
    } else {
        const currentProgress = ((currDuration - appState.hub.timeLeft) / currDuration) * 100;
        mainProgressBar.style.width = `${currentProgress}%`;
        
        let totalWorkoutTime = 0;
        let timeBeforeCurrent = 0;
        if (appState.hub.mode === 'cycling') {
            totalWorkoutTime = appState.hub.currentWorkout.intervals.reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
            timeBeforeCurrent = appState.hub.currentWorkout.intervals.slice(0, appState.hub.index).reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
        } else if (appState.hub.mode === 'stretching') {
            totalWorkoutTime = appState.hub.sequence.reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
            timeBeforeCurrent = appState.hub.sequence.slice(0, appState.hub.index).reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
        }

        const totalElapsed = timeBeforeCurrent + (currDuration - appState.hub.timeLeft);
        const totalProgress = (totalElapsed / totalWorkoutTime) * 100;
        totalProgressBar.style.width = `${totalProgress}%`;
        totalProgressText.textContent = `${Math.floor(totalProgress)}%`;
    }

    // Controls
    if (appState.hub.mode === 'mobility') {
        toggleIcon.textContent = '⏭';
        toggleLabel.textContent = 'NEXT';
        pauseOverlay.style.display = 'none';
        skipBtn.style.display = 'none';
    } else {
        toggleIcon.textContent = appState.hub.isPaused ? '▶' : '⏸';
        toggleLabel.textContent = appState.hub.isPaused ? 'RESUME' : 'PAUSE';
        pauseOverlay.style.display = appState.hub.isPaused ? 'flex' : 'none';
        skipBtn.style.display = 'flex';
    }

    // Next Interval Preview
    const nextSummary = document.getElementById('next-interval-summary');
    if (appState.hub.mode === 'cycling') {
        const nextInterval = appState.hub.currentWorkout.intervals[appState.hub.index + 1];
        if (nextInterval) {
            const p = nextInterval.power;
            const powerStr = p.type === 'fixed' ? `${p.value}W` : `${p.min}-${p.max}W`;
            const cadenceStr = `${nextInterval.cadence.min}-${nextInterval.cadence.max} RPM`;
            nextSummary.textContent = `${nextInterval.type.toUpperCase()} • ${powerStr} • ${cadenceStr} • ${formatTime(nextInterval.duration)}`;
        } else {
            nextSummary.textContent = 'FINAL INTERVAL';
        }
    } else if (appState.hub.mode === 'stretching') {
        const nextInterval = appState.hub.sequence[appState.hub.index + 1];
        nextSummary.textContent = nextInterval ? `NEXT: ${nextInterval.name}` : 'FINAL STEP';
    } else if (appState.hub.mode === 'mobility') {
        const nextInterval = appState.hub.currentWorkout.exercises[appState.hub.index + 1];
        nextSummary.textContent = nextInterval ? `NEXT: ${nextInterval.name}` : 'FINAL EXERCISE';
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
    let items = [];
    if (appState.hub.mode === 'cycling') {
        items = appState.hub.currentWorkout.intervals;
    } else if (appState.hub.mode === 'stretching') {
        items = appState.hub.sequence;
    } else if (appState.hub.mode === 'mobility') {
        items = appState.hub.currentWorkout.exercises;
    }

    items.forEach((interval, idx) => {
        const li = document.createElement('li');
        let statusText = 'PENDING';
        let className = 'step-item';

        if (appState.hub.isCompleted || idx < appState.hub.index) {
            className += ' done';
            statusText = 'DONE';
        } else if (idx === appState.hub.index) {
            className += ' active';
            statusText = appState.hub.mode === 'mobility' ? 'CURRENT' : 'ACTIVE';
        } else if (idx === appState.hub.index + 1) {
            className += ' next-step';
            statusText = appState.hub.mode === 'mobility' ? 'NEXT' : 'NEXT UP';
        }

        li.className = className;
        li.innerHTML = `
            <span class="index">0${idx + 1}</span>
            <div class="step-info">
                <header>
                    <span class="step-name">${interval.name}</span>
                    <span class="step-duration">${appState.hub.mode === 'mobility' ? `x${interval.sets}` : formatTime(interval.duration)}</span>
                </header>
                <div class="step-status">${statusText}</div>
            </div>
        `;
        intervalList.appendChild(li);
    });
}

function tick() {
    if (appState.hub.isPaused || !appState.hub.currentWorkout || appState.hub.mode === 'mobility') return;

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
    
    if (appState.hub.mode === 'cycling') {
        if (appState.hub.index >= appState.hub.currentWorkout.intervals.length) {
            endWorkout(true);
            return;
        }
        const next = appState.hub.currentWorkout.intervals[appState.hub.index];
        appState.hub.timeLeft = next.duration;
    } else if (appState.hub.mode === 'stretching') {
        if (appState.hub.index >= appState.hub.sequence.length) {
            endWorkout(true);
            return;
        }
        const next = appState.hub.sequence[appState.hub.index];
        appState.hub.timeLeft = next.duration;
    } else if (appState.hub.mode === 'mobility') {
        if (appState.hub.index >= appState.hub.currentWorkout.exercises.length) {
            endWorkout(true);
            return;
        }
    }

    appState.hub.lastBeep = null; // Reset for next countdown
    playBeep(600, 0.15, 0.3); // Transition Sound
    updateUI();
}

function endWorkout(completed = false) {
    if (completed) {
        appState.hub.isPaused = true;
        appState.hub.isCompleted = true;
        playBeep(800, 0.2, 0.3); // Success Sound
        setTimeout(() => playBeep(1000, 0.2, 0.3), 150);
        updateUI();
    } else {
        appState.hub.isPaused = true;
        appState.hub.isCompleted = false;
        switchView(appState.hub.previousView || 'library');
    }
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// --- Event Listeners ---
toggleBtn.addEventListener('click', () => {
    if (!appState.hub.currentWorkout) return;
    
    if (appState.hub.isCompleted) {
        switchView(appState.hub.previousView || 'library');
        return;
    }
    
    if (appState.hub.mode === 'mobility') {
        advanceInterval();
        return;
    }
    
    appState.hub.isPaused = !appState.hub.isPaused;
    if (!appState.hub.isPaused) appState.hub.lastTick = Date.now();
    updateUI();
});

skipBtn.addEventListener('click', () => {
    if (!appState.hub.currentWorkout || appState.hub.isCompleted) return;
    advanceInterval();
    updateUI();
});

resetBtn.addEventListener('click', () => {
    if (!appState.hub.currentWorkout) return;
    if (confirm('Reset workout?')) {
        appState.hub.isCompleted = false;
        appState.hub.index = 0;
        appState.hub.timeLeft = appState.hub.currentWorkout.intervals[0].duration;
        appState.hub.isPaused = true;
        updateUI();
    }
});

endWorkoutBtn.addEventListener('click', () => {
    if (confirm('End and exit workout?')) {
        endWorkout(false);
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

// --- Import / Export ---
function exportWorkouts() {
    if (appState.workouts.length === 0) {
        alert('No workouts to export.');
        return;
    }
    const data = JSON.stringify(appState.workouts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `workouts-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function triggerImport() {
    importInput.click();
}

importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (!Array.isArray(imported)) throw new Error('Not an array');

            let importedCount = 0;
            let duplicateCount = 0;

            imported.forEach(workout => {
                const normalizedWorkout = {
                    ...workout,
                    goal: workout.goal || 'Custom',
                    intervals: (workout.intervals || []).map(interval => ({
                        ...interval,
                        id: interval.id || crypto.randomUUID()
                    })),
                    id: workout.id || crypto.randomUUID()
                };

                // Validation
                if (!validateWorkout(normalizedWorkout)) return;

                // Handle ID Conflicts as Duplicates
                const exists = appState.workouts.some(w => w.id === normalizedWorkout.id);
                if (exists) {
                    normalizedWorkout.id = crypto.randomUUID(); // Re-assign for duplication
                    duplicateCount++;
                } else {
                    importedCount++;
                }

                appState.workouts.push(structuredClone(normalizedWorkout));
            });

            if (importedCount === 0 && duplicateCount === 0) {
                alert('No valid workouts found in file.');
            } else {
                storage.saveWorkouts(appState.workouts);

                let message = '';
                if (importedCount > 0 && duplicateCount > 0) {
                    message = `Imported ${importedCount} workouts (${duplicateCount} duplicates)`;
                } else if (duplicateCount > 0) {
                    message = `Imported ${duplicateCount} duplicate workouts`;
                } else {
                    message = `Imported ${importedCount} workouts`;
                }

                alert(message);
                renderLibrary();
            }
        } catch (err) {
            alert('Import failed: Invalid JSON or file format.');
        } finally {
            // File Input Reset
            e.target.value = '';
        }
    };
    reader.readAsText(file);
});