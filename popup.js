// popup.js (FINAL Fixed: Cleanest Initialization and Status Update)

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element References ---
    const feeCheckbox = document.getElementById('superbuyFeeCheckbox');
    const rateSelector = document.getElementById('rateSelector');
    const updateButton = document.getElementById('updateRateButton');
    const rateStatusElement = document.getElementById('rateStatus');
    const currencySelector = document.getElementById('currencySelector');
    const rateSelectorBlock = document.getElementById('rateSelectorBlock');
    const currentCurrencyCodeSpan = document.getElementById('currentCurrencyCode');

    // --- 2. Mappings and Options ---
    const rateTypeNames = {
        'standard': 'Superbuy Standard Rate',
        'wise': 'Wise Remittance',
        'transfer': 'Bank Transfer',
        'other_payments': 'Other Payment Types (Dynamic Fee)',
        'cny_standard': 'Standard (1:1 CNY)',
        'cny_alipay': 'Alipay Card (Fee applies > ¥200)'
    };
    
    // HTML string for USD-based currency options
    const USDRateOptions = `
        <option value="standard">Superbuy Standard Rate</option>
        <option value="wise">Wise Remittance Rate</option>
        <option value="transfer">Bank Transfer Rate</option>
        <option value="other_payments">Other Payment Types (Dynamic Fee)</option>
    `;

    // HTML string for CNY currency options
    const CNYRateOptions = `
        <option value="cny_standard">Standard (1:1 CNY)</option>
        <option value="cny_alipay">Alipay Card (Fee applies > ¥200)</option>
    `;
    
    // --- 3. Function Definitions ---

    /** * Sends messages to content scripts to apply new fee/rate settings.
     * @param {string} rateType - The newly selected rate type.
     * @param {boolean} includeFee - Whether the Superbuy fee is enabled.
     * @param {boolean} fullReconvert - True if a full price re-read and conversion is needed (e.g., after currency change).
     */
    function notifyContentScripts(rateType, includeFee, fullReconvert) {
        // Query tabs that match the goofish domain
        browser.tabs.query({ url: "*://*.goofish.com/*" }).then(tabs => {
            tabs.forEach(tab => {
                // 1. Send the command for update (contains all information)
                // We ALWAYS use the reconvert_live_rate command here for maximum reliability,
                // as it instructs the content.js to reload ALL settings from storage.
                browser.tabs.sendMessage(tab.id, { 
                    command: "reconvert_live_rate" 
                }).catch(e => console.warn(`[POPUP] Full reconversion failed for tab ${tab.id}:`, e));
                
                // Note: The separate 'toggle_fee_live' command is now redundant,
                // as 'reconvert_live_rate' also reloads the fee. For safety/compatibility 
                // with old content.js versions, it could be kept, but in the final code
                // 'reconvert_live_rate' is the only needed command for changes
                // to currency, Rate-Type, and fee.
            });
        });
    }

    /** * Displays the current rate based on stored data and selected type.
     * @param {string} [currentRateType] - Optional, the rate type to display.
     * @param {string} [currentCode] - Optional, the currency code to display.
     */
    function displayCurrentRate(currentRateType, currentCode) {
         browser.storage.local.get(["conversionRates", "selectedRateType", "targetCurrencyCode", "targetCurrencySymbol"])
            .then(data => {
                const rates = data.conversionRates || {};
                const rateType = currentRateType || data.selectedRateType || 'standard';
                const code = currentCode || data.targetCurrencyCode || 'USD';
                const rateName = rateTypeNames[rateType] || rateType;

                let rateText = '';
                rateStatusElement.classList.remove('success', 'error');

                if (code === 'CNY') {
                    // Logic for CNY (1:1 conversion, fee only applies to Alipay type)
                    if (rateType === 'cny_standard') {
                        rateText = `1 CNY ≈ 1 CNY (Standard)`;
                    } else if (rateType === 'cny_alipay') {
                        rateText = `1 CNY ≈ 1 CNY (Alipay Card - Fee applies)`;
                    } else {
                        rateText = `Current Type: ${rateName}`;
                    }
                } else {
                    // Logic for USD and other foreign currencies
                    const rate = rates[rateType];
                    
                    if (rate) {
                        rateText = `1 ${code} ≈ ¥${rate.toFixed(4)} (${rateName})`;
                    } else if (rateType === 'other_payments' && rates.standard) {
                         rateText = `Dynamic Fee Model (${rateName}) based on 1 ${code} ≈ ¥${rates.standard.toFixed(4)}`;
                    } else if (rates.standard) {
                        // Fallback to standard rate if the specific rate is missing
                        rateText = `Rate for ${rateType} not available. Using Standard: 1 ${code} ≈ ¥${rates.standard.toFixed(4)}`;
                    } else {
                        // Critical error state if no rates are available
                        rateStatusElement.textContent = "No conversion rates available. Please update manually.";
                        rateStatusElement.classList.add('error');
                        return; 
                    }
                }
                
                rateStatusElement.textContent = rateText;
            })
            .catch(error => {
                console.error("[POPUP] Error reading saved rates:", error);
                rateStatusElement.textContent = "Error reading saved rates.";
                rateStatusElement.classList.add('error');
            });
    }

    /** * Handles the UI logic when the currency changes (populates rate selector, updates fee checkbox state).
     * @param {string} newCode - The newly selected currency code.
     * @param {boolean} shouldRestoreRate - Whether to try restoring the last saved rate type afterward.
     */
    function handleCurrencyChange(newCode, shouldRestoreRate) {
        currentCurrencyCodeSpan.textContent = newCode;
        
        let defaultRateType;

        // 1. Sets the correct rate options and fee status
        if (newCode === 'CNY') {
            // The checkbox now remains ENABLED, but the fee block is visually highlighted
            feeCheckbox.disabled = false; // <<< IMPORTANT: DO NOT DISABLE
            feeCheckbox.parentElement.style.opacity = '1.0';
            
            rateSelector.innerHTML = CNYRateOptions; 
            defaultRateType = 'cny_standard'; 
        } else {
            feeCheckbox.disabled = false;
            feeCheckbox.parentElement.style.opacity = '1.0';
            rateSelector.innerHTML = USDRateOptions; 
            defaultRateType = 'standard';
        }
        
        // 2. Sets the Rate Selector to the default value for the NEW currency.
        if (shouldRestoreRate) {
             restoreOptions(false); 
        } else {
             // Sets the selector directly to the new default value (prevents conflicts)
             rateSelector.value = defaultRateType;

             // Saves the new default rate type, as the old one is invalid.
             browser.storage.local.set({ 
                 selectedRateType: defaultRateType
             }).catch(e => console.error("[POPUP] Error setting default rate type:", e));
        }
    }

    /** * Retrieves options from storage and updates the popup UI. 
     * Assumes the currency list has already been loaded into currencySelector.
     * @param {boolean} shouldRefetchRates - True to call displayCurrentRate() after options are loaded.
     */
    function restoreOptions(shouldRefetchRates = true) {
        browser.storage.local.get(["includeSuperbuyFee", "selectedRateType", "targetCurrencyCode"])
            .then(result => {
                feeCheckbox.checked = result.includeSuperbuyFee === true;

                const currentCode = result.targetCurrencyCode || 'USD';
                
                // Sets the currency in the selector
                if (currencySelector.querySelector(`option[value="${currentCode}"]`)) {
                    currencySelector.value = currentCode;
                } else if (currencySelector.options.length > 0) {
                     // Fallback to the first loaded currency (should be CNY)
                     currencySelector.value = currencySelector.options[0].value;
                } else {
                    // Currencies not yet loaded (shouldn't happen after populateCurrencySelector)
                    return; 
                }

                // Updates the rate options based on the current currency
                handleCurrencyChange(currencySelector.value, false); 
                
                const storedRateType = result.selectedRateType || 'standard';
                
                // Sets the saved rate type
                if (rateSelector.querySelector(`option[value="${storedRateType}"]`)) {
                     rateSelector.value = storedRateType;
                } else if (currencySelector.value === 'CNY') {
                    rateSelector.value = 'cny_standard'; 
                } else {
                    rateSelector.value = 'standard';
                }

                // Displays the status/rate
                if (shouldRefetchRates) {
                   displayCurrentRate(); 
                }

            })
            .catch(error => {
                 console.error("[POPUP] Error restoring options:", error);
                 rateStatusElement.textContent = "Error loading saved settings.";
                 rateStatusElement.classList.add('error');
            });
    }

    /** * Saves the settings and sends the live update command to content scripts.
     * @param {boolean} currencyChanged - True if the currency selector triggered the save.
     */
    function saveOptions(currencyChanged) {
        const includeFee = feeCheckbox.checked;
        const newRateType = rateSelector.value;
        const newCurrencyCode = currencySelector.value;

        let finalRateType = newRateType;
        
        if (currencyChanged) {
            // Case 1: Currency changed
            
            // 1a. Updates the UI (options, fee) and sets the rate type to the default of the NEW currency.
            handleCurrencyChange(newCurrencyCode, false); // <--- HERE IT RESETS TO 'standard' (for USD)
            
            // Since handleCurrencyChange updates the rate type in storage, we must also update it here for the notification.
            finalRateType = (newCurrencyCode === 'CNY') ? 'cny_standard' : 'standard';

            // 1b. Save the fee status and the NEW currency
            browser.storage.local.set({ 
                includeSuperbuyFee: includeFee, 
                targetCurrencyCode: newCurrencyCode
                // selectedRateType is set in handleCurrencyChange!
            })
            .then(() => {
                // ... (Rest of the logic for rate update in the background)
                
                rateStatusElement.textContent = `Currency changed to ${newCurrencyCode}. Updating rates...`;
                rateStatusElement.classList.remove('success', 'error');

                browser.runtime.sendMessage({ 
                    command: "update_rate_manual", 
                    targetCurrencyCode: newCurrencyCode 
                })
                .then(response => {
                    if (response && response.success) {
                        notifyContentScripts(finalRateType, includeFee, true); 
                        displayCurrentRate(); 
                    } else {
                        throw new Error(response ? response.message : "Background update failed.");
                    }
                })
                .catch(error => {
                     rateStatusElement.textContent = "Error updating rates after currency change. Check console.";
                     rateStatusElement.classList.add('error');
                     console.error("[POPUP] Error updating rates:", error);
                });

            });

        } else {
            // Case 2: Rate type or fee changed
            // 1. Save the new rate type and fee status
            browser.storage.local.set({ 
                includeSuperbuyFee: includeFee, 
                selectedRateType: newRateType 
                // targetCurrencyCode remains unchanged
            })
            .then(() => {
                // 2. Notify content scripts and update status
                notifyContentScripts(finalRateType, includeFee, true); 
                displayCurrentRate(); 
            })
            .catch(error => {
                 console.error("[POPUP] Error saving options:", error);
                 rateStatusElement.textContent = "Error saving settings.";
                 rateStatusElement.classList.add('error');
            });
        }
    }
    
    /** * Fetches supported currencies from background script and populates the currency dropdown.
     * This is the initial function called on DOMContentLoaded.
     */
    function populateCurrencySelector() {
        rateStatusElement.textContent = "Loading rates and settings...";
        rateStatusElement.classList.remove('success', 'error');

        browser.runtime.sendMessage({ command: "fetch_currencies" })
            .then(response => {
                // Critical check for a valid response object
                if (!response || !response.success || !Array.isArray(response.supportedCurrencies)) {
                    const msg = response ? (response.message || "Unknown API error.") : "No response from background script.";
                    throw new Error(`[POPUP] Currency fetch failed: ${msg}`);
                }
                
                currencySelector.innerHTML = ''; 
                
                // 1. Add CNY option (always required)
                const cnyOption = document.createElement('option');
                cnyOption.value = 'CNY';
                cnyOption.textContent = 'CNY (Chinese Yuan)';
                currencySelector.appendChild(cnyOption);
                
                // 2. Add all other currencies
                response.supportedCurrencies.forEach(currency => {
                    // USD is the default, but we only take it from the list if it's not CNY
                    if (currency.code === 'CNY') return; 

                    const option = document.createElement('option');
                    option.value = currency.code;
                    // Shows the standard rate for each currency for information
                    option.textContent = `${currency.code} (${currency.symbol || ''}) - 1 ${currency.code} ≈ ¥${currency.rate.toFixed(4)}`;
                    currencySelector.appendChild(option);
                });

                // 3. After loading the options: Restore saved values and update UI
                restoreOptions(true); 
            })
            .catch(error => {
                console.error("[POPUP] Fatal Fetch Error:", error);
                // IMPORTANT: Display the error in the popup if initialization fails.
                rateStatusElement.textContent = "FATAL Error: Cannot load initial settings or communicate with API.";
                rateStatusElement.classList.add('error');
            });
    }

    // --- 4. Event Listeners ---
    
    /** Triggers the manual rate update. */
    updateButton.addEventListener('click', () => {
        rateStatusElement.textContent = 'Updating...';
        rateStatusElement.classList.remove('success', 'error');
        
        const currentCurrencyCode = currencySelector.value;

        // Send manual update command to the background script
        browser.runtime.sendMessage({ 
            command: "update_rate_manual", 
            targetCurrencyCode: currentCurrencyCode 
        })
            .then(response => {
                if (!response || !response.success) {
                    throw new Error(response ? response.message : "No response received or unknown error.");
                }
                
                // Display success message
                const code = response.code; 
                const rate = response.rate;
                let message = `Update Successful!`;
                
                if (code === 'CNY') {
                    message += ` Conversion to CNY is 1:1.`;
                } else {
                    message += ` Standard: 1 ${code} ≈ ¥${rate.toFixed(4)}`;
                }

                rateStatusElement.textContent = message;
                rateStatusElement.classList.add('success');
                
                // Update status and notify content scripts
                restoreOptions(true); // Display status/rate
                notifyContentScripts(rateSelector.value, feeCheckbox.checked, true); // true = Full Reconvert
                
                setTimeout(() => {
                    rateStatusElement.classList.remove('success', 'error');
                }, 3000);
            })
            .catch(error => {
                rateStatusElement.textContent = "Could not reach background script or network error.";
                rateStatusElement.classList.add('error');
                console.error("[POPUP] Manual update error:", error);
            });
    });

    // --- 5. INITIALIZATION ---
    // Starts the asynchronous loading of currencies and settings
    populateCurrencySelector();
    
    // Adds listeners for the UI elements
    feeCheckbox.addEventListener('change', () => saveOptions(false));
    rateSelector.addEventListener('change', () => saveOptions(false)); 
    currencySelector.addEventListener('change', () => saveOptions(true)); // Currency change requires a new rate fetch
});
