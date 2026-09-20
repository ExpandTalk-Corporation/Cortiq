# Plan: tillförlitlig mätning och förbättring med integritet som grund

Datum: 2026-09-17. Status: första tekniska del genomförd lokalt; ingen driftsättning.

### Genomförandelogg, 2026-09-17

- Ny migration `20260917000001_fix_pageview_total.sql` rättar summeringen och behåller ägarkontrollen. Testad med 1 000 sidvisningar över 10 URL:er, tom period och annan kund.
- `generate-dashboard-insights` verifierar användare och webbplatsåtkomst före service-role-frågor och AI-anrop. Metod, JSON och site-ID valideras; misslyckad åtkomstkontroll stoppar anropet. Explicit JWT-inställning tillagd.
- `spa-tracking.js` skapar inte längre sessions-ID vid inläsning före analyssamtycke. Publikt API, SPA-navigation och interaktioner kontrollerar samtycke. `cookieless` och `requireConsent=false` kringgår inte längre detta.
- Återkallelse stoppar efterföljande anrop, rensar skriptets sessions-/annons-ID:n och hindrar sena identifieringssvar från att återställa profilen. Upprepade samtycken duplicerar inte lyssnare. Cookiebot-val hanteras också.
- WebGL läses inte längre ovillkorligt vid identifiering. Formulärmejl läses/hashas av detta skript bara med marknadsföringssamtycke; cookieless skickar ingen identifierande konverteringspost.
- 23 lokala regressionstester passerar via `npm run test:foundation`. PostgreSQL-testet körs isolerat med PGlite; klienttester använder simulerad webbläsare och Edge Function-testet mockar externa tjänster. Separat CI-jobb tillagt, ännu inte kört på GitHub.
- Produktionsbygget passerar inklusive SSR och prerendering av 11 sidor. Riktad lint för spårningsskriptet passerar. Tidigare identifierade typfel i övriga projektet är inte åtgärdade av denna del.

Kvar i närmaste arbetsomgång: verkliga webbläsartester inklusive banner och serverjournal, serverkontroll på samtliga ingestvägar, samtyckets giltighet/version, sanering av insamlade fält, rättning av AI-underlagets radbegränsningar och full datainventering. Övriga skript och befintliga kundinstallationer är inte automatiskt täckta av ändringen. Baslägets serverinsamling, juridisk bedömning och produktionsverifiering återstår. Denna del är inte ett intyg om GDPR-efterlevnad.

## Mål och avgränsning

CortIQ ska hjälpa webbplatsägaren att förstå vad som händer, prioritera en förbättring och mäta resultatet. Ordningen är: laglig och säker insamling → tillförlitliga mått → prioriterade åtgärder → verifierad effekt → kontrollerad automatisering.

Planen bygger på lokal kodgranskning. Driftsatta funktioner, databaspolicyer, leverantörsavtal och faktisk nätverkstrafik återstår att verifiera. Juridiska bedömningar ska avse den slutliga implementationen och aktuella marknader; planen är inte ett intyg om efterlevnad.

## 1. Två produktlägen, separata ändamål

Webbplatsägaren väljer vilka funktioner som erbjuds. Besökaren bestämmer vilka samtyckeskrävande ändamål som får aktiveras. Att ägaren väljer utökat läge ger inte samtycke för besökaren.

| Funktion | Bas: cookiefri mätning | Utökad: samtyckesstyrd mätning |
|---|---|---|
| Grundteknik | I första versionen aggregering av nödvändiga server-/edge-anrop, efter rättslig bedömning | Förstapartsidentifierare efter relevant samtycke |
| Analyscookies och webbläsarlagring | Ingen | Bara för godkänt ändamål, med dokumenterad livslängd |
| Fingerprinting | Avstängt | Ingår inte i föreslagen första version; använd mindre ingripande identifierare |
| Sidtrafik och bottrafik | Aggregerade servermått med redovisade begränsningar | Kan kompletteras med samtyckta klienthändelser |
| Unika besökare och återbesök | Utelämnas när tillförlitlig och tillåten identifiering saknas | Tillgängligt inom godkänt ändamål och lagringstid |
| Heatmaps, scroll och formulärresor | Avstängt i första basversionen | Efter analyssamtycke; inga formulärvärden |
| Session replay | Avstängt | Separat, tydligt beskrivet val; avstängt som standard, maskering och sidundantag |
| Annonsidentifierare och CRM-matchning | Avstängt | Separat marknadsföringsändamål och granskad mottagare |
| AI-insikter | Minimerade aggregat från tillåtna källor | Samma princip; samtycke till analys ger inte obegränsad vidareanvändning |

Basläget ska inte använda dagliga IP/UA-hashar eller minnes-ID:n som en genväg till ett påstående om anonymitet eller samtyckesfrihet. Servertrafik kan inkludera IP-adresser och omfattas av GDPR även om slutresultatet är aggregerat. Serveranrop motsvarar inte automatiskt sidvisningar i en SPA; cache, förhämtning och botar påverkar också mätningen.

Cookiefri teknik och samtyckesbehov är två olika egenskaper. EDPB:s vägledning omfattar fler tekniker än cookies. PTS anger att statistik inte i sig gör lagring nödvändig. Ett franskt undantag får inte antas gälla generellt i Sverige/EU. [PTS](https://pts.se/internet-och-telefoni/kakor-cookies/), [EDPB](https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf).

Nödvändig lagring för exempelvis inloggning och besökarens integritetsval ska bedömas separat och aldrig återanvändas för analys. Basläge för CortIQ innebär inte att andra verktyg på kundens webbplats är samtyckesfria.

## 2. Etapp A: rättslig och teknisk inventering

Ansvar: produktansvarig, backendansvarig och dataskyddsjurist/dataskyddsansvarig.

- Kartlägg varje datatyp, insamlingsväg, ändamål, mottagare, lagringsplats och gallringstid, inklusive CDN, loggar, backuper, AI, annonser och CRM.
- Bedöm terminalåtkomst enligt ePrivacy/svenska LEK separat från rättslig grund enligt GDPR. Dokumentera eventuell intresseavvägning; den ersätter inte ett krav på samtycke till terminalåtkomst. [IMY](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/intresseavvagning/).
- Fastställ ansvarsfördelning per behandling: kunden normalt personuppgiftsansvarig för besöksanalys, CortIQ normalt biträde; egna konto-, fakturerings- och säkerhetsändamål bedöms separat.
- Ta fram biträdesavtal, underbiträdeslista, behandlingsregister, integritetsinformation och incidentrutiner. Dokumentera behovsbedömning för konsekvensbedömning och genomför sådan om behandlingen sannolikt medför hög risk. [IMY om biträden](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsansvariga-och-personuppgiftsbitraden/att-tanka-pa-som-personuppgiftsbitrade/).
- Kontrollera faktisk EU/EES-lagring och eventuell åtkomst/överföring till tredjeland. Dokumentera tillämpligt överföringsstöd och kompletterande åtgärder där det krävs; EU-region ensam avgör inte frågan. [IMY om överföringar](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/overforing-till-tredje-land/).
- Behandla hashade e-postadresser och andra länkbara identifierare som personuppgifter. [IMY om pseudonymisering](https://www.imy.se/nyheter/snabbguide-om-pseudonymisering/).
- Revidera README och `docs/consent-banner-strategy.md`: avlägsna kategoriska påståenden om GDPR-efterlevnad och generellt samtyckesundantag.

Klart när: varje planerad behandling har dokumenterat ändamål, ansvar, rättsligt stöd, retention och tillåtna lägen. Oklar funktion är avstängd tills bedömningen är klar. Sverige är första verifierade marknad; andra EU-marknader får dokumenterad kontroll av nationella regler.

## 3. Etapp B: bygg och verifiera integritetslägena

Ansvar: frontend, backend och QA. Beroende: beslutad behandlingsmatris från A.

- Lagra versionerad policy per webbplats på servern. Separera mätläge, funktioner, ändamål och besökarens val; lita inte på en klientflagga som tillstånd.
- Flytta identifiering och all icke-nödvändig lagring efter relevant samtycke. `public/spa-tracking.js` anropar i dag `getOrCreateSessionId()` vid initiering och skriver sessionStorage i standardläget.
- Ta bort det generella kringgåendet via `requireConsent=false` för funktioner som enligt policyn kräver samtycke. Baslägets tillåtna insamling ska ha en egen begränsad väg.
- Återanvänd befintlig samtyckesjournal och CMP-stöd efter granskning. Spara minimerat bevis på val, ändamål, tid och informationsversion; bind beviset till rätt webbplats och kontext. Kontrollera samtyckeskrävande händelser även på servern.
- Erbjud likvärdiga acceptera-/nekaalternativ, inga förval och enkel återkallelse. Vid okänt val, CMP-fel eller utgånget samtycke blockeras berörda funktioner. [PTS](https://pts.se/internet-och-telefoni/kakor-cookies/).
- Vid återkallelse: stoppa insamling, koppla bort lyssnare/replay, kasta köade samtyckesberoende händelser, rensa egna identifierare och stoppa berörda exporter. Hantera redan lagrade uppgifter enligt rättslig grund och raderingsregler; återkallelse gör inte tidigare laglig behandling retroaktivt olaglig. [IMY om samtycke](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/).
- Rensa URL-parametrar, söksträngar, fritext och formulärvärden före lagring. Inför tillåtelselistor för händelsefält och undanta känsliga sidor. Granska loggning av hela samtyckesförfrågningar i `store-consent`.
- Bestäm retention per datakategori och testa gallring, export/radering, underbiträden och återställning från backup. Dokumentera begränsningar för data som inte går att knyta till en person; skapa inte nya identifierare enbart för att göra anonym statistik sökbar.

Klart när: webbläsartester bevisar beteendet före val, efter nej, efter analys-ja, efter marknadsförings-ja och efter återkallelse. Kontrollera nätverk, cookies, localStorage, sessionStorage, IndexedDB och serverlagring. Testa även direktanrop som försöker kringgå samtyckeskontrollen och byte mellan lägen. Inga gamla identifierare återanvänds för att länka basdata till senare profiler.

## 4. Etapp C: tillförlitlig mätning och säker åtkomst

Kan påbörjas parallellt med A. Ansvar: backend och QA.

- Rätta `get_analytics_summary`: summera sidvisningar i stället för antalet URL-grupper. Testa 1 000 sidvisningar över 10 URL:er, tomma perioder och datumgränser.
- Inför gemensamma definitioner och serveraggregat för dashboard, rapporter och AI. Ange tidszon, population, källa, mätläge och definitionsversion.
- Rätta `generate-dashboard-insights`: verifiera användarens webbplatsåtkomst, ersätt begränsade radurval som totalsiffror och använd gemensam AI-budgetkontroll. Testa isolering mellan två kunder för databas, API, MCP och exporter.
- Inför händelse-ID och deduplicering, begränsade återförsök och observerbar felhantering. Köer får bara innehålla data som policyn tillåter och måste hantera återkallelse. Säkerställ att råhändelse och dashboardunderlag inte tyst divergerar.
- Skilj laddning, verkligt nollresultat, behörighetsfel och tekniskt fel i gränssnittet. Skydda mot gamla svar vid byte av webbplats eller period.
- Visa mätkvalitet: aktiv källa, senaste händelse, fördröjning, bortfall, dubbletter och schemafel. Samtyckt trafik får inte presenteras som representativ för all trafik utan stöd; botanrop och mänskliga sessioner redovisas separat.

Klart när: kända testdata ger samma definierade resultat i databas, dashboard och AI-underlag, och negativa behörighetstester passerar.

## 5. Etapp D: kvalitetssäkring som leveranskrav

Ansvar: utveckling och QA. Börjar i A och följer alla etapper.

Nuvarande typkontroll misslyckas, riktad lint misslyckas och testfiler importerar Vitest som saknas i paketmanifestet. CI kör i dag bygge utan separata typ- och teststeg.

- Synka Supabase-typer mot verifierat schema och rätta faktiska avvikelser. Skärp TypeScript stegvis.
- Konfigurera testkörning och CI för typkontroll, lint, relevanta enhetstester, databas-/RLS-tester och webbläsartester.
- Testa nya migrationer på en tom testdatabas och uppgradering från befintlig version. Produktionsstatus ska jämföras med repositoryt.
- Prioritera skydd mot dataläckage, felräkning, samtyckesbrott, dubbletter och felaktig gallring före kosmetisk täckning.

Klart när: de obligatoriska kontrollerna passerar och stoppar leverans vid regression. Befintliga fel får inte döljas genom generellt avstängda regler.

## 6. Etapp E: en produkt som leder till handling

Ansvar: produkt/design och frontend. Beroende: C.

- Gör översikten till svar på: fungerar mätningen, vad har förändrats och vad bör vi göra?
- Bygg vidare på ontologin, hälsokontroller och befintliga insikter. Visa definition, källa, population, period och databegränsningar intill slutsatsen.
- Inför förbättringsärenden med observation, hypotes, evidens, ansvarig, prioritet, status, primärt mål, baslinje, genomförandedatum och uppföljning.
- Låt AI formulera förslag utifrån verifierade aggregat. Modellens egen siffra är inte statistisk säkerhet. Skicka inte råa besökarprofiler, replay eller formulärvärden till språkmodeller i första versionen.

Klart när: en insikt kan följas till en genomförd åtgärd och ett redovisat resultat, inklusive utfallet "otillräckligt underlag".

## 7. Etapp F: första kompletta förbättringsfallet

Förslag: fler kvalificerade förfrågningar från ett formulär. Beroende: B–E.

- Välj en landningssida, ett formulär och en definition av kvalificerad förfrågan.
- Följ besök → formulärstart → skickat formulär inom tillåten analys. CRM-koppling aktiveras bara med rätt ändamål, rättslig grund och information; själva hanteringen av en kundförfrågan bedöms separat från annonsspårning.
- Rätta A/B-resultat till valt mål, dokumenterad exponering och konverteringsfönster. Bygg stabil tilldelning, faktisk variantvisning och exponeringshändelser; verifiera hela kedjan.
- Hantera flera konverteringar, nollvärden, minsta underlag, sned variantfördelning och för tidiga slutsatser. Testlängd baseras på faktisk tillåten trafik, inte antagandet 1 000 sessioner/dag.
- Före/efter-jämförelse märks som observation; säsong, kampanjer och ändrad samtyckesgrad kan påverka utfallet. Automatiska vinnarbeslut kräver en validerad experimentmetod.

Klart när: en pilotkund kan genomföra en dokumenterad förbättring och följa effekten utan att mätlägen eller populationer blandas.

## 8. Etapp G: kontrollerad automatisering

Beroende: fungerande pilot och experimentkedja.

- Börja med ändringsförslag och förhandsvisning i testmiljö.
- Lägg till godkänd publicering med begränsade rättigheter, versionshistorik, ändringslogg och återställning.
- Övervaka fel, prestanda, konverteringsmål och integritetsregler efter publicering. Definiera stoppvillkor före körning.
- Automatiken får inte ändra ändamål, aktivera nya mottagare eller utöka datainsamling utan separat beslut och erforderlig information/samtycke.

Klart när: en publicerad förändring kan spåras, utvärderas och återställas; först därefter övervägs snävt avgränsad automatisk publicering.

## Första arbetsomgången

1. Inventera databehandlingar och verifiera drift mot kod.
2. Rätta åtkomstkontrollen för AI-insikter och sidvisningsberäkningen med tester.
3. Specificera och testa lagring före samtycke och `requireConsent`-kringgåendet.
4. Fastställ funktionsmatris och rättslig bedömning för basläget.
5. Återställ användbara typ-/testkontroller och börja bygga samtyckesmatrisens webbläsartester.

Tidsestimat sätts efter denna inventering. Varje etapp delas i små leveranser med ansvarig, acceptanskriterier och verifierat testresultat. Vi behåller befintlig React/Supabase-arkitektur och återanvänder fungerande delar.

## Uppföljande kodgranskning 2026-09-17

Ytterligare lokala rättningar och återstående pilotkrav finns i [granskningsrapporten](REVIEW-2026-09-17.md). 56 riktade tester och produktionsbygget passerar. Samtyckeskontroll är införd för konverteringar och Google Ads-export men måste fortfarande kopplas till övriga insamlingsvägar och verifieras tillsammans med banner och journal. Ingen driftsättning har gjorts.

