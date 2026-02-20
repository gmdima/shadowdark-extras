

import { JournalPinRenderer } from "./JournalPinsSD.mjs";

const MODULE_ID = "shadowdark-extras";
const HEX_JOURNAL_NAME = "__sdx_hex_data__";

// ─── Fog Shader Registry ─────────────────────────────────────────────
const FOG_SHADERS = {
	water: {
		label: "Water",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

#define TAU 6.28318530718
#define MAX_ITER 5

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    float time = uTime * 0.5 + 23.0;
    vec2 uv = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec2 p = mod(uv * TAU, TAU) - 250.0;
    vec2 i = vec2(p);
    float c = 1.0;
    float inten = 0.005;

    for (int n = 0; n < MAX_ITER; n++) {
        float t = time * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        c += 1.0 / length(vec2(
            p.x / (sin(i.x + t) / inten),
            p.y / (cos(i.y + t) / inten)
        ));
    }
    c /= float(MAX_ITER);
    c = 1.17 - pow(c, 1.4);
    vec3 colour = vec3(pow(abs(c), 8.0));
    colour = clamp(colour + vec3(0.0, 0.35, 0.5), 0.0, 1.0);

    gl_FragColor = vec4(colour, original.a);
}
`
	},
	space: {
		label: "Space",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

#define iterations 17
#define formuparam 0.53
#define volsteps 20
#define stepsize 0.1
#define zoom 0.800
#define tile 0.250
#define speed 0.0006
#define brightness 0.0015
#define darkmatter 0.300
#define distfading 0.730
#define saturation 0.850

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    vec2 worldUV = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec2 uv = worldUV - 0.5;
    vec3 dir = vec3(uv * zoom, 1.0);
    float time = uTime * speed + 0.25;

    float a1 = 0.5;
    float a2 = 0.8;
    mat2 rot1 = mat2(cos(a1), sin(a1), -sin(a1), cos(a1));
    mat2 rot2 = mat2(cos(a2), sin(a2), -sin(a2), cos(a2));
    dir.xz *= rot1;
    dir.xy *= rot2;
    vec3 from = vec3(1.0, 0.5, 0.5);
    from += vec3(time * 2.0, time, -2.0);
    from.xz *= rot1;
    from.xy *= rot2;

    float s = 0.1, fade = 1.0;
    vec3 v = vec3(0.0);
    for (int r = 0; r < volsteps; r++) {
        vec3 p = from + s * dir * 0.5;
        p = abs(vec3(tile) - mod(p, vec3(tile * 2.0)));
        float pa, a = pa = 0.0;
        for (int i = 0; i < iterations; i++) {
            p = abs(p) / dot(p, p) - formuparam;
            a += abs(length(p) - pa);
            pa = length(p);
        }
        float dm = max(0.0, darkmatter - a * a * 0.001);
        a *= a * a;
        if (r > 6) fade *= 1.0 - dm;
        v += fade;
        v += vec3(s, s * s, s * s * s * s) * a * brightness * fade;
        fade *= distfading;
        s += stepsize;
    }
    v = mix(vec3(length(v)), v, saturation);

    gl_FragColor = vec4(v * 0.01, original.a);
}
`
	},
	fumes: {
		label: "Fumes",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

#define TURB_NUM 10.0
#define TURB_AMP 0.7
#define TURB_SPEED 0.3
#define TURB_FREQ 2.0
#define TURB_EXP 1.4

vec2 turbulence(vec2 p) {
    float freq = TURB_FREQ;
    mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
    for (float i = 0.0; i < TURB_NUM; i++) {
        float phase = freq * (p * rot).y + TURB_SPEED * uTime + i;
        p += TURB_AMP * rot[0] * sin(phase) / freq;
        rot *= mat2(0.6, -0.8, 0.8, 0.6);
        freq *= TURB_EXP;
    }
    return p;
}

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    vec2 worldUV = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec2 p = (worldUV - 0.5) * 4.0;
    p = turbulence(p);

    vec3 col = exp(-dot(p, p) * vec3(0.5, 1.0, 2.0));
    col = mix(vec3(0.04, 0.03, 0.05), col * 0.4 + vec3(0.06, 0.05, 0.08), 0.5);

    gl_FragColor = vec4(col, original.a);
}
`
	},
	voronoi: {
		label: "Voronoi",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

#define MAX_MARCH_STEPS 16
#define MARCH_STEP_SIZE 0.2
#define NOISE_AMPLITUDE 0.75
#define FBM_ITERATIONS 3
#define FBM_AMPLITUDE_GAIN 0.8
#define FBM_FREQUENCY_GAIN 1.9
#define FOV45 0.82842693331417825

vec3 Hash3(vec3 p) {
    return fract(sin(vec3(
        dot(p, vec3(127.1, 311.7, 786.6)),
        dot(p, vec3(269.5, 183.3, 455.8)),
        dot(p, vec3(419.2, 371.9, 948.6))
    )) * 43758.5453);
}

float Voronoi(vec3 p) {
    vec3 n = floor(p);
    vec3 f = fract(p);
    float shortest = 1.0;
    for (int x = -1; x < 1; x++) {
        for (int y = -1; y < 1; y++) {
            for (int z = -1; z < 1; z++) {
                vec3 o = vec3(x, y, z);
                vec3 r = (o - f) + 1.0 + sin(Hash3(n + o) * 50.0) * 0.2;
                float d = dot(r, r);
                if (d < shortest) shortest = d;
            }
        }
    }
    return shortest;
}

float FractalVoronoi(vec3 p) {
    float n = 0.0;
    float f = 0.5, a = 0.5;
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < FBM_ITERATIONS; i++) {
        n += Voronoi(p * f) * a;
        f *= FBM_FREQUENCY_GAIN;
        a *= FBM_AMPLITUDE_GAIN;
        p.xy = m * p.xy;
    }
    return n;
}

vec2 March(vec3 origin, vec3 direction) {
    float depth = MARCH_STEP_SIZE;
    float d = 0.0;
    for (int i = 0; i < MAX_MARCH_STEPS; i++) {
        vec3 p = origin + direction * depth;
        d = FractalVoronoi(p) * NOISE_AMPLITUDE;
        depth += max(MARCH_STEP_SIZE, d);
    }
    return vec2(depth, d);
}

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    vec2 worldUV = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec3 direction = normalize(vec3((worldUV - 0.5) * 2.0, -1.0 / FOV45));
    vec3 origin = vec3(0.0, -uTime * 0.2, 0.0);
    vec2 data = March(origin, direction);

    vec4 col = vec4(1.0, 0.616, 0.476, 1.0) * data.y * data.x * 0.7;
    col = mix(col, vec4(0.0, 0.0, 1.0, 1.0), max(0.0, 0.3 - data.y));

    gl_FragColor = vec4(col.rgb, original.a);
}
`
	},
	mist: {
		label: "Mist",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

const vec3 COLOR = vec3(0.42, 0.40, 0.47);
const vec3 BG = vec3(0.0, 0.0, 0.0);
const float ZOOM = 3.0;
const float INTENSITY = 2.0;

vec2 random2(vec2 st) {
    st = vec2(dot(st, vec2(127.1, 311.7)), dot(st, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(st) * 7.0);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(dot(random2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(random2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(random2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(random2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y);
}

float fbm(vec2 coord) {
    float value = 0.0;
    float scale = 0.5;
    for (int i = 0; i < 4; i++) {
        value += noise(coord) * scale;
        coord *= 2.0;
        scale *= 0.5;
    }
    return value;
}

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    vec2 worldUV = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec2 coord = worldUV * ZOOM;

    vec2 motion = vec2(fbm(coord + uTime * 0.15));
    float final_val = fbm(coord + motion);

    vec3 col = mix(BG, COLOR, final_val * INTENSITY);

    gl_FragColor = vec4(col, original.a);
}
`
	},
	warp: {
		label: "Warp",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    vec2 worldUV = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec2 uv = worldUV * 2.0 - 1.0;
    float time = (uTime - 2.0) * 58.0;
    vec3 col = vec3(0.0);
    vec3 init = vec3(sin(time * 0.0032) * 0.3, 0.35 - cos(time * 0.005) * 0.3, time * 0.002);
    float s = 0.0, v = 0.0;
    for (int r = 0; r < 100; r++) {
        vec3 p = init + s * vec3(uv, 0.05);
        p.z = fract(p.z);
        for (int i = 0; i < 10; i++)
            p = abs(p * 2.04) / dot(p, p) - 0.9;
        v += pow(dot(p, p), 0.7) * 0.06;
        col += vec3(v * 0.2 + 0.4, 12.0 - s * 2.0, 0.1 + v * 1.0) * v * 0.00003;
        s += 0.025;
    }
    col = col / (1.0 + abs(col));

    gl_FragColor = vec4(col, original.a);
}
`
	},
	sky: {
		label: "Sky",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

const float cloudscale = 1.1;
const float speed = 0.03;
const float clouddark = 0.5;
const float cloudlight = 0.3;
const float cloudcover = 0.2;
const float cloudalpha = 8.0;
const float skytint = 0.5;
const vec3 skycolour1 = vec3(0.2, 0.4, 0.6);
const vec3 skycolour2 = vec3(0.4, 0.7, 1.0);
const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
}

float fbm(vec2 n) {
    float total = 0.0, amplitude = 0.1;
    for (int i = 0; i < 7; i++) {
        total += noise(n) * amplitude;
        n = m * n;
        amplitude *= 0.4;
    }
    return total;
}

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    vec2 worldUV = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec2 uv = worldUV;
    float time = uTime * speed;
    float q = fbm(uv * cloudscale * 0.5);

    float r = 0.0;
    vec2 ruv = uv * cloudscale - q + time;
    float weight = 0.8;
    for (int i = 0; i < 8; i++) {
        r += abs(weight * noise(ruv));
        ruv = m * ruv + time;
        weight *= 0.7;
    }

    float f = 0.0;
    vec2 fuv = uv * cloudscale - q + time;
    weight = 0.7;
    for (int i = 0; i < 8; i++) {
        f += weight * noise(fuv);
        fuv = m * fuv + time;
        weight *= 0.6;
    }
    f *= r + f;

    float c = 0.0;
    float time2 = uTime * speed * 2.0;
    vec2 cuv = uv * cloudscale * 2.0 - q + time2;
    weight = 0.4;
    for (int i = 0; i < 7; i++) {
        c += weight * noise(cuv);
        cuv = m * cuv + time2;
        weight *= 0.6;
    }

    float c1 = 0.0;
    float time3 = uTime * speed * 3.0;
    vec2 c1uv = uv * cloudscale * 3.0 - q + time3;
    weight = 0.4;
    for (int i = 0; i < 7; i++) {
        c1 += abs(weight * noise(c1uv));
        c1uv = m * c1uv + time3;
        weight *= 0.6;
    }
    c += c1;

    vec3 skycolour = mix(skycolour2, skycolour1, worldUV.y);
    vec3 cloudcolour = vec3(1.1, 1.1, 0.9) * clamp(clouddark + cloudlight * c, 0.0, 1.0);
    f = cloudcover + cloudalpha * f * r;
    vec3 result = mix(skycolour, clamp(skytint * skycolour + cloudcolour, 0.0, 1.0), clamp(f + c, 0.0, 1.0));

    gl_FragColor = vec4(result, original.a);
}
`
	},
	zippy: {
		label: "Zippy",
		fragment: `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec4 uUVToWorld;

void main() {
    vec4 original = texture2D(uSampler, vTextureCoord);
    if (original.a < 0.01) {
        gl_FragColor = original;
        return;
    }

    vec2 worldUV = vTextureCoord * uUVToWorld.xy + uUVToWorld.zw;
    vec2 u = 0.2 * (worldUV * 2.0 - 1.0);
    vec4 z = vec4(1.0, 2.0, 3.0, 0.0);
    vec4 o = z;
    vec2 v;
    float a = 0.5;
    float t = uTime;

    for (float i = 0.0; i < 19.0; i += 1.0) {
        float ci = cos(i + 0.02 * t);
        float si = sin(i + 0.02 * t);
        float cw = cos(i + 0.02 * t - z.w * 11.0);
        float sw = sin(i + 0.02 * t - z.w * 11.0);
        float cx = cos(i + 0.02 * t - z.x * 11.0);
        float sx = sin(i + 0.02 * t - z.x * 11.0);
        float cz = cos(i + 0.02 * t - z.z * 11.0);
        float sz = sin(i + 0.02 * t - z.z * 11.0);
        mat2 rm = mat2(ci, cx, cw, cz);
        vec2 mu = rm * u;
        float dp = dot(mu, mu);
        float s40 = dp * 40.0;
        vec2 th = s40 * cos(100.0 * u.yx + t);
        th = th / (1.0 + abs(th));
        u += th / 200.0 + 0.2 * a * u + cos(4.0 / exp(dot(o, o) / 100.0) + t) / 300.0;
        t += 1.0;
        a += 0.03;
        v = cos(t - 7.0 * u * pow(a, i)) - 5.0 * u;
        float il = 1.0 + i * dot(v, v);
        vec2 sv = sin(1.5 * u / (0.5 - dot(u, u)) - 9.0 * u.yx + t);
        o += (1.0 + cos(z + t)) / length(il * sv);
    }

    o = 25.6 / (min(o, 13.0) + 164.0 / o) - dot(u, u) / 250.0;

    gl_FragColor = vec4(o.rgb, original.a);
}
`
	}
};

let fog = null;
let fogMask = null;
let enabled = false;
let _onDownRef = null;
let _onMoveRef = null;
let _onUpRef = null;
let _paintMode = null;
let _paintKeys = null;
let _shaderTick = null;
let _activeFilter = null;
let _fogOverlayTexture = null;
let _fogOverlayPath = null;



export function isHexFogEnabled(sceneId) {
	if (!sceneId) return false;
	const scene = game.scenes.get(sceneId);
	return !!scene?.getFlag(MODULE_ID, "hexFogEnabled");
}

export function isPositionRevealed(x, y) {
	if (!enabled || !canvas.grid?.isHexagonal) return true;
	const offset = canvas.grid.getOffset({ x, y });
	const key = `${offset.i}-${offset.j}`;
	const revealed = canvas.scene.getFlag(MODULE_ID, "hexFogRevealed") || {};
	if (revealed[key]) return true;
	if (key in _paintOverlay) return _paintOverlay[key];
	const exploredKeys = _getExploredHexKeys(canvas.scene.id);
	return exploredKeys.has(key);
}

export async function setHexFogEnabled(sceneId, val) {
	if (!game.user.isGM) return;
	const scene = game.scenes.get(sceneId);
	if (!scene) return;
	await scene.setFlag(MODULE_ID, "hexFogEnabled", !!val);
	return !!val;
}

export function getActiveHexFogEffect(sceneId) {
	if (!sceneId) return null;
	const scene = game.scenes.get(sceneId);
	return scene?.getFlag(MODULE_ID, "hexFogEffect") ?? null;
}

export async function setHexFogEffect(sceneId, effectName) {
	if (!game.user.isGM) return;
	const scene = game.scenes.get(sceneId);
	if (!scene) return;
	if (effectName) {
		await scene.setFlag(MODULE_ID, "hexFogEffect", effectName);
	} else {
		await scene.unsetFlag(MODULE_ID, "hexFogEffect");
	}
}

export function getAvailableHexFogEffects() {
	return Object.entries(FOG_SHADERS).map(([name, data]) => ({
		name,
		label: data.label
	}));
}

export function initHexFog() {
	Hooks.on("canvasReady", _onCanvasReady);
	Hooks.on("canvasTearDown", _onCanvasTearDown);
	Hooks.on("updateScene", _onUpdateScene);
	Hooks.on("updateToken", _onUpdateToken);

	Hooks.on("updateJournalEntry", (journal) => {
		if (journal.name !== HEX_JOURNAL_NAME) return;
		if (enabled) {
			_drawFog();
			canvas.perception.update({ refreshVision: true });
		}
	});
}



function _onCanvasReady() {
	_destroyFog();
	enabled = isHexFogEnabled(canvas.scene?.id);
	if (enabled && canvas.grid?.isHexagonal) {
		_initFog();
		const effect = getActiveHexFogEffect(canvas.scene.id);
		if (effect) _applyFogShader(effect);
	}
}

function _onCanvasTearDown() {
	_destroyFog();
	enabled = false;
}

function _onUpdateScene(scene, changes) {
	if (scene.id !== canvas.scene?.id) return;

	const hasOurFlags = changes?.flags?.[MODULE_ID] !== undefined
		|| Object.keys(changes).some(k => k.startsWith(`flags.${MODULE_ID}`));
	if (!hasOurFlags) return;

	const newEnabled = isHexFogEnabled(scene.id);
	if (newEnabled !== enabled) {
		enabled = newEnabled;
		if (enabled && canvas.grid?.isHexagonal) {
			_initFog();
			const effect = getActiveHexFogEffect(scene.id);
			if (effect) _applyFogShader(effect);
		} else {
			_destroyFog();
		}
		return;
	}

	// Detect hexFogEffect flag change
	const effectChanged = changes?.flags?.[MODULE_ID]?.hexFogEffect !== undefined
		|| changes?.flags?.[MODULE_ID]?.["-=hexFogEffect"] !== undefined
		|| Object.keys(changes).some(k => k.includes("hexFogEffect"));
	if (effectChanged && enabled) {
		const effect = getActiveHexFogEffect(scene.id);
		if (effect) _applyFogShader(effect);
		else _removeFogShader();
	}

	if (enabled) _drawFog();
}

function _onUpdateToken(tokenDoc, changes) {
	if (!enabled) return;
	if (!canvas.grid?.isHexagonal) return;

	const hasMove = ("x" in changes) || ("y" in changes);
	if (!hasMove) return;

	const tw = tokenDoc.width * canvas.grid.sizeX;
	const th = tokenDoc.height * canvas.grid.sizeY;
	const halfW = tw / 2;
	const halfH = th / 2;

	const oldX = tokenDoc._source?.x ?? tokenDoc.x;
	const oldY = tokenDoc._source?.y ?? tokenDoc.y;
	const newX = tokenDoc.x;
	const newY = tokenDoc.y;

	const origin = { x: oldX + halfW, y: oldY + halfH };
	const destination = { x: newX + halfW, y: newY + halfH };

	// Get all cells along the movement path
	const pathCells = canvas.grid.getDirectPath([origin, destination]);

	// Origin cell key — skip it for roll tables (token is leaving, not entering)
	const originOffset = canvas.grid.getOffset(origin);
	const originKey = `${originOffset.i}_${originOffset.j}`;

	// Default reveal radius from module settings
	const defaultRadius = game.settings.get(MODULE_ID, "hexFog.defaultRevealRadius") ?? 1;

	// Load hex tooltip data for per-hex radius overrides
	const hexData = _getHexSceneData(canvas.scene.id);

	// Collect cells to reveal: path cells + neighbors based on radius
	const toReveal = new Set();
	const rollTableCells = [];  // track cells with roll tables

	for (const cell of pathCells) {
		const cellKey = `${cell.i}-${cell.j}`;
		toReveal.add(cellKey);

		// Check per-hex radius override (tooltip uses i_j format)
		const tooltipKey = `${cell.i}_${cell.j}`;
		const hexRecord = hexData?.[tooltipKey];
		const perHexRadius = hexRecord?.revealRadius ?? -1;
		const radius = perHexRadius >= 0 ? perHexRadius : defaultRadius;

		if (radius > 0) {
			_getNeighborsAtDepth(cell, radius, toReveal);
		}

		// Reveal Cells: extra cells listed in hex data
		if (hexRecord?.revealCells) {
			_parseRevealCells(hexRecord.revealCells, toReveal);
		}

		// Collect cells that have roll tables (only cells being entered, not the origin)
		if (hexRecord?.rollTable && tooltipKey !== originKey) {
			rollTableCells.push({ tooltipKey, hexRecord });
		}
	}

	const scene = canvas.scene;
	const existing = scene.getFlag(MODULE_ID, "hexFogRevealed") || {};
	let changed = false;
	const updated = { ...existing };
	for (const key of toReveal) {
		if (!updated[key]) {
			updated[key] = true;
			changed = true;
		}
	}

	if (changed && game.user.isGM) {
		scene.setFlag(MODULE_ID, "hexFogRevealed", updated);
		// updateScene hook will trigger _drawFog for all clients
	}

	// Roll tables for entered cells (GM only)
	if (game.user.isGM && rollTableCells.length > 0) {
		_processRollTables(scene, rollTableCells);
	}
}

/**
 * Get neighbors up to `depth` rings outward from a cell.
 * Adds all discovered keys to the provided Set.
 */
function _getNeighborsAtDepth(center, depth, resultSet) {
	let frontier = [center];
	const visited = new Set([`${center.i}-${center.j}`]);

	for (let d = 0; d < depth; d++) {
		const nextFrontier = [];
		for (const cell of frontier) {
			try {
				const neighbors = canvas.grid.getAdjacentOffsets(cell);
				for (const n of neighbors) {
					const key = `${n.i}-${n.j}`;
					if (!visited.has(key)) {
						visited.add(key);
						resultSet.add(key);
						nextFrontier.push(n);
					}
				}
			} catch { /* fallback if getAdjacentOffsets unavailable */ }
		}
		frontier = nextFrontier;
	}
}

/**
 * Get hex tooltip scene data (cached read from journal).
 */
function _getHexSceneData(sceneId) {
	const journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
	if (!journal) return null;
	const allData = journal.getFlag(MODULE_ID, "hexData") ?? {};
	return allData[sceneId] ?? null;
}

/**
 * Parse "Reveal Cells" string (e.g. "3.5, 4.6, 5.7") into fog-key format and add to Set.
 * Labels use "i.j" format, fog uses "i-j".
 */
function _parseRevealCells(cellStr, resultSet) {
	if (!cellStr) return;
	for (const part of cellStr.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const [i, j] = trimmed.split(".").map(Number);
		if (!isNaN(i) && !isNaN(j)) {
			resultSet.add(`${i}-${j}`);
		}
	}
}

/**
 * Roll tables for cells a token entered/traveled through.
 * Respects "First Time Only" — tracks rolled cells in scene flag.
 */
async function _processRollTables(scene, rollTableCells) {
	const rolledCells = scene.getFlag(MODULE_ID, "hexRolledCells") || {};
	const updatedRolled = { ...rolledCells };
	let rolledChanged = false;

	for (const { tooltipKey, hexRecord } of rollTableCells) {
		if (hexRecord.rollTableFirstOnly && rolledCells[tooltipKey]) continue;

		// Chance check (default 100%)
		const chance = hexRecord.rollTableChance ?? 100;
		if (chance < 100 && Math.random() * 100 >= chance) continue;

		try {
			const table = await fromUuid(hexRecord.rollTable);
			if (table instanceof RollTable) {
				await table.draw();
				if (hexRecord.rollTableFirstOnly) {
					updatedRolled[tooltipKey] = true;
					rolledChanged = true;
				}
			}
		} catch (err) {
			console.warn(`${MODULE_ID} | Failed to roll table for hex ${tooltipKey}:`, err);
		}
	}

	if (rolledChanged) {
		await scene.setFlag(MODULE_ID, "hexRolledCells", updatedRolled);
	}
}

// ─── Hex Tooltip Integration ─────────────────────────────────────────

/**
 * Build a Set of "i-j" keys for hexes that are explored or mapped
 * in the hex tooltip system, so fog is removed from those hexes.
 */
function _getExploredHexKeys(sceneId) {
	const explored = new Set();
	const journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
	if (!journal) return explored;
	const allData = journal.getFlag(MODULE_ID, "hexData") ?? {};
	const sceneData = allData[sceneId];
	if (!sceneData) return explored;
	for (const [hexKey, record] of Object.entries(sceneData)) {
		const ex = record?.exploration;
		if (ex === "explored" || ex === "mapped") {
			// Tooltip uses "i_j", fog uses "i-j"
			explored.add(hexKey.replace("_", "-"));
		}
	}
	return explored;
}



function _initFog() {
	if (fog) return;

	fog = new PIXI.Graphics();
	fog.eventMode = "none";
	fog.sdxHexFog = true;
	// Add fog as the first child of canvas.interface — not vision-masked,
	// renders above everything, and before pins/controls so they stay on top.
	canvas.interface.addChildAt(fog, 0);

	// Vision mask — only if scene has token vision enabled
	if (canvas.scene.tokenVision) {
		fogMask = new PIXI.Graphics();
		canvas.masks.vision.addChild(fogMask);
	}

	// GM: shift+drag to re-fog, ctrl+drag to reveal
	if (game.user.isGM) {
		_onDownRef = _onPaintDown.bind(null);
		_onMoveRef = _onPaintMove.bind(null);
		_onUpRef = _onPaintUp.bind(null);
		canvas.stage.on("mousedown", _onDownRef);
		canvas.stage.on("mousemove", _onMoveRef);
		canvas.stage.on("mouseup", _onUpRef);
	}

	_drawFog();
	_loadFogOverlayTexture();
}

async function _loadFogOverlayTexture() {
	const overlayPath = canvas.scene?.fog?.overlay;
	if (!overlayPath) {
		_fogOverlayTexture = null;
		_fogOverlayPath = null;
		return;
	}
	if (overlayPath === _fogOverlayPath && _fogOverlayTexture?.valid) return;
	try {
		const texture = await loadTexture(overlayPath);
		if (texture?.valid) {
			_fogOverlayTexture = texture;
			_fogOverlayPath = overlayPath;
			if (fog) _drawFog();
		}
	} catch (err) {
		console.warn(`${MODULE_ID} | Failed to load fog overlay texture:`, err);
		_fogOverlayTexture = null;
		_fogOverlayPath = null;
	}
}

function _destroyFog() {
	_removeFogShader();
	if (_onDownRef) {
		canvas.stage.off("mousedown", _onDownRef);
		canvas.stage.off("mousemove", _onMoveRef);
		canvas.stage.off("mouseup", _onUpRef);
		_onDownRef = _onMoveRef = _onUpRef = null;
	}
	_paintMode = null;
	_paintKeys = null;
	_fogOverlayTexture = null;
	_fogOverlayPath = null;
	if (fog) {
		fog.destroy({ children: true });
		fog = null;
	}
	if (fogMask) {
		fogMask.destroy({ children: true });
		fogMask = null;
	}
}

// ─── GM Paint (shift+drag = re-fog, ctrl+drag = reveal) ─────────────

/** Local overlay of pending paint changes (applied on top of scene flags during draw). */
let _paintOverlay = {};  // key → true (reveal) or false (hide)

function _getHexKeyFromEvent(event) {
	const clientX = event.client?.x ?? 0;
	const clientY = event.client?.y ?? 0;
	const topEl = document.elementFromPoint(clientX, clientY);
	if (topEl?.tagName !== "CANVAS") return null;
	const worldPos = event.getLocalPosition(canvas.stage);
	const offset = canvas.grid.getOffset(worldPos);
	return `${offset.i}-${offset.j}`;
}

function _onPaintDown(event) {
	if (!enabled) return;
	if (!event.shiftKey && !event.ctrlKey) return;

	const key = _getHexKeyFromEvent(event);
	if (!key) return;

	_paintMode = event.ctrlKey ? "reveal" : "hide";
	_paintKeys = new Set();
	_paintOverlay = {};
	_paintHex(key);
}

function _onPaintMove(event) {
	if (!_paintMode) return;
	const key = _getHexKeyFromEvent(event);
	if (!key || _paintKeys.has(key)) return;
	_paintHex(key);
}

function _onPaintUp() {
	if (!_paintMode) return;
	_paintMode = null;
	_paintKeys = null;

	// Batch-save all changes to the scene flag
	const scene = canvas.scene;
	const revealed = { ...(scene.getFlag(MODULE_ID, "hexFogRevealed") || {}) };
	for (const [key, val] of Object.entries(_paintOverlay)) {
		if (val) revealed[key] = true;
		else revealed[key] = false;
	}
	_paintOverlay = {};
	scene.setFlag(MODULE_ID, "hexFogRevealed", revealed);
}

function _paintHex(key) {
	_paintKeys.add(key);
	if (_paintMode === "reveal") {
		_paintOverlay[key] = true;
	} else {
		_paintOverlay[key] = false;
	}
	_drawFog();
	canvas.perception.update({ refreshVision: true });
}

// ─── Fog Shader Effects ──────────────────────────────────────────────

function _applyFogShader(effectName) {
	_removeFogShader();
	if (!fog) return;
	const shaderDef = FOG_SHADERS[effectName];
	if (!shaderDef) return;

	const filter = new PIXI.Filter(null, shaderDef.fragment, {
		uTime: 0.0,
		uUVToWorld: [1, 1, 0, 0]
	});
	// Lock filter to screen-space so zoom/pan don't cause texture recreation
	filter.autoFit = false;
	filter.filterArea = canvas.app.screen;
	fog.filters = [filter];
	_activeFilter = filter;

	_shaderTick = () => {
		if (!_activeFilter) return;
		_activeFilter.uniforms.uTime += 0.016;
		// Map vTextureCoord (screen-space 0-1) → stable world-space UV
		const zoom = canvas.stage.scale.x;
		const panX = canvas.stage.position.x;
		const panY = canvas.stage.position.y;
		const sw = canvas.app.screen.width;
		const sh = canvas.app.screen.height;
		const dw = canvas.dimensions.width || sw;
		const dh = canvas.dimensions.height || sh;
		_activeFilter.uniforms.uUVToWorld = [
			sw / (zoom * dw),        // scaleX
			sh / (zoom * dh),        // scaleY
			-panX / (zoom * dw),     // offsetX
			-panY / (zoom * dh)      // offsetY
		];
	};
	canvas.app.ticker.add(_shaderTick);
}

function _removeFogShader() {
	if (_shaderTick) {
		canvas.app?.ticker?.remove(_shaderTick);
		_shaderTick = null;
	}
	if (fog) fog.filters = [];
	_activeFilter = null;
}

function _drawFog() {
	if (!fog) return;
	if (!canvas.grid?.isHexagonal) return;

	const scene = canvas.scene;
	const revealed = scene.getFlag(MODULE_ID, "hexFogRevealed") || {};
	const exploredKeys = _getExploredHexKeys(scene.id);
	const alpha = game.user.isGM ? 0.5 : 1.0;
	const unexploredColor = scene.fog?.colors?.unexplored?.css || "#000000";

	const rows = scene.dimensions.rows;
	const cols = scene.dimensions.columns;
	const cellShape = canvas.grid.getShape();

	// ── Draw fog overlay ──
	fog.clear();

	// Compute texture matrix if fog overlay image is set on the scene
	let texMatrix = null;
	if (_fogOverlayTexture?.valid) {
		const dims = canvas.dimensions;
		const sx = dims.sceneX ?? 0;
		const sy = dims.sceneY ?? 0;
		const sw = dims.sceneWidth ?? dims.width;
		const sh = dims.sceneHeight ?? dims.height;
		texMatrix = new PIXI.Matrix();
		texMatrix.translate(-sx, -sy);
		texMatrix.scale(
			_fogOverlayTexture.width / sw,
			_fogOverlayTexture.height / sh
		);
	}

	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			const key = `${i}-${j}`;

			// Paint overlay takes priority (live preview during drag)
			if (key in _paintOverlay) {
				if (_paintOverlay[key]) continue; // painting reveal → no fog
				// painting hide → fall through to draw fog
			} else if (revealed[key] || exploredKeys.has(key)) {
				continue;
			}

			const center = canvas.grid.getCenterPoint({ i, j });
			const offsetShape = cellShape.map(p => ({
				x: p.x + center.x,
				y: p.y + center.y
			}));

			if (texMatrix) {
				fog.lineStyle(0);
				fog.beginTextureFill({ texture: _fogOverlayTexture, alpha, matrix: texMatrix });
			} else {
				fog.lineStyle(alpha, unexploredColor, alpha);
				fog.beginFill(unexploredColor, alpha);
			}
			fog.drawPolygon(offsetShape);
			fog.endFill();
		}
	}

	// ── Draw vision mask ──
	_drawFogMask(revealed, exploredKeys, rows, cols, cellShape);

	// ── Update pin visibility based on fog ──
	_updateFogPinVisibility();
}

function _drawFogMask(revealed, exploredKeys, rows, cols, cellShape) {
	if (!fogMask) return;
	fogMask.clear();
	fogMask.lineStyle(0, 0x000000, 0);

	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			const key = `${i}-${j}`;
			const isRevealed = (key in _paintOverlay)
				? _paintOverlay[key]
				: (revealed[key] || exploredKeys.has(key));
			const center = canvas.grid.getCenterPoint({ i, j });
			const offsetShape = cellShape.map(p => ({
				x: p.x + center.x,
				y: p.y + center.y
			}));

			fogMask.beginFill(isRevealed ? 0xffffff : 0x000000, 1);
			fogMask.drawPolygon(offsetShape);
			fogMask.endFill();
		}
	}
}

/**
 * Show/hide pins based on fog state.
 * By default all pins in fogged hexes are hidden for players.
 * Pins with aboveFog=true are always visible regardless of fog.
 * GM: fogged pins are dimmed (alpha 0.3), never hidden.
 */
function _updateFogPinVisibility() {
	let renderer;
	try {
		renderer = JournalPinRenderer;
	} catch {
		return;
	}
	if (!renderer?._pins) return;

	for (const pin of renderer._pins.values()) {
		if (pin.pinData?.aboveFog) continue;
		const revealed = isPositionRevealed(pin.pinData.x, pin.pinData.y);
		if (game.user.isGM) {
			pin.alpha = revealed ? 1.0 : 0.3;
			pin.visible = true;
		} else {
			pin.visible = revealed;
		}
	}
}
