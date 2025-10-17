// Title: autotest.js
// Version: 3.8.0 - Fixed undefined errors
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

let clipboardy;
try {
  clipboardy = require('clipboardy');
  console.log('✅ clipboardy-modulen laddades korrekt');
} catch (e) {
  console.warn('⚠️ clipboardy-modulen kunde inte laddas:', e.message);
}

// Parse command line arguments
const args = process.argv.slice(2);
const suiteArg = args.find(arg => arg.startsWith('--suite='));
const portArg = args.find(arg => arg.startsWith('--port='));

const PORT = portArg ? parseInt(portArg.split('=')[1]) : 3000;
const BASE_URL = `http://localhost:${PORT}`;

const TEST_SUITES = {
  am: './test-suite-am.json',
  stress: './test-suite-stress.json'
};

async function runTestSuite(suiteName, testFile) {
  const suiteStartTime = Date.now();
  console.log(`\n--- STARTAR AUTOMATISK TEST-SVIT (v3.8.0) [${new Date().toISOString()}] ---`);
  console.log(`Vald test-svit: ${suiteName} (${testFile})`);
  console.log(`Server: ${BASE_URL}`);
  
  const fails = [];
  let passCount = 0;

  try {
    // Kontrollera att servern är online
    console.log('Kontrollerar server...');
    const healthResponse = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    if (healthResponse.status !== 200 || healthResponse.data.status !== 'OK') {
      console.error('❌ Servern svarar inte korrekt.');
      return fails;
    }
    console.log(`✅ Servern är online (version: ${healthResponse.data.version || 'okänd'})`);
    
    // Läs testfilen
    const testData = JSON.parse(await fs.readFile(testFile, 'utf8'));
    const tests = testData.tests;
    
    if (!tests || tests.length === 0) {
      console.error('❌ Inga tester hittades i testfilen!');
      return fails;
    }
    
    console.log(`Startar ${tests.length} tester...\n`);
    
    // Kör varje test
    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      console.log(`--- Test ${i + 1}/${tests.length} - ${suiteName} ---`);
      console.log(`Fråga: "${test.question}"`);
      
      try {
        // Anropa rätt endpoint med rätt format
        const res = await axios.post(
          `${BASE_URL}/search_all`, 
          { query: test.question },
          { timeout: 30000 }
        );
        
        // KRITISK FIX: Säker hantering av response
        const answer = res.data?.answer || res.data?.message || JSON.stringify(res.data);
        
        // KRITISK FIX: Kontrollera att expected_keywords existerar och är en array
        const expectedKeywords = Array.isArray(test.expected_keywords) ? test.expected_keywords : [];
        
        if (expectedKeywords.length === 0) {
          console.log('  [SKIP] ⚠️ Inga förväntade nyckelord definierade');
          continue;
        }
        
        // Kontrollera keywords (case-insensitive)
        const missingKeywords = expectedKeywords.filter(kw => {
          const normalizedKeyword = String(kw).toLowerCase().replace(/\s+/g, ' ').trim();
          const normalizedAnswer = String(answer).toLowerCase().replace(/\s+/g, ' ').trim();
          return !normalizedAnswer.includes(normalizedKeyword);
        });
        
        if (missingKeywords.length === 0) {
          console.log('  [PASS] ✅');
          passCount++;
        } else {
          console.log('  [FAIL] ❌');
          console.log(`    --> Saknade nyckelord: [${missingKeywords.join(', ')}]`);
          console.log(`    --> Fick svar: "${answer.slice(0, 200)}${answer.length > 200 ? '...' : ''}"`);
          fails.push({
            testNumber: i + 1,
            suite: suiteName,
            question: test.question,
            answer,
            missingKeywords,
            expectedKeywords
          });
        }
      } catch (e) {
        console.error(`  [ERROR] ❌ ${e.message}`);
        if (e.response) {
          console.error(`    HTTP Status: ${e.response.status}`);
          console.error(`    Response: ${JSON.stringify(e.response.data)}`);
        }
        
        // KRITISK FIX: Säker hantering av expected_keywords även vid fel
        const expectedKeywords = Array.isArray(test.expected_keywords) ? test.expected_keywords : [];
        
        fails.push({
          testNumber: i + 1,
          suite: suiteName,
          question: test.question,
          answer: `Testfel: ${e.message}`,
          missingKeywords: expectedKeywords,
          expectedKeywords,
          error: e.message
        });
      }
    }
    
    const duration = ((Date.now() - suiteStartTime) / 1000).toFixed(2);
    console.log(`\n--- TESTER AVSLUTADE ---`);
    console.log(`Resultat: ${passCount} / ${tests.length} godkända (${((passCount/tests.length)*100).toFixed(1)}%)`);
    console.log(`Total tid: ${duration} sekunder`);
    
    return fails;
  } catch (e) {
    console.error(`🔥 Fel vid körning av test-svit ${suiteName}: ${e.message}`);
    if (e.code === 'ECONNREFUSED') {
      console.error(`   Servern körs inte på ${BASE_URL}. Starta servern först!`);
    }
    return fails;
  }
}

async function main() {
  const startTime = Date.now();
  let allFails = [];
  
  // Bestäm vilka sviter som ska köras
  const suitesToRun = suiteArg 
    ? { [suiteArg.split('=')[1]]: TEST_SUITES[suiteArg.split('=')[1]] }
    : TEST_SUITES;
  
  // Kontrollera att sviter finns
  for (const [name, file] of Object.entries(suitesToRun)) {
    if (!file) {
      console.error(`❌ Okänd test-svit: ${name}`);
      process.exit(1);
    }
    try {
      await fs.access(file);
    } catch (e) {
      console.error(`❌ Testfil saknas: ${file}`);
      process.exit(1);
    }
  }
  
  // Kör testsviterna
  for (const [suiteName, testFile] of Object.entries(suitesToRun)) {
    const fails = await runTestSuite(suiteName, testFile);
    allFails = allFails.concat(fails);
  }
  
  // Sammanställ resultat
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SLUTRESULTAT - Total tid: ${totalDuration} sekunder`);
  console.log(`${'='.repeat(60)}`);
  
  if (allFails.length > 0) {
    console.log(`❌ ${allFails.length} test(er) misslyckades\n`);
    
    let logContent = `--- TEST FAILS [${new Date().toISOString()}] ---\n`;
    logContent += `Port: ${PORT}\n`;
    logContent += `Total tid: ${totalDuration} sekunder\n\n`;
    
    // KRITISK FIX: Säker iteration över fails
    allFails.forEach(fail => {
      if (!fail) return; // Hoppa över undefined items
      
      logContent += `--- Test ${fail.testNumber}/test-suite-${fail.suite}.json - ${fail.suite} ---\n`;
      logContent += `Fråga: "${fail.question || 'N/A'}"\n`;
      logContent += `  [FAIL]\n`;
      logContent += `    --> Fick svar: "${fail.answer || 'N/A'}"\n`;
      
      // KRITISK FIX: Säker hantering av missingKeywords
      const missingKw = Array.isArray(fail.missingKeywords) ? fail.missingKeywords : [];
      logContent += `    --> Saknade nyckelord: [${missingKw.join(', ')}]\n`;
      
      if (fail.error) {
        logContent += `    --> Fel: ${fail.error}\n`;
      }
      logContent += '\n';
    });
    
    await fs.writeFile('test_fails.log', logContent);
    console.log('📝 Fails loggade till test_fails.log');
    
    if (clipboardy && typeof clipboardy.default === 'function') {
      try {
        await clipboardy.default.write(logContent);
        console.log('📋 Fails kopierade till urklipp');
      } catch (e) {
        console.warn('⚠️ Kunde inte kopiera till urklipp:', e.message);
      }
    }
  } else {
    console.log('✅ Alla tester godkända! 🎉\n');
    
    const successMsg = `Alla tester godkända! [${new Date().toISOString()}]`;
    await fs.writeFile('test_fails.log', successMsg);
    
    if (clipboardy && typeof clipboardy.default === 'function') {
      try {
        await clipboardy.default.write(successMsg);
        console.log('📋 Resultat kopierat till urklipp');
      } catch (e) {
        console.warn('⚠️ Kunde inte kopiera till urklipp:', e.message);
      }
    }
  }
  
  process.exit(allFails.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('🔥 Kritiskt fel:', e.message);
  console.error(e.stack);
  process.exit(1);
});