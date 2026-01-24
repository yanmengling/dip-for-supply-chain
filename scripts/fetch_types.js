
const TOKEN = 'ory_at_eUV5LdKEBbhNINlTSLTlnVlApKMQo3zpYF4zzoK5vWk.hU03-W389ctdeEPcUC-DcbnwoTp6fZkni-vE7V88-Es';
const KN_ID = 'd56v1l69olk4bpa66uv0';
const BASE_URL = 'https://dip.aishu.cn/api/ontology-manager/v1';

async function listObjectTypes() {
    const url = `${BASE_URL}/knowledge-networks/${KN_ID}/object-types?limit=100`;
    console.log(`Fetching from: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'X-Knowledge-Network-Id': KN_ID,
                'Content-Type': 'application/json'
            }
        });

        console.log(`Response Status: ${response.status}`);

        if (!response.ok) {
            const text = await response.text();
            console.error(`HTTP Error: ${text}`);
            return;
        }

        const result = await response.json();
        const items = result.entries || result.data || [];

        console.log(`Found ${items.length} object types.`);
        const fs = require('fs');
        const path = require('path');
        const outFile = path.join(__dirname, 'types.json');

        fs.writeFileSync(outFile, JSON.stringify(items.map(ot => ({
            name: ot.name,
            id: ot.id,
            displayName: ot.displayName,
            moduleType: ot.module_type
        })), null, 2), 'utf-8');
        console.log(`Wrote ${items.length} items to ${outFile}`);

    } catch (error) {
        console.error('Network/Script Error:', error);
    }
}

listObjectTypes();
