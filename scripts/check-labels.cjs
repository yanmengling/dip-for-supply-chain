const https = require('https');

const MODEL_ID = 'd58keb5g5lk40hvh48og';
const TOKEN = 'ory_at_RptP9IxnbBwiDLS0fUIRgENs64QRRIBoxh2H4hWddWw.dhjGjSVAB_Wz0cyvomSiPQC4W5t-thOVoaCsuGividQ';
const DOMAIN = 'dip.aishu.cn';

async function checkLabels() {
    console.log(`Checking fields for model ${MODEL_ID}...`);
    const path = `/api/mdl-uniquery/v1/metric-models/${MODEL_ID}/fields`;

    const options = {
        hostname: DOMAIN,
        port: 443,
        path: path,
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
            if (res.statusCode === 200) {
                try {
                    const json = JSON.parse(data);
                    console.log('Available Fields:');
                    if (json.data && Array.isArray(json.data)) {
                        json.data.forEach(f => {
                            console.log(` - ${f.name} (${f.display_name})`);
                        });
                    } else if (Array.isArray(json)) {
                        json.forEach(f => {
                            console.log(` - ${f.name || f} (${f.display_name || ''})`);
                        });
                    } else {
                        console.log(JSON.stringify(json, null, 2));
                    }
                } catch (e) {
                    console.log('Parse error:', e.message);
                }
            } else {
                console.log('Error body snippet:', data.substring(0, 500));
            }
        });
    });

    req.on('error', (e) => console.error('Request Error:', e.message));
    req.end();
}

checkLabels();
