// popup.js (Combined Logic for Options and Rate Update - NEW: Live Update)

document.addEventListener('DOMContentLoaded', () => {
    const feeCheckbox = document.getElementById('superbuyFeeCheckbox');
    const updateButton = document.getElementById('updateRateButton');
    const rateStatusElement = document.getElementById('rateStatus');

    // --- A. OPTIONS LOGIC (Fee Checkbox) ---
    
    /** Saves the checkbox setting and sends the live update command. */
    function saveOptions() {
        const includeFee = feeCheckbox.checked;
        
        // 1. Save setting
        browser.storage.local.set({ includeSuperbuyFee: includeFee })
        .then(() => {
            // 2. Send command for live update to all Goofish tabs
            browser.tabs.query({ url: "*://*.goofish.com/*" }).then(tabs => {
                tabs.forEach(tab => {
                    // Send the new value with the command
                    browser.tabs.sendMessage(tab.id, { 
                        command: "toggle_fee_live", 
                        newFeeStatus: includeFee 
                    })
                    .catch(e => {
                        console.warn("[Popup] Could not send message to tab (Tab potentially closed):", e); 
                    });
                });
            });
        })
        .catch(error => {
            console.error("[Popup] Error saving options:", error);
        });
    }

    /** Loads saved settings and sets the checkmark. */
    function restoreOptions() {
        browser.storage.local.get("includeSuperbuyFee")
        .then(result => {
            feeCheckbox.checked = result.includeSuperbuyFee === true;
        })
        .catch(error => {
            console.error("[Popup] Error loading options:", error);
        });
    }

    // --- B. RATE UPDATE LOGIC (Unchanged) ---

    /** Displays the current exchange rate. */
    function displayCurrentRate() {
        browser.storage.local.get("cnyPerUsd")
            .then(data => {
                if (data.cnyPerUsd) {
                    rateStatusElement.textContent = `Current Rate: 1 USD ≈ ¥${data.cnyPerUsd.toFixed(4)}`;
                } else {
                    rateStatusElement.textContent = "Rate not available. Update now!";
                }
            })
            .catch(() => {
                rateStatusElement.textContent = "Error loading rate.";
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
                    rateStatusElement.textContent = `Updated: 1 USD ≈ ¥${response.rate.toFixed(4)}`;
                    rateStatusElement.classList.add('success');
                    
                    // The background script already reloads the tabs, so no double reload is needed here.

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
});
