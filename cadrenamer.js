(function() {
    'use strict';

    let partCounter = {};
    let documentLetter = null;
    let isEnabled = true;

    // Extract letter from document name (e.g., "3990-C000-intake" -> "C")
    function extractLetterFromDocName() {
        const docNameElement = document.querySelector('[data-test-id="document-name"]') ||
            document.querySelector('.document-name');

        if (docNameElement) {
            const docName = docNameElement.textContent.trim();
            // Pattern: XXXX-L000-name where L is the letter
            const match = docName.match(/\d+-([A-Z])\d+-/i);
            if (match) {
                return match[1].toUpperCase();
            }
        }
        return null;
    }

    // Get next part number for the letter
    function getNextPartNumber(letter) {
        if (!partCounter[letter]) {
            partCounter[letter] = 0;
        }
        partCounter[letter]++;
        return String(partCounter[letter]).padStart(3, '0');
    }

    // Scan existing parts to initialize counter
    function scanExistingParts() {
        const letter = documentLetter;
        if (!letter) return;

        const partElements = document.querySelectorAll('[data-test-id="parts-table-row"]');
        let maxNum = 0;

        partElements.forEach(el => {
            const nameEl = el.querySelector('.part-name');
            if (nameEl) {
                const name = nameEl.textContent.trim();
                const pattern = new RegExp(`^${letter}(\\d+)$`, 'i');
                const match = name.match(pattern);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) maxNum = num;
                }
            }
        });

        partCounter[letter] = maxNum;
    }

    // Rename a part
    function renamePart(partElement, newName) {
        const nameElement = partElement.querySelector('.part-name');
        if (!nameElement) return;

        // Simulate double-click to enter edit mode
        nameElement.dispatchEvent(new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        setTimeout(() => {
            const input = partElement.querySelector('input[type="text"]');
            if (input) {
                input.value = newName;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true
                }));
            }
        }, 100);
    }

    // Check for new parts with default names
    function checkForNewParts() {
        if (!isEnabled || !documentLetter) return;

        const partElements = document.querySelectorAll('[data-test-id="parts-table-row"]');

        partElements.forEach(el => {
            const nameEl = el.querySelector('.part-name');
            if (nameEl) {
                const currentName = nameEl.textContent.trim();

                // Check if it's a default name like "Part 1", "Part1", etc.
                if (/^Part\s*\d+$/i.test(currentName)) {
                    const newName = documentLetter + getNextPartNumber(documentLetter);
                    console.log(`Renaming "${currentName}" to "${newName}"`);
                    renamePart(el, newName);
                }
            }
        });
    }

    // Initialize
    function init() {
        documentLetter = extractLetterFromDocName();
        if (documentLetter) {
            console.log(`Document letter detected: ${documentLetter}`);
            scanExistingParts();
            console.log(`Starting counter at: ${partCounter[documentLetter]}`);
        }
    }

    // Wait for page to load
    function waitForOnshape() {
        if (document.querySelector('[data-test-id="parts-table"]')) {
            init();

            // Use MutationObserver to watch for new parts
            const observer = new MutationObserver((mutations) => {
                checkForNewParts();
            });

            const partsTable = document.querySelector('[data-test-id="parts-table"]');
            if (partsTable) {
                observer.observe(partsTable, {
                    childList: true,
                    subtree: true
                });
            }

            // Also check periodically
            setInterval(checkForNewParts, 2000);
        } else {
            setTimeout(waitForOnshape, 1000);
        }
    }

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggle') {
            isEnabled = request.enabled;
            sendResponse({ success: true });
        }
    });

    waitForOnshape();
})();
