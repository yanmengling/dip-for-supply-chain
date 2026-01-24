
const TOKEN = 'ory_at_eUV5LdKEBbhNINlTSLTlnVlApKMQo3zpYF4zzoK5vWk.hU03-W389ctdeEPcUC-DcbnwoTp6fZkni-vE7V88-Es';
const KN_ID = 'd56v1l69olk4bpa66uv0';
const BASE_URL = 'https://dip.aishu.cn/api/ontology-manager/v1';

async function listObjectTypes() {
    const url = `${BASE_URL}/object-types?limit=100`;
    console.log(`Fetching from: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'X-Knowledge-Network-Id': KN_ID,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText} - ${await response.text()}`);
        }

        const result = await response.json();
        const items = result.entries || result.data || []; // Adjust based on actual structure

        console.log(`Found ${items.length} object types.`);
        console.log('--- Object Types ---');
        items.forEach((ot: any) => {
            console.log(`Name: ${ot.name}, ID: ${ot.id}, DisplayName: ${ot.displayName || ot.name}`);
        });
        console.log('--------------------');

        // Helper to find specific ones
        const suppliers = items.filter((ot: any) => ot.name.toLowerCase().includes('supplier') || ot.name.includes('供应商'));
        const performance = items.filter((ot: any) =>
            ot.name.toLowerCase().includes('score') ||
            ot.name.toLowerCase().includes('performance') ||
            ot.name.includes('绩效')
        );
        const procurement = items.filter((ot: any) =>
            ot.name.toLowerCase().includes('procure') ||
            ot.name.toLowerCase().includes('purchase') ||
            ot.name.includes('采购')
        );

        console.log('\nPotential Suppliers:', suppliers.map((s: any) => `${s.name} (${s.id})`));
        console.log('Potential Performance:', performance.map((s: any) => `${s.name} (${s.id})`));
        console.log('Potential Procurement:', procurement.map((s: any) => `${s.name} (${s.id})`));

    } catch (error) {
        console.error('Error fetching object types:', error);
    }
}

listObjectTypes();
