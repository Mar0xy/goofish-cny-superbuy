// content.js (FINAL: Smart Live Update - Text-Only Update on Fee Toggle)

// Selectors for inner price wrappers
const PRICE_PARTS_SELECTORS = [
    '.value--EyQBSInp', 
    '.price-wrap--YzmU5cUl',
    '.right-card-main-price--BRE5MkOF' 
];

// Regex for simple prices (e.g., in body text, discount boxes)
const SIMPLE_PRICE_REGEX = /(¥|元|￥)\s*(\d[\d,.]*)/g; 

let cnyPerUsd = null;
let isModifyingDOM = false;
let includeSuperbuyFee = false;
const SUPERBUY_FEE_CNY = 20; 

// --- HELPER FUNCTIONS FOR PRICE CALCULATION ---

/**
 * Creates the converted USD text based on price and conversion type.
 */
function getUsdText(cnyPrice, isTextNodeConversion) {
    let displayCnyPrice = cnyPrice;
    let usdPrice = cnyPrice / cnyPerUsd;
    let usdText;

    if (includeSuperbuyFee) {
        displayCnyPrice = cnyPrice + SUPERBUY_FEE_CNY;
        usdPrice = displayCnyPrice / cnyPerUsd;
        // Text node conversion always uses the (~$ prefix
        usdText = isTextNodeConversion 
            ? ` (~$${usdPrice.toFixed(2)} USD, Fee Incl. ¥${displayCnyPrice.toFixed(2)})`
            : `$${usdPrice.toFixed(2)} USD (Fee Incl. ¥${displayCnyPrice.toFixed(2)})`;
    } else {
        usdText = isTextNodeConversion
            ? ` (~$${usdPrice.toFixed(2)} USD)`
            : `$${usdPrice.toFixed(2)} USD`;
    }
    return usdText;
}


// --- HELPER FUNCTIONS FOR DOM MANIPULATION ---

/**
 * Removes all USD price displays added by this extension.
 */
function removeExistingConversions() {
    isModifyingDOM = true;
    
    document.querySelectorAll('[data-converted-multi="true"]').forEach(el => {
        el.removeAttribute('data-converted-multi');
    });

    document.querySelectorAll('[data-converted-usd="true"]').forEach(el => {
        try {
            el.remove();
        } catch(e) {
            console.error("[CONTENT] Error removing old conversions:", e);
        }
    });

    isModifyingDOM = false;
}


/**
 * Extracts the full CNY price from a container. (Unchanged)
 */
function extractCnyPrice(priceContainer) {
    let priceString = '';
    let foundSymbol = false;
    let foundNumber = false;

    priceContainer.childNodes.forEach(child => {
        if (child.nodeType === 1) { 
            const text = child.textContent.trim();
            
            if (text.match(/^(¥|元|￥)$/)) {
                foundSymbol = true;
            } 
            else if (text.match(/^[\d,.]+$/)) {
                priceString += text.replace(/,/g, '');
                foundNumber = true;
            }
        }
    });

    if (foundSymbol && foundNumber && priceString.length > 0) {
        return parseFloat(priceString);
    }
    return null;
}

/**
 * Handles all nested price structures.
 * Added: Saves the original price in the data-cny-price attribute.
 */
function handleMultiPartPrice(scopeNode) {
    if (!cnyPerUsd) return;
    
    scopeNode.querySelectorAll(PRICE_PARTS_SELECTORS.join(', ')).forEach(priceContainer => {
        if (priceContainer.getAttribute('data-converted-multi') === 'true') {
            return;
        }

        const cnyPrice = extractCnyPrice(priceContainer);

        if (cnyPrice !== null && cnyPrice > 0) {
            
            const usdText = getUsdText(cnyPrice, false); // isTextNodeConversion = false
            
            const usdSpan = document.createElement('span');
            usdSpan.textContent = usdText;
            usdSpan.setAttribute('data-converted-usd', 'true');
            usdSpan.setAttribute('data-cny-price', cnyPrice.toString()); // <-- Added: Save original price
            
            // --- STYLING LOGIC ---
            if (priceContainer.classList.contains('right-card-main-price--BRE5MkOF')) {
                usdSpan.style.position = 'absolute';
                usdSpan.style.bottom = '-15.8px'; 
                usdSpan.style.left = '50%';
                usdSpan.style.transform = 'translateX(-50%)';
                usdSpan.style.zIndex = '10'; 
                usdSpan.style.whiteSpace = 'nowrap';
                
                usdSpan.style.fontSize = '9px'; 
                usdSpan.style.fontWeight = 'bold';
                usdSpan.style.color = '#fff'; 
                usdSpan.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                usdSpan.style.padding = '2px 4px';
                usdSpan.style.borderRadius = '3px';
                
                isModifyingDOM = true;
                try {
                     priceContainer.appendChild(usdSpan);
                } catch(e) { console.error("[CONTENT] Error during DOM modification:", e); }
                finally {
                     isModifyingDOM = false;
                }

            } else {
                usdSpan.style.fontSize = '12px';
                usdSpan.style.color = '#fff';   
                usdSpan.style.backgroundColor = '#666';
                usdSpan.style.padding = '2px 4px';
                usdSpan.style.borderRadius = '3px';
                usdSpan.style.marginLeft = '4px';
                usdSpan.style.display = 'inline-block'; 

                isModifyingDOM = true;
                try {
                    priceContainer.parentNode.insertBefore(usdSpan, priceContainer.nextSibling);
                } catch(e) { console.error("[CONTENT] Error during DOM modification:", e); }
                finally {
                     isModifyingDOM = false;
                }
            }

            priceContainer.setAttribute('data-converted-multi', 'true');
        }
    });
}


/**
 * Converts prices found within a text node.
 * Added: Saves the original price in the data-cny-price attribute.
 */
function convertPriceInTextNode(textNode) {
    if (!cnyPerUsd) return;

    const originalText = textNode.textContent;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let match;
    let convertedCount = 0;

    SIMPLE_PRICE_REGEX.lastIndex = 0;

    while ((match = SIMPLE_PRICE_REGEX.exec(originalText)) !== null) {
        const fullMatch = match[0];
        const priceString = match[2]; 

        if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
        }

        const cnyPrice = parseFloat(priceString.replace(/,/g, ''));
        
        if (isNaN(cnyPrice) || cnyPrice <= 0) {
            fragment.appendChild(document.createTextNode(fullMatch));
        } else {
            fragment.appendChild(document.createTextNode(fullMatch));
            
            const usdText = getUsdText(cnyPrice, true); // isTextNodeConversion = true
            
            const usdSpan = document.createElement('span');
            usdSpan.textContent = usdText;
            usdSpan.setAttribute('data-converted-usd', 'true');
            usdSpan.setAttribute('data-cny-price', cnyPrice.toString()); // <-- Added: Save original price
            usdSpan.style.fontWeight = 'bold';
            fragment.appendChild(usdSpan);
            convertedCount++;
        }

        lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < originalText.length) {
        fragment.appendChild(document.createTextNode(originalText.substring(lastIndex)));
    }

    if (convertedCount > 0) {
        isModifyingDOM = true;
        try {
            textNode.parentNode.replaceChild(fragment, textNode); 
        } catch (e) {
            console.error("[CONTENT] Error during DOM modification:", e);
        } finally {
            isModifyingDOM = false;
        }
    }
}


// --- DOM Processing and Observer (Unchanged) ---

function processNode(node) {
    if (!cnyPerUsd) return;

    if (node.nodeType === 1 && node.getAttribute('data-converted-usd') === 'true') {
        return;
    }

    if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
        
        if (node.matches(PRICE_PARTS_SELECTORS.join(', '))) {
            handleMultiPartPrice(node);
        }

        node.childNodes.forEach(child => {
            processNode(child);
        });
    }

    if (node.nodeType === 3 && node.textContent.trim().length > 0) {
        if (!node.parentNode || node.parentNode.getAttribute('data-converted-usd') !== 'true') {
            convertPriceInTextNode(node);
        }
    }
}

/**
 * NEW: Updates only the text content of existing USD spans (non-destructively).
 */
function updateOnlyUsdText() {
    if (!cnyPerUsd) return;
    
    document.querySelectorAll('[data-converted-usd="true"]').forEach(usdSpan => {
        const cnyPriceAttr = usdSpan.getAttribute('data-cny-price');
        if (!cnyPriceAttr) return; 

        const cnyPrice = parseFloat(cnyPriceAttr);
        if (isNaN(cnyPrice)) return;

        // Determine if it was a text node conversion (with "~")
        // This is necessary to use the correct prefix (with/without ~)
        const isTextNodeConversion = usdSpan.textContent.includes(' (~'); 

        const usdText = getUsdText(cnyPrice, isTextNodeConversion);
        
        isModifyingDOM = true;
        try {
            usdSpan.textContent = usdText; // ONLY update the text content
        } catch(e) {
             console.error("[CONTENT] Error during text update:", e);
        } finally {
            isModifyingDOM = false;
        }
    });
    
    console.log(`[$] Live Update (Text-Only) performed. Superbuy Fee is: ${includeSuperbuyFee ? 'INCLUDED' : 'EXCLUDED'}.`);
}


/**
 * Forces reconversion of all prices based on the current fee/rate.
 * Performs a text-only update for live changes.
 */
function forceReconversion() {
    if (!cnyPerUsd) {
        console.warn("[$] Rate not available, cannot update live.");
        return;
    }

    // If converted spans already exist, do NOT perform the destructive scan,
    // but only the text update.
    if (document.querySelector('[data-converted-usd="true"]')) {
        updateOnlyUsdText();
        return;
    }
    
    // Otherwise (Initial conversion), perform the full scan.
    removeExistingConversions();
    processNode(document.body);
    handleMultiPartPrice(document.body);
    
    console.log(`[$] Full Scan performed (Initial conversion). Superbuy Fee is: ${includeSuperbuyFee ? 'INCLUDED' : 'EXCLUDED'}.`);
}

function startObserver() {
    if (!cnyPerUsd) {
        console.warn("[$] Exchange rate not available yet. Retrying...");
        setTimeout(startObserver, 500); 
        return;
    }
    
    console.log("[$] Goofish USD Converter is active.");
    console.log(`[$] Superbuy Fee (20 CNY) is: ${includeSuperbuyFee ? 'INCLUDED' : 'EXCLUDED'}.`);

    processNode(document.body);
    handleMultiPartPrice(document.body); 

    const observer = new MutationObserver((mutationsList, observer) => {
        if (isModifyingDOM) {
            return;
        }
        
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        processNode(node);
                        handleMultiPartPrice(node);
                    }
                });
            }
        }
    });

    const config = { childList: true, subtree: true };
    observer.observe(document.body, config);
}


// --- Main Execution and Message Listener ---

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Live update for the fee and rate now calls the smart forceReconversion.
    if (request.command === "toggle_fee_live" && request.newFeeStatus !== undefined) {
        includeSuperbuyFee = request.newFeeStatus; 
        forceReconversion(); 
        sendResponse({ success: true });
        return true;
    }
    
    if (request.command === "reconvert_live_rate") {
        browser.storage.local.get("cnyPerUsd")
          .then(data => {
            if (data.cnyPerUsd) {
              cnyPerUsd = data.cnyPerUsd; 
              forceReconversion(); 
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, message: "Rate not found in storage." });
            }
          });
        return true; 
    }
});

browser.storage.local.get(["cnyPerUsd", "includeSuperbuyFee"])
  .then(data => {
    if (data.cnyPerUsd) {
      cnyPerUsd = data.cnyPerUsd;
      includeSuperbuyFee = data.includeSuperbuyFee === true; 
      startObserver();
    } else {
      console.error("[$] Exchange rate not found in storage. Background script will fetch the rate.");
      includeSuperbuyFee = data.includeSuperbuyFee === true;
      startObserver(); 
    }
  })
  .catch(error => {
    console.error("[$] Error fetching settings:", error);
  });
