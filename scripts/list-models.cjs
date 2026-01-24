const https = require('https');

const API_PATH = '/api/mdl-uniquery/v1/mdl/model/list';
const TOKEN = 'ory_at_RptP9IxnbBwiDLS0fUIRgENs64QRRIBoxh2H4hWddWw.dhjGjSVAB_Wz0cyvomSiPQC4W5t-thOVoaCsuGividQ';
const DOMAIN = 'dip.aishu.cn';

async function listModels() {
    console.log(`Listing models on ${DOMAIN}...`);

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

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log(`Status: ${res.statusCode}`);
            try {
                const json = JSON.parse(data);
                if (json.data) {
                    console.log('Available models:');
                    json.data.forEach(m => console.log(` - ${m.id}: ${m.name} (${m.label || m.displayName})`));
                } else {
                    console.log('No data found in response');
                    console.log('Response:', data.substring(0, 500));
                }
            } catch (e) {
                console.log('Failed to parse JSON:', e.message);
                console.log('Raw data:', data.substring(0, 500));
            }
        });
    });

    req.on('error', (e) => console.error('Error:', e.message));
    req.end();
}

listModels();
