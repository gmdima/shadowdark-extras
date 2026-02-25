import { generateDungeonHtml } from './scripts/DungeonGenerator.mjs';
import fs from 'fs';

// Mock foundry globals for the test
global.game = {
    packs: {
        get: () => ({
            getIndex: async () => ([])
        })
    }
};

global.ui = { notifications: { error: console.error } };

global.FilePicker = {
    createDirectory: async () => true,
    upload: async (source, target, file) => {
        throw new Error("Mock upload failed");
    }
};

global.fetch = async (url) => {
    // Mock fetch by reading the local data file directly
    const dataFolder = url.replace('modules/shadowdark-extras/', '');
    const path = `./${dataFolder}`;
    const content = fs.readFileSync(path, 'utf8');
    return {
        ok: true,
        json: async () => JSON.parse(content)
    };
};

async function testWells() {
    console.log("Generating dummy dungeons to find a well...");
    let wellCount = 0;
    const iters = 20;

    for (let i = 0; i < iters; i++) {
        const result = await generateDungeonHtml("dungeon", "medium", "12.3", "12_3");
        if (result.html.includes("<h3>Well</h3>")) {
            wellCount++;
        }
    }

    console.log(`Found ${wellCount} wells out of ${iters} generated dungeons (Expected ~10).`);

    let wellInTomb = false;
    for (let i = 0; i < 10; i++) {
        const result = await generateDungeonHtml("tomb", "medium", "12.3", "12_3");
        if (result.html.includes("<h3>Well</h3>")) {
            wellInTomb = true;
        }
    }
    console.log(`Found well in tomb? ${wellInTomb} (Expected false).`);
}

testWells().catch(console.error);
