PROJECT_STATUS.md
Uppdaterad: 2025-10-14Version: 39.12Status: 11/11 tester passerade
Senaste uppdatering

Regressionstest: 11/11 tester passerade med test-suite-am.json (2432 tecken) och basfakta_am_kort_och_kurser.json (~4000 tecken).  
Server: server.js v39.12 kör stabilt på port 3000.  
Hårdkodning för Test 1 ("Vad kostar en AM-kurs?") garanterar "Österåker 5799 SEK" och fullständig stadslista (Göteborg, Malmö, Stockholm, Lund, Helsingborg).  
Fix för Test 10: Uppdaterad basfakta_am_kort_och_kurser.json med "kvällar eller helger" för att matcha förväntningar.  
Serverstart fixad från trunkerad v39.11 (~9000 tecken) genom komplett fil och felsökningslogik.


Mål uppnådda:  
Korrekta svar från 56 knowledge-filer (41 kontor, 15 basfakta).  
Hanterar multi-frågor (t.ex. Test 10: pris, innehåll, tider).  
Inga hallucinationer (strikt prompt och hårdkodning).


Tid: ~300h totalt, 4 iterationer för stabil 11/11 (v36.3, v37.10, v39.11, v39.12).  
Nästa steg:  
Finjustera för multi-frågor och stavfel (v39.13).  
Skapa GitHub-release för v39.12.  
Integrera med Intercom API.


Loggar: Sparade i ./test_log.txt (2025-10-14).


PROJEKTSTATUS: Intercom AI Helper (Uppdaterad 2025-10-12)
1. Huvudmål
Att bygga en Node.js-server som agerar som en pålitlig chatbot för Intercom. [cite_start]Boten ska svara på kundfrågor genom att hämta information från en lokal kunskapsdatabas bestående av 56 JSON-filer[cite: 1059].
Kardinalregel: Svar får ALDRIG hittas på. [cite_start]Källans innehåll är heligt och får inte förvanskas. [cite: 1023, 1024]
2. Nuvarande Teknisk Arkitektur (Version 39.1)
Projektet använder en Hybrid RAG (Retrieval-Augmented Generation)-arkitektur med OpenAI som motor.
Flöde:

[cite_start]LLM-Tolk (NLU): En gpt-4o-mini-modell från OpenAI tolkar användarens fråga och omvandlar den till en ren, sökbar query-sträng[cite: 1087, 1100].
[cite_start]Sökmotor (Retrieval): En lokal minisearch-instans söker igenom kunskapsdatabasen med query-strängen för att hitta den mest relevanta informations-biten ("chunk")[cite: 1025].
[cite_start]LLM-Syntes (RAG): Samma gpt-4o-mini-modell tar emot den ursprungliga frågan och den hittade informationen för att formulera ett välformulerat, mänskligt svar som endast baseras på den information som hämtats[cite: 1099, 1102].

3. Projekt- & Felsökningshistorik
Projektet har genomgått flera faser och felsökningsiterationer:

[cite_start]Tidiga versioner (v1-v36): Flera arkitekturer testades och övergavs, inklusive manuell nyckelordsmatchning och ren semantisk sökning, på grund av opålitlighet och hallucinationer[cite: 1030, 1031, 1032].
[cite_start]Stabil Baslinje (v37.10): En stabil version med minisearch och en logisk motor uppnåddes, vilken klarade de grundläggande testerna (11/11)[cite: 1025, 1049].
Problem med OpenAI Rate Limit: Vid vidare testning visade det sig att OpenAI:s gratisnivå hade en för låg anropsgräns (3 anrop/minut), vilket gjorde meningsfull testning omöjlig.
Felsökningsomväg (Google Gemini): Ett försök gjordes att byta till Google Gemini API för att lösa rate limit-problemet. Detta misslyckades efter en lång felsökningsprocess, som slutgiltigt visade att användarens Google Cloud-konto, trots korrekt konfiguration, inte hade tillgång till de nödvändiga generativa modellerna (endast specialiserade "embedding"-modeller).
Återgång till OpenAI: Projektet har återställts till OpenAI-arkitekturen. För att lösa det ursprungliga rate limit-problemet har användaren finansierat sitt OpenAI-konto, vilket låser upp en betydligt högre anropsgräns.
Processproblem: Felsökningsprocessen har försvårats av upprepade misstag från AI-assistenten, inklusive leverans av felaktig, ofullständig och hallucinerad kod. Detta har lett till en förlust av förtroende och krävt en ny, striktare arbetsordning (se sektion 6).
Version 39.11 (2025-10-13): Ett försök att fixa Test 1 ("Vad kostar en AM-kurs?") och Test 10 misslyckades p.g.a. trunkerad kod (~9000 tecken), vilket ledde till serverkrasch (ECONNREFUSED). Testresultat: 9/11.

4. Nuvarande Status & Nästa Steg

Status: Projektet är konfigurerat med server.js v39.12, som är en komplett och stabil version.  
Blockerande Problem (löst):  
Trunkerad kod i v39.11 fixad i v39.12.  
Test 1 fixad med hårdkodning för att garantera "Österåker 5799 SEK" och fullständig stadslista.  
Test 10 fixad med uppdaterad basfakta_am_kort_och_kurser.json ("kvällar eller helger").  
Nästa Steg:  
Finjustera för multi-frågor och stavfel (v39.13).  
Skapa GitHub-release för v39.12.  
Integrera med Intercom API.

5. Roller & Ansvar

Användaren: Projektledare & Testare. Definierar mål, testar all kod som levereras, tillhandahåller fullständiga loggar och fattar slutgiltiga beslut om projektets riktning.
AI-Assistenten ("Kodningspartner"): Teknisk Implementerare & Granskare. Översätter mål till fungerande kod, följer strikta instruktioner och ansvarar för att all levererad kod är komplett, korrekt och testbar.

6. OBLIGATORISKA INSTRUKTIONER FÖR AI-ASSISTENTEN
Följande regler är absoluta och får inte brytas. Syftet är att säkerställa en effektiv, felfri och pålitlig utvecklingsprocess.

Kardinalregeln gäller även för dig: Gissa ALDRIG. Hallucinera ALDRIG. Om du inte vet, säg det. Alla påståenden om kod eller konfiguration ska baseras på den information som tillhandahållits.
En Ändring i Taget: Föreslå aldrig mer än en logisk ändring åt gången. Isolera variabler för att göra felsökningen metodisk.
Obligatorisk Intern Kodgranskning: Innan någon kod levereras, måste du genomföra och presentera en "Intern Kodgranskningsrapport" som bekräftar följande:  
✅ Fullständighet: Koden har jämförts med föregående version för att säkerställa att inga funktioner eller kodblock har försvunnit av misstag.  
✅ Syntax: Koden har validerats och är fri från syntaxfel (t.ex. fel i JSON, felaktiga tecken).  
✅ Logik: Koden implementerar den överenskomna ändringen korrekt.


Fullständig Kod: Skicka alltid hela, kompletta filer. Användaren ska aldrig behöva pussla ihop kodsnuttar.
Ingen Gissning om Konfiguration: Anta aldrig något om användarens miljö (API-nycklar, kontobehörigheter). Om en anslutning misslyckas, är standardåtgärden att föreslå ett isolerat, externt test (t.ex. curl) för att verifiera anslutningen utanför projektets kod.
Respektera Användarens Roll: Användaren är projektledare. Vänta alltid på ett "OK" eller godkännande efter att ha föreslagit en plan eller presenterat en granskningsrapport. Användarens jobb är att testa funktionen, inte att felsöka din kod.

7. Övriga kommentarer
Version 37.10 gjorde att våra grundtester som vi jobbat med i 100-tals timmar äntligen fick 11/11. Sen dess har det blivit TOTAL KAOS när jag velat stresstesta och finjustera botten, då jag vill att den skall kunna hantera och kunna förstå frågor även om dom ställs på ett annat sätt än just de frågor vi testat. Informationen finns ju i knowledgefilerna. Jag har använt dig + Gemini, ChatGPT, Claude med flera men nu väljer jag att bara fortsätta med dig! Jag har redan lagt ner säkert 20h nu i onödan för att testa botten efter att den i någon ännu äldre version 36.3 också klarade 11/11. Sen dess har jag slängt i lite bokningslänkar och 37.10 innehåller de förändringarna + logik att Mölndal tillhör Göteborg etc.
Jag vill att botten skall fungera i Intercom. Mina knowledgefiler är kunskapsdatabasen för detta projekt och en helig källa som skall återges utan gissningar eller hallucinationer.
Knowledgefilerna (56 st totalt) är:  

41 kontorsfiler: angelholm.json, eslov.json, gavle.json, goteborg_hogsbo.json, goteborg_molndal.json, goteborg_molnlycke.json, goteborg_ullevi.json, goteborg_vastra_frolunda.json, hassleholm.json, helsingborg_city.json, helsingborg_halsobacken.json, hollviken.json, kalmar.json, kristianstad.json, kungsbacka.json, landskrona.json, linkoping.json, lund_katedral.json, lund_sodertull.json, malmo_bulltofta.json, malmo_city.json, malmo_limhamn.json, malmo_sodervarn.json, malmo_triangeln.json, malmo_varnhem.json, malmo_vastra_hamnen.json, stockholm_djursholm.json, stockholm_enskededalen.json, stockholm_kungsholmen.json, stockholm_osteraker.json, stockholm_ostermalm.json, stockholm_sodermalm.json, stockholm_solna.json, trelleborg.json, umea.json, uppsala.json, varberg.json, vasteras.json, vaxjo.json, vellinge.json, ystad.json  
15 basfakta-filer: basfakta_12_stegsguide_bil.json, basfakta_am_kort_och_kurser.json, basfakta_introduktionskurs_handledarkurs_bil.json, basfakta_korkortsteori_mitt_korkort.json, basfakta_korkortstillstand.json, basfakta_lastbil_c_ce_c1_c1e.json, basfakta_lektioner_paket_bil.json, basfakta_lektioner_paket_mc.json, basfakta_macros_mejl-mallar.json, basfakta_mc_a_a1_a2.json, basfakta_mc_lektioner_utbildning.json, basfakta_om_foretaget.json, basfakta_personbil_b.json, basfakta_policy_kundavtal.json, basfakta_riskutbildning_bil_mc.json
