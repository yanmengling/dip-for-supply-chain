
const https = require('https');

const TOKEN = 'ory_at_eUV5LdKEBbhNINlTSLTlnVlApKMQo3zpYF4zzoK5vWk.hU03-W389ctdeEPcUC-DcbnwoTp6fZkni-vE7V88-Es';
const KN_ID = 'd56v1l69olk4bpa66uv0';
const HOST = 'dip.aishu.cn';
const PATH = `/api/ontology-manager/v1/knowledge-networks/${KN_ID}/object-types?limit=100`;

const options = {
    hostname: HOST,
    port: 443,
    path: PATH,
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'X-Knowledge-Network-Id': KN_ID,
        'Content-Type': 'application/json'
    },
    rejectUnauthorized: false // equivalent to NODE_TLS_REJECT_UNAUTHORIZED='0'
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            if (res.statusCode !== 200) {
                console.log('Response:', data);
                return;
            }
            const result = JSON.parse(data);
            const items = result.entries || result.data || [];
            console.log(`Total Types: ${items.length}`);

            const suppliers = items.filter(ot => ot.name.includes('Supplier') || ot.name.includes('供应商'));
            const performance = items.filter(ot => ot.name.includes('Performance') || ot.name.includes('绩效') || ot.name.includes('Score'));
            const procurement = items.filter(ot => ot.name.includes('Procurement') || ot.name.includes('采购') || ot.name.includes('Purchase'));

            console.log('--- IDs Found ---');
            const fs = require('fs');

            // Write all types to file
            fs.writeFileSync('all_types.json', JSON.stringify(items.map(i => ({
                name: i.name,
                displayName: i.displayName,
                id: i.id
            })), null, 2));
            console.log('All types written to all_types.json');


        } catch (e) {
            console.error('Error parsing JSON:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
