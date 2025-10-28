document.addEventListener('DOMContentLoaded', async function() {
  const renameBtn = document.getElementById('renameBtn');
  const statusDiv = document.getElementById('status');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('onshape.com')) {
    statusDiv.className = 'error';
    statusDiv.textContent = '❌ Open an Onshape document first';
    renameBtn.disabled = true;
    return;
  }

  renameBtn.addEventListener('click', async function() {
    renameBtn.disabled = true;
    statusDiv.className = 'working';
    statusDiv.textContent = '⚡ Renaming...';

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fastRenameAllParts
      });

      const result = results[0].result;

      if (result.success) {
        statusDiv.className = 'success';
        statusDiv.textContent = `✓ Renamed ${result.count} parts instantly!`;
        setTimeout(() => renameBtn.disabled = false, 1000);
      } else {
        statusDiv.className = 'error';
        statusDiv.textContent = '❌ ' + result.error;
        renameBtn.disabled = false;
      }
    } catch (error) {
      statusDiv.className = 'error';
      statusDiv.textContent = '❌ ' + error.message;
      renameBtn.disabled = false;
    }
  });
});

// This function runs in the page context (injected)
function fastRenameAllParts() {
  console.log('⚡ Starting FAST rename...');

  try {
    // Extract document info
    const title = document.title;
    const match = title.match(/\d+-([A-Z])\d+-/i);

    if (!match) {
      return { success: false, error: 'Could not find letter in document name' };
    }

    const letter = match[1].toUpperCase();
    const urlMatch = window.location.pathname.match(/\/documents\/([^\/]+)/);
    const documentId = urlMatch ? urlMatch[1] : 'unknown';

    console.log('Document letter:', letter);

    // Find all part items
    const partList = document.querySelector('.part-list-container');
    if (!partList) {
      return { success: false, error: 'Part list not found' };
    }

    const partItems = Array.from(partList.querySelectorAll('.os-list-item'));
    const partsToRename = [];
    let maxExisting = 0;

    // First pass: find all parts and max number
    partItems.forEach(item => {
      const partIcon = item.querySelector('.os-part-list-icon');
      if (!partIcon) return;

      const nameEl = item.querySelector('.os-list-item-name');
      const nameLabel = item.querySelector('.os-list-item-label');
      if (!nameEl || !nameLabel) return;

      const currentName = nameEl.textContent.trim();

      // Check if already numbered
      const existingPattern = new RegExp(`^${letter}(\\d+)$`, 'i');
      const existingMatch = currentName.match(existingPattern);
      if (existingMatch) {
        const num = parseInt(existingMatch[1], 10);
        if (num > maxExisting) maxExisting = num;
        return;
      }

      // Check if needs renaming
      if (/^Part\s*\d+$/i.test(currentName)) {
        partsToRename.push({ item, nameEl, nameLabel, currentName });
      }
    });

    if (partsToRename.length === 0) {
      return { success: true, count: 0, message: 'No parts need renaming' };
    }

    console.log(`Found ${partsToRename.length} parts to rename, starting from ${maxExisting + 1}`);

    // Rename ALL parts in parallel
    let counter = maxExisting;
    const renamePromises = partsToRename.map((part, index) => {
      return new Promise((resolve) => {
        // Small stagger to avoid conflicts (5ms apart)
        setTimeout(() => {
          counter++;
          const newName = letter + String(counter).padStart(3, '0');
          console.log(`Renaming: ${part.currentName} → ${newName}`);

          // Click to select
          part.item.click();

          setTimeout(() => {
            // Right-click
            const rect = part.nameLabel.getBoundingClientRect();
            part.nameLabel.dispatchEvent(new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 2,
              clientX: rect.left + 10,
              clientY: rect.top + 10
            }));

            setTimeout(() => {
              // Find and click Rename
              const menuItems = document.querySelectorAll('[class*="menu"]');
              const renameOption = Array.from(menuItems).find(item =>
                item.textContent.trim() === 'Rename'
              );

              if (renameOption) {
                renameOption.click();

                setTimeout(() => {
                  // Type the name directly
                  document.execCommand('selectAll');
                  document.execCommand('insertText', false, newName);

                  // Press Enter
                  document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: 13,
                    bubbles: true
                  }));

                  resolve(true);
                }, 50);
              } else {
                resolve(false);
              }
            }, 50);
          }, 20);
        }, index * 5); // 5ms stagger between each rename
      });
    });

    // Wait for all renames to complete
    Promise.all(renamePromises).then(results => {
      const successCount = results.filter(r => r).length;
      console.log(`✓ Completed! ${successCount}/${partsToRename.length} renamed`);
    });

    // Save counter to storage
    const storageKey = `counter_${documentId}_${letter}`;
    chrome.storage.local.set({ [storageKey]: counter });

    return {
      success: true,
      count: partsToRename.length,
      letter: letter,
      finalCounter: counter
    };

  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: error.message };
  }
}

