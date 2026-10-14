# Privacy Policy Mall för CortIQ (Cookieless- eller Full-läge)

## Mall för integritetspolicy

Kopiera och anpassa texten nedan för din webbplats. Ersätt [DITT FÖRETAGSNAMN] med ditt faktiska företagsnamn, behåll stycket för det spårningsläge du använder (Cookieless eller Full) och gör din egen rättsliga bedömning innan publicering.

---

## Integritetspolicy

**Senast uppdaterad: [DATUM]**

### 1. Introduktion

[DITT FÖRETAGSNAMN] ("vi", "oss", "vår") respekterar din integritet och är engagerade i att skydda dina personuppgifter. Denna integritetspolicy förklarar hur vi samlar in och använder data när du besöker vår webbplats.

### 2. Dataansvarig

**Företagsnamn:** [DITT FÖRETAGSNAMN]  
**Kontakt:** [DIN E-POST]  
**Adress:** [DIN ADRESS]

### 3. Vilken data samlar vi in?

#### 3.1 Mätning av botar och AI-agenter (på vår server)

Vår server analyserar tekniska uppgifter i inkommande förfrågningar (user-agent, begärd sida, hänvisande sida och en förkortad IP-adress) för att upptäcka och klassificera botar och AI-agenter. Bara förfrågningar som ser automatiserade ut skickas till CortIQ, vårt personuppgiftsbiträde. IP-adressen förkortas på vår server innan den skickas. Ingenting lagras i eller läses från din enhet.

**Rättslig grund (GDPR):** Berättigat intresse (Art. 6.1.f GDPR) av att förstå och hantera automatiserad trafik. [Justera efter er egen bedömning och intresseavvägning.]

CortIQ:s botkontroller i webbläsaren (bot-probe, honeypot, canary) läser uppgifter från enheten och körs därför först efter ditt samtycke till statistik (se 3.2).

#### 3.2 Besöksstatistik (kräver ditt samtycke)

Endast om du **aktivt accepterar kategorin Statistik** i vår cookie-banner samlar vi in:

- **Sidvisningar och sessioner** (vilka sidor du besöker, varifrån du kom)
- **Enhetstyp och webbläsartyp**
- **Anonymiserad IP-adress** (sista oktetten maskerad, t.ex. 192.168.1.0)
- **Klickdata och heatmap-data** (klickpositioner)
- **Scrolldjup** (hur långt ned du scrollar)
- **Formulärinteraktioner** (när du börjar fylla i formulär, INTE vad du skriver)
- **Konverteringar och e-handelshändelser**
- **Sessionsinspelning** (inmatningar maskerade som standard)

Utan ditt samtycke samlas ingen av dessa uppgifter in.

[Cookieless-läge:] Inga cookies sätts och ingen beständig identifierare sparas. Besök kopplas inte ihop med varandra.
[Full-läge:] Vi använder en beständig besöksidentifierare, härledd från tekniska egenskaper hos din enhet, för att känna igen återkommande besök, samt en sessionsidentifierare i webbläsaren under besöket.

**Rättslig grund (GDPR):** Samtycke (Art. 6.1.a GDPR, ePrivacy Art. 5.3). Ditt val sparas i 12 månader, därefter frågar vi igen. Du kan när som helst återkalla samtycket via cookie-ikonen.

**Datalagring:** Besöksstatistik sparas i [X] månader.

#### 3.3 Marknadsföring (kräver separat samtycke)

Klick-ID från annonsplattformar (t.ex. gclid, fbclid) sparas endast om du accepterar kategorin Marknadsföring.

### 4. Lagring i din webbläsare

#### 4.1 Nödvändig lagring (alltid aktiv)
- `site_cookie_consent` (localStorage) - Sparar dina cookie-val
- Livstid: 12 månader, därefter visas bannern igen

#### 4.2 Statistik (kräver samtycke, endast Full-läge)
- `cortiq_session_id` (sessionStorage) - Session-ID för att koppla ihop dina sidbesök
- Livstid: Session (raderas när du stänger fliken/webbläsaren)

I Cookieless-läge sparas inget utöver ditt cookie-val.

#### 4.3 Marknadsföring (kräver samtycke)
- `cortiq_click_ids` (sessionStorage) - Klick-ID från annonser
- Livstid: Session

### 5. Google Analytics Integration (Om aktiverad)

Om du accepterar analytiska cookies kan vi även dela anonymiserad data med Google Analytics 4 för ytterligare analys. Detta inkluderar:

- Anonymiserad IP-adress
- Sidvisningar
- Händelser (klick, scrollning)

**Google Consent Mode v2:** Vi använder Google Consent Mode v2 för att säkerställa att Google respekterar dina consent-val.

**Google's integritetspolicy:** https://policies.google.com/privacy

### 6. Dina rättigheter enligt GDPR

Du har följande rättigheter:

- **Rätt till tillgång** (Art. 15 GDPR) - Be om en kopia av din data
- **Rätt till radering** (Art. 17 GDPR) - Be oss radera din data
- **Rätt till rättelse** (Art. 16 GDPR) - Korrigera felaktig data
- **Rätt till begränsning** (Art. 18 GDPR) - Begränsa behandlingen
- **Rätt till invändning** (Art. 21 GDPR) - Invända mot behandling
- **Rätt till dataportabilitet** (Art. 20 GDPR) - Få din data i strukturerad form

**Så här utövar du dina rättigheter:**

1. Skicka e-post till: [DIN E-POST]
2. Inkludera: Ditt namn, e-post och vilken rättighet du vill utöva
3. Vi svarar inom 30 dagar

### 7. Data Security

Vi använder följande säkerhetsåtgärder:

- **Kryptering:** All data överförs via HTTPS/TLS
- **IP-anonymisering:** Automatisk maskning av IP-adresser
- **Access control:** Endast auktoriserad personal har tillgång
- **Regelbunden radering:** Automatisk radering enligt retention-policy
- **Supabase:** Säker datalagring i EU (GDPR-kompatibel)

### 8. Data Retention (Lagring)

- **Besöksstatistik:** [365] dagar
- **Cookie consent records:** 2 år (lagstadgat beviskrav)

Efter dessa perioder raderas all data automatiskt.

### 9. Delning av Data

Vi delar **ALDRIG** din data med tredje part för marknadsföring.

Vi delar endast data med:

- **Supabase** (EU-baserad datalagring, GDPR-kompatibel)
- **Google Analytics** (endast om du samtyckt, anonymiserad)

### 10. Internationella överföringar

All data lagras inom EU (Supabase EU region). Om du accepterar Google Analytics kan data överföras till USA med stöd av EU-US Data Privacy Framework och EU:s standardavtalsklausuler.

### 11. Ändringar i denna policy

Vi kan uppdatera denna policy. Senaste uppdateringsdatum visas överst. Vid väsentliga ändringar informerar vi dig via webbplatsen.

### 12. Kontakta oss

**E-post:** [DIN E-POST]  
**Telefon:** [DITT TELEFONNUMMER]  
**Adress:** [DIN ADRESS]

**Dataskyddsombud (om tillämpligt):** [E-POST TILL DPO]

### 13. Tillsynsmyndighet

Om du är missnöjd med hur vi hanterar din data kan du kontakta:

**Integritetsskyddsmyndigheten (IMY)**  
Box 8114  
104 20 Stockholm  
E-post: imy@imy.se  
Telefon: 08-657 61 00

---

## Snabbguide: Vad är skillnaden?

### Utan samtycke (på servern)
- Mätning av botar och AI-agenter från HTTP-förfrågan, utan åtkomst till enheten
- **Inget körs i webbläsaren, ingen besöksstatistik**

### Med samtycke – Cookieless-läge
- Sidvisningar, sessioner inom ett besök, klick, scroll, heatmaps, formulär, konverteringar
- Inga cookies, inget fingeravtryck, inga beständiga ID:n, ingen koppling mellan besök

### Med samtycke – Full-läge
- Allt ovanstående PLUS:
- Återkommande besökare (beständigt besöks-ID)
- Detaljerad användarresa över flera besök

---

## Implementation Checklist

- [ ] Lägg till denna policy på din webbplats under `/privacy-policy` eller `/integritet`
- [ ] Ersätt alla [PLATSHÅLLARE] med din information
- [ ] Lägg till länk till Privacy Policy i footer
- [ ] Uppdatera cookie-bannerns "Läs mer"-länk till din privacy policy
- [ ] Välj spårningsläge (Cookieless/Full) och behåll motsvarande stycke i policyn
- [ ] Se över retention-perioden och anpassa efter ditt behov
- [ ] Om du använder Google Analytics - verifiera att du har ett DPA (Data Processing Agreement) med Google
- [ ] Dokumentera hur användare kan utöva sina GDPR-rättigheter
- [ ] Testa processen för data export/radering

---

## Vanliga Frågor

**Q: Behöver jag en cookie-banner om jag kör Cookieless-läge?**  
A: Ja. All besöksstatistik startar först efter samtycke, i både Cookieless- och Full-läge. Cookieless-läget minskar vilka data som samlas in, men ersätter inte samtycket.

**Q: Kan jag helt skippa cookie-bannern?**  
A: Då körs ingenting från CortIQ i webbläsaren. Mätningen av botar och AI-agenter på serversidan fungerar ändå, eftersom den inte rör besökarens enhet.

**Q: Vad händer om användare säger nej eller stänger bannern?**  
A: Ingen besöksstatistik samlas in och skriptet gör ingenting. Att stänga bannern sparas som "endast nödvändiga". Mätningen av botar på serversidan fortsätter.

**Q: Vilken rättslig grund gäller?**  
A: Besöksstatistik = samtycke (Art. 6.1.a GDPR / ePrivacy Art. 5.3). Botkontroller i webbläsaren = samtycke. Mätning av botar på serversidan = i vår bedömning utanför ePrivacy Art. 5.3 (LEK 9 kap. 28 §) eftersom enheten inte används, men personuppgifter enligt GDPR, normalt berättigat intresse (Art. 6.1.f). Den slutliga rättsliga bedömningen görs av dig som webbplatsägare.

**Q: Hur länge sparas data?**  
A: Enligt den retention-period du ställer in i CortIQ (standard 365 dagar). Förkortade IP-adresser på botposter rensas efter 30 dagar. Samtyckesval gäller i 12 månader.
