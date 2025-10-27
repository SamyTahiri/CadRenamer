(function() {
    'use strict';

    let partCounter = {};
    let documentLetter = null;
    let isEnabled = true;

    function extractLetterFromDocName() {
        const docNameElement = document.querySelector('[data-test-id="document-name"]') ||
            document.querySelector('.document-name') ||
            document.querySelector('title');

        if (docNameElement) {
            const docName = docNameElement.textContent.trim();
            const match = docName.match(/\d+-([A-Z])\d+-/i);
            if (match) {
                return match[1].toUpperCase();
            }
        }
        return null;
    }

    function getNextPartNumber(letter) {
        if (!partCounter[letter]) {
            partCounter[letter] = 0;
        }
        partCounter[letter]++;
        return String(partCounter[letter]).padStart(3, '0');
    }

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

    function renamePart(partElement, newName) {
        const nameElement = partElement.querySelector('.part-name');
        if (!nameElement) return;

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

    function checkForNewParts() {
        if (!isEnabled || !documentLetter) return;

        const partElements = document.querySelectorAll('[data-test-id="parts-table-row"]');

        partElements.forEach(el => {
            const nameEl = el.querySelector('.part-name');
            if (nameEl) {
                const currentName = nameEl.textContent.trim();

                if (/^Part\s*\d+$/i.test(currentName)) {
                    const newName = documentLetter + getNextPartNumber(documentLetter);
                    console.log(`Renaming "${currentName}" to "${newName}"`);
                    renamePart(el, newName);
                }
            }
        });
    }

    function init() {
        documentLetter = extractLetterFromDocName();
        if (documentLetter) {
            console.log(`Document letter detected: ${documentLetter}`);
            scanExistingParts();
            console.log(`Starting counter at: ${partCounter[documentLetter]}`);
        }
    }

    function waitForOnshape() {
        if (document.querySelector('[data-test-id="parts-table"]')) {
            init();

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

            setInterval(checkForNewParts, 2000);
        } else {
            setTimeout(waitForOnshape, 1000);
        }
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggle') {
            isEnabled = request.enabled;
            sendResponse({ success: true });
        }
    });

    waitForOnshape();
})();