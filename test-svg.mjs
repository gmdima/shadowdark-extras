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
        // Force failure so we get the base64 string for testing
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

async function testSVG() {
    console.log("Generating dummy dungeon...");
    const result = await generateDungeonHtml("dungeon", "medium", "12.3", "12_3");
    console.log("HTML Output length:", result.html.length);

    // Extract the Base64 SVG from the fallback or File path if possible
    const match = result.html.match(/src="data:image\/svg\+xml;base64,(.*?)"/);
    if (match) {
        const svgContent = decodeURIComponent(escape(atob(match[1])));
        fs.writeFileSync('test-dungeon-output.svg', svgContent);
        console.log("Wrote test-dungeon-output.svg to disk for review.");
    } else {
        console.log("No base64 SVG found in layout! Did FilePicker mock succeed instead?");
        // Look for the mock path
        const pathMatch = result.html.match(/src="data\/hexlocations\/(.*?)"/);
        if (pathMatch) {
            console.log("Found path:", pathMatch[0]);
        }
    }
}

testSVG().catch(console.error);
