# QmaxRefresh v2 – opt-in A/B test

V1 stays unchanged. V2 is an additional file: `refresh/qm_refresh_v2.js`.

## Activation

In a controlled publisher test integration, **replace the script URL only**:

```js
refreshScript.src = 'https://cdn.jsdelivr.net/gh/QUARTER-MEDIA/live@main/refresh/qm_refresh_v2.js?v=2';
```

Use this URL **only after merging the v2 PR to main**. Alternatively, deploy v2 to the existing tags/CDN pipeline under a distinct path, then use the verified deployed URL. A file committed to GitHub is not automatically deployed at the legacy `tags.quartermedia-ad-service.net` URL.

Keep the existing `refreshScript.onload` configuration and `window.googletag.cmd.push(QmaxRefresh.init());` intact. Never load v1 and v2 together: both export the same global `QmaxRefresh` and register GPT listeners.

To roll back the test, restore the original v1 URL. There are no required changes to the separate `refreshBids()` integration.

## Functional behavior

- Default minimum interval: 30 seconds **after GPT slotRenderEnded**, per slot.
- Refresh eligibility: page visible, slot visibility >= 50%, user active within 30 seconds, slot enabled, no refresh in flight, below optional max count.
- Trigger evaluation on interval deadline, viewport reentry, activity resumption and tab/window return.
- New Prebid auction (1200ms timeout) before GPT refresh; no APS changes.
- In-flight lock and 8-second recovery watchdog.
- Same public config methods and GAM targeting keys as v1.
- Automatic exclusion list loading; existing IDs normalized to strings, including late arrival of the exclusion list.
- Debugging: `QmaxRefresh.enableDebugMode()`.

## Important distinctions / constraints

- This implementation counts refreshes when `googletag.pubads().refresh()` has been invoked. It does not count a Prebid request that is canceled before calling GPT.
- `slotRenderEnded` denotes GPT rendering, not verified creative paint or impression viewability. The initial empty response is treated as a render timestamp for minimum timing. The eligibility gate still requires at least 50% reported slot visibility.
- This version is intended to run as a **replacement** for the original refresh library, not alongside it in the same JavaScript context.
- No production integration is changed in this PR.

## A/B checklist

1. Validate v1/V2 mutually exclusive loading and GPT listener registration.
2. Confirm minimum >=30s between slotRenderEnded and next GPT refresh call.
3. Confirm visibility <50%, hidden page and user idle all block refresh.
4. Confirm viewport reentry, activity resume and tab return each wake eligible slots.
5. Confirm configured kicker exclusions (top desktop, maxiad desktop) never refresh.
6. Confirm refreshed Line Items from the JSON exclude list disable subsequent refreshes.
7. Confirm refresh count/targeting consistency and absence of simultaneous auctions per slot.
8. Confirm dynamic slot replacement/destroy scenarios and compatibility with external `refreshBids()` calls.
9. Compare revenue, refresh requests, render rate, active view and user experience by variant.

No live browser A/B validation was performed as part of this PR.
