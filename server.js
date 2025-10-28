const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 49157;
const ACCESS_KEY = process.env.ONSHAPE_ACCESS_KEY;
const SECRET_KEY = process.env.ONSHAPE_SECRET_KEY;
    const BASE_URL = process.env.ONSHAPE_BASE_URL || 'https://cad.onshape.com';

// In-memory counter storage (document_id -> counter)
const counters = {};

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'Onshape Auto-Renamer',
        version: '1.0'
    });
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    console.log('📥 Webhook received:', new Date().toISOString());
    console.log('Event:', req.body.event);

    // Respond immediately to Onshape
    res.status(200).send('OK');

    try {
        const event = req.body;

        // Check if this is a part creation event
        if (event.event === 'onshape.model.lifecycle.changed' ||
            event.event === 'onshape.part.add') {

            const documentId = event.documentId;
            const workspaceId = event.workspaceId;
            const elementId = event.elementId;

            console.log(`📋 Document: ${documentId}`);
            console.log(`📁 Workspace: ${workspaceId}`);
            console.log(`🔧 Element: ${elementId}`);

            // Wait a moment for Onshape to finish creating the part
            await sleep(2000);

            await processDocument(documentId, workspaceId, elementId);
        } else {
            console.log('ℹ️  Event type not relevant, skipping');
        }
    } catch (error) {
        console.error('❌ Error processing webhook:', error.message);
    }
});

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
        console.error(`API Error: ${method} ${path}`, error.response?.data || error.message);
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

// Process document and rename parts
async function processDocument(documentId, workspaceId, elementId) {
    try {
        console.log('🔍 Getting document info...');

        // Get document info
        const docPath = `/api/documents/${documentId}`;
        const docInfo = await apiRequest('GET', docPath);
        const docName = docInfo.name || '';

        console.log(`📄 Document name: ${docName}`);

        // Extract letter
        const letter = extractLetter(docName);
        if (!letter) {
            console.log('⚠️  Could not extract letter from document name');
            return;
        }

        console.log(`🔤 Letter: ${letter}`);

        // Initialize counter if not exists
        const counterKey = `${documentId}_${letter}`;
        if (!counters[counterKey]) {
            // Scan existing parts to find max number
            console.log('🔢 Initializing counter...');

            const elementsPath = `/api/documents/d/${documentId}/w/${workspaceId}/elements`;
            const elements = await apiRequest('GET', elementsPath);
            const partStudios = elements.filter(el => el.elementType === 'PARTSTUDIO');

            let maxNum = 0;
            for (const ps of partStudios) {
                const partsPath = `/api/parts/d/${documentId}/w/${workspaceId}/e/${ps.id}`;
                try {
                    const parts = await apiRequest('GET', partsPath);

                    for (const part of parts) {
                        const pattern = new RegExp(`^${letter}(\\d+)$`, 'i');
                        const match = part.name.match(pattern);
                        if (match) {
                            const num = parseInt(match[1], 10);
                            if (num > maxNum) maxNum = num;
                        }
                    }
                } catch (e) {
                    // Skip if can't get parts
                }
            }

            counters[counterKey] = maxNum;
            console.log(`✓ Counter initialized to: ${maxNum}`);
        }

        // Get parts in the specific element
        const partsPath = `/api/parts/d/${documentId}/w/${workspaceId}/e/${elementId}`;
        const parts = await apiRequest('GET', partsPath);

        console.log(`📦 Found ${parts.length} parts in element`);

        // Find parts that need renaming
        for (const part of parts) {
            if (/^Part\s*\d+$/i.test(part.name)) {
                const newNum = incrementCounter(documentId, letter);
                const newName = `${letter}${String(newNum).padStart(3, '0')}`;

                console.log(`✏️  Renaming: "${part.name}" → "${newName}"`);

                try {
                    await renamePart(documentId, workspaceId, elementId, part.partId, newName);
                    console.log(`✅ Successfully renamed to ${newName}`);
                } catch (error) {
                    console.log(`❌ Failed to rename: ${error.message}`);
                }

                await sleep(500);
            }
        }

    } catch (error) {
        console.error('❌ Error processing document:', error.message);
    }
}

// Helper: sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Start server
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 Onshape Auto-Renamer Server Started');
    console.log('='.repeat(50));
    console.log(`📡 Listening on port: ${PORT}`);
    console.log(`🔗 Webhook URL: http://YOUR_PUBLIC_IP:${PORT}/webhook`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(50) + '\n');
    console.log('✓ Ready to receive webhooks from Onshape\n');
});
