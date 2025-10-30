// popup.js (Combined Logic for Options and Rate Update - NEW: Rate Selector)

document.addEventListener('DOMContentLoaded', () => {
    const feeCheckbox = document.getElementById('superbuyFeeCheckbox');
    const rateSelector = document.getElementById('rateSelector');
    const updateButton = document.getElementById('updateRateButton');
    const rateStatusElement = document.getElementById('rateStatus');
    
    const rateTypeNames = {
        'standard': 'Standard Rate',
        'wise': 'Wise Remittance',
        'transfer': 'Bank Transfer',
        'other_payments': 'Other Payment Types (Dynamic Fee)' // NEW TYPE
    };


    // --- A. OPTIONS LOGIC (Fee Checkbox and Rate Selector) ---
    
    /** Saves the settings and sends the live update command. */
    function saveOptions() {
        const includeFee = feeCheckbox.checked;
        const newRateType = rateSelector.value;
        
        // 1. Save settings
        browser.storage.local.set({ 
            includeSuperbuyFee: includeFee, 
            selectedRateType: newRateType 
        })
        .then(() => {
            // 2. Send commands for live update to all Goofish tabs
            browser.tabs.query({ url: "*://*.goofish.com/*" }).then(tabs => {
                
                // 2a. Update Fee status
                tabs.forEach(tab => {
                    browser.tabs.sendMessage(tab.id, { 
                        command: "toggle_fee_live", 
                        newFeeStatus: includeFee 
                    })
                    .catch(e => console.warn("[Popup] Could not send fee message:", e));
                });
                
                // 2b. Update Rate Type
                tabs.forEach(tab => {
                    browser.tabs.sendMessage(tab.id, { 
                        command: "set_rate_type", 
                        newRateType: newRateType 
                    })
                    .catch(e => console.warn("[Popup] Could not send rate type message:", e));
                });
                
            });
            displayCurrentRate();

        })
        .catch(error => {
            console.error("[Popup] Error saving options:", error);
        });
    }

    /** Loads saved settings and sets the UI elements. */
    function restoreOptions() {
        browser.storage.local.get(["includeSuperbuyFee", "selectedRateType"])
        .then(result => {
            feeCheckbox.checked = result.includeSuperbuyFee === true;
            rateSelector.value = result.selectedRateType || 'standard';
        })
        .catch(error => {
            console.error("[Popup] Error loading options:", error);
        });
    }

    // --- B. RATE UPDATE LOGIC ---

    /** Displays the current exchange rates. */
    function displayCurrentRate() {
        browser.storage.local.get(["conversionRates", "selectedRateType"])
            .then(data => {
                const rates = data.conversionRates;
                const selectedType = data.selectedRateType || 'standard';
                
                if (rates && rates.standard) {
                    let statusHtml = `
                        <strong>Selected: ${rateTypeNames[selectedType]}</strong><br>`;
                    
                    if (selectedType === 'other_payments') {
                         statusHtml += `
                             **Note:** This rate is **dynamic** and cannot be displayed as a single CNY/USD value due to the fixed $0.30 fee. The conversion is calculated per item based on the Standard Rate (¥${rates.standard.toFixed(4)}) plus a 5% fee model.
                         `;
                    } else {
                         statusHtml += `
                            1 USD ≈ ¥${rates[selectedType].toFixed(4)}
                         `;
                    }

                    statusHtml += `
                        <hr style="border:0; border-top: 1px dashed #ccc; margin: 5px 0;">
                        Standard Rate: ¥${rates.standard.toFixed(4)}<br>
                        Wise Rate: ¥${(rates.wise || 'N/A')}<br>
                        Bank Transfer Rate: ¥${(rates.transfer || 'N/A')}
                    `;
                    rateStatusElement.innerHTML = statusHtml;

                } else {
                    rateStatusElement.textContent = "Rates not available. Update now!";
                }
            })
            .catch(() => {
                rateStatusElement.textContent = "Error loading rates.";
                rateStatusElement.classList.add('error');
            });
    }

    /** Triggers the manual rate update. */
    updateButton.addEventListener('click', () => {
        rateStatusElement.textContent = 'Updating...';
        rateStatusElement.classList.remove('success', 'error');

        browser.runtime.sendMessage({ command: "update_rate_manual" })
            .then(response => {
                if (response && response.success) {
                    rateStatusElement.textContent = `Update Successful! Standard: 1 USD ≈ ¥${response.rate.toFixed(4)}`;
                    rateStatusElement.classList.add('success');
                } else {
                    rateStatusElement.textContent = response ? response.message : "Unknown error during update.";
                    rateStatusElement.classList.add('error');
                }
                
                setTimeout(() => {
                    displayCurrentRate(); 
                    rateStatusElement.classList.remove('success', 'error');
                }, 3000);
            })
            .catch(() => {
                rateStatusElement.textContent = "Could not reach background script.";
                rateStatusElement.classList.add('error');
            });
    });

    // --- INITIALIZATION ---
    restoreOptions();
    displayCurrentRate();
    feeCheckbox.addEventListener('change', saveOptions);
    rateSelector.addEventListener('change', saveOptions); 
});
