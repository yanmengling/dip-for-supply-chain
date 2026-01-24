const https = require('https');

const TOKEN = 'ory_at_RptP9IxnbBwiDLS0fUIRgENs64QRRIBoxh2H4hWddWw.dhjGjSVAB_Wz0cyvomSiPQC4W5t-thOVoaCsuGividQ';
const DOMAIN = 'dip.aishu.cn';

async function checkView(viewId, name) {
    console.log(`Checking view ${name} (${viewId})...`);
    const API_PATH = `/api/mdl-uniquery/v1/mdl/dataview/metadata/${viewId}`;

    const options = {
        hostname: DOMAIN,
        port: 443,
        path: API_PATH,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        },
        rejectUnauthorized: false
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        console.log(`Fields for ${name}:`);
                        if (json.fields) {
                            json.fields.forEach(f => console.log(` - ${f.name} (${f.displayName})`));
                        } else {
                            console.log('No fields found', json);
                        }
                    } catch (e) {
                        console.log('Parse error', e.message);
                    }
                } else {
                    console.log(`Status ${res.statusCode} for ${name}`);
                }
                resolve();
            });
        });
        req.on('error', (e) => {
            console.log(`Error for ${name}: ${e.message}`);
            resolve();
        });
        req.end();
    });
}

async function run() {
    await checkView('2004376134629285892', 'BOM (Factories)');
    await checkView('2004376134625091585', 'Inventory (Warehouses)');
    await checkView('2004376134620897282', 'Products');
}

run();
