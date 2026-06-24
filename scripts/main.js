// main.js: Full Speed Ahead Module

const MODULE_ID = "full-speed-ahead";
const INTERNAL_MOVE = "fullSpeedAheadInternalMove";
const LOG_PREFIX = "[Full Speed Ahead]";
const THRUSTER_COLOR_FLAG = "thrusterColor";
const lastTokenPositions = new Map();
const activeMotionEffects = new Map();

class FullSpeedAheadEffectsConfig extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "full-speed-ahead-effects-config",
            title: "Full Speed Ahead: Movement Effects",
            template: `modules/${MODULE_ID}/templates/effects-settings.hbs`,
            width: 520,
            closeOnSubmit: true
        });
    }

    get tokenDocument() {
        return this.object?.documentName === "Token" ? this.object : null;
    }

    getData() {
        const tokenDocument = this.tokenDocument;

        return {
            enableMovementSound: game.settings.get(MODULE_ID, "enableMovementSound"),
            movementSoundPath: game.settings.get(MODULE_ID, "movementSoundPath"),
            movementSoundVolume: game.settings.get(MODULE_ID, "movementSoundVolume"),
            enableThrusterEffect: game.settings.get(MODULE_ID, "enableThrusterEffect"),
            thrusterColor: game.settings.get(MODULE_ID, "thrusterColor"),
            thrusterLength: game.settings.get(MODULE_ID, "thrusterLength"),
            thrusterWidth: game.settings.get(MODULE_ID, "thrusterWidth"),
            tokenName: tokenDocument?.name,
            isTokenConfig: Boolean(tokenDocument),
            useTokenThrusterColor: Boolean(tokenDocument?.getFlag(MODULE_ID, THRUSTER_COLOR_FLAG)),
            tokenThrusterColor: tokenDocument?.getFlag(MODULE_ID, THRUSTER_COLOR_FLAG) ?? game.settings.get(MODULE_ID, "thrusterColor")
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('[data-action="browse-sound"]').on("click", event => {
            event.preventDefault();
            const input = html.find('[name="movementSoundPath"]');
            new FilePicker({
                type: "audio",
                current: input.val() || "",
                callback: path => input.val(path)
            }).render(true);
        });

        html.find('[data-color-picker]').on("input", event => {
            const target = event.currentTarget.dataset.colorPicker;
            html.find(`[data-color-text="${target}"]`).val(event.currentTarget.value);
        });

        html.find('[data-color-text]').on("change", event => {
            const value = event.currentTarget.value.trim();
            if (!/^#[0-9a-f]{6}$/i.test(value)) return;

            const target = event.currentTarget.dataset.colorText;
            html.find(`[data-color-picker="${target}"]`).val(value);
        });

        html.find('[name="useTokenThrusterColor"]').on("change", event => {
            html.find('[data-token-color-fields]').toggle(event.currentTarget.checked);
        });
    }

    async _updateObject(event, formData) {
        const updates = {
            enableMovementSound: Boolean(formData.enableMovementSound),
            movementSoundPath: String(formData.movementSoundPath ?? "").trim(),
            movementSoundVolume: Number(formData.movementSoundVolume),
            enableThrusterEffect: Boolean(formData.enableThrusterEffect),
            thrusterColor: String(formData.thrusterColor ?? "#40c7ff").trim(),
            thrusterLength: Number(formData.thrusterLength),
            thrusterWidth: Number(formData.thrusterWidth)
        };

        for (const [key, value] of Object.entries(updates)) {
            await game.settings.set(MODULE_ID, key, value);
        }

        const tokenDocument = this.tokenDocument;
        if (!tokenDocument) return;

        if (formData.useTokenThrusterColor) {
            const tokenColor = String(formData.tokenThrusterColor ?? updates.thrusterColor).trim();
            await tokenDocument.setFlag(MODULE_ID, THRUSTER_COLOR_FLAG, /^#[0-9a-f]{6}$/i.test(tokenColor) ? tokenColor : updates.thrusterColor);
        } else {
            await tokenDocument.unsetFlag(MODULE_ID, THRUSTER_COLOR_FLAG);
        }
    }
}

Hooks.once("init", () => {
    console.log(`${LOG_PREFIX} Initializing...`);

    game.settings.registerMenu(MODULE_ID, "effectsConfig", {
        name: "Movement Effects",
        label: "Configure Effects",
        hint: "Configure movement sound, sound browsing, thruster color, and thruster shape.",
        icon: "fas fa-fire",
        type: FullSpeedAheadEffectsConfig,
        restricted: true
    });

    registerSetting("enableShipRotation", {
        name: "Enable Vehicle Rotation",
        hint: "Automatically face vehicle tokens toward their movement destination.",
        type: Boolean,
        default: true
    });

    registerSetting("rotateBeforeMove", {
        name: "Smooth Rotation During Movement",
        hint: "Rotate vehicles by the shortest path while they start moving instead of instantly snapping to the destination heading.",
        type: Boolean,
        default: true
    });

    registerSetting("rotationDelayMs", {
        name: "Rotation Update Interval",
        hint: "How often, in milliseconds, to publish smooth rotation updates while a vehicle starts moving.",
        type: Number,
        default: 75,
        range: { min: 25, max: 500, step: 25 }
    });

    registerSetting("rotationFinishSquares", {
        name: "Rotation Finish Distance",
        hint: "How many grid spaces the vehicle may travel before it has finished rotating to its new heading.",
        type: Number,
        default: 2,
        range: { min: 0.25, max: 10, step: 0.25 }
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
        default: true,
        config: false
    });

    registerSetting("movementSoundPath", {
        name: "Movement Sound Path",
        hint: "Path to a movement sound. Defaults to the bundled lock-on sound until you add a dedicated thruster audio file.",
        type: String,
        default: "modules/full-speed-ahead/sounds/lockon.ogg",
        config: false
    });

    registerSetting("movementSoundVolume", {
        name: "Movement Sound Volume",
        hint: "Volume for the vehicle movement sound.",
        type: Number,
        default: 0.18,
        range: { min: 0, max: 1, step: 0.05 },
        config: false
    });

    registerSetting("enableThrusterEffect", {
        name: "Enable Thruster Effect",
        hint: "Draw a short colored thrust trail behind vehicle tokens while they move.",
        type: Boolean,
        default: true,
        config: false
    });

    registerSetting("thrusterColor", {
        name: "Thruster Color",
        hint: "Hex color used for the movement thrust trail.",
        type: String,
        default: "#40c7ff",
        config: false
    });

    registerSetting("thrusterLength", {
        name: "Thruster Length",
        hint: "Length of the attached thrust cone in grid spaces.",
        type: Number,
        default: 1.25,
        range: { min: 0.25, max: 6, step: 0.25 },
        config: false
    });

    registerSetting("thrusterWidth", {
        name: "Thruster Width",
        hint: "Width of the attached thrust cone in grid spaces.",
        type: Number,
        default: 0.55,
        range: { min: 0.1, max: 3, step: 0.05 },
        config: false
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
    lastTokenPositions.set(tokenDocument.id, origin);
    options.fullSpeedAheadMotion = {
        origin,
        destination,
        startRotation: normalizeDegrees(tokenDocument.rotation ?? 0),
        targetRotation: adjustedRotation
    };
    delete changes.rotation;
});

Hooks.on("updateToken", (tokenDocument, changes, options, userId) => {
    if (options?.[INTERNAL_MOVE] && options.fullSpeedAheadRotationOnly) return;
    if (!hasMovement(changes)) return;
    if (!isVehicleDocument(tokenDocument)) return;

    playMovementSound();
    startVehicleMotionEffects(tokenDocument, options);
});

Hooks.on("renderTokenHUD", (app, html, data) => {
    if (!game.user.isGM) return;

    const token = app.object ?? canvas.tokens.get(data?._id);
    if (token?.actor?.type !== "vehicle") return;
    if (html.find(".full-speed-ahead-effects").length) return;

    const button = $(`
        <div class="control-icon full-speed-ahead-effects" title="Full Speed Ahead Effects">
            <i class="fas fa-cog"></i>
        </div>
    `);
    button.css({
        background: "rgba(30, 105, 220, 0.82)",
        border: "1px solid rgba(125, 190, 255, 0.95)",
        color: "#ffffff",
        boxShadow: "0 0 10px rgba(80, 170, 255, 0.65)"
    });
    button.on("click", event => {
        event.preventDefault();
        event.stopPropagation();
        new FullSpeedAheadEffectsConfig(token.document).render(true);
    });

    const leftColumn = html.find(".col.left");
    if (leftColumn.length) leftColumn.append(button);
    else html.append(button);
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

function startVehicleMotionEffects(tokenDocument, options) {
    if (!canvas?.ready || !canvas.tokens) return;

    const token = canvas.tokens.get(tokenDocument.id);
    if (!token) return;

    const current = { x: tokenDocument.x, y: tokenDocument.y };
    const motion = options?.fullSpeedAheadMotion ?? getFallbackMotion(tokenDocument, current);
    lastTokenPositions.delete(tokenDocument.id);
    if (!motion) return;

    stopVehicleMotionEffects(tokenDocument.id);

    const controller = {
        destroyed: false,
        thruster: game.settings.get(MODULE_ID, "enableThrusterEffect") ? createUnderTokenThruster(token) : null,
        lastRotationUpdate: 0,
        currentRotation: motion.startRotation
    };
    activeMotionEffects.set(tokenDocument.id, controller);

    const startTime = performance.now();
    const maxDuration = 5000;
    const tick = () => {
        if (controller.destroyed) return;

        const progress = getMotionProgress(token, motion);
        if (game.settings.get(MODULE_ID, "rotateBeforeMove")) {
            updateSmoothRotation(tokenDocument, motion, progress, controller);
        } else {
            controller.currentRotation = motion.targetRotation;
        }
        drawThrusterCone(controller.thruster, token, controller.currentRotation);

        if (progress >= 0.995 || performance.now() - startTime > maxDuration) {
            finishVehicleMotionEffects(tokenDocument, motion, controller, tick);
        }
    };

    controller.tick = tick;
    canvas.app.ticker.add(tick);
}

function getFallbackMotion(tokenDocument, destination) {
    const origin = lastTokenPositions.get(tokenDocument.id);
    if (!origin) return null;

    const targetRotation = getHeadingRotation(origin, destination);
    if (targetRotation === null) return null;

    return {
        origin,
        destination,
        startRotation: normalizeDegrees(tokenDocument.rotation ?? 0),
        targetRotation: normalizeDegrees(targetRotation + getSettingNumber("rotationOffset", 0))
    };
}

function getMotionProgress(token, motion) {
    const totalDistance = Math.hypot(
        motion.destination.x - motion.origin.x,
        motion.destination.y - motion.origin.y
    );
    if (totalDistance === 0) return 1;

    const currentX = Number.isFinite(token.x) ? token.x : motion.destination.x;
    const currentY = Number.isFinite(token.y) ? token.y : motion.destination.y;
    const traveled = Math.hypot(currentX - motion.origin.x, currentY - motion.origin.y);
    return Math.max(0, Math.min(1, traveled / totalDistance));
}

function updateSmoothRotation(tokenDocument, motion, moveProgress, controller) {
    const totalDistance = Math.hypot(
        motion.destination.x - motion.origin.x,
        motion.destination.y - motion.origin.y
    );
    const finishDistance = Math.max(canvas.grid.size * 0.1, getSettingNumber("rotationFinishSquares", 2) * canvas.grid.size);
    const rotationProgress = totalDistance <= finishDistance ? moveProgress : Math.min(1, moveProgress * totalDistance / finishDistance);
    const easedProgress = easeOutCubic(rotationProgress);
    const target = interpolateRotation(motion.startRotation, motion.targetRotation, easedProgress);
    const now = performance.now();
    const interval = Math.max(25, getSettingNumber("rotationDelayMs", 75));
    controller.currentRotation = target;

    if (rotationProgress < 1 && now - controller.lastRotationUpdate < interval) return;
    controller.lastRotationUpdate = now;

    const rounded = Math.round(target);
    if (normalizeDegrees(tokenDocument.rotation ?? 0) === normalizeDegrees(rounded)) return;

    tokenDocument.update(
        { rotation: rounded },
        { animate: false, [INTERNAL_MOVE]: true, fullSpeedAheadRotationOnly: true }
    ).catch(error => console.warn(`${LOG_PREFIX} Could not update smooth vehicle rotation.`, error));
}

function finishVehicleMotionEffects(tokenDocument, motion, controller, tick) {
    canvas.app.ticker.remove(tick);
    tokenDocument.update(
        { rotation: motion.targetRotation },
        { animate: false, [INTERNAL_MOVE]: true, fullSpeedAheadRotationOnly: true }
    ).catch(error => console.warn(`${LOG_PREFIX} Could not finish vehicle rotation.`, error));

    fadeAndDestroyThruster(controller);
    activeMotionEffects.delete(tokenDocument.id);
}

function stopVehicleMotionEffects(tokenId) {
    const controller = activeMotionEffects.get(tokenId);
    if (!controller) return;

    controller.destroyed = true;
    if (controller.tick) canvas.app.ticker.remove(controller.tick);
    fadeAndDestroyThruster(controller);
    activeMotionEffects.delete(tokenId);
}

function createUnderTokenThruster(token) {
    const graphics = new PIXI.Graphics();
    graphics.blendMode = PIXI.BLEND_MODES.ADD;
    graphics.alpha = 0.85;
    graphics.eventMode = "none";
    graphics.interactive = false;
    graphics.zIndex = getTokenSortValue(token) - 1;

    const layer = canvas.primary ?? canvas.tokens;
    layer.sortableChildren = true;
    layer.addChildAt(graphics, 0);
    return graphics;
}

function drawThrusterCone(graphics, token, rotation) {
    if (!graphics || graphics.destroyed) return;

    const length = getSettingNumber("thrusterLength", 1.25) * canvas.grid.size;
    const width = getSettingNumber("thrusterWidth", 0.55) * canvas.grid.size;
    const color = hexToNumber(getThrusterColor(token), 0x40c7ff);
    const centerX = token.x + token.w / 2;
    const centerY = token.y + token.h / 2;
    const radians = normalizeDegrees(rotation) * Math.PI / 180;
    const forwardX = Math.sin(radians);
    const forwardY = -Math.cos(radians);
    const sideX = -forwardY;
    const sideY = forwardX;
    const rearDistance = Math.min(token.w, token.h) * 0.48;
    const rearX = centerX - forwardX * rearDistance;
    const rearY = centerY - forwardY * rearDistance;
    const tipX = rearX - forwardX * length;
    const tipY = rearY - forwardY * length;

    graphics.clear();
    graphics.zIndex = getTokenSortValue(token) - 1;

    const segments = 8;
    for (let i = 0; i < segments; i++) {
        const start = i / segments;
        const end = (i + 1) / segments;
        const startWidth = width * (1 - start);
        const endWidth = width * (1 - end);
        const alpha = 0.65 * Math.pow(1 - start, 1.8);
        const startX = rearX + (tipX - rearX) * start;
        const startY = rearY + (tipY - rearY) * start;
        const endX = rearX + (tipX - rearX) * end;
        const endY = rearY + (tipY - rearY) * end;

        graphics.beginFill(color, alpha);
        graphics.drawPolygon([
            startX + sideX * startWidth / 2, startY + sideY * startWidth / 2,
            startX - sideX * startWidth / 2, startY - sideY * startWidth / 2,
            endX - sideX * endWidth / 2, endY - sideY * endWidth / 2,
            endX + sideX * endWidth / 2, endY + sideY * endWidth / 2
        ]);
        graphics.endFill();
    }
}

function getTokenSortValue(token) {
    return Number.isFinite(token.mesh?.zIndex) ? token.mesh.zIndex : Number.isFinite(token.zIndex) ? token.zIndex : 0;
}

function getThrusterColor(token) {
    return token.document?.getFlag(MODULE_ID, THRUSTER_COLOR_FLAG) ?? game.settings.get(MODULE_ID, "thrusterColor");
}

function fadeAndDestroyThruster(controller) {
    const graphics = controller.thruster;
    if (!graphics || graphics.destroyed) return;

    const startedAt = performance.now();
    const startAlpha = graphics.alpha;
    const duration = 250;
    const fade = () => {
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        graphics.alpha = startAlpha * (1 - progress);
        if (progress < 1) return;

        canvas.app.ticker.remove(fade);
        graphics.destroy({ children: true });
    };
    canvas.app.ticker.add(fade);
}

function interpolateRotation(start, end, progress) {
    return normalizeDegrees(start + shortestRotationDelta(start, end) * progress);
}

function shortestRotationDelta(start, end) {
    return ((((end - start) % 360) + 540) % 360) - 180;
}

function easeOutCubic(progress) {
    return 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3);
}

function hexToNumber(value, fallback) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
    return parseInt(normalized, 16);
}
