/* QmaxRefresh 2.0 - opt-in, parallel implementation.
 * Load this file INSTEAD OF v1; never load both on the same page.
 * Public configuration methods remain compatible with v1.
 */
var QmaxRefresh = (function () {
  'use strict';

  var config = {
    debug: false,
    refreshInterval: 30,
    maxRefreshs: null,
    timeDiffLastUserInteraction: 30,
    lastUserInteraction: Date.now(),
    refreshExcludedList: [],
    initialized: false
  };
  var slots = new Map();
  var excludedIds = new Set();
  var interactionThrottleAt = 0;
  var AUCTION_WATCHDOG_MS = 8000;
  var FAILED_AUCTION_RETRY_MS = 5000;

  function log(message, data) {
    if (config.debug && typeof console !== 'undefined') {
      console.log('[QmaxRefresh v2] ' + message, data === undefined ? '' : data);
    }
  }

  function timestamp() { return Date.now(); }
  function visiblePage() { return document.visibilityState !== 'hidden'; }
  function intervalMs(state) {
    var seconds = state.refreshInterval !== undefined ? state.refreshInterval : config.refreshInterval;
    return Math.max(1, Number(seconds) || 30) * 1000;
  }
  function maxCount(state) {
    return state.maxRefreshs !== undefined ? state.maxRefreshs : config.maxRefreshs;
  }
  function getState(divId) {
    if (!slots.has(divId)) {
      slots.set(divId, {
        id: divId, slot: null, refreshEnabled: true, refreshInterval: undefined,
        maxRefreshs: undefined, refreshCount: 0, visibility: 0,
        lastRenderAt: null, lastLineItemId: null, inFlight: false,
        auctionToken: 0, timer: null, watchdog: null, retryAfter: 0,
        completed: false
      });
    }
    return slots.get(divId);
  }
  function clearTimer(state) {
    if (state.timer !== null) { clearTimeout(state.timer); state.timer = null; }
  }
  function clearWatchdog(state) {
    if (state.watchdog !== null) { clearTimeout(state.watchdog); state.watchdog = null; }
  }
  function disable(state, reason) {
    state.refreshEnabled = false;
    state.completed = true;
    clearTimer(state);
    clearWatchdog(state);
    state.auctionToken++;
    state.inFlight = false;
    log(state.id + ': disabled (' + reason + ')');
  }
  function activeSlot(state) {
    if (!state.slot || !window.googletag || !googletag.pubads) { return false; }
    if (typeof googletag.pubads().getSlots !== 'function') { return true; }
    return googletag.pubads().getSlots().indexOf(state.slot) !== -1;
  }
  function eligibility(state, now) {
    if (!state.refreshEnabled || state.completed) { return 'disabled'; }
    if (!activeSlot(state)) { return 'destroyed'; }
    if (state.lastRenderAt === null) { return 'not-rendered'; }
    if (state.inFlight) { return 'auction-in-flight'; }
    if (!visiblePage()) { return 'page-hidden'; }
    var limit = maxCount(state);
    if (limit !== null && limit !== undefined && Number.isFinite(Number(limit)) &&
        state.refreshCount >= Number(limit)) { return 'max-refreshes'; }
    if (state.visibility < 50) { return 'below-50-percent'; }
    if (now - config.lastUserInteraction > Math.max(0, Number(config.timeDiffLastUserInteraction)) * 1000) {
      return 'user-idle';
    }
    if (now < state.retryAfter) { return 'retry-backoff'; }
    if (now < state.lastRenderAt + intervalMs(state)) { return 'minimum-interval'; }
    return null;
  }
  function schedule(state) {
    clearTimer(state);
    if (!state.refreshEnabled || state.completed || state.inFlight || state.lastRenderAt === null) { return; }
    var next = Math.max(state.lastRenderAt + intervalMs(state), state.retryAfter);
    var delay = next - timestamp();
    // Once due, let interaction, visibility or focus wake the slot.
    if (delay <= 0) { return; }
    state.timer = setTimeout(function () {
      state.timer = null;
      evaluate(state, 'minimum-interval-elapsed');
    }, delay);
  }
  function evaluate(state, trigger) {
    if (!state.refreshEnabled || state.completed) { return; }
    var now = timestamp();
    var reason = eligibility(state, now);
    if (reason) {
      log(state.id + ': blocked by ' + reason + ' (trigger=' + trigger + ')');
      if (reason === 'destroyed' || reason === 'max-refreshes') {
        state.completed = true;
        clearTimer(state);
      } else if (reason === 'minimum-interval' || reason === 'retry-backoff') {
        schedule(state);
      }
      return;
    }
    startAuction(state, trigger);
  }
  function startAuction(state, trigger) {
    state.inFlight = true;
    clearTimer(state);
    var token = ++state.auctionToken;
    var sentToGpt = false;
    log(state.id + ': auction started by ' + trigger);
    function fail(reason) {
      if (state.auctionToken !== token) { return; }
      clearWatchdog(state);
      state.inFlight = false;
      state.retryAfter = timestamp() + FAILED_AUCTION_RETRY_MS;
      log(state.id + ': ' + reason);
      schedule(state);
    }
    state.watchdog = setTimeout(function () {
      fail(sentToGpt ? 'GPT render timeout' : 'Prebid auction timeout');
    }, AUCTION_WATCHDOG_MS);
    try {
      if (!window.pbjs || !window.pbjs.que) { fail('pbjs unavailable'); return; }
      window.pbjs.que.push(function () {
        if (token !== state.auctionToken) { return; }
        try {
          window.pbjs.requestBids({
            timeout: 1200,
            adUnitCodes: [state.id],
            bidsBackHandler: function () {
              if (token !== state.auctionToken || !state.inFlight) { return; }
              if (!visiblePage() || state.visibility < 50 || !activeSlot(state) ||
                  !state.refreshEnabled) { fail('conditions changed during auction'); return; }
              try {
                // Count the request only when GPT refresh is actually invoked.
                var nextCount = state.refreshCount + 1;
                state.slot.setTargeting('qm_is_refresh', 'true');
                state.slot.setTargeting('qm_refresh_count', String(nextCount));
                window.pbjs.setTargetingForGPTAsync([state.id]);
                window.googletag.pubads().refresh([state.slot]);
                state.refreshCount = nextCount;
                sentToGpt = true;
                log(state.id + ': GAM refresh #' + nextCount);
              } catch (error) { fail('GPT refresh failed: ' + error.message); }
            }
          });
        } catch (error) { fail('Prebid request failed: ' + error.message); }
      });
    } catch (error) { fail('Prebid queue failed: ' + error.message); }
  }
  function onRender(event) {
    var state = getState(event.slot.getSlotElementId());
    state.slot = event.slot;
    state.lastLineItemId = event.lineItemId;
    if (excludedIds.has(String(event.lineItemId))) {
      disable(state, 'excluded line item ' + event.lineItemId);
      return;
    }
    // Ignore render events for no-longer-managed slots.
    if (!state.refreshEnabled || state.completed) { return; }
    clearWatchdog(state);
    state.inFlight = false;
    state.retryAfter = 0;
    // Only count time after a GPT render, never from a response/auction timestamp.
    state.lastRenderAt = timestamp();
    log(state.id + ': rendered; isEmpty=' + Boolean(event.isEmpty));
    schedule(state);
  }
  function onVisibility(event) {
    var state = getState(event.slot.getSlotElementId());
    var previous = state.visibility;
    state.slot = event.slot;
    state.visibility = event.inViewPercentage;
    if (previous < 50 && state.visibility >= 50) { evaluate(state, 'viewport-reentry'); }
  }
  function wake(trigger) {
    slots.forEach(function (state) { evaluate(state, trigger); });
  }
  function onInteraction() {
    var now = timestamp();
    var wasIdle = now - config.lastUserInteraction > Number(config.timeDiffLastUserInteraction) * 1000;
    config.lastUserInteraction = now; // Synchronous: no focus/interaction race.
    if (wasIdle && now - interactionThrottleAt >= 1000) {
      interactionThrottleAt = now;
      wake('activity-resume');
    }
  }
  function loadExclusions() {
    var now = new Date();
    var hash = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'), String(now.getHours()).padStart(2, '0')].join('');
    var req = new XMLHttpRequest();
    req.open('GET', 'https://storage.googleapis.com/qm-refresh/refresh-exclude-list.json?' + hash, true);
    req.onload = function () {
      if (req.status !== 200) { log('exclude list HTTP ' + req.status); return; }
      try {
        var parsed = JSON.parse(req.responseText);
        if (!Array.isArray(parsed)) { throw new Error('expected JSON array'); }
        config.refreshExcludedList = parsed;
        excludedIds = new Set(parsed.map(String));
        // Catch line items rendered before the async list finished loading.
        slots.forEach(function (state) {
          if (state.lastLineItemId !== null &&
              excludedIds.has(String(state.lastLineItemId))) {
            disable(state, 'excluded line item (late list load)');
          }
        });
        log('exclude list loaded: ' + excludedIds.size + ' entries');
      } catch (error) { log('exclude list invalid: ' + error.message); }
    };
    req.onerror = function () { log('exclude list request failed'); };
    req.send();
  }
  function init() {
    return function () {
      if (config.initialized) { log('init ignored (already initialized)'); return; }
      config.initialized = true;
      googletag.pubads().addEventListener('slotRequested', function (event) {
        var state = getState(event.slot.getSlotElementId());
        state.slot = event.slot;
      });
      googletag.pubads().addEventListener('slotVisibilityChanged', onVisibility);
      googletag.pubads().addEventListener('slotRenderEnded', onRender);
      document.addEventListener('visibilitychange', function () {
        if (visiblePage()) {
          config.lastUserInteraction = timestamp();
          wake('tab-return');
        }
      });
      // Focus is a fallback; ignore focus when the document is still hidden.
      window.addEventListener('focus', function () {
        if (visiblePage()) {
          config.lastUserInteraction = timestamp();
          wake('window-focus');
        }
      });
      ['scroll', 'pointerdown', 'keyup'].forEach(function (name) {
        document.addEventListener(name, onInteraction, { passive: true });
      });
      loadExclusions();
    };
  }
  function setSlotRefreshEnabled(id, enabled) {
    var state = getState(id);
    if (enabled === false) { disable(state, 'publisher config'); }
    else {
      state.refreshEnabled = true;
      state.completed = false;
      schedule(state);
    }
  }
  function setSlotMaxRefreshs(id, value) {
    var state = getState(id);
    state.maxRefreshs = value;
    evaluate(state, 'config-change');
  }
  function setSlotRefreshInterval(id, seconds) {
    var state = getState(id);
    state.refreshInterval = seconds;
    schedule(state);
  }
  function setPageRefreshInterval(seconds) {
    config.refreshInterval = seconds;
    slots.forEach(schedule);
  }
  function setPageMaxRefreshs(value) {
    config.maxRefreshs = value;
    slots.forEach(function (state) { evaluate(state, 'config-change'); });
  }
  function setTimeDiffLastUserInteraction(seconds) {
    config.timeDiffLastUserInteraction = seconds;
  }
  return {
    init: init,
    enableDebugMode: function () { config.debug = true; log('debug enabled'); },
    setSlotRefreshEnabled: setSlotRefreshEnabled,
    setSlotMaxRefreshs: setSlotMaxRefreshs,
    setSlotRefreshInterval: setSlotRefreshInterval,
    setPageRefreshInterval: setPageRefreshInterval,
    setPageMaxRefreshs: setPageMaxRefreshs,
    setTimeDiffLastUserInteraction: setTimeDiffLastUserInteraction
  };
})();
