// background.js (FINAL with Popup Logic, Live Update, and Optimized Tab Reload)

const CURRENCY_API_URL = "https://front.superbuy.com/tool/js/get-currency-list";
const REMITTANCE_API_URL = "https://front.superbuy.com/payment/remittance/transfer-list"; 
const TARGET_CURRENCY_CODE = "USD";
const ALARM_NAME = 'six-hour-update';
const RECURRENCE_INTERVAL_MINUTES = 360; 

function checkAndSetDefaults() {
    browser.storage.local.get(["includeSuperbuyFee", "selectedRateType"])
        .then(result => {
            if (result.includeSuperbuyFee === undefined) {
                browser.storage.local.set({ includeSuperbuyFee: false });
                console.log("[BG] Default setting 'includeSuperbuyFee' set to false.");
            }
            if (result.selectedRateType === undefined) {
                 browser.storage.local.set({ selectedRateType: 'standard' });
                console.log("[BG] Default setting 'selectedRateType' set to 'standard'.");
            }
        });
}

/**
 * Calculates the discounted remittance rate.
 * Formula: CalculatedRate = RealRate - (RealRate - BaseRate) * (DiscountPercentage / 100)
 */
function calculateRemittanceRate(realRate, baseRate, discountPercentage) {
    const realDifference = realRate - baseRate;
    const discountAmount = realDifference * (discountPercentage / 100);
    return realRate - discountAmount;
}

/**
 * Fetches the exchange rate, saves it, and notifies (if requested).
 */
function updateExchangeRate(notify = false) {
  browser.browserAction.setTitle({ title: "Exchange rate updating..." });
  
  // 1. Fetch Currency List (RealRate and BaseRate)
  const currencyPromise = fetch(CURRENCY_API_URL)
    .then(response => response.json());
    
  // 2. Fetch Remittance Discounts
  const remittancePromise = fetch(REMITTANCE_API_URL)
    .then(response => response.json());

  return Promise.all([currencyPromise, remittancePromise])
    .then(([currencyData, remittanceData]) => {
      let success = false;
      let message = "Exchange rate successfully updated.";
      let conversionRates = {};
      
      const usdItem = currencyData.data?.find(item => item.code === TARGET_CURRENCY_CODE);
      
      // ASSUMPTION: 'rate' is RealRate and 'marketRate' is BaseRate.
      const REAL_RATE = parseFloat(usdItem?.realRate);
      const BASE_RATE = parseFloat(usdItem?.rate); 

      // Attempt to get Discount Percentage (60 for USD)
      const wiseDiscountItem = remittanceData.data?.rateDiscount
        .find(item => item.paymentType === 'wise')?.discount
        .find(disc => disc.currencyCode === TARGET_CURRENCY_CODE);
        
      const transferDiscountItem = remittanceData.data?.rateDiscount
        .find(item => item.paymentType === 'transfer')?.discount
        .find(disc => disc.currencyCode === TARGET_CURRENCY_CODE);

      if (!usdItem || isNaN(REAL_RATE) || REAL_RATE <= 0 || isNaN(BASE_RATE) || BASE_RATE <= 0) {
        message = "Error: Invalid Real/Base rate data from the Currency API.";
      } else if (!wiseDiscountItem || !transferDiscountItem) {
          // This allows the standard rate to still be calculated even if remittance data is missing
          console.warn("[BG] Missing remittance discount data, only standard rate available.");
          conversionRates.standard = REAL_RATE;
          success = true;
          message = "Exchange rate updated (Remittance rates unavailable).";
      } else {
        const WISE_DISCOUNT = wiseDiscountItem.discount;
        const TRANSFER_DISCOUNT = transferDiscountItem.discount;

        conversionRates.standard = BASE_RATE;
        conversionRates.wise = calculateRemittanceRate(REAL_RATE, BASE_RATE, WISE_DISCOUNT);
        conversionRates.transfer = calculateRemittanceRate(REAL_RATE, BASE_RATE, TRANSFER_DISCOUNT);
        
        success = true;
      }
      
      if (success) {
        browser.storage.local.set({ conversionRates: conversionRates });
        console.log(`[BG] Exchange rates saved: Standard: ${conversionRates.standard?.toFixed(4)}`);
      }
      
      if (notify) {
          browser.notifications.create({
              "type": "basic",
              "title": "Goofish USD Converter",
              "message": success ? `Rates updated. Standard: 1 USD ≈ ¥${conversionRates.standard.toFixed(4)}` : message
          });
      }
      
      browser.browserAction.setTitle({ title: success ? `Rate Success: 1 USD ≈ ${conversionRates.standard.toFixed(4)} CNY (S)` : "Rate Update Error" });
      
      if (success && notify) {
          browser.tabs.query({ url: "*://*.goofish.com/*" }).then(tabs => {
              tabs.forEach(tab => {
                  browser.tabs.sendMessage(tab.id, { command: "reconvert_live_rate" })
                    .catch(e => {
                        console.warn("[BG] Could not send message to tab:", e); 
                    });
              });
          });
      }

      return { success: success, message: message, rates: conversionRates, rate: conversionRates.standard }; 

    })
    .catch(error => {
        console.error("[BG] Error fetching exchange rate:", error);
        browser.browserAction.setTitle({ title: "Exchange Rate Error! See console." });
        if (notify) {
             browser.notifications.create({
                "type": "basic",
                "title": "Goofish USD Converter",
                "message": `Error fetching rates: ${error.message}.`
            });
        }
        return { success: false, message: `Error fetching: ${error.message}` };
    });
}


// --- Event Listeners ---

// 1. Set default values
checkAndSetDefaults();

// 2. Automatically update rate on extension start
updateExchangeRate(false);

// 3. Alarm for automatic update
browser.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, 
    periodInMinutes: RECURRENCE_INTERVAL_MINUTES 
});

browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) {
        console.log(`[BG] Alarm triggered: ${ALARM_NAME}. Starting rate update.`);
        updateExchangeRate(false);
    }
});

// Listener for manual rate update from the popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "update_rate_manual") {
        updateExchangeRate(true).then(sendResponse);
        return true; 
    }
});
