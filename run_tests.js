const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.7'; // Fixad version
console.log(`Kör run_tests.js version ${VERSION}`);

let clipboardy;
try {
  clipboardy = require('clipboardy');
  console.log(`✅ clipboardy-modulen laddades korrekt`);
} catch (e) {
  console.log('Installerar clipboardy@4.0.0...');
  try {
    execSync('npm install clipboardy@4.0.0', { stdio: 'inherit' });
    clipboardy = require('clipboardy');
    console.log(`✅ clipboardy@4.0.0 installerad`);
  } catch (installError) {
    console.error(`🔥 Fel vid installation av clipboardy: ${installError.message}`);
    process.exit(1);
  }
}

const LOG_FILE = path.join(__dirname, 'test_results.log');
let SERVER_PORT = 3000;

function runCommand(command, description) {
  console.log(`Kör ${description}...`);
  try {
    const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
    return { success: true, output };
  } catch (error) {
    return { success: false, output: error.stderr || error.message };
  }
}

async function checkPort(port) {
  console.log(`Kontrollerar port ${port}...`);
  try {
    const psCommand = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`;
    const netstatOutput = execSync(psCommand, { encoding: 'utf8' });
    const pids = netstatOutput
      .split('\n')
      .map(pid => pid.trim())
      .filter(pid => pid && !isNaN(pid));
    if (pids.length > 0) {
      console.log(`Port ${port} är upptagen, avslutar processer (PID: ${pids.join(', ')})...`);
      pids.forEach(pid => {
        try {
          execSync(`powershell -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
          console.log(`Avslutade PID ${pid}`);
        } catch (e) {
          console.warn(`⚠️ Kunde inte avsluta PID ${pid}: ${e.message}`);
        }
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
      return checkPort(port); // Rekursiv kontroll
    }
    console.log(`Port ${port} är ledig.`);
    return true;
  } catch (e) {
    console.log(`Port ${port} är ledig eller kontroll misslyckades: ${e.message}`);
    return true;
  }
}

async function checkServerHealth(port) {
  console.log(`Kontrollerar serverhälsa på http://localhost:${port}/health...`);
  try {
    const result = runCommand(`curl http://localhost:${port}/health`, 'Serverhälsokontroll');
    if (result.success && result.output.includes('OK')) {
      console.log(`✅ Servern är redo på port ${port}`);
      return true;
    }
    console.warn(`⚠️ Serverhälsa ej bekräftad: ${result.output}`);
    return false;
  } catch (e) {
    console.warn(`⚠️ Hälsokontroll misslyckades: ${e.message}`);
    return false;
  }
}

async function runTests() {
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
  }

  // Kontrollera och frigör port 3000
  await checkPort(SERVER_PORT);

  console.log('Startar server.js...');
  let serverProcess = spawn('node', ['server.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'], 
    cwd: __dirname, 
    env: { ...process.env, PORT: SERVER_PORT } 
  });
  
  let serverLogs = '';

  serverProcess.stdout.on('data', (data) => {
    serverLogs += data.toString();
  });
  serverProcess.stderr.on('data', (data) => {
    serverLogs += data.toString();
  });

  // Vänta på serverstart
  console.log('Väntar 15 sekunder på serverstart...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Kontrollera serverhälsa
  let serverReady = await checkServerHealth(SERVER_PORT);
  if (!serverReady && SERVER_PORT === 3000) {
    console.log(`Försöker fallback-port 3001...`);
    serverProcess.kill();
    SERVER_PORT = 3001;
    await checkPort(SERVER_PORT);
    
    serverProcess = spawn('node', ['server.js'], { 
      stdio: ['ignore', 'pipe', 'pipe'], 
      cwd: __dirname, 
      env: { ...process.env, PORT: SERVER_PORT } 
    });
    
    serverProcess.stdout.on('data', (data) => { serverLogs += data.toString(); });
    serverProcess.stderr.on('data', (data) => { serverLogs += data.toString(); });
    
    await new Promise(resolve => setTimeout(resolve, 15000));
    serverReady = await checkServerHealth(SERVER_PORT);
    
    if (!serverReady) {
      console.error('🔥 Servern kunde inte starta på någon port');
      fs.appendFileSync(LOG_FILE, '\n=== Körningsfel ===\nServern kunde inte starta\n\n=== Serverloggar ===\n' + serverLogs);
      serverProcess.kill();
      process.exit(1);
    }
  }

  console.log(`✅ Servern kör på port ${SERVER_PORT}`);

  // Testförfrågningar
  const testQueries = [
    { query: "Vad kostar AM-kursen?", desc: "Fråga 1 (AM) - Pris" },
    { query: "Vad ingår i en am-kurs?", desc: "Fråga 3 (AM) - Innehåll" },
    { query: "Vad är åldersgränsen för AM-kurs?", desc: "Fråga 6 (AM) - Åldersgräns" },
    { query: "Hej jag funderar på att anmäla min son till er AM-kurs nästa vecka, men kan inte riktigt se när tiderna är? Är det bara ett teoritillfälle man skall gå? Kan du berätta lite vad som ingår i kursen och vad kostar den? Vi bor i Mölndal, är lektionerna under skoltid för Alfons har ju skola på dagarna?", desc: "Fråga 10 (AM) - Mölndal" },
    { query: "Är 4499kr allt man måste betala, ingår allt då? Finns det kläder och moppe där?", desc: "Fråga 11 (AM) - Inkluderat" },
    { query: "Vad kostar kursen?", desc: "Fråga 3 (Stress) - Pris" },
    { query: "Kan jag boka AM och bilkörlektion i Helsingborg?", desc: "Fråga 4 (Stress) - Helsingborg" },
    { query: "Vad ingår i moppekursen i Lund och när är tiderna?", desc: "Fråga 5 (Stress) - Lund" },
    { query: "Vad kostar AM-kurs i Kiruna?", desc: "Fråga 8 (Stress) - Kiruna" },
    { query: "Jag vill veta allt om AM-kurs i Göteborg, inklusive pris, innehåll, tider, kvällstider, helgtider, ålderskrav, och om jag kan boka en bilkörlektion samtidigt, samt hur jag bokar och vad som krävs för att få körkortstillstånd, och om ni har kurser i Mölndal eller Mölnlycke.", desc: "Fråga 13 (Stress) - Göteborg" }
  ];

  const queryResults = [];
  for (const { query, desc } of testQueries) {
    const escapedQuery = JSON.stringify({ query }).replace(/"/g, '\\"');
    const result = runCommand(
      `curl -X POST http://localhost:${SERVER_PORT}/search_all -H "Content-Type: application/json" -d "${escapedQuery}"`,
      desc
    );
    queryResults.push(result);
  }

  // Kör testsviterna - SERVERN ÄR FORTFARANDE IGÅNG HÄR!
  console.log('\n=== Kör AM-testsvit ===');
  const amTest = runCommand(`node autotest.js --suite=am --port=${SERVER_PORT}`, 'AM-testsvit');
  
  console.log('\n=== Kör Stress-testsvit ===');
  const stressTest = runCommand(`node autotest.js --suite=stress --port=${SERVER_PORT}`, 'Stress-testsvit');

  // NU stänger vi servern - EFTER att alla tester är klara
  console.log('\nStänger av servern...');
  serverProcess.kill();
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('✅ Server stoppad.');

  const logContent = `
=== run_tests.js Version ===
${VERSION}

=== Server kördes på port ===
${SERVER_PORT}

=== AM-Testsvit ===
${amTest.success ? amTest.output : `Fel: ${amTest.output}`}

=== Stress-Testsvit ===
${stressTest.success ? stressTest.output : `Fel: ${stressTest.output}`}

${testQueries.map(({ desc }, i) => `
=== ${desc} ===
${queryResults[i].success ? queryResults[i].output.slice(0, 500) + (queryResults[i].output.length > 500 ? '...' : '') : `Fel: ${queryResults[i].output}`}
`).join('')}

=== Serverloggar ===
${serverLogs}
  `;
  
  fs.writeFileSync(LOG_FILE, logContent);
  
  try {
    clipboardy.writeSync(logContent);
    console.log(`\n✅ Loggar sparade i ${LOG_FILE} och kopierade till clipboard.`);
  } catch (e) {
    console.warn(`⚠️ Kunde inte kopiera till clipboard: ${e.message}`);
    console.log(`✅ Loggar sparade i ${LOG_FILE}.`);
  }
}

runTests().catch(err => {
  console.error('🔥 Fel vid körning:', err.message);
  console.error(err.stack);
  fs.appendFileSync(LOG_FILE, `\n=== Körningsfel ===\n${err.message}\n${err.stack}`);
  process.exit(1);
});