const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

const files = fs.readdirSync(KNOWLEDGE_DIR).filter(file => path.extname(file) === '.json');

files.forEach(file => {
  const filePath = path.join(KNOWLEDGE_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // --- KONTROLLEN SOM FÖRHINDRAR KRASCHEN ---
  // Kör bara koden nedanför OM data.prices existerar och är en lista (array).
  if (data.prices && Array.isArray(data.prices)) {

    data.prices.forEach(service => {
      const priceKeyword = `${service.price} SEK (kronor/kr)`;
      if (!service.keywords.includes(priceKeyword)) {
        service.keywords.push(priceKeyword);
      }

      const serviceName = service.service_name.toLowerCase();
      if (serviceName.includes('am')) {
        if (!service.keywords.includes('Boka AM här')) {
          service.keywords.push('Boka AM här');
        }
      } else if (serviceName.includes('bil') && !['risk 1', 'risk 2', 'introduktionskurs', 'handledarkurs'].some(excl => serviceName.includes(excl))) {
        if (!service.keywords.includes('Boka bil här')) {
          service.keywords.push('Boka bil här');
        }
      } else if (serviceName.includes('mc') && !['risk 1', 'risk 2'].some(excl => serviceName.includes(excl))) {
        if (!service.keywords.includes('Boka MC här')) {
          service.keywords.push('Boka MC här');
        }
      }
    });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Uppdaterade ${file}`);

  } else {
    // Filen saknar en 'prices'-lista, så vi ignorerar den.
    console.log(`Ignorerar ${file} (saknar 'prices'-data).`);
  }
});

console.log('Alla relevanta kontorsfiler uppdaterade.');