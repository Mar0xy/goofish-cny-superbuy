// background.js (FINAL Fixed: Maximum Stability and Error Isolation)

const CURRENCY_API_URL = "https://front.superbuy.com/tool/js/get-currency-list";
const REMITTANCE_API_URL = "https://front.superbuy.com/payment/remittance/transfer-list"; 
const ALARM_NAME = 'six-hour-update';
const RECURRENCE_INTERVAL_MINUTES = 360; 

function checkAndSetDefaults() {
    return browser.storage.local.get(["includeSuperbuyFee", "selectedRateType", "targetCurrencyCode"])
        .then(result => {
            if (result.includeSuperbuyFee === undefined) {
                browser.storage.local.set({ includeSuperbuyFee: false });
                console.log("[BG] Default setting 'includeSuperbuyFee' set to false.");
            }
            if (result.selectedRateType === undefined) {
                 browser.storage.local.set({ selectedRateType: 'standard' });
                console.log("[BG] Default setting 'selectedRateType' set to 'standard'.");
            }
            if (result.targetCurrencyCode === undefined) {
                 browser.storage.local.set({ targetCurrencyCode: 'USD' });
                console.log("[BG] Default setting 'targetCurrencyCode' set to 'USD'.");
            }
            // Return result to allow chaining
            return result; 
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
 * Fetches the exchange rate, saves it, and notifies content scripts.
 * @param {boolean} notify - Whether to display a notification on success/failure.
 * @param {string} [targetCurrencyCode='USD'] - The currency to fetch rates for.
 * @returns {Promise<Object>} A promise resolving to the status of the update.
 */
async function updateExchangeRate(notify, targetCurrencyCode = 'USD') {

    // Skip API fetch if target is CNY 
    if (targetCurrencyCode === 'CNY') {
         browser.browserAction.setTitle({ title: `CNY (¥) - Standard 1:1` });
         await browser.storage.local.set({ 
             conversionRates: {}, 
             displayCode: 'CNY', 
             displaySymbol: '¥', 
             targetCurrencyCode: 'CNY',
             targetCurrencySymbol: '¥'
         });
         return { success: true, message: "CNY selected. No external rate fetch required.", rates: {}, code: 'CNY' };
    }

    let conversionRates = {};
    let message = 'Rates updated successfully.';
    let success = true;
    let symbol = '$'; 
    
    try {
        // --- 1. Fetch Currency List (Base Data) ---
        const currencyResponse = await fetch(CURRENCY_API_URL);
        if (!currencyResponse.ok) throw new Error(`Currency API failed: ${currencyResponse.statusText}`);
        const currencyData = await currencyResponse.json();

        // Check Status Code/Message
        if (currencyData.code !== '1' && currencyData.msg !== 'Success') {
            throw new Error(`Currency API error: ${currencyData.msg}`);
        }
        
        // Check Data Structure 
        if (!currencyData.data || !Array.isArray(currencyData.data)) {
             throw new Error(`Currency API error: Missing expected currency list data structure.`);
        }
        
        const currencyList = currencyData.data; 
        
        // --- 2. Extract Base Rates ---
        const targetCurrencyData = currencyList.find(c => c.code === targetCurrencyCode);

        if (!targetCurrencyData) throw new Error(`Target currency ${targetCurrencyCode} not found in Superbuy list.`);

        const standardRate = parseFloat(targetCurrencyData.rate);
        const realRate = parseFloat(targetCurrencyData.realRate); // Market Rate
        symbol = targetCurrencyData.symbol || '$';

        conversionRates.standard = standardRate;

        // --- 3. Fetch Remittance List (Get Discount Percentage) ---
        const remittanceResponse = await fetch(REMITTANCE_API_URL);
        if (!remittanceResponse.ok) throw new Error(`Remittance API failed: ${remittanceResponse.statusText}`);
        const remittanceData = await remittanceResponse.json();

        // Check Status Code/Message
        if (remittanceData.code !== '1' && remittanceData.msg !== 'Success') {
            throw new Error(`Remittance API error: ${remittanceData.msg}`);
        }

        // --- 4. Parse Discounts and Calculate Rates (ROBUSTNESS) ---
        
        // Check for 'rateDiscount' array safely
        if (!remittanceData.data?.rateDiscount || !Array.isArray(remittanceData.data.rateDiscount)) {
             console.warn("[BG] Remittance API 'rateDiscount' missing or invalid. Falling back to standard rate for Wise/Transfer.");
             conversionRates.wise = standardRate;
             conversionRates.transfer = standardRate;
        } else {
             const rateDiscountList = remittanceData.data.rateDiscount;

             // Use optional chaining (?.) for safe access to nested properties
             const wiseDiscount = rateDiscountList.find(item => item.paymentType === 'wise')
                                     ?.discount.find(d => d.currencyCode === targetCurrencyCode)
                                     ?.discount;

             const transferDiscount = rateDiscountList.find(item => item.paymentType === 'transfer')
                                     ?.discount.find(d => d.currencyCode === targetCurrencyCode)
                                     ?.discount;
             
             const parsedWiseDiscount = wiseDiscount ? parseFloat(wiseDiscount) : 0;
             const parsedTransferDiscount = transferDiscount ? parseFloat(transferDiscount) : 0;

             // Calculate Wise Rate
             if (parsedWiseDiscount > 0 && !isNaN(realRate) && realRate > 0) {
                 conversionRates.wise = calculateRemittanceRate(realRate, standardRate, parsedWiseDiscount);
             } else {
                 conversionRates.wise = standardRate;
             }

             // Calculate Transfer Rate
             if (parsedTransferDiscount > 0 && !isNaN(realRate) && realRate > 0) {
                 conversionRates.transfer = calculateRemittanceRate(realRate, standardRate, parsedTransferDiscount);
             } else {
                 conversionRates.transfer = standardRate;
             }
        }


        // --- 5. Save Data and Notify ---
        await browser.storage.local.set({ 
             conversionRates: conversionRates, 
             displayCode: targetCurrencyCode, 
             displaySymbol: symbol,
             targetCurrencyCode: targetCurrencyCode,
             targetCurrencySymbol: symbol
        });
        
        browser.browserAction.setTitle({ title: `${targetCurrencyCode} - 1 ${targetCurrencyCode} ≈ ¥${conversionRates.standard.toFixed(4)}` });
        
        const supportedCurrencies = currencyList.map(c => ({ 
            code: c.code, 
            symbol: c.symbol, 
            rate: parseFloat(c.rate) 
        }));
        await browser.storage.local.set({ supportedCurrencies: supportedCurrencies });

        // Notify content scripts to reconvert with new rates
        browser.tabs.query({ url: "*://*.goofish.com/*" })
            .then(tabs => {
                tabs.forEach(tab => {
                    browser.tabs.sendMessage(tab.id, { 
                        command: "reconvert_live_rate" 
                    })
                    .catch(e => console.warn("[BG] Could not send message to tab:", e)); 
                });
          });


      if (notify) {
           browser.notifications.create({
              "type": "basic",
              "title": "Goofish Converter",
              "message": `Rates updated! 1 ${targetCurrencyCode} ≈ ¥${conversionRates.standard.toFixed(4)}`
          });
      }

      return { success: success, message: message, rates: conversionRates, rate: conversionRates.standard, code: targetCurrencyCode, supportedCurrencies: supportedCurrencies }; 

    }
    catch(error) {
        // CATCH ALL: This ensures that even API errors are caught and processed without crashing the script.
        console.error("[BG] Error fetching exchange rate:", error);
        browser.browserAction.setTitle({ title: "Exchange Rate Error! See console." });
        if (notify) {
             browser.notifications.create({
                "type": "basic",
                "title": "Goofish Price Converter",
                "message": `Error fetching rates: ${error.message}.`
            });
        }
        return { success: false, message: `Error fetching: ${error.message}`, code: targetCurrencyCode };
    }
}


// --- Event Listeners and Initialisation ---

// 1. Set default values AND THEN start the first rate update
checkAndSetDefaults()
    .then(result => {
        // Use initial value from storage, defaulting to 'USD'
        return updateExchangeRate(false, result.targetCurrencyCode || 'USD');
    })
    .catch(error => {
        // CRITICAL CATCH: This catches any error during the very first API fetch or setup, 
        // ensuring the background script doesn't die immediately.
        console.error("[BG] FATAL INITIALIZATION ERROR:", error);
        browser.browserAction.setTitle({ title: "INIT Error! See console." });
    });


browser.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, 
    periodInMinutes: RECURRENCE_INTERVAL_MINUTES 
});

browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) {
        console.log(`[BG] Alarm triggered: ${ALARM_NAME}. Starting rate update.`);
        browser.storage.local.get(["targetCurrencyCode"]).then(result => {
            updateExchangeRate(false, result.targetCurrencyCode || 'USD');
        });
    }
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "update_rate_manual") {
        // Return Promise chain and true to signal async response
        const targetCode = request.targetCurrencyCode || 'USD';
        updateExchangeRate(true, targetCode).then(sendResponse);
        return true; 
    }
    
    if (request.command === "fetch_currencies") {
        // 1. Check local storage first
        const promiseChain = browser.storage.local.get(["targetCurrencyCode", "supportedCurrencies"])
            .then(result => {
                // 1a. If currencies are cached, return them immediately
                if (result.supportedCurrencies && result.supportedCurrencies.length > 0) {
                     return { 
                         success: true, 
                         supportedCurrencies: result.supportedCurrencies, 
                         targetCurrencyCode: result.targetCurrencyCode 
                     };
                }
                
                // 1b. If not cached, trigger a full rate update/fetch
                // updateExchangeRate(notify, targetCurrencyCode)
                return updateExchangeRate(false, result.targetCurrencyCode || 'USD');
            })
            .then(response => {
                // Stellt sicher, dass das finale Objekt die erwartete Struktur hat
                if (response.supportedCurrencies) {
                     return response;
                }
                
                // Fallback (wird nur erreicht, wenn updateExchangeRate keine supportedCurrencies zurückgibt)
                // Wir nehmen an, der Standardfall ist USD und es ist erfolgreich.
                return { 
                    success: true, 
                    supportedCurrencies: [{code: 'USD', symbol: '$', rate: response.rate || 6.8}], // Fallback USD
                    targetCurrencyCode: response.code || 'USD'
                };
            })
            .catch(error => {
                // CRITICAL FIX: Wenn die gesamte Kette fehlschlägt (z.B. API-Fehler), 
                // muss ein Objekt mit success: false zurückgegeben werden, damit popup.js 
                // nicht hängt und eine Fehlermeldung anzeigen kann.
                console.error("[BG] Error fetching currency list for popup:", error);
                return { success: false, message: "Error communicating with API or network failure." };
            });
        
        // Sende das Ergebnis der Promise-Kette asynchron
        promiseChain.then(sendResponse);
        
        // Signalisiere, dass die Antwort asynchron gesendet wird
        return true;
    }
});
