const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const ACCESS_KEY = process.env.ONSHAPE_ACCESS_KEY;
const SECRET_KEY = process.env.ONSHAPE_SECRET_KEY;
const BASE_URL = process.env.ONSHAPE_BASE_URL;

// Storage for counters (document_id -> counter)
const counters = {};

// Build authentication headers
function buildHeaders(method, path, queryString = '', body = '') {
  const date = new Date().toUTCString();
  const onNonce = crypto.randomBytes(16).toString('base64');

  const hmacString = [
    method.toLowerCase(),
    onNonce,
    date,
    'application/json',
    path,
    queryString,
    body
  ].join('\n');

  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(hmacString);
  const signature = hmac.digest('base64');

  const auth = `On ${ACCESS_KEY}:HmacSHA256:${signature}`;

  return {
    'Authorization': auth,
    'Date': date,
    'On-Nonce': onNonce,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

// Make authenticated API request
async function apiRequest(method, path, data = null) {
  const url = `${BASE_URL}${path}`;
  const queryString = '';
  const body = data ? JSON.stringify(data) : '';

  const headers = buildHeaders(method, path, queryString, body);

  try {
    const response = await axios({
      method,
      url,
      headers,
      data
    });
    return response.data;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Extract letter from document name
function extractLetter(docName) {
  const match = docName.match(/\d+-([A-Z])\d+-/i);
  return match ? match[1].toUpperCase() : null;
}

// Get counter for document
function getCounter(documentId, letter) {
  const key = `${documentId}_${letter}`;
  if (!counters[key]) {
    counters[key] = 0;
  }
  return counters[key];
}

// Increment counter
function incrementCounter(documentId, letter) {
  const key = `${documentId}_${letter}`;
  counters[key] = getCounter(documentId, letter) + 1;
  return counters[key];
}

// Get all parts in a part studio
async function getPartsInPartStudio(documentId, workspaceId, elementId) {
  const path = `/api/parts/d/${documentId}/w/${workspaceId}/e/${elementId}`;
  return await apiRequest('GET', path);
}

// Rename a part
async function renamePart(documentId, workspaceId, elementId, partId, newName) {
  const path = `/api/parts/d/${documentId}/w/${workspaceId}/e/${elementId}/partid/${partId}/metadata`;

  const data = {
    properties: [{
      propertyId: 'name',
      value: newName
    }]
  };

  return await apiRequest('POST', path, data);
}

// Scan document and rename parts
async function scanAndRenameDocument(documentId) {
  try {
    console.log(`\n=== Scanning Document: ${documentId} ===`);

    // Get document info
    const docPath = `/api/documents/${documentId}`;
    const docInfo = await apiRequest('GET', docPath);

    console.log(`Document name: ${docInfo.name}`);

    const letter = extractLetter(docInfo.name);
    if (!letter) {
      console.log('❌ Could not extract letter from document name');
      console.log('Document name should follow pattern: XXXX-L000-name (e.g., 3990-C000-intake)');
      return;
    }

    console.log(`✓ Detected letter: ${letter}`);

    // Get default workspace
    const workspaceId = docInfo.defaultWorkspace.id;

    // Get all elements (Part Studios, Assemblies, etc.)
    const elementsPath = `/api/documents/d/${documentId}/w/${workspaceId}/elements`;
    const elements = await apiRequest('GET', elementsPath);

    // Filter for Part Studios
    const partStudios = elements.filter(el => el.elementType === 'PARTSTUDIO');
    console.log(`Found ${partStudios.length} Part Studios`);

    // Scan all Part Studios to find highest part number
    let maxNum = 0;
    for (const ps of partStudios) {
      const parts = await getPartsInPartStudio(documentId, workspaceId, ps.id);

      for (const part of parts) {
        const pattern = new RegExp(`^${letter}(\\d+)$`, 'i');
        const match = part.name.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }

    counters[`${documentId}_${letter}`] = maxNum;
    console.log(`Counter initialized to: ${maxNum}`);

    // Now rename parts that need renaming
    let renamedCount = 0;
    for (const ps of partStudios) {
      console.log(`\nChecking Part Studio: ${ps.name}`);
      const parts = await getPartsInPartStudio(documentId, workspaceId, ps.id);

      for (const part of parts) {
        // Check if it's a default name
        if (/^Part\s*\d+$/i.test(part.name)) {
          const newNum = incrementCounter(documentId, letter);
          const newName = `${letter}${String(newNum).padStart(3, '0')}`;

          console.log(`  Renaming: "${part.name}" → "${newName}"`);

          try {
            await renamePart(documentId, workspaceId, ps.id, part.partId, newName);
            console.log(`  ✓ Successfully renamed to ${newName}`);
            renamedCount++;
          } catch (error) {
            console.log(`  ✗ Failed to rename: ${error.message}`);
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    console.log(`\n✓ Complete! Renamed ${renamedCount} parts.`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Main function
async function main() {
  console.log('=== Onshape Part Auto-Renamer v1.0 ===\n');

  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error('❌ Error: API keys not found!');
    console.error('Make sure you have created a .env file with your keys.');
    return;
  }

  // Get document ID from command line or prompt
  const documentId = process.argv[2];

  if (!documentId) {
    console.log('Usage: node index.js <document_id>');
    console.log('\nTo get the document ID:');
    console.log('1. Open your Onshape document');
    console.log('2. Look at the URL: https://...onshape.com/documents/DOCUMENT_ID/...');
    console.log('3. Copy the DOCUMENT_ID part');
    console.log('\nExample: node index.js 92bf7d28316ba3f29ddfb4d4');
    return;
  }

  await scanAndRenameDocument(documentId);
}

main();
