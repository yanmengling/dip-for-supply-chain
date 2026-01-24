const https = require('https');

const API_PATH = '/api/mdl-uniquery/v1/mdl/model/metadata/d58keb5g5lk40hvh48og';
const TOKEN = 'ory_at_RptP9IxnbBwiDLS0fUIRgENs64QRRIBoxh2H4hWddWw.dhjGjSVAB_Wz0cyvomSiPQC4W5t-thOVoaCsuGividQ';
const DOMAIN = 'dip.aishu.cn';

async function checkModel() {
    console.log(`Checking model d58keb5g5lk40hvh48og on ${DOMAIN}...`);

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
                if (json.analysis_dimensions) {
                    console.log('Available dimensions:');
                    json.analysis_dimensions.forEach(d => console.log(` - ${d.name} (${d.label})`));
                } else {
                    console.log('No analysis_dimensions found in response');
                    console.log('Response:', data);
                }
            } catch (e) {
                console.log('Failed to parse JSON:', e.message);
                console.log('Raw data:', data);
            }
        });
    });

    req.on('error', (e) => console.error('Error:', e.message));
    req.end();
}

checkModel();
