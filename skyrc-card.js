/*
 * SkyRC Charger Card — a Lovelace card for the ha-skyrc integration
 * https://github.com/sargeantpepper/SkyRCchargercard
 * Integration: https://github.com/lightheaded/ha-skyrc
 *
 * Shows every channel of a SkyRC neo-series charger (Q200neo etc.) with its
 * status, pack voltage, current, power, capacity, temperature, elapsed time and
 * per-cell voltages, plus Start / Stop / preset controls.
 *
 * Entities are found through the entity registry (platform "skyrc"), so it
 * keeps working if you rename entity IDs. Set `prefix:` to fall back to the
 * default entity-ID pattern instead.
 *
 * MIT licensed.
 */

const CARD_VERSION = "1.6.0";
const DOMAIN = "skyrc";
const ALL_CHANNELS = ["A", "B", "C", "D"];

const STATUS = {
  charging:    { label: "Charging",    icon: "mdi:battery-charging",    tone: "charge",    active: true },
  discharging: { label: "Discharging", icon: "mdi:battery-arrow-down",  tone: "discharge", active: true },
  working:     { label: "Working",     icon: "mdi:battery-sync",        tone: "work",      active: true },
  done:        { label: "Done",        icon: "mdi:battery-check",       tone: "done" },
  idle:        { label: "Idle",        icon: "mdi:battery-outline",     tone: "idle" },
  ready:       { label: "Ready",       icon: "mdi:battery-outline",     tone: "idle" },
  standby:     { label: "Standby",     icon: "mdi:power-sleep",         tone: "idle" },
  dc_power:    { label: "DC supply",   icon: "mdi:power-plug",          tone: "work" },
  error:       { label: "Error",       icon: "mdi:battery-alert",       tone: "error" },
  unknown:     { label: "Unknown",     icon: "mdi:battery-unknown",     tone: "idle" },
  unavailable: { label: "Unavailable", icon: "mdi:bluetooth-off",       tone: "off" },
};

const BATTERY = {
  lipo: "LiPo", liion: "Li-ion", life: "LiFe", lihv: "LiHV",
  nimh: "NiMH", nicd: "NiCd", pb: "Pb", pb_agm: "Pb AGM",
};

const PROGRAM = {
  balance_charge: "Balance charge", charge: "Charge", fast_charge: "Fast charge",
  auto_charge: "Auto charge", re_peak: "Re-peak", discharge: "Discharge",
  storage: "Storage", cycle: "Cycle",
};

// Registry translation_key -> card key, per domain.
const KEYS = {
  sensor: {
    status: "status", capacity: "capacity", voltage: "voltage", current: "current",
    duration: "duration", battery_temp: "temp", charger_temp: "charger_temp",
  },
  button: { start: "start", stop: "stop", save_preset: "save_preset", delete_preset: "delete_preset" },
  select: { preset: "preset", battery_type: "s_battery", program: "s_program", cycle_order: "s_cycle_order" },
  number: {
    cell_count: "n_cells", charge_current: "n_charge_current", discharge_current: "n_discharge_current",
    charge_voltage: "n_charge_voltage", discharge_voltage: "n_discharge_voltage",
    track_voltage: "n_track_voltage", cycle_number: "n_cycles",
  },
  text: { preset_name: "preset_name" },
};

// Keys the channel tiles render; changes to anything else only touch the popup.
const TILE_KEYS = ["status", "capacity", "voltage", "current", "duration", "temp", "start", "stop", "preset"];

// Staging fields shown in the popup, in order. Selects first, then numbers.
const STAGE_FIELDS = [
  { key: "s_battery", label: "Battery type", type: "select" },
  { key: "s_program", label: "Program", type: "select" },
  { key: "n_cells", label: "Cells", type: "number" },
  { key: "n_charge_current", label: "Charge current", type: "number" },
  { key: "n_discharge_current", label: "Discharge current", type: "number" },
  { key: "n_charge_voltage", label: "Charge voltage / cell", type: "number" },
  { key: "n_discharge_voltage", label: "Discharge voltage / cell", type: "number" },
  { key: "n_track_voltage", label: "Peak sensitivity", type: "number" },
  { key: "s_cycle_order", label: "Cycle order", type: "select", wide: true },
  { key: "n_cycles", label: "Cycles", type: "number" },
];

const OPTION_LABELS = {
  ...{ lipo: "LiPo", liion: "Li-ion", life: "LiFe", lihv: "LiHV", nimh: "NiMH", nicd: "NiCd", pb: "Lead acid", pb_agm: "Pb AGM" },
  balance_charge: "Balance charge", charge: "Charge", fast_charge: "Fast charge", auto_charge: "Auto charge",
  re_peak: "Re-peak", discharge: "Discharge", storage: "Storage", cycle: "Cycle",
  charge_discharge: "Charge, then discharge", discharge_charge: "Discharge, then charge",
};

// Default entity-ID suffixes (used with `prefix:`).
const SUFFIX = {
  status: "sensor.%_channel_#_status",
  capacity: "sensor.%_channel_#_capacity",
  voltage: "sensor.%_channel_#_voltage",
  current: "sensor.%_channel_#_current",
  duration: "sensor.%_channel_#_duration",
  temp: "sensor.%_channel_#_battery_temperature",
  start: "button.%_channel_#_start",
  stop: "button.%_channel_#_stop",
  preset: "select.%_channel_#_preset",
  s_battery: "select.%_channel_#_battery_type",
  s_program: "select.%_channel_#_program",
  s_cycle_order: "select.%_channel_#_cycle_order",
  n_cells: "number.%_channel_#_cell_count",
  n_charge_current: "number.%_channel_#_charge_current",
  n_discharge_current: "number.%_channel_#_discharge_current",
  n_charge_voltage: "number.%_channel_#_charge_voltage_per_cell",
  n_discharge_voltage: "number.%_channel_#_discharge_voltage_per_cell",
  n_track_voltage: "number.%_channel_#_peak_sensitivity",
  n_cycles: "number.%_channel_#_cycle_count",
  preset_name: "text.%_channel_#_preset_name",
  save_preset: "button.%_channel_#_save_preset",
  delete_preset: "button.%_channel_#_delete_preset",
};

const UNAVAILABLE = ["unavailable", "unknown", "none", "", undefined, null];
const num = (s) => {
  if (!s || UNAVAILABLE.includes(s.state)) return null;
  const n = Number(s.state);
  return Number.isFinite(n) ? n : null;
};
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d) => (v == null ? "—" : v.toFixed(d));
const fmtDuration = (s) => {
  if (s == null) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;
};

class SkyrcCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("skyrc-card-editor");
  }

  static getStubConfig(hass) {
    const e = Object.values(hass?.entities || {}).find((x) => x.platform === DOMAIN && x.device_id);
    return e ? { device: e.device_id } : {};
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._armed = {}; // channel -> timestamp of first Stop tap
    this._sig = "";
    this._stageCh = null; // channel the staging popup is open for
    this._stageSig = "";
    // The tiles re-render on every poll; the popup lives beside them so it
    // survives that and keeps whatever is being typed into it.
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><div id="main"></div><dialog id="stage" aria-labelledby="stage-title"></dialog>`;
    this._main = this.shadowRoot.getElementById("main");
    this._dialog = this.shadowRoot.getElementById("stage");
    this._dialog.addEventListener("close", () => { this._stageCh = null; this._stageSig = ""; });
    this._dialog.addEventListener("click", (ev) => { if (ev.target === this._dialog) this._dialog.close(); });
    this._dialog.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && ev.target?.dataset?.stageNumber) ev.target.blur();
    });
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this._main.addEventListener("keydown", (ev) => {
      const t = ev.target;
      if ((ev.key === "Enter" || ev.key === " ") && t?.dataset?.action === "stage") {
        ev.preventDefault();
        this._openStage(t.dataset.ch);
      }
    });
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const channels = (config.channels || ALL_CHANNELS).map((c) => String(c).toUpperCase());
    if (channels.some((c) => !ALL_CHANNELS.includes(c))) {
      throw new Error("channels must be a list of A, B, C and/or D");
    }
    if (config.switch_entity && !/^(switch|input_boolean)\./.test(config.switch_entity)) {
      throw new Error("switch_entity must be a switch or input_boolean entity");
    }
    this._config = {
      show_cells: true,
      show_controls: true,
      compact_idle: true,
      stage_popup: true,
      collapse_offline: true,
      ...config,
      channels,
    };
    this._map = null;
    this._sig = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._map || this._regRef !== hass.entities) this._resolve();
    const sig = this._signature();
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
    if (this._stageCh) {
      const ssig = this._stageSignature();
      if (ssig !== this._stageSig) {
        this._stageSig = ssig;
        this._renderStage();
      }
    }
  }

  getCardSize() {
    return 2 + Math.ceil(this._config.channels.length / 2) * 4;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  /* ---------- entity discovery ---------- */

  _resolve() {
    const hass = this._hass;
    const cfg = this._config;
    const map = { charger: {}, channels: {} };
    ALL_CHANNELS.forEach((c) => (map.channels[c] = {}));
    this._regRef = hass.entities;

    if (cfg.prefix) {
      const p = cfg.prefix.replace(/^(sensor|button|select)\./, "");
      for (const c of ALL_CHANNELS) {
        for (const [k, pat] of Object.entries(SUFFIX)) {
          map.channels[c][k] = pat.replace("%", p).replace("#", c.toLowerCase());
        }
      }
      map.charger.charger_temp = `sensor.${p}_charger_temperature`;
      map.deviceName = cfg.prefix;
      this._map = map;
      return;
    }

    const reg = Object.values(hass.entities || {}).filter((e) => e.platform === DOMAIN);
    const device = cfg.device || reg.find((e) => e.device_id)?.device_id;
    map.device = device;
    map.deviceName = device && hass.devices?.[device]
      ? hass.devices[device].name_by_user || hass.devices[device].name
      : null;

    for (const e of reg) {
      if (device && e.device_id !== device) continue;
      const domain = e.entity_id.split(".")[0];
      const key = KEYS[domain]?.[e.translation_key];
      if (!key) continue;
      if (key === "charger_temp") {
        map.charger.charger_temp = e.entity_id;
        continue;
      }
      const ch = this._channelOf(e.entity_id);
      if (ch) map.channels[ch][key] = e.entity_id;
    }
    this._map = map;
  }

  _channelOf(entityId) {
    const m = entityId.match(/_channel_([a-d])(?:_|$)/i);
    if (m) return m[1].toUpperCase();
    const name = this._hass.states[entityId]?.attributes?.friendly_name || "";
    const n = name.match(/\bChannel ([A-D])\b/i);
    return n ? n[1].toUpperCase() : null;
  }

  _signature() {
    const ids = [this._map.charger.charger_temp, this._config.switch_entity];
    for (const c of this._config.channels) ids.push(...TILE_KEYS.map((k) => this._map.channels[c][k]));
    return ids
      .map((id) => {
        const s = id && this._hass.states[id];
        return s ? `${s.state}|${s.last_updated}` : "-";
      })
      .join(";");
  }

  _stageSignature() {
    const ids = Object.values(this._map.channels[this._stageCh] || {});
    return ids
      .map((id) => {
        const s = id && this._hass.states[id];
        return s ? `${s.state}|${s.last_updated}|${s.attributes.min}|${s.attributes.max}|${(s.attributes.options || []).join(",")}` : "-";
      })
      .join(";");
  }

  /* ---------- actions ---------- */

  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset && (n.dataset.action || n.dataset.entity));
    if (!el) return;
    const { action, ch, entity } = el.dataset;

    if (entity && !action) {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } }));
      return;
    }
    if (action === "toggle") {
      const id = this._config.switch_entity;
      const s = this._st(id);
      if (s && s.state !== "unavailable") {
        this._hass.callService("homeassistant", "toggle", { entity_id: id }).catch((err) => {
          this.dispatchEvent(new CustomEvent("hass-notification", {
            bubbles: true, composed: true, detail: { message: `${id}: ${err.message || err}` },
          }));
        });
      }
      return;
    }
    const ids = this._map.channels[ch] || {};
    if (action === "stage") {
      this._openStage(ch);
    } else if (action === "stage-close") {
      this._dialog.close();
    } else if (action === "stage-start" && ids.start) {
      this._press(ids.start);
      this._dialog.close();
    } else if (action === "stage-save") {
      this._savePreset(ch);
    } else if (action === "stage-delete" && ids.delete_preset) {
      this._press(ids.delete_preset);
    } else if (action === "start" && ids.start) {
      this._press(ids.start);
    } else if (action === "stop" && ids.stop) {
      const now = Date.now();
      if (this._armed[ch] && now - this._armed[ch] < 3000) {
        delete this._armed[ch];
        this._press(ids.stop);
        this._render();
      } else {
        this._armed[ch] = now;
        this._render();
        setTimeout(() => {
          if (this._armed[ch] === now) {
            delete this._armed[ch];
            this._render();
          }
        }, 3000);
      }
    }
  }

  _onChange(ev) {
    const el = ev.target;
    const ds = el?.dataset || {};
    if (ds.action === "preset") {
      const id = this._map.channels[ds.ch]?.preset;
      if (id && el.value) this._call("select", "select_option", { entity_id: id, option: el.value });
    } else if (ds.stageSelect) {
      this._call("select", "select_option", { entity_id: ds.stageSelect, option: el.value });
    } else if (ds.stageNumber) {
      const s = this._st(ds.stageNumber);
      const a = s?.attributes || {};
      let v = Number(el.value);
      if (el.value === "" || !Number.isFinite(v)) {
        el.value = s?.state ?? "";
        return;
      }
      const step = Number(a.step) || 1;
      const min = Number.isFinite(Number(a.min)) ? Number(a.min) : -Infinity;
      const max = Number.isFinite(Number(a.max)) ? Number(a.max) : Infinity;
      v = Math.min(max, Math.max(min, Math.round((v - (Number.isFinite(min) ? min : 0)) / step) * step + (Number.isFinite(min) ? min : 0)));
      el.value = v;
      if (String(v) !== String(Number(s?.state))) this._call("number", "set_value", { entity_id: ds.stageNumber, value: v });
    }
  }

  _call(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((err) => {
      this.dispatchEvent(new CustomEvent("hass-notification", {
        bubbles: true, composed: true, detail: { message: `SkyRC: ${err.message || err}` },
      }));
      throw err;
    });
  }

  _press(entityId) {
    return this._call("button", "press", { entity_id: entityId }).catch(() => {});
  }

  async _savePreset(ch) {
    const ids = this._map.channels[ch] || {};
    const input = this._dialog.querySelector("input[data-preset-name]");
    const name = (input?.value || "").trim();
    if (!name) {
      input?.focus();
      input?.setAttribute("aria-invalid", "true");
      return;
    }
    try {
      await this._call("text", "set_value", { entity_id: ids.preset_name, value: name });
      await this._call("button", "press", { entity_id: ids.save_preset });
      this._flash = `Saved “${name}”`;
      this._stageSig = "";
      this._renderStage();
    } catch (_) { /* already reported */ }
  }

  _canStage(d) {
    const ids = d.ids;
    return this._config.stage_popup && !d.meta.active && d.state !== "error" && !!(ids.s_battery || ids.s_program);
  }

  _openStage(ch) {
    this._stageCh = ch;
    this._flash = null;
    this._stageSig = this._stageSignature();
    this._renderStage();
    if (!this._dialog.open) this._dialog.showModal();
  }

  /* ---------- rendering ---------- */

  _st(id) {
    return id ? this._hass.states[id] : undefined;
  }

  _channelData(c) {
    const ids = this._map.channels[c];
    const status = this._st(ids.status);
    const state = !status || status.state === "unavailable" ? "unavailable" : status.state;
    const a = status?.attributes || {};
    const v = num(this._st(ids.voltage));
    const i = num(this._st(ids.current));
    return {
      c,
      ids,
      state,
      meta: STATUS[state] || STATUS.unknown,
      battery: BATTERY[a.battery_type] || null,
      cellsCfg: a.cell_configuration || null,
      program: PROGRAM[a.program] || (a.program ? String(a.program).replace(/_/g, " ") : null),
      cells: Array.isArray(a.cell_voltages_mv) ? a.cell_voltages_mv.filter((x) => Number.isFinite(x)) : [],
      v,
      i,
      p: v != null && i != null ? Math.abs(v * i) : null,
      cap: num(this._st(ids.capacity)),
      temp: num(this._st(ids.temp)),
      dur: num(this._st(ids.duration)),
      preset: this._st(ids.preset),
    };
  }

  _render() {
    if (!this._hass || !this._config || !this._map) return;
    const cfg = this._config;
    const data = cfg.channels.map((c) => this._channelData(c));
    const found = data.some((d) => d.ids.status);
    const offline = found && data.every((d) => d.state === "unavailable");
    const active = data.filter((d) => d.meta.active).length;
    // Total power going into / out of the packs on running channels (V × A).
    const watts = data.filter((d) => d.meta.active && d.p != null);
    const totalW = watts.length ? watts.reduce((sum, d) => sum + d.p, 0) : null;
    const chargerTemp = num(this._st(this._map.charger.charger_temp));
    const title = cfg.title ?? this._map.deviceName ?? "SkyRC charger";

    // Collapse to the header row when the charger can't be reached, or when
    // the header switch (e.g. the plug feeding it) is off.
    const sw = cfg.switch_entity ? this._st(cfg.switch_entity) : null;
    const switchedOff = !!sw && sw.state === "off";
    const collapsed = found && ((offline && cfg.collapse_offline) || switchedOff);

    let body = "";
    if (!found) {
      body = `<div class="empty">No SkyRC charger entities found.${cfg.device || cfg.prefix ? " Check the <code>device</code> / <code>prefix</code> option." : " Is the integration set up?"}</div>`;
    } else if (!collapsed) {
      body = `<div class="grid">${data.map((d) => this._renderChannel(d)).join("")}</div>`;
    }
    if (collapsed && this._dialog.open) this._dialog.close();

    const tone = offline || switchedOff ? "off" : active ? "live" : "";
    const lead = cfg.icon !== "" && cfg.icon !== false
      ? `<span class="t-icon ${tone}"><ha-icon icon="${esc(cfg.icon || "mdi:battery-charging-high")}"></ha-icon></span>`
      : "";

    this._main.innerHTML = `
      <ha-card class="${collapsed ? "collapsed" : ""}">
        ${title === "" && !collapsed ? "" : `
        <div class="header">
          <div class="title">
            ${lead}
            <span class="t-name">${esc(title)}</span>
          </div>
          <div class="chips">
            ${offline && !switchedOff ? `<span class="chip warn" title="The charger isn't responding over Bluetooth"><ha-icon icon="mdi:bluetooth-off"></ha-icon><span class="txt">Unavailable</span></span>` : ""}
            ${active && !switchedOff ? `<span class="chip live"><span class="dot"></span><span class="txt">${active} active</span></span>` : ""}
            ${totalW != null && !switchedOff && !offline ? `<span class="chip" title="Total power on running channels (pack voltage × current)"><ha-icon icon="mdi:flash"></ha-icon><span class="txt">${totalW < 10 ? fmt(totalW, 1) : Math.round(totalW)} W</span></span>` : ""}
            ${chargerTemp != null && !switchedOff ? `<span class="chip link" data-entity="${esc(this._map.charger.charger_temp)}"><ha-icon icon="mdi:thermometer"></ha-icon><span class="txt">${fmt(chargerTemp, 0)}°C</span></span>` : ""}
            ${this._renderSwitch()}
          </div>
        </div>`}
        ${body}
      </ha-card>`;
  }

  _renderSwitch() {
    const id = this._config.switch_entity;
    if (!id) return "";
    const s = this._st(id);
    const state = s ? s.state : "unavailable";
    const on = state === "on";
    const off = state === "unavailable" || state === "unknown";
    const name = this._config.switch_name ?? "";
    const icon = this._config.switch_icon || s?.attributes?.icon || (on ? "mdi:power-plug" : "mdi:power-plug-off");
    const label = `${s?.attributes?.friendly_name || id}: ${off ? "unavailable" : on ? "on" : "off"}`;
    return `<button class="chip toggle ${on ? "on" : ""}" data-action="toggle" role="switch" aria-checked="${on}"
        aria-label="${esc(label)}" title="${esc(label)}" ${off ? "disabled" : ""}>
        <ha-icon icon="${esc(icon)}"></ha-icon>${name ? `<span class="txt">${esc(name)}</span>` : ""}<span class="knob"></span>
      </button>`;
  }

  _renderChannel(d) {
    const cfg = this._config;
    const { c, ids, meta, state } = d;
    const compact = cfg.compact_idle && ["idle", "standby", "unavailable", "ready", "unknown"].includes(state);
    const stage = this._canStage(d);
    // A tile that opens the popup doesn't also open more-info from its values.
    const link = (id) => (stage || !id ? "" : `link" data-entity="${esc(id)}`);
    const sub = [d.battery && d.cellsCfg ? `${d.battery} ${d.cellsCfg}` : d.battery || d.cellsCfg, d.program]
      .filter(Boolean).join(" · ");

    const metric = (label, value, unit, entity) => `
      <div class="metric ${link(entity)}">
        <div class="m-val">${value}<span class="m-unit">${unit}</span></div>
        <div class="m-lbl">${label}</div>
      </div>`;

    const metrics = [
      metric("Current", fmt(d.i, 2), "A", ids.current),
      metric("Capacity", d.cap == null ? "—" : Math.round(d.cap).toLocaleString(), "mAh", ids.capacity),
      d.temp != null ? metric("Pack", fmt(d.temp, 0), "°C", ids.temp) : metric("Power", fmt(d.p, 1), "W", null),
    ];
    const durTxt = fmtDuration(d.dur);

    return `
      <section class="ch tone-${meta.tone} ${meta.active ? "active" : ""} ${compact ? "compact" : ""} ${stage ? "stageable" : ""}"
        ${stage ? `data-action="stage" data-ch="${c}" role="button" tabindex="0" aria-label="Set up channel ${c}"` : ""}>
        <div class="ch-head">
          <div class="badge">${c}</div>
          <div class="ch-title ${link(ids.status)}">
            <div class="status"><ha-icon icon="${meta.icon}"></ha-icon><span class="txt">${esc(meta.label)}</span></div>
            ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
          </div>
          ${stage ? `<ha-icon class="tune" icon="mdi:tune-variant"></ha-icon>` : ""}
          ${durTxt && !compact ? `<div class="dur ${link(ids.duration)}"><ha-icon icon="mdi:timer-outline"></ha-icon><span class="txt">${durTxt}</span></div>` : ""}
        </div>
        ${compact ? "" : `
          <div class="hero ${link(ids.voltage)}">
            <span class="hero-v">${fmt(d.v, 2)}</span><span class="hero-u">V</span>
            ${d.temp != null && d.p != null && meta.active ? `<span class="hero-p">${fmt(d.p, 1)} W</span>` : ""}
          </div>
          <div class="metrics">${metrics.join("")}</div>
          ${cfg.show_cells ? this._renderCells(d) : ""}`}
        ${cfg.show_controls ? this._renderControls(d) : ""}
      </section>`;
  }

  _renderStage() {
    const ch = this._stageCh;
    if (!ch || !this._map) return;
    const ids = this._map.channels[ch] || {};
    const d = this._channelData(ch);
    const offline = d.state === "unavailable";

    // Keep focus and anything half-typed across a re-render.
    const active = this.shadowRoot.activeElement;
    const keep = active && this._dialog.contains(active)
      ? { sel: active.dataset.stageNumber ? `[data-stage-number="${active.dataset.stageNumber}"]`
            : active.dataset.presetName != null ? "[data-preset-name]" : null,
          value: active.value, start: active.selectionStart, end: active.selectionEnd }
      : null;
    const typedName = this._dialog.querySelector("[data-preset-name]")?.value;

    const fields = STAGE_FIELDS.map((f) => {
      const id = ids[f.key];
      const s = this._st(id);
      if (!s || s.state === "unavailable") return "";
      const a = s.attributes || {};
      if (f.type === "select") {
        const opts = a.options || [];
        return `<label class="field ${f.wide ? "wide" : ""}">
          <span class="f-lbl">${f.label}</span>
          <select data-stage-select="${esc(id)}">
            ${opts.map((o) => `<option value="${esc(o)}" ${o === s.state ? "selected" : ""}>${esc(OPTION_LABELS[o] || o)}</option>`).join("")}
          </select>
        </label>`;
      }
      const unit = a.unit_of_measurement || "";
      const showUnit = unit && !["cells", "cycles"].includes(unit);
      const range = a.min != null && a.max != null ? `${a.min}–${a.max}${showUnit ? ` ${unit}` : ""}` : "";
      return `<label class="field">
        <span class="f-lbl">${f.label}</span>
        <span class="num">
          <input type="number" inputmode="decimal" data-stage-number="${esc(id)}" value="${esc(Number(s.state))}"
            min="${esc(a.min)}" max="${esc(a.max)}" step="${esc(a.step || 1)}" title="${esc(range)}">
          ${showUnit ? `<span class="n-unit">${esc(unit)}</span>` : ""}
        </span>
      </label>`;
    }).join("");

    const preset = this._st(ids.preset);
    const presetOpts = preset && preset.state !== "unavailable" ? preset.attributes.options || [] : [];
    const del = this._st(ids.delete_preset);
    const canDelete = del && del.state !== "unavailable";
    const nameState = this._st(ids.preset_name);
    const nameVal = typedName ?? (nameState && !UNAVAILABLE.includes(nameState.state) ? nameState.state : "");
    const nameMax = nameState?.attributes?.max || 32;

    this._dialog.innerHTML = `
      <div class="sheet">
        <div class="s-head tone-${d.meta.tone}">
          <div class="badge">${ch}</div>
          <div class="s-titles">
            <div id="stage-title" class="s-title">Set up channel ${ch}</div>
            <div class="s-sub">${esc(d.meta.label)}${offline ? " · charger unavailable" : ""}</div>
          </div>
          <button class="icon-btn" data-action="stage-close" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>

        ${presetOpts.length ? `
        <div class="s-section">
          <div class="s-row">
            <label class="field grow">
              <span class="f-lbl">Preset</span>
              <select data-action="preset" data-ch="${ch}">
                <option value="" ${presetOpts.includes(preset.state) ? "" : "selected"} disabled>Custom</option>
                ${presetOpts.map((o) => `<option value="${esc(o)}" ${o === preset.state ? "selected" : ""}>${esc(o)}</option>`).join("")}
              </select>
            </label>
            ${canDelete ? `<button class="btn ghost danger" data-action="stage-delete" data-ch="${ch}" title="Delete preset “${esc(preset.state)}”">
              <ha-icon icon="mdi:delete-outline"></ha-icon></button>` : ""}
          </div>
        </div>` : ""}

        <div class="s-section">
          ${fields ? `<div class="fields">${fields}</div>` : `<div class="s-note">This channel has no program settings. They need version 0.4.0 or later of the SkyRC integration.</div>`}
        </div>

        ${ids.preset_name && ids.save_preset ? `
        <div class="s-section">
          <div class="s-row">
            <label class="field grow">
              <span class="f-lbl">Save as preset</span>
              <input type="text" data-preset-name maxlength="${esc(nameMax)}" placeholder="e.g. 4S 2A balance" value="${esc(nameVal)}">
            </label>
            <button class="btn" data-action="stage-save" data-ch="${ch}"><ha-icon icon="mdi:content-save-outline"></ha-icon>Save</button>
          </div>
          ${this._flash ? `<div class="s-flash" role="status">${esc(this._flash)}</div>` : ""}
        </div>` : ""}

        <div class="s-foot">
          ${offline ? `<span class="s-note">Settings are kept; start once the charger is back.</span>` : ""}
          <button class="btn ghost" data-action="stage-close">Close</button>
          <button class="btn primary" data-action="stage-start" data-ch="${ch}" ${offline || !ids.start ? "disabled" : ""}>
            <ha-icon icon="mdi:play"></ha-icon>Start</button>
        </div>
      </div>`;

    if (keep?.sel) {
      const el = this._dialog.querySelector(keep.sel);
      if (el) {
        el.value = keep.value;
        el.focus();
        try { el.setSelectionRange(keep.start, keep.end); } catch (_) { /* number inputs */ }
      }
    }
  }

  _renderCells(d) {
    const cells = d.cells;
    if (cells.length < 2) return "";
    const min = Math.min(...cells), max = Math.max(...cells);
    const spread = max - min;
    // Window the scale around the pack so small imbalances are visible,
    // but never narrower than 60 mV so a balanced pack looks balanced.
    const span = Math.max(60, spread * 2.5);
    const lo = (min + max) / 2 - span / 2;
    const warn = spread > (this._config.cell_warning_mv ?? 50);
    const bars = cells.map((mv, idx) => {
      const h = Math.max(8, Math.min(100, ((mv - lo) / span) * 100));
      const cls = spread > 0 && mv === min ? "lo" : spread > 0 && mv === max ? "hi" : "";
      return `<div class="cell ${cls}" title="Cell ${idx + 1}: ${(mv / 1000).toFixed(3)} V">
        <div class="bar"><div class="fill" style="height:${h.toFixed(1)}%"></div></div>
        <div class="cv">${(mv / 1000).toFixed(2)}</div>
      </div>`;
    }).join("");
    return `
      <div class="cells">
        <div class="cells-head">
          <span>Cells</span>
          <span class="spread ${warn ? "warn" : ""}">Δ ${spread} mV${warn ? " ⚠" : ""}</span>
        </div>
        <div class="cell-row ${cells.length > 8 ? "many" : ""}" style="--n:${cells.length}">${bars}</div>
      </div>`;
  }

  _renderControls(d) {
    const { c, ids, meta, state } = d;
    if (!ids.start && !ids.stop) return "";
    const offline = state === "unavailable";
    const showStop = meta.active || state === "error";
    const armed = !!this._armed[c];
    const preset = d.preset;
    const presetOk = preset && preset.state !== "unavailable";
    const options = presetOk ? preset.attributes.options || [] : [];

    const presetSel = !showStop && options.length
      ? `<select class="preset" data-action="preset" data-ch="${c}" ${offline ? "disabled" : ""} aria-label="Channel ${c} preset">
          <option value="" ${options.includes(preset.state) ? "" : "selected"} disabled>Preset…</option>
          ${options.map((o) => `<option value="${esc(o)}" ${o === preset.state ? "selected" : ""}>${esc(o)}</option>`).join("")}
        </select>`
      : "";

    const btn = showStop
      ? `<button class="btn stop ${armed ? "armed" : ""}" data-action="stop" data-ch="${c}" ${offline || !ids.stop ? "disabled" : ""}>
          <ha-icon icon="mdi:stop"></ha-icon>${armed ? "Tap to confirm" : "Stop"}</button>`
      : `<button class="btn start" data-action="start" data-ch="${c}" ${offline || !ids.start ? "disabled" : ""}>
          <ha-icon icon="mdi:play"></ha-icon>Start</button>`;

    return `<div class="controls">${presetSel}${btn}</div>`;
  }
}

const STYLES = `
  :host {
    --skyrc-charge: var(--success-color, #2e9d5b);
    --skyrc-discharge: var(--warning-color, #e08a1e);
    --skyrc-work: var(--info-color, #3a86d4);
    --skyrc-done: var(--primary-color, #03a9f4);
    --skyrc-error: var(--error-color, #db4437);
    --skyrc-idle: var(--disabled-text-color, #9e9e9e);
    --skyrc-tile: var(--secondary-background-color, rgba(127,127,127,.08));
    --skyrc-radius: var(--ha-card-border-radius, 12px);
  }
  ha-card { padding: 14px 14px 16px; overflow: hidden; }
  ha-card.collapsed { padding-bottom: 14px; }
  ha-card.collapsed .header { margin-bottom: 2px; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 2px 2px 12px; flex-wrap: wrap; }
  .title { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 1.15rem; font-weight: 500;
           color: var(--primary-text-color); letter-spacing: .01em; }
  .t-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .t-icon { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
            color: var(--state-icon-color, var(--primary-color)); background: color-mix(in srgb, currentColor 14%, transparent);
            transition: color .2s, background .2s; }
  .t-icon ha-icon { --mdc-icon-size: 20px; }
  .t-icon.live { color: var(--skyrc-charge); }
  .t-icon.off { color: var(--skyrc-idle); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: .78rem; padding: 3px 9px; border-radius: 999px;
          background: var(--skyrc-tile); color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .chip ha-icon { --mdc-icon-size: 15px; }
  /* HA's icon element is inline and sits on the text baseline; make every icon
     here a fixed box that flex can centre exactly. */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; line-height: 0; --ha-icon-display: block; }
  /* Trim text to its digits/capitals so it centres optically against icons
     (ignored by browsers without text-box support). */
  .txt { text-box: trim-both cap alphabetic; }
  .chip { line-height: 1.2; min-height: 22px; box-sizing: border-box; }
  .chip.live { color: var(--skyrc-charge); background: color-mix(in srgb, var(--skyrc-charge) 14%, transparent); }
  .chip.toggle { font: inherit; font-size: .78rem; border: 0; cursor: pointer; padding: 3px 5px 3px 9px; gap: 6px;
                 transition: background .15s, color .15s; }
  .chip.toggle .knob { position: relative; width: 26px; height: 15px; border-radius: 999px; flex: none;
                       background: color-mix(in srgb, var(--secondary-text-color) 35%, transparent); transition: background .15s; }
  .chip.toggle .knob::after { content: ""; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%;
                              background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
  .chip.toggle.on { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .chip.toggle.on .knob { background: var(--primary-color); }
  .chip.toggle.on .knob::after { transform: translateX(11px); }
  .chip.toggle:disabled { opacity: .45; cursor: default; }
  .chip.toggle:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .chip.warn { color: var(--skyrc-error); background: color-mix(in srgb, var(--skyrc-error) 14%, transparent); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: pulse 1.6s ease-in-out infinite; }
  .link { cursor: pointer; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 10px; align-items: start; }
  .empty { color: var(--secondary-text-color); padding: 8px 2px; }

  .ch { --tone: var(--skyrc-idle); position: relative; background: var(--skyrc-tile); border-radius: calc(var(--skyrc-radius) - 2px);
        padding: 12px 12px 12px 14px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  .ch::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--tone); opacity: .9; }
  .ch.active::before { background: linear-gradient(180deg, var(--tone) 0%, color-mix(in srgb, var(--tone) 35%, transparent) 50%, var(--tone) 100%);
                       background-size: 100% 200%; animation: flow 2.2s linear infinite; }
  .tone-charge { --tone: var(--skyrc-charge); }
  .tone-discharge { --tone: var(--skyrc-discharge); }
  .tone-work { --tone: var(--skyrc-work); }
  .tone-done { --tone: var(--skyrc-done); }
  .tone-error { --tone: var(--skyrc-error); }
  .tone-off { --tone: var(--skyrc-idle); }
  .tone-off .ch-head, .tone-off .controls { opacity: .6; }

  .ch-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .badge { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-weight: 700; font-size: .9rem;
           color: var(--tone); background: color-mix(in srgb, var(--tone) 16%, transparent); }
  .ch-title { min-width: 0; flex: 1; }
  .status { display: flex; align-items: center; gap: 4px; font-weight: 600; font-size: .92rem; color: var(--tone); }
  .status ha-icon { --mdc-icon-size: 17px; flex: none; }
  .tone-idle .status, .tone-off .status { color: var(--secondary-text-color); }
  .sub { font-size: .76rem; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .dur { flex: none; display: inline-flex; align-items: center; gap: 3px; font-size: .75rem; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .dur ha-icon { --mdc-icon-size: 14px; }

  .hero { display: flex; align-items: baseline; gap: 3px; line-height: 1; padding-top: 2px; }
  .hero-v { font-size: 2.1rem; font-weight: 300; color: var(--primary-text-color); font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .hero-u { font-size: 1rem; color: var(--secondary-text-color); }
  .hero-p { margin-left: auto; font-size: .82rem; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }

  .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .metric { min-width: 0; }
  .m-val { overflow: hidden; text-overflow: ellipsis; font-size: .98rem; font-weight: 500; color: var(--primary-text-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .m-unit { font-size: .72rem; font-weight: 400; color: var(--secondary-text-color); margin-left: 2px; }
  .m-lbl { font-size: .7rem; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }

  .cells-head { display: flex; justify-content: space-between; font-size: .7rem; color: var(--secondary-text-color);
                text-transform: uppercase; letter-spacing: .05em; margin-bottom: 5px; }
  .spread { font-variant-numeric: tabular-nums; text-transform: none; letter-spacing: 0; }
  .spread.warn { color: var(--skyrc-error); font-weight: 600; }
  .cell-row { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 3px; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
  .bar { width: 100%; max-width: 26px; height: 34px; border-radius: 4px; background: color-mix(in srgb, var(--primary-text-color) 7%, transparent);
         display: flex; align-items: flex-end; overflow: hidden; }
  .fill { width: 100%; background: color-mix(in srgb, var(--tone) 70%, transparent); border-radius: 3px; transition: height .4s ease; }
  .cell.hi .fill { background: var(--tone); }
  .cell.lo .fill { background: color-mix(in srgb, var(--tone) 40%, transparent); }
  .cv { font-size: .62rem; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .cell-row.many .cv { display: none; }

  .controls { display: flex; gap: 6px; margin-top: auto; }
  .ch.compact .controls { margin-top: 0; }
  .btn, .preset { font: inherit; font-size: .82rem; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.3));
                  background: var(--card-background-color, transparent); color: var(--primary-text-color); height: 32px; }
  .btn { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 0 12px; cursor: pointer;
         margin-left: auto; transition: background .15s, color .15s, border-color .15s; }
  .btn ha-icon { --mdc-icon-size: 17px; }
  .btn.start:hover:not(:disabled) { border-color: var(--skyrc-charge); color: var(--skyrc-charge); }
  .btn.stop:hover:not(:disabled) { border-color: var(--skyrc-error); color: var(--skyrc-error); }
  .btn.stop.armed, .btn.stop.armed:hover:not(:disabled) { background: var(--skyrc-error); border-color: var(--skyrc-error); color: #fff; }
  .btn.stop.armed:hover:not(:disabled) { filter: brightness(1.1); }
  .btn:disabled, .preset:disabled { opacity: .45; cursor: default; }
  .btn:focus-visible, .preset:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .preset { flex: 1; min-width: 0; padding: 0 6px; cursor: pointer; }

  .ch.stageable { cursor: pointer; transition: background .15s; }
  .ch.stageable:hover { background: color-mix(in srgb, var(--primary-text-color) 6%, var(--skyrc-tile)); }
  .ch.stageable:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .tune { --mdc-icon-size: 16px; color: var(--secondary-text-color); opacity: .7; flex: none; }

  dialog { border: 0; padding: 0; border-radius: 16px; width: min(440px, calc(100vw - 24px)); max-height: calc(100vh - 32px);
           background: var(--card-background-color, #fff); color: var(--primary-text-color);
           box-shadow: 0 12px 40px rgba(0,0,0,.3); font-family: inherit; }
  dialog::backdrop { background: rgba(0,0,0,.45); }
  .sheet { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 14px; }
  .s-head { --tone: var(--skyrc-idle); display: flex; align-items: center; gap: 10px; }
  .s-titles { flex: 1; min-width: 0; }
  .s-title { font-size: 1.05rem; font-weight: 600; }
  .s-sub { font-size: .8rem; color: var(--secondary-text-color); }
  .icon-btn { border: 0; background: transparent; color: var(--secondary-text-color); width: 34px; height: 34px; border-radius: 50%;
              display: grid; place-items: center; cursor: pointer; }
  .icon-btn:hover { background: var(--skyrc-tile); }
  .s-section + .s-section { border-top: 1px solid var(--divider-color, rgba(127,127,127,.25)); padding-top: 14px; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: end; }
  .field.wide { grid-column: 1 / -1; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field.grow { flex: 1; }
  .f-lbl { font-size: .72rem; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em; }
  .field select, .field input { font: inherit; font-size: .92rem; height: 38px; border-radius: 8px; padding: 0 10px; min-width: 0; width: 100%;
         box-sizing: border-box; border: 1px solid var(--divider-color, rgba(127,127,127,.3));
         background: var(--secondary-background-color, transparent); color: var(--primary-text-color); }
  .field input[aria-invalid="true"] { border-color: var(--skyrc-error); }
  .field select:focus-visible, .field input:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 0; border-color: transparent; }
  .num { position: relative; display: flex; }
  .num input { padding-right: 40px; font-variant-numeric: tabular-nums; }
  .n-unit { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: .78rem; color: var(--secondary-text-color); pointer-events: none; }
  .s-row { display: flex; align-items: flex-end; gap: 8px; }
  .s-row .btn { margin-left: 0; height: 38px; }
  .s-note { font-size: .8rem; color: var(--secondary-text-color); }
  .s-flash { font-size: .8rem; color: var(--skyrc-charge); margin-top: 6px; }
  .s-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .s-foot .s-note { flex: 1 1 100%; }
  .s-foot .btn { margin-left: 0; height: 38px; padding: 0 16px; }
  .btn.ghost { background: transparent; }
  .btn.ghost.danger { color: var(--skyrc-error); padding: 0 10px; }
  .btn.primary { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .btn.primary:hover:not(:disabled) { filter: brightness(1.08); }

  @keyframes flow { from { background-position: 0 0; } to { background-position: 0 200%; } }
  @keyframes pulse { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { .ch.active::before, .dot { animation: none; } }
`;

/* ---------- visual editor ---------- */

const EDITOR_SCHEMA = [
  { name: "device", selector: { device: { filter: { integration: DOMAIN } } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "title", selector: { text: {} } },
      { name: "icon", selector: { icon: {} }, context: { icon_entity: "" } },
    ],
  },
  { name: "switch_entity", selector: { entity: { filter: { domain: ["switch", "input_boolean"] } } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "switch_name", selector: { text: {} } },
      { name: "switch_icon", selector: { icon: {} } },
    ],
  },
  {
    name: "channels",
    selector: { select: { multiple: true, mode: "list", options: ALL_CHANNELS.map((c) => ({ value: c, label: `Channel ${c}` })) } },
  },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "show_cells", selector: { boolean: {} } },
      { name: "show_controls", selector: { boolean: {} } },
      { name: "compact_idle", selector: { boolean: {} } },
      { name: "stage_popup", selector: { boolean: {} } },
      { name: "collapse_offline", selector: { boolean: {} } },
      { name: "cell_warning_mv", selector: { number: { min: 5, max: 500, step: 5, mode: "box", unit_of_measurement: "mV" } } },
    ],
  },
];

const EDITOR_LABELS = {
  switch_entity: "Header switch (optional)",
  switch_name: "Switch label",
  switch_icon: "Switch icon",
  device: "Charger",
  title: "Title (leave blank for the device name)",
  icon: "Icon",
  channels: "Channels",
  show_cells: "Show cell voltages",
  show_controls: "Show start / stop controls",
  compact_idle: "Collapse idle channels",
  stage_popup: "Tap an idle channel to set it up",
  collapse_offline: "Collapse the card when the charger is unavailable",
  cell_warning_mv: "Cell imbalance warning",
};

class SkyrcCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  async _render() {
    if (!this._hass || !this._config) return;
    if (!customElements.get("ha-form")) {
      // ha-form is lazy-loaded by HA; borrow it from a built-in card editor.
      const helpers = await window.loadCardHelpers?.();
      const card = await helpers?.createCardElement({ type: "entities", entities: [] });
      await card?.constructor?.getConfigElement?.();
    }
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const cfg = { ...ev.detail.value };
        for (const k of Object.keys(cfg)) if (cfg[k] === "" || cfg[k] == null) delete cfg[k];
        if (Array.isArray(cfg.channels) && (cfg.channels.length === 0 || cfg.channels.length === 4)) delete cfg.channels;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = {
      show_cells: true, show_controls: true, compact_idle: true, stage_popup: true, collapse_offline: true, cell_warning_mv: 50,
      channels: ALL_CHANNELS,
      ...this._config,
    };
  }
}

customElements.get("skyrc-card") || customElements.define("skyrc-card", SkyrcCard);
customElements.get("skyrc-card-editor") || customElements.define("skyrc-card-editor", SkyrcCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "skyrc-card")) {
  window.customCards.push({
    type: "skyrc-card",
    name: "SkyRC Charger",
    description: "Per-channel status, cell voltages and start/stop for SkyRC neo-series chargers.",
    preview: true,
    documentationURL: "https://github.com/sargeantpepper/SkyRCchargercard",
  });
}

console.info(`%c SKYRC-CARD %c ${CARD_VERSION} `, "background:#2e9d5b;color:#fff;border-radius:3px 0 0 3px;padding:1px 4px", "background:#444;color:#fff;border-radius:0 3px 3px 0;padding:1px 4px");
