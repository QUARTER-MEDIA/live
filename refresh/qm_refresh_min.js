var QmaxRefresh=function(){"use strict";var e={debug:!1,refreshInterval:30,maxRefreshs:null,timeDiffLastUserInteraction:30,isPageVisible:!0,lastUserInteraction:f(),slotsToRefresh:[],blurTimestamp:null,slotsConfig:[],refreshExcludedList:[]},t=new Event("qm_last_interaction_event");function n(e){"undefined"!=typeof console&&a("debug")&&console.log("QMAX-Refresh: "+e)}function s(t){var n=a("slotsConfig").find(e=>e.id===t);return void 0===n&&(n={id:t,refreshEnabled:void 0,refreshInterval:void 0,maxRefreshs:void 0,refreshCount:0,timer:null,visibility:0,lastRefreshTimestamp:null},e.slotsConfig.push(n)),n}function i(t){void 0===a("slotsToRefresh").find(e=>e.divId===t.getSlotElementId())&&e.slotsToRefresh.push({divId:t.getSlotElementId(),slot:t})}function r(t){var n,s="slotsToRefresh";n=a("slotsToRefresh").filter(function(e){return e.divId!==t}),e[s]=n}function o(e,t,n){s(e)[t]=n}function l(e,t){o(e,"refreshEnabled",t)}function a(t){return void 0!==e[t]?e[t]:null}function d(t,n){e[t]=n}function f(){return Math.floor(Date.now()/1e3)}function u(e,t){window.pbjs.que.push(function(){window.pbjs.requestBids({timeout:1200,adUnitCodes:[e],bidsBackHandler:function(){t.setTargeting("qm_is_refresh","true"),t.setTargeting("qm_refresh_count",s(e).refreshCount),window.pbjs.setTargetingForGPTAsync([e]),window.googletag.pubads().refresh([t])}})}),n(e+": Refresh Requested! Refresh count: "+s(e).refreshCount)}function h(e){void 0!==s(e)&&o(e,"refreshCount",s(e).refreshCount+1)}function c(e){var t=a("refreshInterval"),n=s(e);return n&&n.refreshInterval&&(t=n.refreshInterval),t}function v(e,t){if(null===s(e).timer){var n=setInterval(function(){b(e)&&(h(e),u(e,t),o(e,"lastRefreshTimestamp",f()))},1e3*c(e));o(e,"timer",n),o(e,"lastRefreshTimestamp",f())}}function m(e){var t=a("maxRefreshs"),n=s(e);return n&&n.maxRefreshs&&(t=n.maxRefreshs),t}function b(e,t=!1){if(!1===(l=!0,(d=s(i=e))&&d.hasOwnProperty("refreshEnabled")&&void 0!==d.refreshEnabled&&(l=d.refreshEnabled),l))return n(e+": Refresh not allowed because refresh for ad unit is disabled!"),!1;if(!1===a("isPageVisible"))return n(e+": Refresh not allowed because page is not visible!"),!1;if(m(e)&&s(e).refreshCount>=m(e))return n(e+": Refresh not allowed because max refresh count for ad unit has been reached!"),clearInterval(s(e).timer),o(e,"timer",null),r(e),!1;var i,l,d,u=a("timeDiffLastUserInteraction");return a("lastUserInteraction")<f()-u?(n(e+": Refresh not allowed because last user interaction was too long ago!"),!1):s(e)&&s(e).visibility<50?(n(e+": Refresh not allowed because visibility of ad unit is below 50%!"),!1):t?a("blurTimestamp")-s(e).lastRefreshTimestamp>c(e)?(n(e+"REFRESH FROM FOCUS"),n(e+": Should refresh is true."),!0):(n(e+": From window focus - Refresh not allowed because blur time was less than refresh interval for slot."),!1):(n(e+": Should refresh is true."),!0)}return window.onblur=t=>{var n,s,i="blurTimestamp",r="isPageVisible";n=f(),e[i]=n,s=!1,e[r]=s},window.onfocus=n=>{var i,r="isPageVisible",l="blurTimestamp",d=null;document.dispatchEvent(t),i=!0,e[r]=i,a("slotsToRefresh").map(function(e){b(e.divId,!0)&&(h(e.divId),u(e.divId,e.slot),clearInterval(s(e.divId).timer),o(e.divId,"timer",null),v(e.divId,e.slot))}),e[l]=d},!function(){var t="hidden"in document?"hidden":"webkitHidden"in document?"webkitHidden":"mozHidden"in document?"mozHidden":null;if(null!==t&&null!==("visibilityState"in document?"visibilityState":"webkitVisibilityState"in document?"webkitVisibilityState":"mozVisibilityState"in document?"mozVisibilityState":null)){var n=t.replace(/hidden/i,"visibilitychange");function s(){var n;n=!document[t],e.isPageVisible=n}document.addEventListener(n,s),s()}}(),!function(){var t=null;function n(){null===t&&(t=setTimeout(function(){var n;n=f(),e.lastUserInteraction=n,clearTimeout(t),t=null},1e3))}document.addEventListener("scroll",n),document.addEventListener("pointerdown",n),document.addEventListener("keyup",n),document.addEventListener("qm_last_interaction_event",n)}(),{init:function t(){return function(){googletag.pubads().addEventListener("slotVisibilityChanged",function(e){n("slotVisibilityChanged ("+e.slot.getSlotElementId()+"): "+e.inViewPercentage+"%"),o(e.slot.getSlotElementId(),"visibility",e.inViewPercentage),i(e.slot)}),googletag.pubads().addEventListener("slotRequested",function(e){n("slotRequested: "+e.slot.getSlotElementId()),i(e.slot)}),googletag.pubads().addEventListener("slotResponseReceived",function(e){n("slotResponseReceived: "+e.slot.getSlotElementId());var t=e.slot;v(t.getSlotElementId(),t)}),googletag.pubads().addEventListener("slotRenderEnded",function(e){if(n("slotRenderEnded: "+e.slot.getSlotElementId()),a("refreshExcludedList").includes(e.lineItemId)){var t,i=e.slot.getSlotElementId();l(t=e.slot.getSlotElementId(),!1),clearInterval(s(t).timer),r(t),n("Found LineItem "+e.lineItemId+" in refresh exclude list. Disable refresh for slot "+i+"!")}});var t=Date.now(),d=new Date(t),f=[d.getFullYear(),(d.getMonth()+1).toString().padStart(2,"0"),d.getDate().toString().padStart(2,"0"),d.getHours().toString().padStart(2,"0")].join(""),u=new XMLHttpRequest;u.addEventListener("load",function(t){var n,s="refreshExcludedList";200===t.target.status&&(n=t.target.response,e[s]=n)}),u.open("GET","https://storage.googleapis.com/qm-refresh/refresh-exclude-list.json?"+f),u.send()}},enableDebugMode:function t(){var s;s=!0,e.debug=s,n("Debug Mode enabled")},setSlotRefreshEnabled:l,setSlotMaxRefreshs:function e(t,n){o(t,"maxRefreshs",n)},setSlotRefreshInterval:function e(t,n){o(t,"refreshInterval",n)},setPageRefreshInterval:function t(n){var s;s=n,e.refreshInterval=s},setPageMaxRefreshs:function t(n){var s;s=n,e.maxRefreshs=s},setTimeDiffLastUserInteraction:function t(n){var s;s=n,e.timeDiffLastUserInteraction=s}}}();
