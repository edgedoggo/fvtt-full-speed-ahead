// main.js: Full Speed Ahead Module

const MODULE_ID = "full-speed-ahead";
const INTERNAL_MOVE = "fullSpeedAheadInternalMove";
const LOG_PREFIX = "[Full Speed Ahead]";
const sequencingTokens = new Set();
const lastTokenPositions = new Map();

Hooks.once("init", () => {
    console.log(`${LOG_PREFIX} Initializing...`);

    registerSetting("enableShipRotation", {
        name: "Enable Vehicle Rotation",
        hint: "Automatically face vehicle tokens toward their movement destination.",
        type: Boolean,
        default: true
    });

    registerSetting("rotateBeforeMove", {
        name: "Rotate Before Moving",
        hint: "Pause vehicle movement briefly, rotate first, then move. This prevents the late-spin effect and avoids recursive movement updates.",
        type: Boolean,
        default: true
    });

    registerSetting("rotationDelayMs", {
        name: "Rotation Delay",
        hint: "How long, in milliseconds, to wait after rotating before the vehicle starts moving.",
        type: Number,
        default: 300,
        range: { min: 0, max: 2000, step: 50 }
    });

    registerSetting("rotationOffset", {
        name: "Rotation Offset",
        hint: "Degrees added to the calculated heading. Use this if your ship art faces a different direction.",
        type: Number,
        default: 0,
        range: { min: -180, max: 180, step: 15 }
    });

    registerSetting("enableMovementSound", {
        name: "Enable Movement Sound",
        hint: "Play a sound effect whenever a vehicle token moves.",
        type: Boolean,
        default: true
    });

    registerSetting("movementSoundPath", {
        name: "Movement Sound Path",
        hint: "Path to a movement sound. Defaults to the bundled lock-on sound until you add a dedicated thruster audio file.",
        type: String,
        default: "modules/full-speed-ahead/sounds/lockon.ogg"
    });

    registerSetting("movementSoundVolume", {
        name: "Movement Sound Volume",
        hint: "Volume for the vehicle movement sound.",
        type: Number,
        default: 0.18,
        range: { min: 0, max: 1, step: 0.05 }
    });

    registerSetting("enableThrusterEffect", {
        name: "Enable Thruster Effect",
        hint: "Draw a short colored thrust trail behind vehicle tokens while they move.",
        type: Boolean,
        default: true
    });

    registerSetting("thrusterColor", {
        name: "Thruster Color",
        hint: "Hex color used for the movement thrust trail.",
        type: String,
        default: "#40c7ff"
    });

    registerSetting("thrusterLength", {
        name: "Thruster Length",
        hint: "Length of the thrust trail in grid spaces.",
        type: Number,
        default: 1.25,
        range: { min: 0.25, max: 6, step: 0.25 }
    });

    registerSetting("thrusterWidth", {
        name: "Thruster Width",
        hint: "Width of the thrust trail in grid spaces.",
        type: Number,
        default: 0.55,
        range: { min: 0.1, max: 3, step: 0.05 }
    });

    registerTargetingSettings();
});

Hooks.on("ready", () => {
    console.log(`${LOG_PREFIX} Ready.`);
    addTargetingSystemButton();
});

Hooks.on("preUpdateToken", (tokenDocument, changes, options, userId) => {
    if (!game.settings.get(MODULE_ID, "enableShipRotation")) return;
    if (options?.[INTERNAL_MOVE]) return;
    if (!isVehicleDocument(tokenDocument)) return;
    if (!hasMovement(changes)) return;

    const destination = {
        x: Number.isFinite(changes.x) ? changes.x : tokenDocument.x,
        y: Number.isFinite(changes.y) ? changes.y : tokenDocument.y
    };
    const origin = { x: tokenDocument.x, y: tokenDocument.y };
    const rotation = getHeadingRotation(origin, destination);
    if (rotation === null) return;

    const adjustedRotation = normalizeDegrees(rotation + getSettingNumber("rotationOffset", 0));
    const rotateBeforeMove = game.settings.get(MODULE_ID, "rotateBeforeMove");
    lastTokenPositions.set(tokenDocument.id, origin);

    if (!rotateBeforeMove) {
        changes.rotation = adjustedRotation;
        return;
    }

    sequenceVehicleMove(tokenDocument, changes, adjustedRotation);
    return false;
});

Hooks.on("updateToken", (tokenDocument, changes, options, userId) => {
    if (options?.[INTERNAL_MOVE] && options.fullSpeedAheadRotationOnly) return;
    if (!hasMovement(changes)) return;
    if (!isVehicleDocument(tokenDocument)) return;

    playMovementSound();
    drawThrusterEffect(tokenDocument, changes, options);
});

function registerSetting(key, data) {
    game.settings.register(MODULE_ID, key, {
        scope: "world",
        config: true,
        ...data
    });
}

function registerTargetingSettings() {
    registerSetting("enableTargetingSystem", {
        name: "Enable Targeting System",
        hint: "Show range and targeting helpers for ship and actor combat. Requires refresh.",
        type: Boolean,
        default: true
    });

    registerSetting("enableTargetingSystemGM", {
        name: "Show Targeting System for GM",
        hint: "Places a targeting system button on the token controls for the GM. Requires refresh.",
        type: Boolean,
        default: true
    });

    registerSetting("enableTargetingSystemPlayers", {
        name: "Show Targeting System for Players",
        hint: "Places a targeting system button on the token controls for players. Requires refresh.",
        type: Boolean,
        default: true
    });
}

function addTargetingSystemButton() {
    if (!game.settings.get(MODULE_ID, "enableTargetingSystem")) return;
    const showForGM = game.settings.get(MODULE_ID, "enableTargetingSystemGM") && game.user.isGM;
    const showForPlayers = game.settings.get(MODULE_ID, "enableTargetingSystemPlayers") && !game.user.isGM;
    if (!showForGM && !showForPlayers) return;

    Hooks.on("getSceneControlButtons", controls => {
        const tokenControl = controls.find(control => control.name === "token");
        if (!tokenControl) return;

        tokenControl.tools = tokenControl.tools.filter(tool => tool.name !== "highlight-weapon-range");
        tokenControl.tools.push({
            name: "highlight-weapon-range",
            title: "Use Targeting System",
            icon: "fas fa-crosshairs",
            button: true,
            onClick: () => {
                const api = game.modules.get(MODULE_ID)?.api;
                if (api?.highlightWeaponRange) api.highlightWeaponRange();
                else ui.notifications.warn("Full Speed Ahead targeting is not ready yet.");
            }
        });
    });
}

async function sequenceVehicleMove(tokenDocument, changes, rotation) {
    const tokenId = tokenDocument.id;
    if (sequencingTokens.has(tokenId)) return;

    sequencingTokens.add(tokenId);
    const movementChanges = foundry.utils.deepClone(changes);
    movementChanges.rotation = rotation;

    try {
        await tokenDocument.update(
            { rotation },
            { animate: false, [INTERNAL_MOVE]: true, fullSpeedAheadRotationOnly: true }
        );

        const delay = Math.max(0, getSettingNumber("rotationDelayMs", 300));
        if (delay > 0) await wait(delay);

        await tokenDocument.update(movementChanges, {
            animate: true,
            [INTERNAL_MOVE]: true,
            fullSpeedAheadSequencedMove: true,
            fullSpeedAheadOrigin: { x: tokenDocument.x, y: tokenDocument.y }
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Could not sequence vehicle movement.`, error);
        ui.notifications.error("Full Speed Ahead could not complete vehicle movement. See console for details.");
    } finally {
        sequencingTokens.delete(tokenId);
    }
}

function isVehicleDocument(tokenDocument) {
    return tokenDocument?.actor?.type === "vehicle";
}

function hasMovement(changes) {
    return Object.prototype.hasOwnProperty.call(changes, "x") || Object.prototype.hasOwnProperty.call(changes, "y");
}

function getHeadingRotation(origin, destination) {
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    if (dx === 0 && dy === 0) return null;

    const radians = Math.atan2(dy, dx);
    return normalizeDegrees((radians * 180 / Math.PI) + 90);
}

function normalizeDegrees(degrees) {
    return ((degrees % 360) + 360) % 360;
}

function getSettingNumber(key, fallback) {
    const value = Number(game.settings.get(MODULE_ID, key));
    return Number.isFinite(value) ? value : fallback;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function playMovementSound() {
    if (!game.settings.get(MODULE_ID, "enableMovementSound")) return;

    const src = game.settings.get(MODULE_ID, "movementSoundPath")?.trim();
    if (!src) return;

    AudioHelper.play({
        src,
        volume: getSettingNumber("movementSoundVolume", 0.18),
        autoplay: true,
        loop: false
    }, true);
}

function drawThrusterEffect(tokenDocument, changes, options) {
    if (!game.settings.get(MODULE_ID, "enableThrusterEffect")) return;
    if (!canvas?.ready || !canvas.tokens) return;

    const token = canvas.tokens.get(tokenDocument.id);
    if (!token) return;

    const current = { x: tokenDocument.x, y: tokenDocument.y };
    const previous = options?.fullSpeedAheadOrigin ?? lastTokenPositions.get(tokenDocument.id);
    lastTokenPositions.delete(tokenDocument.id);

    let nx;
    let ny;
    if (previous) {
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        if (dx === 0 && dy === 0) return;
        const distance = Math.hypot(dx, dy);
        nx = dx / distance;
        ny = dy / distance;
    } else {
        const radians = normalizeDegrees(tokenDocument.rotation) * Math.PI / 180;
        nx = Math.sin(radians);
        ny = -Math.cos(radians);
    }

    const centerX = tokenDocument.x + tokenDocument.width * canvas.grid.size / 2;
    const centerY = tokenDocument.y + tokenDocument.height * canvas.grid.size / 2;
    const rearX = centerX - nx * token.w * 0.45;
    const rearY = centerY - ny * token.h * 0.45;
    const length = getSettingNumber("thrusterLength", 1.25) * canvas.grid.size;
    const width = getSettingNumber("thrusterWidth", 0.55) * canvas.grid.size;
    const color = hexToNumber(game.settings.get(MODULE_ID, "thrusterColor"), 0x40c7ff);

    const graphics = new PIXI.Graphics();
    graphics.blendMode = PIXI.BLEND_MODES.ADD;
    graphics.alpha = 0.85;

    const px = -ny;
    const py = nx;
    graphics.beginFill(color, 0.35);
    graphics.drawPolygon([
        rearX + px * width / 2, rearY + py * width / 2,
        rearX - px * width / 2, rearY - py * width / 2,
        rearX - nx * length, rearY - ny * length
    ]);
    graphics.endFill();

    graphics.lineStyle(Math.max(2, width * 0.18), color, 0.8);
    graphics.moveTo(rearX, rearY);
    graphics.lineTo(rearX - nx * length * 0.85, rearY - ny * length * 0.85);

    const layer = canvas.interface ?? canvas.stage;
    layer.addChild(graphics);

    const startedAt = performance.now();
    const duration = 450;
    const fade = () => {
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        graphics.alpha = 0.85 * (1 - progress);
        if (progress >= 1) {
            canvas.app.ticker.remove(fade);
            graphics.destroy({ children: true });
        }
    };
    canvas.app.ticker.add(fade);
}

function hexToNumber(value, fallback) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
    return parseInt(normalized, 16);
}
