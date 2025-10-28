// ==================================================
// Onshape Auto-Renamer Extension
// Version: v1.0
// ==================================================

(function() {
  'use strict';

  let documentLetter = null;
  let isEnabled = true;
  let observerActive = false;
  let processedParts = new Set();
  let documentId = null;

  console.log('=== Onshape Auto-Renamer v1.0 Started ===');

  // Extract document ID from URL
  function getDocumentId() {
    const match = window.location.pathname.match(/\/documents\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function extractLetterFromDocName() {
    const title = document.title;
    let match = title.match(/\d+-([A-Z])\d+-/i);
    if (match) {
      console.log('✓ Document letter:', match[1].toUpperCase());
      return match[1].toUpperCase();
    }
    return null;
  }

  // Get counter from storage
  async function getCounter() {
    const storageKey = `counter_${documentId}_${documentLetter}`;
    return new Promise((resolve) => {
      chrome.storage.local.get([storageKey], (result) => {
        resolve(result[storageKey] || 0);
      });
    });
  }

  // Save counter to storage
  async function saveCounter(value) {
    const storageKey = `counter_${documentId}_${documentLetter}`;
    return new Promise((resolve) => {
      chrome.storage.local.set({ [storageKey]: value }, resolve);
    });
  }

  // Get and increment counter
  async function getNextPartNumber() {
    let counter = await getCounter();
    counter++;
    await saveCounter(counter);
    const num = String(counter).padStart(3, '0');
    console.log(`Generated part number: ${documentLetter}${num} (counter: ${counter})`);
    return num;
  }

  async function scanExistingParts() {
    if (!documentLetter) return;

    console.log('Scanning existing parts across entire document...');

    const partList = document.querySelector('.part-list-container');
    if (!partList) return;

    const partItems = partList.querySelectorAll('.os-list-item');
    let maxNum = await getCounter();

    partItems.forEach((item) => {
      const partIcon = item.querySelector('.os-part-list-icon');
      if (!partIcon) return;

      const nameEl = item.querySelector('.os-list-item-name');
      if (nameEl) {
        const name = nameEl.textContent.trim();

        const pattern = new RegExp(`^${documentLetter}(\\d+)$`, 'i');
        const match = name.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
          processedParts.add(name);
        }
      }
    });

    await saveCounter(maxNum);
    console.log(`Counter set to: ${maxNum} (will start next part at ${maxNum + 1})`);
  }

  function renamePart(partItem, currentName, newName) {
    console.log(`Attempting to rename "${currentName}" to "${newName}"`);

    const nameLabel = partItem.querySelector('.os-list-item-label');
    if (!nameLabel) {
      console.log('✗ Could not find label element');
      return;
    }

    processedParts.add(currentName);
    processedParts.add(newName);

    // Click to select
    partItem.click();

    setTimeout(() => {
      // Right-click on label
      const rect = nameLabel.getBoundingClientRect();
      nameLabel.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        clientX: rect.left + 10,
        clientY: rect.top + 10
      }));

      setTimeout(() => {
        // Find Rename option
        const menuItems = document.querySelectorAll('[class*="menu-item"], [role="menuitem"], .ns-menu-item');
        const renameOption = Array.from(menuItems).find(item => {
          const text = item.textContent.trim();
          return text === 'Rename';
        });

        if (renameOption) {
          console.log('✓ Found Rename option, clicking...');
          renameOption.click();

          setTimeout(() => {
            // Look for input or contenteditable
            const nameSpan = partItem.querySelector('.os-list-item-name');
            const input = nameLabel.querySelector('input') ||
              nameSpan.querySelector('input') ||
              document.querySelector('input:focus');

            if (input) {
              console.log('✓ Found input field');
              input.value = newName;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                keyCode: 13,
                bubbles: true
              }));
              setTimeout(() => input.blur(), 50);
            } else if (nameSpan.getAttribute('contenteditable')) {
              console.log('✓ Found contenteditable');
              nameSpan.textContent = newName;
              nameSpan.dispatchEvent(new Event('input', { bubbles: true }));
              nameSpan.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                keyCode: 13,
                bubbles: true
              }));
              nameSpan.blur();
            } else {
              // Fallback: use clipboard to paste the name
              console.log('Trying clipboard method...');
              navigator.clipboard.writeText(newName).then(() => {
                document.execCommand('paste');
                setTimeout(() => {
                  document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: 13,
                    bubbles: true
                  }));
                }, 100);
              });
            }
          }, 400);
        } else {
          console.log('✗ Could not find Rename option');
          processedParts.delete(currentName);
          processedParts.delete(newName);
        }
      }, 400);
    }, 300);
  }

  async function checkForNewParts() {
    if (!isEnabled || !documentLetter) return;

    const partList = document.querySelector('.part-list-container');
    if (!partList) return;

    const partItems = partList.querySelectorAll('.os-list-item');

    for (const item of partItems) {
      const partIcon = item.querySelector('.os-part-list-icon');
      if (!partIcon) continue;

      const nameEl = item.querySelector('.os-list-item-name');
      if (!nameEl) continue;

      const currentName = nameEl.textContent.trim();

      if (processedParts.has(currentName)) continue;

      const defaultPatterns = [
        /^Part\s*\d+$/i,
        /^Partie\s*\d+$/i,
        /^Part$/i
      ];

      for (const pattern of defaultPatterns) {
        if (pattern.test(currentName)) {
          console.log('Found default part name:', currentName);
          const nextNum = await getNextPartNumber();
          const newName = documentLetter + nextNum;
          renamePart(item, currentName, newName);
          return; // Only process one at a time
        }
      }
    }
  }

  async function init() {
    console.log('Initializing...');

    documentId = getDocumentId();
    if (!documentId) {
      console.log('✗ Could not extract document ID');
      setTimeout(init, 3000);
      return;
    }
    console.log('✓ Document ID:', documentId);

    documentLetter = extractLetterFromDocName();
    if (!documentLetter) {
      console.log('✗ Could not extract document letter');
      setTimeout(init, 3000);
      return;
    }

    await scanExistingParts();
    startMonitoring();
  }

  function startMonitoring() {
    if (observerActive) return;

    const partList = document.querySelector('.part-list-container');
    if (!partList) {
      setTimeout(startMonitoring, 2000);
      return;
    }

    console.log('✓ Starting monitoring');
    observerActive = true;

    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.classList && node.classList.contains('os-list-item')) {
              shouldCheck = true;
            }
          });
        }
      });

      if (shouldCheck) {
        console.log('New part detected, checking...');
        setTimeout(checkForNewParts, 800);
      }
    });

    observer.observe(partList, {
      childList: true,
      subtree: true
    });

    setInterval(checkForNewParts, 4000);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      isEnabled = request.enabled;
      console.log('Extension toggled:', isEnabled ? 'ON' : 'OFF');
      sendResponse({ success: true });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 2000);
    });
  } else {
    setTimeout(init, 2000);
  }
})();
