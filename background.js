// background.js (FINAL with Popup Logic, Live Update, and Optimized Tab Reload)

const CURRENCY_API_URL = "https://front.superbuy.com/tool/js/get-currency-list";
const TARGET_CURRENCY_CODE = "USD";
const ALARM_NAME = 'six-hour-update';
const RECURRENCE_INTERVAL_MINUTES = 360; 

function checkAndSetDefaults() {
    browser.storage.local.get("includeSuperbuyFee")
        .then(result => {
            if (result.includeSuperbuyFee === undefined) {
                browser.storage.local.set({ includeSuperbuyFee: false });
                console.log("[BG] Default setting 'includeSuperbuyFee' set to false.");
            }
        });
}

/**
 * Fetches the exchange rate, saves it, and notifies (if requested).
 * @param {boolean} notify - Whether the user should be notified and the Goofish tabs reloaded (manual update).
 * @returns {Promise<object>} A promise containing success/failure and the rate.
 */
function updateExchangeRate(notify = false) {
  browser.browserAction.setTitle({ title: "Exchange rate updating..." });
  
  return fetch(CURRENCY_API_URL)
    .then(response => {
      if (!response.ok) {
        throw new Error(`[BG] HTTP Error: ${response.status}`);
      }
      return response.json(); 
    })
    .then(data => {
      let success = false;
      let message = "Exchange rate successfully updated.";
      let cnyPerUsd = 0;
      
      if (data.state !== 0 || !data.data || !Array.isArray(data.data)) {
        message = "Error: Invalid data structure from the API.";
      } else {
        const usdItem = data.data.find(item => item.code === TARGET_CURRENCY_CODE);
        
        if (!usdItem || !usdItem.rate) {
          message = `Error: Rate data for ${TARGET_CURRENCY_CODE} not found.`;
        } else {
          cnyPerUsd = parseFloat(usdItem.rate); 
          
          if (isNaN(cnyPerUsd) || cnyPerUsd <= 0) {
            message = "Error: The fetched exchange rate was invalid.";
          } else {
            browser.storage.local.set({ cnyPerUsd: cnyPerUsd });
            console.log(`[BG] Exchange rate saved: 1 USD = ${cnyPerUsd} CNY`);
            success = true;
          }
        }
      }
      
      if (notify) {
          // Notification only on manual trigger
          browser.notifications.create({
              "type": "basic",
              "title": "Goofish USD Converter",
              "message": message
          });
      }
      
      browser.browserAction.setTitle({ title: success ? `Rate Success: 1 USD ≈ ${cnyPerUsd.toFixed(4)} CNY` : "Rate Update Error" });
      
      // NEW: Only reload Goofish tabs on manual trigger (notify=true)
      if (success && notify) {
          browser.tabs.query({ url: "*://*.goofish.com/*" }).then(tabs => {
              tabs.forEach(tab => {
                  // Send message to content.js to reload the rate.
                  // We use sendMessage because the manual update command comes from the popup.
                  // In content.js, the reconversion is then triggered to apply the new rate.
                  browser.tabs.sendMessage(tab.id, { command: "reconvert_live_rate" })
                    .catch(e => {
                        console.warn("[BG] Could not send message to tab:", e); 
                    });
              });
          });
      }

      return { success: success, message: message, rate: cnyPerUsd };

    })
    .catch(error => {
        console.error("[BG] Error fetching exchange rate:", error);
        browser.browserAction.setTitle({ title: "Exchange Rate Error! See console." });
        if (notify) {
             browser.notifications.create({
                "type": "basic",
                "title": "Goofish USD Converter",
                "message": `Error fetching rate: ${error.message}.`
            });
        }
        return { success: false, message: `Error fetching: ${error.message}` };
    });
}


// --- Event Listeners ---

// 1. Set default values
checkAndSetDefaults();

// 2. Automatically update rate on extension start
updateExchangeRate(false); // No reload and no notification

// 3. Alarm for automatic update
browser.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, 
    periodInMinutes: RECURRENCE_INTERVAL_MINUTES 
});

browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) {
        console.log(`[BG] Alarm triggered: ${ALARM_NAME}. Starting rate update.`);
        updateExchangeRate(false); // No reload and no notification
    }
});

// Listener for manual rate update from the popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "update_rate_manual") {
        // Manual update: notify=true, which triggers sending a message to the tabs
        updateExchangeRate(true).then(sendResponse);
        return true; 
    }
});
