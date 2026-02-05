/**
 * Script to check if product_bom logical property exists
 * This can be run directly in Node.js or in the browser console
 */

// For Node.js environment
const fetch = require('node-fetch');

// Configuration
const ONTOLOGY_BASE_URL = '/api/ontology-manager/v1';
const KN_ID = 'd56v1l69olk4bpa66uv0'; // DIP供应链业务知识网络
const PRODUCT_OBJECT_TYPE_ID = 'supplychain_hd0202_product';

async function checkProductBomLogicProperty() {
    try {
        console.log('='.repeat(80));
        console.log('Checking for product_bom logical property...');
        console.log('='.repeat(80));

        // Construct URL to get product object type with details
        const url = `${ONTOLOGY_BASE_URL}/knowledge-networks/${KN_ID}/object-types/${PRODUCT_OBJECT_TYPE_ID}?include_detail=true`;

        console.log(`\nQuerying: ${url}\n`);

        // Note: In a real environment, you would need proper authentication headers
        // For now, this is a template that shows the structure

        console.log('Expected Response Structure:');
        console.log('{');
        console.log('  id: "supplychain_hd0202_product",');
        console.log('  name: "产品",');
        console.log('  logic_properties: [');
        console.log('    {');
        console.log('      name: "product_bom",  // <-- Looking for this');
        console.log('      display_name: "产品BOM",');
        console.log('      type: "relation" | "data_view" | "metric" | "operator",');
        console.log('      data_source: {');
        console.log('        type: "...",');
        console.log('        id: "..."');
        console.log('      },');
        console.log('      parameters: [...]');
        console.log('    }');
        console.log('  ]');
        console.log('}');
        console.log('');

        console.log('='.repeat(80));
        console.log('MANUAL VERIFICATION REQUIRED');
        console.log('='.repeat(80));
        console.log('');
        console.log('Please manually check the ontology configuration by:');
        console.log('');
        console.log('Option 1: Using Browser DevTools');
        console.log('  1. Open http://localhost:5173 in your browser');
        console.log('  2. Open DevTools Console (F12)');
        console.log('  3. Run the following code:');
        console.log('');
        console.log('     import("./src/api/ontologyApi.js").then(async ({ ontologyApi }) => {');
        console.log('       const obj = await ontologyApi.getObjectType("supplychain_hd0202_product", true);');
        console.log('       console.log("Logic Properties:", obj.logic_properties);');
        console.log('       const bom = obj.logic_properties?.find(lp => lp.name === "product_bom");');
        console.log('       console.log("product_bom found:", !!bom);');
        console.log('       if (bom) console.log("Config:", JSON.stringify(bom, null, 2));');
        console.log('     });');
        console.log('');
        console.log('Option 2: Using API Configuration UI');
        console.log('  1. Navigate to the Configuration page in SupplyChainBrain');
        console.log('  2. Check the Ontology Object configuration for "product"');
        console.log('  3. Look for logic_properties section');
        console.log('');
        console.log('Option 3: Direct API Call');
        console.log('  Use curl or Postman to call:');
        console.log(`  GET ${url}`);
        console.log('  With proper authentication headers');
        console.log('');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('Error:', error);
    }
}

// Run the check
checkProductBomLogicProperty();
