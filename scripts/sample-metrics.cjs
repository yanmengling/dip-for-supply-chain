const https = require('https');

const MODEL_ID = 'd58keb5g5lk40hvh48og';
const TOKEN = 'ory_at_RptP9IxnbBwiDLS0fUIRgENs64QRRIBoxh2H4hWddWw.dhjGjSVAB_Wz0cyvomSiPQC4W5t-thOVoaCsuGividQ';
const DOMAIN = 'dip.aishu.cn';

async function sampleData() {
    console.log(`Sampling data for model ${MODEL_ID}...`);
    const API_PATH = `/api/mdl-uniquery/v1/mdl/model/query/${MODEL_ID}`;

    const body = JSON.stringify({
        instant: true,
        start: Date.now() - 365 * 24 * 60 * 60 * 1000,
        end: Date.now(),
        analysis_dimensions: ['item_id', 'item_name', 'inventory_data', 'available_quantity', 'quantity']
    });

    const options = {
        hostname: DOMAIN,
        port: 443,
        path: API_PATH,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
            'X-HTTP-Method-Override': 'GET'
        },
        rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log(`Status: ${res.statusCode}`);
            try {
                const json = JSON.parse(data);
                if (json.data && json.data.items) {
                    console.log(`Found ${json.data.items.length} items.`);
                    const sample = json.data.items.slice(0, 3);
                    sample.forEach((item, i) => {
                        console.log(`Item ${i}: value=${item.value}, labels=${JSON.stringify(item.labels)}`);
                    });
                } else {
                    console.log('No items found in data', json);
                }
            } catch (e) {
                console.log('Parse error', e.message);
                console.log('Raw response snippet:', data.substring(0, 500));
            }
        });
    });

    req.on('error', (e) => console.error('Error:', e.message));
    req.write(body);
    req.end();
}

sampleData();
