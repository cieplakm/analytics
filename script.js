(() => {
    const CONFIG = {
        location: window.location,
        document: window.document,
        script: window.document.currentScript,
        get apiEndpoint() {
            return this.script.getAttribute("data-api")
        },
        domain: window.document.currentScript.getAttribute("data-domain")
    };

    const isLocalHost = (hostname) => {
        const localhostRegex = /^localhost$|^127(\.[0-9]+){0,2}\.[0-9]+$|^\[::1?\]$/;
        return localhostRegex.test(hostname);
    };

    const isTestEnvironment = () => {
        return (window._phantom ||
            window.__nightmare ||
            window.navigator.webdriver ||
            window.Cypress) &&
            !window.__datatrust;
    };

    const shouldIgnoreAnalytics = () => {
        if (isLocalHost(CONFIG.location.hostname) || CONFIG.location.protocol === "file:") {
            return "localhost";
        }
        if (isTestEnvironment()) {
            return "test environment";
        }
        try {
            if (window.localStorage.datatrust_ignore === "true") {
                return "localStorage flag";
            }
        } catch (error) {
            // Ignore localStorage errors
        }
        return false;
    };

    const handleCallback = (options, response = null) => {
        if (options?.callback) {
            options.callback(response ? { status: response.status } : undefined);
        }
    };

    const sendEvent = async (eventName, payload, options) => {
        try {
            const response = await fetch(eventName, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify(payload)
            });
            handleCallback(options, response);
        } catch (error) {
            console.error("Failed to send event:", error);
        }
    };

    const trackEvent = (eventName, options) => {
        const ignoreReason = shouldIgnoreAnalytics();
        if (ignoreReason) {
            console.warn("Ignoring Event:", ignoreReason);
            handleCallback(options);
            return;
        }

        const payload = {
            name: eventName,
            url: CONFIG.location.href,
            domain: CONFIG.domain,
            referrer: CONFIG.document.referrer || null,
            ...(options?.meta && { meta: JSON.stringify(options.meta) }),
            ...(options?.props && { props: options.props })
        };

        sendEvent(CONFIG.apiEndpoint, payload, options);
    };

    let currentPath = null;

    const trackPageView = (isNavigationEvent = false) => {
        if (!isNavigationEvent && currentPath === CONFIG.location.pathname) return;
        currentPath = CONFIG.location.pathname;
        trackEvent("pageview");
    };

    const setupHistoryTracking = () => {
        const history = window.history;
        if (!history.pushState) return;

        const originalPushState = history.pushState;
        history.pushState = function () {
            originalPushState.apply(this, arguments);
            trackPageView(true);
        };

        window.addEventListener("popstate", () => trackPageView(true));
    };

    const initializeAnalytics = () => {
        const queuedEvents = window.datatrust?.q || [];
        window.datatrust = trackEvent;
        queuedEvents.forEach(args => trackEvent.apply(null, args));

        if (CONFIG.document.visibilityState === "prerender") {
            CONFIG.document.addEventListener("visibilitychange", () => {
                if (!currentPath && CONFIG.document.visibilityState === "visible") {
                    trackPageView();
                }
            });
        } else {
            trackPageView();
        }

        setupHistoryTracking();
    };

    initializeAnalytics();
})(); 