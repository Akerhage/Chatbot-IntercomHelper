// create_project_package.js
// Ett verktyg för att samla alla nödvändiga projektfiler i en enda textfil
// för att enkelt kunna starta en ny, fullt informerad AI-konversation.

const fs = require('fs');
const path = require('path');

const FILES_TO_INCLUDE = [
    'PROJECT_STATUS.md',
    'server.js',
    'autotest.js',
    'package.json',
    'test-suite-am.json',
	'test-suite-stress.json',
	'test-suite-detailed.json',
	'test.html'
];

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
const OUTPUT_FILE = 'projektpaket.txt';

async function main() {
    console.log('--- Startar paketering av projektfiler ---');
    let combinedContent = '';

    // 1. Inkludera de specificerade filerna
    FILES_TO_INCLUDE.forEach(filename => {
        const filePath = path.join(__dirname, filename);
        if (fs.existsSync(filePath)) {
            console.log(`Lägger till: ${filename}`);
            combinedContent += `\n\n=== Innehåll från ${filename} ===\n\n`;
            combinedContent += fs.readFileSync(filePath, 'utf8');
        } else {
            console.warn(`VARNING: Filen ${filename} hittades inte och kommer inte att inkluderas.`);
        }
    });

    // 2. Inkludera alla filer från knowledge-mappen
    if (fs.existsSync(KNOWLEDGE_DIR)) {
        console.log(`\nLägger till alla filer från mappen 'knowledge'...`);
        const knowledgeFiles = fs.readdirSync(KNOWLEDGE_DIR);
        knowledgeFiles.forEach(filename => {
            if (filename.endsWith('.json')) {
                const filePath = path.join(KNOWLEDGE_DIR, filename);
                console.log(`- ${filename}`);
                combinedContent += `\n\n=== Innehåll från knowledge/${filename} ===\n\n`;
                combinedContent += fs.readFileSync(filePath, 'utf8');
            }
        });
    } else {
        console.warn(`VARNING: Mappen 'knowledge' hittades inte.`);
    }

    // 3. Skriv allt till output-filen
    fs.writeFileSync(OUTPUT_FILE, combinedContent, 'utf8');
    console.log(`\n--- Paketering klar! ---`);
    console.log(`Alla filer har samlats i: ${OUTPUT_FILE}`);

    // 4. Kopiera till urklipp
    try {
        const { default: clipboardy } = await import('clipboardy');
        clipboardy.writeSync(combinedContent);
        console.log('\n\x1b[32m%s\x1b[0m', 'Allt innehåll har även kopierats till ditt urklipp!');
    } catch (error) {
        console.log('\nKunde inte kopiera till urklipp. Du kan öppna ' + OUTPUT_FILE + ' manuellt och kopiera innehållet därifrån.');
    }
}

main();