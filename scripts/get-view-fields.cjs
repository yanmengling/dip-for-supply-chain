const https = require('https');

const MODEL_ID = 'd58keb5g5lk40hvh48og';
const TOKEN = 'ory_at_RptP9IxnbBwiDLS0fUIRgENs64QRRIBoxh2H4hWddWw.dhjGjSVAB_Wz0cyvomSiPQC4W5t-thOVoaCsuGividQ';
const DOMAIN = 'dip.aishu.cn';

async function request(path, method = 'GET', body = null) {
    const options = {
        hostname: DOMAIN,
        port: 443,
        path: path,
        method: method,
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        },
        rejectUnauthorized: false
    };

    if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', (e) => resolve({ status: 500, error: e.message }));
        if (body) req.write(body);
        req.end();
    });
}

async function run() {
    console.log(`Listing all models via /metric-models...`);
    const listRes = await request(`/api/mdl-uniquery/v1/metric-models`);

    if (listRes.status !== 200) {
        console.log(`Status ${listRes.status} for model list`);
        return;
    }

    try {
        const json = JSON.parse(listRes.data);
        const models = Array.isArray(json) ? json : (json.data || []);
        console.log(`Found ${models.length} models in total.`);

        const targetModel = models.find(m => m.id === MODEL_ID || m.name?.includes('库存'));
        if (targetModel) {
            console.log('Found model:', JSON.stringify(targetModel, null, 2));
            const viewId = targetModel.data_view_id;
            if (viewId) {
                console.log(`Fetching metadata for data view ${viewId}...`);
                const viewRes = await request(`/api/mdl-uniquery/v1/mdl/dataview/metadata/${viewId}`);
                if (viewRes.status === 200) {
                    const viewJson = JSON.parse(viewRes.data);
                    console.log('Fields in Data View:');
                    if (viewJson.fields) {
                        viewJson.fields.forEach(f => {
                            console.log(` - ${f.name} (${f.displayName})`);
                        });
                    }
                } else {
                    console.log(`Status ${viewRes.status} for view metadata`);
                }
            }
        } else {
            console.log(`Model ${MODEL_ID} not found in list.`);
            console.log('Sample model names:', models.slice(0, 5).map(m => m.name));
        }
    } catch (e) {
        console.log('Failed to parse list:', e.message);
    }
}

run();
