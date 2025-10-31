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
                // 1. Sende den Befehl zur Aktualisierung (enthält alle Informationen)
                // Wir verwenden HIER IMMER den reconvert_live_rate Befehl für maximale Zuverlässigkeit,
                // da er den content.js anweist, ALLE Einstellungen neu aus dem Storage zu laden.
                browser.tabs.sendMessage(tab.id, { 
                    command: "reconvert_live_rate" 
                }).catch(e => console.warn(`[POPUP] Full reconversion failed for tab ${tab.id}:`, e));
                
                // Hinweis: Der separate 'toggle_fee_live' Befehl ist jetzt redundant,
                // da 'reconvert_live_rate' auch die Gebühr neu lädt. Zur Sicherheit/Kompatibilität 
                // mit alten content.js Versionen könnte man ihn behalten, aber im finalen Code
                // ist 'reconvert_live_rate' der einzige benötigte Befehl für Änderungen
                // an Währung, Rate-Typ und Gebühr.
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

        // 1. Setzt die korrekten Rate-Optionen und Gebühren-Status
        if (newCode === 'CNY') {
            // Die Checkbox bleibt jetzt AKTIVIERT, aber der Fee-Block wird optisch hervorgehoben
            feeCheckbox.disabled = false; // <<< WICHTIG: NICHT DEAKTIVIEREN
            feeCheckbox.parentElement.style.opacity = '1.0';
            
            rateSelector.innerHTML = CNYRateOptions; 
            defaultRateType = 'cny_standard'; 
        } else {
            feeCheckbox.disabled = false;
            feeCheckbox.parentElement.style.opacity = '1.0';
            rateSelector.innerHTML = USDRateOptions; 
            defaultRateType = 'standard';
        }
        
        // 2. Setzt den Rate Selector auf den Standardwert für die NEUE Währung.
        if (shouldRestoreRate) {
             restoreOptions(false); 
        } else {
             // Setzt den Selector direkt auf den neuen Standardwert (verhindert Konflikte)
             rateSelector.value = defaultRateType;

             // Speichert den neuen Standard-Rate-Typ, da der alte ungültig ist.
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
                
                // Setzt die Währung im Selector
                if (currencySelector.querySelector(`option[value="${currentCode}"]`)) {
                    currencySelector.value = currentCode;
                } else if (currencySelector.options.length > 0) {
                     // Fallback auf die erste geladene Währung (sollte CNY sein)
                     currencySelector.value = currencySelector.options[0].value;
                } else {
                    // Währungen wurden noch nicht geladen (sollte nach populateCurrencySelector nicht passieren)
                    return; 
                }

                // Aktualisiert die Raten-Optionen basierend auf der aktuellen Währung
                handleCurrencyChange(currencySelector.value, false); 
                
                const storedRateType = result.selectedRateType || 'standard';
                
                // Setzt den gespeicherten Rate-Typ
                if (rateSelector.querySelector(`option[value="${storedRateType}"]`)) {
                     rateSelector.value = storedRateType;
                } else if (currencySelector.value === 'CNY') {
                    rateSelector.value = 'cny_standard'; 
                } else {
                    rateSelector.value = 'standard';
                }

                // Zeigt den Status/Rate an
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
            // Fall 1: Währung geändert
            
            // 1a. Aktualisiert die UI (Optionen, Gebühr) und setzt den Rate-Typ auf den Standard der NEUEN Währung.
            handleCurrencyChange(newCurrencyCode, false); // <--- HIER WIRD AUF 'standard' (für USD) ZURÜCKGESETZT
            
            // Da handleCurrencyChange den Rate-Typ im Storage aktualisiert, müssen wir ihn hier auch für die Benachrichtigung aktualisieren.
            finalRateType = (newCurrencyCode === 'CNY') ? 'cny_standard' : 'standard';

            // 1b. Speichern des Gebührenstatus und der NEUEN Währung
            browser.storage.local.set({ 
                includeSuperbuyFee: includeFee, 
                targetCurrencyCode: newCurrencyCode
                // selectedRateType wird in handleCurrencyChange gesetzt!
            })
            .then(() => {
                // ... (Rest der Logik für Raten-Update im Hintergrund)
                
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
            // Fall 2: Rate-Typ oder Gebühr geändert
            // 1. Speichern des neuen Rate-Typs und des Gebührenstatus
            browser.storage.local.set({ 
                includeSuperbuyFee: includeFee, 
                selectedRateType: newRateType 
                // targetCurrencyCode bleibt unverändert
            })
            .then(() => {
                // 2. Content Scripts benachrichtigen und Status aktualisieren
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
                
                // 1. CNY-Option hinzufügen (always required)
                const cnyOption = document.createElement('option');
                cnyOption.value = 'CNY';
                cnyOption.textContent = 'CNY (Chinese Yuan)';
                currencySelector.appendChild(cnyOption);
                
                // 2. Alle anderen Währungen hinzufügen
                response.supportedCurrencies.forEach(currency => {
                    // USD ist der Standard, aber wir nehmen ihn nur aus der Liste, wenn er nicht CNY ist
                    if (currency.code === 'CNY') return; 

                    const option = document.createElement('option');
                    option.value = currency.code;
                    // Zeigt die Standardrate für jede Währung zur Information
                    option.textContent = `${currency.code} (${currency.symbol || ''}) - 1 ${currency.code} ≈ ¥${currency.rate.toFixed(4)}`;
                    currencySelector.appendChild(option);
                });

                // 3. Nach dem Laden der Optionen: Gespeicherte Werte wiederherstellen und UI aktualisieren
                restoreOptions(true); 
            })
            .catch(error => {
                console.error("[POPUP] Fatal Fetch Error:", error);
                // WICHTIG: Zeigt den Fehler im Popup an, falls die Initialisierung fehlschlägt.
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

        // Sendet manuellen Update-Befehl an das Background-Script
        browser.runtime.sendMessage({ 
            command: "update_rate_manual", 
            targetCurrencyCode: currentCurrencyCode 
        })
            .then(response => {
                if (!response || !response.success) {
                    throw new Error(response ? response.message : "No response received or unknown error.");
                }
                
                // Erfolgsmeldung anzeigen
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
                
                // Aktualisiert den Status und benachrichtigt Content Scripts
                restoreOptions(true); // Status/Rate anzeigen
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
    // Startet den asynchronen Ladevorgang der Währungen und Einstellungen
    populateCurrencySelector();
    
    // Fügt Listener für die UI-Elemente hinzu
    feeCheckbox.addEventListener('change', () => saveOptions(false));
    rateSelector.addEventListener('change', () => saveOptions(false)); 
    currencySelector.addEventListener('change', () => saveOptions(true)); // Währungsänderung erfordert ein erneutes Abrufen der Rate
});
