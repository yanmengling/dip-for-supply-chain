
import { ontologyApi } from './src/api/ontologyApi';

async function listRelations() {
    try {
        console.log('Listing relation types...');
        const relations = await ontologyApi.getRelationTypes({ limit: 100 });
        console.log(`Found ${relations.entries.length} relations:`);
        relations.entries.forEach(r => {
            console.log(`- ${r.name} (ID: ${r.id})`);
            console.log(`  Source: ${r.source_object_type?.name} (${r.source_object_type_id})`);
            console.log(`  Target: ${r.target_object_type?.name} (${r.target_object_type_id})`);
            console.log('---');
        });
    } catch (err) {
        console.error('Error listing relations:', err);
    }
}

listRelations();
