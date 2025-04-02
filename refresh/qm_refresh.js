var QmaxRefresh = (function () {
    'use strict';

    /**
     * Default Refresh Config
     *
     * @type {{blurTimestamp: null, debug: boolean, refreshExcludedList: *[], slotsToRefresh: *[], refreshInterval: number, isPageVisible: boolean, slotsConfig: *[], lastUserInteraction: number, maxRefreshs: number, timeDiffLastUserInteraction: number}}
     */
    var config = {
        debug: false,
        refreshInterval: 30,
        maxRefreshs: null,
        timeDiffLastUserInteraction: 30,
        isPageVisible: true,
        lastUserInteraction: getCurrentTimestamp(),
        slotsToRefresh: [],
        blurTimestamp: null,
        slotsConfig: [],
        refreshExcludedList: [],
    }

    var lastInteractionEvent = new Event('qm_last_interaction_event');

    /**
     * Event Browserfenster ist nicht mehr aktiv
     *
     * @param event
     */
    window.onblur = (event) => {
        setConfig('blurTimestamp', getCurrentTimestamp());
        setConfig('isPageVisible', false);
    };

    /**
     * Event Browserfenster ist wieder aktiv
     *
     * @param event
     */
    window.onfocus = (event) => {

        document.dispatchEvent(lastInteractionEvent);

        setConfig('isPageVisible', true);
        getConfig('slotsToRefresh').map(function (data) {
            if (validateRefresh(data.divId, true)) {
                updateRefreshCounter(data.divId);
                refreshAdUnit(data.divId, data.slot);

                clearInterval(getSlotConfig(data.divId).timer);
                setSlotConfig(data.divId, 'timer', null);

                startSlotTimer(data.divId, data.slot);
            }
        });

        setConfig('blurTimestamp', null);
    };

    /**
     * Funktion zum Loggen. Berücksichtigt Einstellung aus der Config
     * @param message
     */
    function log(message) {
        if (typeof console !== "undefined" && getConfig('debug')) {
            console.log('QMAX-Refresh: ' + message);
        }
    }

    /**
     * Gibt die Config eines AdSlots anhand der divId zurück
     *
     * @param divId
     * @returns {*}
     */
    function getSlotConfig(divId) {
        var slotConfig = getConfig('slotsConfig').find(data => data.id === divId);

        if (slotConfig === undefined) {

            slotConfig = {
                id: divId,
                refreshEnabled: undefined,
                refreshInterval: undefined,
                maxRefreshs: undefined,
                refreshCount: 0,
                timer: null,
                visibility: 0,
                lastRefreshTimestamp: null,
            };

            config.slotsConfig.push(slotConfig);
        }

        return slotConfig;
    }

    /**
     * Fügt den übergebenen Slot zum Refresh hinzu
     * @param slot
     */
    function addSlotToRefresh(slot) {
        var slotsToRefresh = getConfig('slotsToRefresh');
        if (undefined === slotsToRefresh.find(data => data.divId === slot.getSlotElementId())) {
            config.slotsToRefresh.push({divId: slot.getSlotElementId(), slot: slot});
        }
    }

    /**
     * Entfernt einen Slot aus dem Refresh (Wird ab dann nicht mehr refreshed)
     * @param divId
     */
    function removeSlotFromRefresh(divId) {
        setSlotRefreshEnabled(divId, false);
        clearInterval(getSlotConfig(divId).timer);
        removeSlotToRefresh(divId);
    }

    /**
     * Entfernt den Slot mit der übergebenen DivId aus dem Refresh
     * @param divId
     */
    function removeSlotToRefresh(divId) {
        var slotsToRefresh = getConfig('slotsToRefresh').filter(function (item) {
            return item.divId !== divId
        });

        setConfig('slotsToRefresh', slotsToRefresh);
    }

    /**
     * Schreibt einen Value anhand divId und Config-Key in die Slot-Config
     *
     * @param divId
     * @param key
     * @param value
     */
    function setSlotConfig(divId, key, value) {
        getSlotConfig(divId)[key] = value;
    }

    /**
     * Aktiviert oder deaktiviert die Refresh-Funktion für den Slot mit der übergebenen divId
     * @param divId
     * @param enabled
     */
    function setSlotRefreshEnabled(divId, enabled) {
        setSlotConfig(divId, 'refreshEnabled', enabled);
    }

    /**
     * Initialisiert den Refresh
     *
     * @returns {(function(): void)|*}
     */
    function init() {

        return function () {

            /**
             * Event Listener für Ermittlung der Sichtbarkeit einer AdUnit
             */
            googletag.pubads().addEventListener('slotVisibilityChanged',
                function (event) {
                    log('slotVisibilityChanged (' + event.slot.getSlotElementId() + '): ' + event.inViewPercentage + '%');
                    setSlotConfig(event.slot.getSlotElementId(), 'visibility', event.inViewPercentage);
                    addSlotToRefresh(event.slot);
                }
            );

            /**
             * Event Listener, der den Slot zum Refresh hinzufügt
             */
            googletag.pubads().addEventListener('slotRequested',
                function (event) {
                    log('slotRequested: ' + event.slot.getSlotElementId());
                    addSlotToRefresh(event.slot);
                }
            );


            /**
             * Event Listener, der den Refresh-Timer für den Slot aktiviert
             */
            googletag.pubads().addEventListener('slotResponseReceived',
                function (event) {
                    log('slotResponseReceived: ' + event.slot.getSlotElementId());
                    var slot = event.slot;
                    startSlotTimer(slot.getSlotElementId(), slot);
                }
            );

            /**
             * Event Listener, der ermittelt, ob die gerenderte Order einen Refresh-Exclude auslöst
             */
            googletag.pubads().addEventListener('slotRenderEnded',
                function (event) {
                    log('slotRenderEnded: ' + event.slot.getSlotElementId());
                    if (getConfig('refreshExcludedList').includes(event.lineItemId)) {
                        var divId = event.slot.getSlotElementId();
                        removeSlotFromRefresh(event.slot.getSlotElementId());
                        log('Found LineItem ' + event.lineItemId + ' in refresh exclude list. Disable refresh for slot ' + divId + '!');
                    }
                }
            );

            var now = Date.now();
            var dateObj = new Date(now);
            var hash = [
                dateObj.getFullYear(),
                (dateObj.getMonth() + 1).toString().padStart(2, '0'),
                dateObj.getDate().toString().padStart(2, '0'),
                dateObj.getHours().toString().padStart(2, '0')
            ].join('');

            var req = new XMLHttpRequest();
            req.addEventListener('load', function (data) {
                if (data.target.status === 200) {
                    setConfig('refreshExcludedList', data.target.response);
                }
            });
            req.open('GET', 'https://storage.googleapis.com/qm-refresh/refresh-exclude-list.json?' + hash);
            req.send();
        }
    }

    /**
     * Gibt ein Config-Element anhand des Keys zurück
     *
     * @param configKey
     * @returns {*|null}
     */
    function getConfig(configKey) {
        return config[configKey] !== undefined ? config[configKey] : null;
    }

    /**
     * Schreibt einen Value anhand des Config-Keys in die Config
     *
     * @param configKey
     * @param value
     */
    function setConfig(configKey, value) {
        config[configKey] = value;
    }

    /**
     * Aktiviert Debug-Ausgaben in der Browser-Konsole
     */
    function enableDebugMode() {
        setConfig('debug', true);
        log('Debug Mode enabled');
    }

    /**
     * Gibt den aktuellen Timestamp zurück
     * @returns {number}
     */
    function getCurrentTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * Refresh einer AdUnit
     *
     * @param divId
     * @param adSlot
     */
    function refreshAdUnit(divId, adSlot) {
        window.pbjs.que.push(function () {
            window.pbjs.requestBids({
                timeout: 1200,
                adUnitCodes: [divId],
                bidsBackHandler: function () {
                    adSlot.setTargeting('qm_is_refresh', 'true');
                    adSlot.setTargeting('qm_refresh_count', getSlotConfig(divId).refreshCount);
                    window.pbjs.setTargetingForGPTAsync([divId]);
                    window.googletag.pubads().refresh([adSlot]);
                }
            })
        });

        log(divId + ': Refresh Requested! Refresh count: ' + getSlotConfig(divId).refreshCount);
    }

    /**
     * Zählt den Refresh-Count für den Slot mit der übergebenen DivId um 1 hoch
     * @param divId
     */
    function updateRefreshCounter(divId) {
        if (getSlotConfig(divId) !== undefined) {
            setSlotConfig(divId, 'refreshCount', getSlotConfig(divId).refreshCount + 1);
        }
    }


    /**
     * Holt das Refresh-Interval aus der Config
     * Wurde das Interval auf Slot-Ebene definiert wird dieses verwendet, ansonsten das global definierte Interval
     * @param divId
     * @returns {null|*}
     */
    function getSlotRefreshInterval(divId) {
        var interval = getConfig('refreshInterval');
        var slotConfig = getSlotConfig(divId);

        if (slotConfig && slotConfig.refreshInterval) {
            interval = slotConfig.refreshInterval;
        }

        return interval;
    }


    /**
     * Startet Refresh-Timer für den übergebenen Slot
     * @param divId
     * @param slot
     */
    function startSlotTimer(divId, slot) {

        if (getSlotConfig(divId).timer !== null) {
            return;
        }

        var timer = setInterval(function () {
            if (validateRefresh(divId)) {
                updateRefreshCounter(divId);
                refreshAdUnit(divId, slot);
                setSlotConfig(divId, 'lastRefreshTimestamp', getCurrentTimestamp());
            }
        }, getSlotRefreshInterval(divId) * 1000);

        setSlotConfig(divId, 'timer', timer);
        setSlotConfig(divId, 'lastRefreshTimestamp', getCurrentTimestamp());
    }


    /**
     * Gibt zurück, ob der Refresh für den Slot mit der übergebenen DivId aktiviert ist
     * @param divId
     * @returns {boolean}
     */
    function getRefreshEnabled(divId) {

        var refreshEnabled = true;
        var slotConfig = getSlotConfig(divId);

        if (slotConfig && slotConfig.hasOwnProperty('refreshEnabled') && slotConfig.refreshEnabled !== undefined) {
            refreshEnabled = slotConfig.refreshEnabled;
        }

        return refreshEnabled;
    }


    /**
     * Gibt die maximal erlaubte Anzahl an Refreshs für den Slot mit der übergebenen DivId zurück
     * @param divId
     * @returns {*|null}
     */
    function getMaxRefreshs(divId) {

        var maxRefreshs = getConfig('maxRefreshs');
        var slotConfig = getSlotConfig(divId);

        if (slotConfig && slotConfig.maxRefreshs) {
            maxRefreshs = slotConfig.maxRefreshs;
        }

        return maxRefreshs;
    }


    /**
     * Validiert, ob ein Refresh für einen Slot mit der übergebenen DivId stattfinden darf
     *
     * @param divId
     * @param fromWindowFocus
     * @returns {boolean}
     */
    function validateRefresh(divId, fromWindowFocus = false) {

        if (false === getRefreshEnabled(divId)) {
            log(divId + ': Refresh not allowed because refresh for ad unit is disabled!');
            return false;
        }

        if (false === getConfig('isPageVisible')) {
            log(divId + ': Refresh not allowed because page is not visible!');
            return false;
        }


        if (getMaxRefreshs(divId) && (getSlotConfig(divId).refreshCount >= getMaxRefreshs(divId))) {
            log(divId + ': Refresh not allowed because max refresh count for ad unit has been reached!');
            clearInterval(getSlotConfig(divId).timer);
            setSlotConfig(divId, 'timer', null);
            removeSlotToRefresh(divId);
            return false;
        }

        var timeDiffLastUserInteraction = getConfig('timeDiffLastUserInteraction');
        var lastUserInteraction = getConfig('lastUserInteraction');

        if (lastUserInteraction < getCurrentTimestamp() - timeDiffLastUserInteraction) {
            log(divId + ': Refresh not allowed because last user interaction was too long ago!');
            return false;
        }

        if (getSlotConfig(divId) && getSlotConfig(divId).visibility < 50) {
            log(divId + ': Refresh not allowed because visibility of ad unit is below 50%!');
            return false;
        }

        if (fromWindowFocus) {
            if (getConfig('blurTimestamp') - getSlotConfig(divId).lastRefreshTimestamp > getSlotRefreshInterval(divId)) {
                log(divId + 'REFRESH FROM FOCUS');
                log(divId + ': Should refresh is true.');
                return true;
            } else {
                log(divId + ': From window focus - Refresh not allowed because blur time was less than refresh interval for slot.');
                return false;
            }
        }

        log(divId + ': Should refresh is true.');

        return true;
    }

    /**
     * Konfiguriert die maximale Anzahl der Refreshs für den Slot mit der übergebenen divId
     * @param divId
     * @param maxRefreshs
     */
    function setSlotMaxRefreshs(divId, maxRefreshs) {
        setSlotConfig(divId, 'maxRefreshs', maxRefreshs);
    }


    /**
     * Aktiviert oder deaktiviert die Refresh-Funktion für den Slot mit der übergebenen divId
     * @param divId
     * @param intervalInSeconds
     */
    function setSlotRefreshInterval(divId, intervalInSeconds) {
        setSlotConfig(divId, 'refreshInterval', intervalInSeconds);
    }

    /**
     * Setzt Refresh-Interval auf Seitenebene
     * @param refreshIntervalInSeconds
     */
    function setPageRefreshInterval(refreshIntervalInSeconds) {
        setConfig('refreshInterval', refreshIntervalInSeconds);
    }

    /**
     * Setzt die maximale Anzahl an Refreshs pro Slot auf Seitenebene
     * @param maxRefreshs
     */
    function setPageMaxRefreshs(maxRefreshs) {
        setConfig('maxRefreshs', maxRefreshs);
    }

    /**
     * Setzt die maximale Anzahl von Sekunden, die seit der letzten Interaktion des Seitenbesuchers vergehen dürfen,
     * bevor ein Refresh stattfindet
     * @param timeDiffLastUserInteractionInSeconds
     */
    function setTimeDiffLastUserInteraction(timeDiffLastUserInteractionInSeconds) {
        setConfig('timeDiffLastUserInteraction', timeDiffLastUserInteractionInSeconds);
    }

    // Event listener für "Fenster aktiv"
    (function () {
        var hiddenProperty = 'hidden' in document ? 'hidden' :
            'webkitHidden' in document ? 'webkitHidden' :
                'mozHidden' in document ? 'mozHidden' :
                    null;

        var visibilityStateProperty = 'visibilityState' in document ? 'visibilityState' :
            'webkitVisibilityState' in document ? 'webkitVisibilityState' :
                'mozVisibilityState' in document ? 'mozVisibilityState' :
                    null;

        if (hiddenProperty !== null && visibilityStateProperty !== null) {
            var visibilityChangeEvent = hiddenProperty.replace(/hidden/i, 'visibilitychange');

            function onVisibilityChange() {
                setConfig('isPageVisible', !document[hiddenProperty]);
            }

            document.addEventListener(visibilityChangeEvent, onVisibilityChange);

            onVisibilityChange();
        }

    })();


    // Event listener für "User Interaktion"
    (function () {
        var qm_user_interaction_timeout = null;

        function handleTimeout() {
            if (qm_user_interaction_timeout !== null) {
                return;
            }

            qm_user_interaction_timeout = setTimeout(function () {
                setConfig('lastUserInteraction', getCurrentTimestamp());
                clearTimeout(qm_user_interaction_timeout);
                qm_user_interaction_timeout = null;
            }, 1000);
        }

        // Scroll
        document.addEventListener('scroll', handleTimeout);

        // Click / Touch
        document.addEventListener('pointerdown', handleTimeout);

        // Keyup
        document.addEventListener('keyup', handleTimeout);

        // Last Interaction Event
        document.addEventListener('qm_last_interaction_event', handleTimeout);
    })();

    // Öffentlich verfügbare Funktionen
    return {
        init: init,
        enableDebugMode: enableDebugMode, // Check
        setSlotRefreshEnabled: setSlotRefreshEnabled,
        setSlotMaxRefreshs: setSlotMaxRefreshs,
        setSlotRefreshInterval: setSlotRefreshInterval,
        setPageRefreshInterval: setPageRefreshInterval,
        setPageMaxRefreshs: setPageMaxRefreshs,
        setTimeDiffLastUserInteraction: setTimeDiffLastUserInteraction,
    };
})();
