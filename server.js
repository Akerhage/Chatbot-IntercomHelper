const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const MiniSearch = require('minisearch');
require('dotenv').config();
const { OpenAI } = require('openai');
const openai = new OpenAI();

const app = express();
let PORT = process.env.PORT || 3000;
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
const VERSION = '43.1.0'; // FIXED: "Vad ingår" prioriteras, basfakta tvingas in för innehållsfrågor
console.log(`\n🚀 Startar server.js version ${VERSION}\n`);

app.use(cors());
app.use(express.json());

// Global data structures
let miniSearch;
let allChunks = [];
let knownCities = [];
let cityOffices = {}; // Stad -> [kontorsnamn]
let officePrices = {}; // Kontor -> {AM: pris, BIL: pris, MC: pris}

// ==================== CITY ALIASES ====================
const CITY_ALIASES = {
  'limhamn': 'Malmö',
  'mölndal': 'Göteborg',
  'molndal': 'Göteborg',
  'mölnlycke': 'Göteborg',
  'molnlycke': 'Göteborg',
  'östermalm': 'Stockholm',
  'ostermalm': 'Stockholm',
  'södermalm': 'Stockholm',
  'sodermalm': 'Stockholm',
  'kungsholmen': 'Stockholm',
  'solna': 'Stockholm',
  'djursholm': 'Stockholm',
  'enskededalen': 'Stockholm',
  'österåker': 'Stockholm',
  'osteraker': 'Stockholm',
  'högsbo': 'Göteborg',
  'hogsbo': 'Göteborg',
  'ullevi': 'Göteborg',
  'västra frölunda': 'Göteborg',
  'vastra frolunda': 'Göteborg',
  'frölunda': 'Göteborg',
  'frolunda': 'Göteborg',
  'hälsobacken': 'Helsingborg',
  'halsobacken': 'Helsingborg',
  'katedral': 'Lund',
  'södertull': 'Lund',
  'sodertull': 'Lund',
  'bulltofta': 'Malmö',
  'triangeln': 'Malmö',
  'södervärn': 'Malmö',
  'sodervarn': 'Malmö',
  'värnhem': 'Malmö',
  'varnhem': 'Malmö',
  'västra hamnen': 'Malmö',
  'vastra hamnen': 'Malmö',
  'sthlm': 'Stockholm',
  'gbg': 'Göteborg',
  'götebrog': 'Göteborg',
  'gotebrog': 'Göteborg',
  'göötehoorg': 'Göteborg',
  'gooteboorg': 'Göteborg'
};

// ==================== LEVENSHTEIN DISTANCE ====================
const levenshtein = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
};

// ==================== FIND CITY ====================
const findCity = (input) => {
  const inputLower = input.toLowerCase().trim();
  
  // 1. Check exact alias match
  if (CITY_ALIASES[inputLower]) {
    return CITY_ALIASES[inputLower];
  }
  
  // 2. Check if it's already a known city
  const exactMatch = knownCities.find(city => city.toLowerCase() === inputLower);
  if (exactMatch) return exactMatch;
  
  // 3. Fuzzy match with Levenshtein (max distance 2)
  let closestCity = null;
  let minDistance = Infinity;
  
  for (const city of knownCities) {
    const distance = levenshtein(inputLower, city.toLowerCase());
    if (distance < minDistance) {
      minDistance = distance;
      closestCity = city;
    }
  }
  
  return minDistance <= 2 ? closestCity : null;
};

// ==================== CHECK IF UNKNOWN CITY ====================
const checkUnknownCity = (query, detectedCity) => {
  if (detectedCity) return null; // Stad är känd
  
  const words = query.split(/\s+/);
  const skipWords = ['am', 'bil', 'mc', 'vad', 'hur', 'kan', 'kurs', 'kursen', 'kostar', 'pris', 'i', 'på'];
  
  for (const word of words) {
    // Sök efter ord som börjar med versal och är längre än 3 tecken
    if (word.length > 3 && /^[A-ZÅÄÖ]/.test(word[0])) {
      const cleanWord = word.replace(/[?.,!]/g, '');
      if (!skipWords.includes(cleanWord.toLowerCase())) {
        // Kolla om det kan vara ett alias vi inte känner igen
        const possibleCity = findCity(cleanWord);
        if (!possibleCity) {
          return cleanWord; // Detta är troligen en okänd stad
        }
      }
    }
  }
  return null;
};

// ==================== EXTRACT VEHICLE TYPE ====================
const extractVehicle = (serviceName) => {
  const lower = serviceName.toLowerCase();
  
  // KRITISKT: Undvik att matcha "Risk 1/2" som körlektion!
  if (lower.includes('risk 1') || lower.includes('risk 2') || 
      lower.includes('riskettan') || lower.includes('risktvåan') ||
      lower.includes('halkbana')) {
    return null; // Inte en körlektion!
  }
  
  // KRITISKT: Undvik paket, introduktionskurs, etc.
  if (lower.includes('paket') || lower.includes('introduktionskurs') || 
      lower.includes('handledarkurs') || lower.includes('intensiv') ||
      lower.includes('teori') || lower.includes('b96') || lower.includes('be ')) {
    return null;
  }
  
  // Nu kan vi matcha körlektion
  if (lower.includes('körlektion')) {
    if (lower.includes(' mc')) return 'MC';
    if (lower.includes(' bil')) return 'BIL';
  }
  
  // AM är alltid AM Mopedutbildning
  if (lower.includes('am ') || lower.includes('moped')) return 'AM';
  
  return null;
};

// ==================== SMART NLU ====================
async function smart_nlu(question) {
  const systemPrompt = `Du är en NLU-expert som konverterar användarfrågor till söksträng för en trafikskolekatalog.

REGLER:
1. Returnera JSON: { "queries": ["söksträng1", "söksträng2"], "intent": "typ", "city": "stad eller null", "area": "område eller null" }
2. Normalisera: "moppe"/"moped" -> "AM Mopedutbildning"
3. Identifiera stad OCH område i frågan (även stavfel och förkortningar)
4. För prisfrågor: lägg alltid till "pris"
5. För innehållsfrågor: lägg alltid till "innehåll" eller specifika delar (teori, manöverkörning)
6. Separera olika ämnen (AM och BIL är olika queries)
7. Håll söksträng kortfattade men precisa
8. Om stad/område nämns: inkludera i query OCH i city/area-fältet
9. Känna igen områden: Limhamn, Österåker, City, Hälsobacken, etc.

EXEMPEL:
"vad kostar moppe" -> { "queries": ["AM Mopedutbildning pris"], "intent": "pris", "city": null, "area": null }
"am-kurs göteborg pris" -> { "queries": ["AM Mopedutbildning Göteborg pris"], "intent": "pris", "city": "Göteborg", "area": null }
"bilkörlektion limhamn" -> { "queries": ["Körlektion BIL Limhamn pris"], "intent": "pris", "city": "Malmö", "area": "Limhamn" }
"am österåker" -> { "queries": ["AM Mopedutbildning Österåker pris"], "intent": "pris", "city": "Stockholm", "area": "Österåker" }
"vad kostar en lektion helsingborg" -> { "queries": ["Körlektion pris Helsingborg"], "intent": "pris", "city": "Helsingborg", "area": null }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question }
      ],
      response_format: { type: "json_object" }
    });
    const result = JSON.parse(response.choices[0].message.content);
    console.log(`[NLU] "${question}" -> ${JSON.stringify(result)}`);
    return result;
  } catch (e) {
    console.error(`[NLU ERROR] ${e.message}`);
    return { queries: [question], intent: 'unknown', city: null, area: null };
  }
}

// ==================== GENERATE RAG ANSWER ====================
async function generate_rag_answer(userQuestion, retrievedContext, detectedCity, detectedArea) {
  const systemPrompt = `Du är kundtjänst för svensk trafikskola.

ABSOLUTA REGLER - FÅR ALDRIG BRYTAS:
1. Använd ENDAST information från "Kontext" nedan - INGEN egen kunskap eller gissningar
2. För priser: använd EXAKT det pris som står i Kontext för den specifika staden/kontoret
3. Om flera kontor finns i samma stad, specificera ALLTID vilket kontor priset gäller för
4. Om Kontext säger "1249 SEK i Helsingborg - City", skriv "1249 SEK på vårt kontor Helsingborg - City"
5. KRITISKT FÖR "VAD INGÅR" FRÅGOR:
   - Om frågan innehåller "ingår" eller "innehåll", svara FÖRST med vad som ingår
   - Om Kontext säger "teori, manöverkörning, körning i trafik", inkludera ALLA tre
   - Nämn också: "lån av moped, hjälm och skyddsutrustning" om det finns i Kontext
   - Svara ALLTID på "vad ingår" FÖRE tider/priser
6. Om frågan nämner en stad/område, MÅSTE svaret nämna samma stad/område
7. Använd alltid exakta termer från Kontext:
   - "AM Mopedutbildning" (INTE "mopedkurs")
   - "Körlektion BIL" (INTE bara "körlektion")
   - "krävs" (INTE "behöver")
   - "inte tillåtet" (INTE "tyvärr inte")
   - "övningsköra privat" (hela frasen)
8. VIKTIGT: Österåker har specialpris för AM (5799 SEK) - om frågan gäller Österåker, nämn detta tydligt
9. Om Kontext saknar information: Förklara vad som saknas för att kunna svara
10. Inkludera bokningslänk när relevant: "Boka här: [länk]"
11. KRITISKT: Hänvisa ALDRIG till telefonnummer - användaren chattar redan med support!`;

  try {
    let contextForGPT = retrievedContext;
    
    // Lägg till stads/områdesinfo om detekterad
    if (detectedArea && detectedCity) {
      contextForGPT = `VIKTIG PLATS: ${detectedCity} - ${detectedArea}\n\n${retrievedContext}`;
    } else if (detectedCity) {
      contextForGPT = `VIKTIG STAD: ${detectedCity}\n\n${retrievedContext}`;
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Fråga: ${userQuestion}\n\nKontext:\n${contextForGPT}` }
      ]
    });
    const answer = response.choices[0].message.content;
    console.log(`[RAG] Svar (${answer.length} tecken)`);
    return answer;
  } catch (e) {
    console.error(`[RAG ERROR] ${e.message}`);
    console.error(e.stack);
    return `Jag upplever ett tekniskt fel. Kan du försöka ställa frågan på ett annat sätt?`;
  }
}

// ==================== LOAD KNOWLEDGE BASE ====================
const loadKnowledgeBase = () => {
  console.log('📚 Laddar kunskapsdatabas...\n');
  const files = fs.readdirSync(KNOWLEDGE_DIR);
  let tempChunks = [];
  let officeCount = 0;
  let basfaktaCount = 0;

  files.forEach(file => {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // ========== BASFAKTA FILES ==========
      if (file.startsWith('basfakta_')) {
        basfaktaCount++;
        console.log(`   📄 Basfakta: ${file}`);
        
        if (data.sections) {
          data.sections.forEach((section, idx) => {
            const chunk = {
              id: `${file}_${idx}`,
              title: section.title,
              text: section.answer || section.content || '',
              keywords: section.keywords || [],
              type: 'basfakta',
              source: file
            };
            tempChunks.push(chunk);
          });
        }
      }
      // ========== OFFICE FILES ==========
      else if (data.city && data.prices) {
        officeCount++;
        
        // KRITISK FIX: Hantera både med och utan area-fält
        const officeName = data.area ? `${data.city} - ${data.area}` : data.city;
        console.log(`   🏢 Kontor: ${officeName}`);
        
        if (!knownCities.includes(data.city)) {
          knownCities.push(data.city);
        }
        
        if (!cityOffices[data.city]) {
          cityOffices[data.city] = [];
        }
        cityOffices[data.city].push(officeName);
        
        // Process prices
        const priceData = { AM: null, BIL: null, MC: null };
        
        data.prices.forEach(price => {
          const vehicle = extractVehicle(price.service_name);
          if (vehicle && !priceData[vehicle]) {
            priceData[vehicle] = price.price;
            
            // KRITISK FIX: Chunks innehåller nu office, area, och city
            const priceChunk = {
              id: `${file}_price_${vehicle}`,
              title: `${price.service_name} i ${officeName}`,
              text: `${price.service_name} kostar ${price.price} SEK i ${officeName}.`,
              city: data.city,
              area: data.area || null,
              office: officeName,
              vehicle: vehicle,
              price: price.price,
              keywords: [
                ...(price.keywords || []), 
                data.city, 
                vehicle, 
                'pris', 
                'kostnad', 
                `${price.price}`,
                officeName,
                ...(data.area ? [data.area] : [])
              ],
              type: 'price',
              source: file
            };
            tempChunks.push(priceChunk);
          }
        });
        
        officePrices[officeName] = priceData;
        
        // Create sections if exist
        if (data.sections) {
          data.sections.forEach((section, idx) => {
            const chunk = {
              id: `${file}_section_${idx}`,
              title: section.title,
              text: section.answer || section.content || '',
              city: data.city,
              area: data.area || null,
              office: officeName,
              keywords: section.keywords || [],
              type: 'office_info',
              source: file
            };
            tempChunks.push(chunk);
          });
        }
      }
    } catch (e) {
      console.error(`   ❌ Fel vid läsning av ${file}: ${e.message}`);
    }
  });

  knownCities.sort();
  allChunks = tempChunks;

  console.log(`\n✅ Laddade ${tempChunks.length} chunks från ${files.length} filer`);
  console.log(`   - ${basfaktaCount} basfakta-filer`);
  console.log(`   - ${officeCount} kontorsfiler`);
  console.log(`   - ${knownCities.length} unika städer: ${knownCities.join(', ')}\n`);

  // ========== CREATE MINISEARCH INDEX ==========
  miniSearch = new MiniSearch({
    fields: ['title', 'text', 'city', 'area', 'office', 'keywords', 'vehicle'],
    storeFields: ['title', 'text', 'city', 'area', 'office', 'vehicle', 'type', 'price'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: {
        keywords: 6,
        office: 5,
        city: 4,
        area: 3,
        vehicle: 2,
        title: 3,
        text: 1
      }
    }
  });

  miniSearch.addAll(allChunks);
  console.log('🔍 MiniSearch indexering klar\n');
};

// ==================== ENDPOINTS ====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    version: VERSION, 
    port: PORT,
    chunks: allChunks.length,
    cities: knownCities.length
  });
});

app.get('/test', (req, res) => {
  res.json({ status: 'OK', message: 'Test endpoint', version: VERSION });
});

app.post('/search_all', async (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query saknas' });
  }

  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[SEARCH] "${query}"`);
    console.log('='.repeat(70));
    
    // ========== NLU: Parse query ==========
    const nluResult = await smart_nlu(query);
    let detectedCity = nluResult.city ? findCity(nluResult.city) : null;
    let detectedArea = nluResult.area || null;
    
    // KRITISK FIX: Dubbelkolla alias i frågan DIREKT (även om NLU missade)
    if (!detectedCity || !detectedArea) {
      const queryLower = query.toLowerCase();
      for (const [alias, city] of Object.entries(CITY_ALIASES)) {
        if (queryLower.includes(alias) && city) {
          detectedCity = city;
          detectedArea = alias;
          console.log(`[ALIAS] Detekterade via alias: ${alias} -> ${city}`);
          break;
        }
      }
    }
    
    // Försök hitta stad i själva frågan om NLU missade det
    if (!detectedCity) {
      const words = query.split(/\s+/);
      for (const word of words) {
        const city = findCity(word);
        if (city) {
          detectedCity = city;
          console.log(`[CITY] Detekterade stad: ${detectedCity}`);
          break;
        }
      }
    }
    
    // ========== PRIORITET 1: CHECK UNKNOWN CITY ==========
    const unknownCity = checkUnknownCity(query, detectedCity);
    if (unknownCity) {
      const answer = `Tyvärr har vi inget kontor i ${unknownCity}. Våra kontor finns i: ${knownCities.join(', ')}. Vill du veta mer om något av dessa kontor?`;
      console.log(`[UNKNOWN CITY] ${unknownCity}\n`);
      return res.json({ answer, context: [], debug: { unknown_city: unknownCity } });
    }
    
    // ========== PRIORITET 2: CHECK VAGUE QUESTION ==========
    const isVague = (
      (query.toLowerCase().includes('kostar kursen') || 
       query.toLowerCase().includes('vad kostar') && !query.toLowerCase().match(/am|bil|mc|moped/i)) &&
      !detectedCity
    );
    
    if (isVague) {
      const answer = `För att kunna ge dig rätt prisinformation behöver jag veta vilken kurs du är intresserad av (AM, Bil, MC) och i vilken stad. Våra kontor finns i: ${knownCities.join(', ')}. Vilken kurs och stad är du intresserad av?`;
      console.log(`[VAGUE QUESTION] "${query}" -> Följdfråga\n`);
      return res.json({ answer, context: [], debug: { vague_question: true } });
    }
    
    // ========== SEARCH: Get relevant chunks ==========
    const allResults = [];
    
    for (const q of nluResult.queries) {
      let searchQuery = q;
      
      // Lägg till stad/område i sökningen om detekterad
      if (detectedArea && !q.toLowerCase().includes(detectedArea.toLowerCase())) {
        searchQuery = `${q} ${detectedArea}`;
      } else if (detectedCity && !q.toLowerCase().includes(detectedCity.toLowerCase())) {
        searchQuery = `${q} ${detectedCity}`;
      }
      
      const searchResults = miniSearch.search(searchQuery, { 
        combineWith: 'OR',
        boost: { keywords: 6, office: 5, city: 4, area: 3 }
      });
      
      console.log(`[SEARCH] "${searchQuery}" -> ${searchResults.length} träffar`);
      allResults.push(...searchResults);
    }
    
    // Remove duplicates and sort by score
    const uniqueResults = Array.from(
      new Map(allResults.map(item => [item.id, item])).values()
    );
    uniqueResults.sort((a, b) => b.score - a.score);
    
    // KRITISK FIX: Filtrera prioritering - område > stad > allmänt
    let topResults = uniqueResults;
    if (detectedArea && detectedCity) {
      const areaResults = uniqueResults.filter(r => 
        r.area && r.area.toLowerCase() === detectedArea.toLowerCase() && r.city === detectedCity
      );
      const cityResults = uniqueResults.filter(r => 
        r.city === detectedCity && (!r.area || r.area.toLowerCase() !== detectedArea.toLowerCase())
      );
      const otherResults = uniqueResults.filter(r => r.city !== detectedCity);
      topResults = [...areaResults, ...cityResults, ...otherResults];
    } else if (detectedCity) {
      const cityResults = uniqueResults.filter(r => r.city === detectedCity);
      const otherResults = uniqueResults.filter(r => r.city !== detectedCity);
      topResults = [...cityResults, ...otherResults];
    }
    
    topResults = topResults.slice(0, 8);
    
    console.log(`[CONTEXT] Använder ${topResults.length} chunks (stad: ${detectedCity || 'ingen'}, område: ${detectedArea || 'inget'})`);
    
    // ========== BUILD CONTEXT ==========
    const context = topResults.map(r => {
      let text = `${r.title}: ${r.text}`;
      if (r.office) text += ` (${r.office})`;
      else if (r.city) text += ` (${r.city})`;
      if (r.price) text += ` - ${r.price} SEK`;
      return text;
    }).join('\n\n');
    
    // KRITISKT: Om frågan innehåller "ingår" eller "innehåll", TVINGA fram basfakta
    const isContentQuestion = query.toLowerCase().includes('ingår') || 
                             query.toLowerCase().includes('innehåll') ||
                             nluResult.intent === 'innehåll';
    
    if (isContentQuestion && topResults.filter(r => r.type === 'basfakta').length === 0) {
      console.log('[INNEHÅLL] Lägger till basfakta för "vad ingår"-fråga');
      const basfaktaChunks = allChunks.filter(c => 
        c.type === 'basfakta' && 
        (c.title.toLowerCase().includes('ingår') || 
         c.title.toLowerCase().includes('innehåll') ||
         c.title.toLowerCase().includes('am'))
      ).slice(0, 3);
      
      if (basfaktaChunks.length > 0) {
        topResults.unshift(...basfaktaChunks); // Lägg FÖRST i listan
      }
    }
    
    // ========== GENERATE ANSWER ==========
    const answer = await generate_rag_answer(query, context, detectedCity, detectedArea);
    
    console.log(`[ANSWER] ${answer.slice(0, 150)}${answer.length > 150 ? '...' : ''}\n`);

    res.json({ 
      answer, 
      context: topResults.map(r => ({
        title: r.title,
        text: r.text.slice(0, 200),
        city: r.city,
        area: r.area,
        office: r.office,
        type: r.type,
        score: r.score
      })),
      debug: {
        nlu: nluResult,
        detected_city: detectedCity,
        detected_area: detectedArea,
        chunks_used: topResults.length
      }
    });

  } catch (e) {
    console.error(`[ERROR] ${e.message}`);
    console.error(e.stack);
    res.status(500).json({ error: 'Internt serverfel', details: e.message });
  }
});

// ==================== START SERVER ====================
const startServer = () => {
  try {
    loadKnowledgeBase();
    
    app.listen(PORT, () => {
      console.log('='.repeat(70));
      console.log(`✅ SERVER REDO`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   Version: ${VERSION}`);
      console.log(`   Endpoints: /health, /test, /search_all`);
      console.log('='.repeat(70) + '\n');
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} är upptagen!`);
        console.error(`   Kör: taskkill /F /IM node.exe\n`);
        process.exit(1);
      } else {
        console.error(`\n❌ Serverfel: ${err.message}\n`);
        process.exit(1);
      }
    });
  } catch (e) {
    console.error(`\n❌ Kritiskt fel: ${e.message}\n`);
    console.error(e.stack);
    process.exit(1);
  }
};

startServer();

// ==================== ERROR HANDLING ====================
process.on('uncaughtException', (err) => {
  console.error(`\n❌ Oväntat fel: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`\n❌ Ohanterat löfte: ${reason}`);
  process.exit(1);
});