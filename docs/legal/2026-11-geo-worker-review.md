# Juridisk granskning: geo-Workern "cortiq-geo" (Cloudflare) före release

**Status: approved_internal** (Daniel, 2026-11-18; earlier reviewed_agent) · Granskad 18 november 2026 av jurist-agenten · Inte juridisk rådgivning i ett enskilt ärende och ersätter inte advokat.
Underlag: `workers/geo-edge/src/index.js`, `workers/geo-edge/wrangler.toml`, `supabase/functions/_shared/geo-token.js`, `_shared/geo.ts`, `supabase/functions/geo-check/index.ts`, runbook `docs/runbooks/geo-edge-worker.md` (avsnitt 5), spec `2026-11-18-jurisdiction-aware-measurement-design.md`, `DPA.md` (version 1.5), `src/pages/Privacy.tsx`, `src/content/legal.ts`, `docs/legal/TIA-2026-10-14.md`.

---

## Sammanfattning

Workern kan släppas juridiskt, men inte på kunders sajter förrän tre saker är gjorda: kunderna har fått 30 dagars förhandsbesked om Cloudflares utvidgade roll, DPA och integritetspolicy är uppdaterade, och en överföringsbedömning (TIA) för Cloudflare finns.

- **Cloudflare är redan underbiträde i DPA 1.5, men bara för en roll kunden själv slår på** ("only if the Customer enables the Cloudflare integration"). Workern gör Cloudflare till underbiträde för *all* webbläsartrafik, även före samtycke. Kundernas allmänna förhandstillstånd täcker inte den rollen. Behandla det som ett nytt underbiträde: e-post med minst 30 dagars varsel och 14 dagars invändningsrätt (DPA 3.4 och avsnitt 6, villkoren avsnitt 12, artikel 28.2 i dataskyddsförordningen (GDPR)).
- **Överföringsgrund finns.** Cloudflares Data Processing Addendum (DPA) version 6.4 har standardavtalsklausuler (SCC) modul 3 för fallet att kunden är biträde, UK Addendum för Storbritannien, och Cloudflare uppger att bolaget deltar i EU–US Data Privacy Framework (DPF). Cloudflare-DPA:n ingår i Self-Serve Subscription Agreement genom hänvisning, även för gratistjänster. Ingen separat underskrift krävs, men avtalsparten måste vara Expandtalk Corporation AB och accepten ska dokumenteras.
- **Ny TIA behövs.** Den befintliga TIA:n (14 oktober 2026) saknar Cloudflare helt, trots att Cloudflare står i DPA sedan version 1.4. Det är en lucka redan i dag.
- **Samtycke (artikel 5.3 i eDataskyddsdirektivet, 9 kap. 28 § lagen om elektronisk kommunikation (LEK)):** Workern läser ingenting nytt från besökarens enhet. Det är samma HTTP-anrop som tidigare, bara till en annan värd. Bedömningen av varje anropsväg före samtycke är därför oförändrad. Det nya är *ändamålet*: IP-adressen används nu också för geolokalisering, och land sparas på fler rader, bland annat i aggregatläget. Det är en GDPR-fråga om information och ändamål, inte en ny åtkomst.
- **Risknivå:** låg för EU/EES-delen när punkterna nedan är gjorda. Medel för USA, Storbritannien, Brasilien och Kanada (inklusive Québec), där CortIQ:s avtal i dag bara är byggt för GDPR. De delarna ska inte gå över `draft` utan extern rådgivning (se sista avsnittet).

**Blockerande före release på kundsajter:** (1) varsel 30 dagar, (2) DPA 1.6 och integritetspolicy publicerade, (3) Cloudflare-kontot är bolagets och DPA-accepten dokumenterad, (4) loggning i Workern uttryckligen avstängd och kontrollerad, (5) TIA för Cloudflare. CortIQ:s egna sajter (där Expandtalk är personuppgiftsansvarig) kan gå före varseltiden, om (2)–(5) är klara.

---

## Bedömning per fråga

### Fråga 1 – Cloudflare, Inc. som underbiträde: överföringsgrund, TIA och förhandsbesked

**Fråga.** Vilken rättslig grund har överföringen till Cloudflare, behövs ny TIA, och måste kunderna få förhandsbesked med invändningsrätt?

**Regel.**
- Artikel 28.2 GDPR: biträdet får inte anlita ett annat biträde utan särskilt eller allmänt skriftligt förhandstillstånd. Vid allmänt tillstånd ska biträdet informera om planer på att anlita nya eller ersätta biträden, så att den personuppgiftsansvarige kan invända. Artikel 28.4: samma skyldigheter ska föras vidare genom avtal. (Kontrollerat i officiell svensk text, CELEX 32016R0679, via Publikationsbyrån.)
- Kapitel V GDPR: artikel 45 (adekvansbeslut, för USA beslut (EU) 2023/1795 om DPF) och artikel 46.2 c (standardavtalsklausuler, beslut (EU) 2021/914).
- CortIQ:s DPA 1.5: 3.4 (allmänt tillstånd för listade underbiträden, besked om ändringar), avsnitt 6 sista stycket (minst 30 dagars varsel, invändning inom 14 dagar, båda parter får säga upp). Villkoren avsnitt 12 (`src/content/legal.ts`): e-post minst 30 dagar före en väsentlig ändring.
- Cloudflare DPA version 6.4 (gäller från 3 april 2026), klausul 2.3–2.4, 4.4 och 6.2: modul 2 när kunden är personuppgiftsansvarig, modul 3 när kunden är biträde, UK Addendum (version B1.0), schweizisk anpassning. Klausul 2.4: ett kundbiträde garanterar att den personuppgiftsansvarige har godkänt att Cloudflare anlitas.

**Tillämpning.**
- *Grund för överföring.* Workern körs i Cloudflares globala nät. På gratisplanen finns ingen geografisk begränsning, och Cloudflare är ett amerikanskt bolag. Räkna därför med överföring till tredjeland, även om de flesta EU-besökare hamnar i ett EU-datacenter. Primär grund: SCC modul 3 i Cloudflares DPA (CortIQ är biträde åt kunden). DPF är ett komplement. Att Cloudflare deltar i DPF (EU–US, UK-tillägget och schweiziska ramverket) står i Cloudflares DPA och i sökresultat från dataprivacyframework.gov. Själva deltagarsidan kunde inte läsas maskinellt i dag och ska kontrolleras manuellt (checklistan). DPF:s giltighet: tribunalen ogillade talan i mål T-553/23 Latombe den 3 september 2025. Överklagandet C-703/25 P är enligt andrahandskällor fortfarande anhängigt. Det är ett skäl att luta sig mot SCC i första hand, som DPA 1.5 redan gör för Supabase och Anthropic.
- *Ny TIA.* Ja. Den befintliga TIA:n täcker Supabase, Resend och Anthropic men inte Cloudflare. Workern gör saken större: fullständig IP-adress och user agent för i princip varje besök, i transit, även före samtycke. Det motverkas av att Workern inte lagrar något, att tokenen bara gäller i 60 sekunder och att uppgifterna har lågt underrättelsevärde. Förslag till TIA-text finns under Formuleringsförslag (c).
- *Förhandsbesked.* Kundernas allmänna tillstånd gäller underbiträdena "listed in Section 6", och Cloudflare-raden är uttryckligen villkorad av att kunden själv slår på integrationen. Att Cloudflare nu tar emot alla webbläsaranrop är en ny roll, som kunden inte har godkänt. Artikel 28.2 talar ordagrant om att anlita nya eller ersätta biträden. Syftet med regeln – att den ansvarige ska kunna invända mot vem som får dess uppgifter – täcker en utvidgning av den här storleken. Det är också en väsentlig ändring av DPA:n enligt villkoren avsnitt 12. Därför gäller både 30 dagars varsel och 14 dagars invändningsrätt.
- *Alternativ till att vänta 30 dagar:* Workern av som standard och en uttrycklig opt-in per sajt i dashboarden, med en text som beskriver Cloudflares roll. En sådan opt-in kan fungera som särskilt skriftligt tillstånd enligt artikel 28.2. Det kräver kod (per-sajt-flagga som styr vilken endpoint skriptet använder) och ändrar inte att DPA och integritetspolicy måste uppdateras först.

**Slutsats.** Överföringsgrund: SCC modul 3 i första hand, DPF som komplement – **låg risk**. TIA saknas – **medel, blockerande**. Förhandsbesked med 30 dagars varsel och invändningsrätt krävs – **blockerande** för kundsajter. Rekommenderad åtgärd: skicka varsel nu, släpp på kundsajter tidigast 30 dagar senare, eller bygg per-sajt-opt-in.

### Fråga 2 – Räcker gratisplanens villkor?

**Regel.** Artikel 28.3 och 28.9 GDPR: avtalet ska vara skriftligt, vilket inkluderar elektronisk form. Artikel 28.4: kraven ska föras vidare till underbiträdet.

**Tillämpning.**
- Cloudflare Self-Serve Subscription Agreement (senast uppdaterad 12 september 2025) gäller tjänster "that require a Cloudflare account" och börjar gälla när kunden klickar, använder eller öppnar tjänsterna. Avsnitt 2.6 räknar gratistjänster som en del av tjänsterna. Avsnitt 6.1: när kundinnehållet innehåller personuppgifter som omfattas av EU- eller brittisk dataskyddsrätt eller CCPA är Cloudflare biträde eller underbiträde, och Cloudflares DPA "is hereby incorporated by reference into this Agreement". DPA 6.4 nämner självbetjäningsavtalet uttryckligen som huvudavtal. **Gratisplanen har alltså ett biträdesavtal med SCC. Ingen separat underskrift krävs.**
- Tre förbehåll:
  1. **Avtalsparten.** Runbooken säger "Daniel's existing account". Biträdeskedjan håller bara om avtalsparten hos Cloudflare är Expandtalk Corporation AB, inte Daniel som privatperson. Kontrollera kontots ägare och företagsuppgifter, eller skapa ett bolagskonto. **Blockerande.**
  2. **Cloudflares egen användning.** Enligt avsnitt 2.5.5 får Cloudflare använda "Network Data" – data som härletts ur trafiken – för att tillhandahålla, utveckla och förbättra sina tjänster. Avsnitt 2.5.3 tillåter att Cloudflare lägger till cookies eller skript, till exempel vid utmaningssidor. Det gäller alla Cloudflare-kunder och är en känd restrisk mot artikel 28.3 a (bara behandling enligt instruktion). Nämn det i TIA:n. Kontrollera dessutom att svar från workers.dev inte sätter cookies (checklistan).
  3. **Loggning.** `wrangler.toml` har inget `[observability]`-block. Cloudflares dokumentation säger både att nya Workers får observability påslaget som standard och att blocket behövs för att loggar ska skrivas. Det är oklart, så stäng av uttryckligen (`[observability] enabled = false`) och kontrollera i dashboarden. Workers Logs sparas tre dagar på gratisplanen och kan innehålla förfrågningsdata.
- Om dashboarden erbjuder att underteckna DPA:n separat kostar det inget och ger bättre bevisning – gör det. Spara annars PDF-kopior av självbetjäningsavtalet och DPA 6.4 med datum, och anteckna när kontot accepterade villkoren.

**Slutsats.** Villkoren räcker i sak – **låg risk** – under förutsättning att kontot tillhör bolaget, att accepten dokumenteras och att loggningen är avstängd.

### Fråga 3 – Formuleringar

Se avsnittet Formuleringsförslag. Formuleringarna följer copyreglerna: ingenting om att samtycke, banner eller GDPR-efterlevnad skulle vara onödigt eller garanterat.

### Fråga 4 – Påverkas samtyckesfrågan (artikel 5.3 / 9 kap. 28 § LEK)?

**Regel.** 9 kap. 28 § LEK (2022:482, ändrad till och med SFS 2026:1681 enligt riksdagens öppna data): uppgifter får lagras i eller hämtas från en abonnents eller användares terminalutrustning bara efter information och samtycke. Undantag gäller för lagring eller åtkomst som behövs för överföring av ett elektroniskt meddelande, eller som är nödvändig för en tjänst som användaren uttryckligen har begärt. EDPB:s riktlinjer 2/2023 om artikel 5.3 i eDataskyddsdirektivet (version 2.0, antagen 7 oktober 2024), punkt 54–55: IP-adresser kan omfattas när skriptet instruerar webbläsaren att skicka dem och adressen kommer från användarens utrustning (statisk IPv4 från routern, IPv6). Det gäller även om mottagaren är en annan än den som instruerar. Punkt 56: att artikeln är tillämplig betyder inte automatiskt att samtycke krävs.

**Tillämpning.**
- *Ingen ny åtkomst.* Workern tar emot exakt det anrop som webbläsaren annars hade skickat direkt till Supabase: samma IP-adress, user agent och payload. Workern läser `request.cf` (Cloudflares egen geolokalisering, gjord på serversidan) och `cf-connecting-ip`. Inget av det hämtas från enheten utöver det som redan överförs. Workern sätter inga cookies och skriptet ändras bara i fråga om mål-URL. Därför ändrar Workern inte bedömningen för någon anropsväg:
  - Spårningsskriptet i Cookieless- och Full-läge: efter samtycke, som i dag.
  - Aggregatläget före samtycke: samma öppna fråga som i DPA 4.1 – kunden bedömer, CortIQ lämnar ingen försäkran.
  - Samtyckesbannern och `store-consent` / `geo-check`: anrop som behövs för att visa och spara besökarens val. Bedömningen är oförändrad.
- *Det som ändras är ändamålet, och det är en GDPR-fråga.* IP-adressen används nu för att bestämma land och, för USA och Kanada, delstat eller provins. Landet sparas på sessions-, samtyckes- och botrader och i aggregattabellerna (bara land). För aggregatläget är land en **ny datakategori** som saknas i DPA 1.5 avsnitt 2. Ändamålet – att tillämpa rätt regler och göra landsrapporter – är förenligt med analysändamålet. Det ska ändå anges i DPA och integritetspolicy (artikel 5.1 b och 13 GDPR). Kundens intresseavvägning för aggregatläget bör nämna land.
- *Spar inte mer än tidigare.* Tidszonen läses fortfarande från enheten (`Intl`-API) i `spa-tracking.js` och `consent-banner.js` som reserv. Det är inte nytt. Men när IP-landet finns behövs tidszonen inte längre för huvudändamålet. Överväg att bara skicka den när geo-tokenen saknas, eller att inte spara den. Rekommendation, inte blockerande.
- *Två praktiska risker:*
  1. **Bannerstyrning efter land.** `geo-check` avgör om besökaren är inom EES, Storbritannien eller Schweiz. Okänt land räknas som inom (bra). En EU-besökare som använder vpn med utgång i USA bedöms däremot som utanför. Om en kund döljer bannern utanför EES blir det ett avsteg från 9 kap. 28 § för den besökaren. Kundtexten bör säga att landet är en uppskattning från IP-adressen. Strängare val för okänt land och vpn hör till regelpaketen i fas 3–4.
  2. **Cookies från Cloudflare.** Avsnitt 2.5.3 i självbetjäningsavtalet tillåter Cloudflare att lägga till cookies, till exempel vid utmaningar. På workers.dev utan zon och WAF bör det inte hända. Kontrollera att inga `Set-Cookie`-huvuden kommer tillbaka; annars uppstår en ny lagring på enheten före samtycke.

**Slutsats.** Workern läser ingenting nytt från besökarens enhet. Samtyckesbedömningen per anropsväg är oförändrad – **låg risk**. Land i aggregatläget är en ny datakategori som ska in i DPA och information – **medel, blockerande via DPA 1.6**.

### Fråga 5 – Vad kräver extern advokat?

Se avsnittet Extern rådgivning. Kort sagt: EU/EES-delen klarar sig med den här granskningen och internt godkännande (`approved_internal`). USA-, Storbritannien-, Brasilien- och Kanada-delarna bygger på källor som inte är kontrollerade i dag. De ska inte styra produktionen utan extern rådgivning.

---

## Formuleringsförslag

Ny DPA-version: **1.6** (eller nästa lediga nummer om 1.6 redan är reserverad för attributionslager 1 eller cookieless fas 2 – samordna så att varslet täcker allt på en gång).

### (a) DPA

**Avsnitt 6.1, ersätt Cloudflare-raden med:**

| Sub-processor | Role | Data location | Transfer basis (Section 7) | Agreement |
|---|---|---|---|---|
| Cloudflare, Inc. (USA) | (1) Geo edge: CortIQ's own Cloudflare Worker, through which the tracking script, the aggregate script and the consent banner send their requests to CortIQ's server functions. Cloudflare receives each request in transit (IP address, user agent and request content), derives the visitor's country – and for the United States and Canada the state or province – from the IP address, and forwards the request with that result to CortIQ's server functions in the EU. CortIQ does not store data in the Worker and has not enabled request logging for it. (2) Edge web analytics and geo lookup for consent-banner gating through CortIQ's own Cloudflare access – only if the Customer enables the Cloudflare integration | Cloudflare's global edge network – normally the data centre nearest the visitor, which may be outside the EEA | SCCs, Module 3; EU-US Data Privacy Framework | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), incorporated in Cloudflare's Self-Serve Subscription Agreement |

**Avsnitt 2, kategorier – lägg till:**
- *Visitor analytics:* ersätt "geographic region" med: "country and, for visitors in the United States and Canada, state or province, derived from the IP address of the request (or, if that is unavailable, estimated from the browser's time zone); the same country is recorded with consent records".
- *Aggregate measurement:* lägg till efter "device type": "country derived from the IP address of the request (long-term: daily totals per country)".

**Avsnitt 6.1, stycket om aggregatläget – ersätt med:**
> If the Customer enables aggregate measurement, the aggregate script (inline in the snippet or bundled in the WordPress plugin) does not contact CortIQ's web host, but sends page-view requests through CortIQ's Cloudflare Worker to CortIQ's endpoint at Supabase (EU) without waiting for consent; Section 4.1 applies. If the Worker cannot be reached, the request goes directly to CortIQ's endpoint at Supabase (EU) and the country is estimated from the browser's time zone.

**Avsnitt 7, ersätt Cloudflare-punkten med:**
> **Cloudflare** — requests pass through Cloudflare's edge network, which may process them outside the EEA. For the geo edge, Cloudflare processes the IP address, user agent and request content in transit and returns the country (and US state or Canadian province); nothing is stored in the Worker. Transfers rely on the Standard Contractual Clauses, Module 3, in Cloudflare's Data Processing Addendum (Art. 46.2(c) GDPR). Cloudflare also participates in the EU-US Data Privacy Framework (Art. 45 GDPR).

**Ändringsnotis (sidfot):**
> *Changes in 1.6: Cloudflare's role as sub-processor extended to the geo edge – CortIQ's Cloudflare Worker, through which the tracking script, aggregate script and consent banner reach CortIQ, and which derives country and US/Canadian region from the IP address; country added to the data categories for visitor analytics, consent records and aggregate measurement; transfer basis for Cloudflare stated as SCCs Module 3 first.*

**Varselmejl till kunder (kort, engelska):**
> Subject: Change to CortIQ's sub-processors – effective [date, at least 30 days after sending]
>
> From [date], requests from the CortIQ tracking script, aggregate script and consent banner will pass through a Cloudflare Worker operated by CortIQ. Cloudflare, Inc. is already listed as a CortIQ sub-processor for the optional Cloudflare integration; this extends its role to all script requests. Cloudflare sees each request in transit, including the IP address, and gives CortIQ the visitor's country (and US state or Canadian province). Nothing is stored in the Worker. CortIQ uses the country to apply the privacy rules of the visitor's location and for country reports. The updated DPA (version 1.6) is here: [link]. You may object within 14 days of this notice by replying to this email (DPA, Section 6).

### (b) Integritetspolicyn (`src/pages/Privacy.tsx`)

**5B, ersätt Cloudflare-punkten med:**
> • **Cloudflare** (Cloudflare, Inc., USA) — requests from the CortIQ tracking script, aggregate script and consent banner pass through CortIQ's Cloudflare Worker on their way to our servers in the EU. Cloudflare sees each request in transit, including the IP address, and tells us the visitor's country – for the United States and Canada also the state or province. We use it to apply the privacy rules of the visitor's location and for country reports. Nothing is stored in the Worker, and we do not store the full IP address. The country is an estimate: a VPN or proxy can make it wrong. When the operator enables the Cloudflare integration, Cloudflare also processes visitor IP addresses at its edge for security and bot classification (section 3B).

**5C, ersätt Cloudflare-punkten med:**
> • **Cloudflare** — Cloudflare's global network, which may process requests outside the EU/EEA; Standard Contractual Clauses (Art. 46 GDPR) in Cloudflare's data processing addendum, and the EU–US Data Privacy Framework (Art. 45 GDPR).

**5C, sista stycket – ändra andra meningen till:**
> AI and advertising features and the Cloudflare log integration are optional and enabled by the site operator; advertising transfers additionally require the visitor's marketing consent.

**Listan över vad som mäts (rad med "Sessions, device type, browser and country") – ändra till:**
> 'Sessions, device type, browser and country (for the United States and Canada also state or province), derived from the IP address'

### (c) TIA-tillägg (`docs/legal/TIA-2026-10-14.md`, nytt avsnitt 4, eller en ny TIA-fil)

> ## 4. Cloudflare, Inc. — geo edge Worker and optional Cloudflare integration
>
> | Item | Assessment |
> |---|---|
> | Data | Geo edge: every request from the tracking script, aggregate script and consent banner, in transit – full IP address, user agent, request body and headers. The Worker derives country and US/CA region and forwards them in a signed header (valid 60 s) to Supabase (EU). No storage in the Worker; Workers Logs disabled (`[observability] enabled = false`, checked in the dashboard on [date]). Optional integration: as in DPA §6.1. |
> | Data subjects | Visitors to Customers' websites, before and after consent. |
> | Location | Cloudflare's global edge; normally the data centre nearest the visitor. No regional restriction on the free plan. |
> | Transfer tool | SCCs Module 3 in Cloudflare DPA v6.4 (incorporated in the Self-Serve Subscription Agreement of 12 Sept 2025); UK Addendum for UK data. Cloudflare also participates in the EU-US DPF (listing checked on dataprivacyframework.gov on [date]). |
> | Third-country law | US: FISA §702 and EO 12333 can reach Cloudflare as a provider of electronic communication services. EO 14086 and the Data Protection Review Court apply. |
> | Practical likelihood | Low. Transit only, no storage by CortIQ at Cloudflare; data is ordinary web-request metadata. Cloudflare DPA §8 commits to notifying the customer of third-party requests unless prohibited. Check Cloudflare's transparency report yearly. |
> | Residual risk | Cloudflare may use "Network Data" derived from traffic to provide and improve its services (Self-Serve Subscription Agreement §2.5.5), and may add cookies in security challenges (§2.5.3). Responses from the Worker are checked for `Set-Cookie`. |
> | Supplementary measures | TLS end to end; no Worker storage or logging; signed, short-lived token; raw IP never stored by CortIQ; fallback to direct EU path if the Worker fails. |
> | Conclusion | Transfer may proceed under SCCs, with DPF as an additional basis. Re-assess yearly, on a change of Cloudflare DPA version, or on a CJEU ruling in C-703/25 P. |

---

## Krävs före release (checklista)

Blockerande för kundsajter (runbook avsnitt 3 steg 4):

- [ ] **Avtalspart:** Cloudflare-kontot `965167b0…` tillhör Expandtalk Corporation AB (företagsnamn och faktureringsuppgifter), inte Daniel privat. Annars: bolagskonto.
- [ ] **Avtal dokumenterat:** PDF-kopior av Self-Serve Subscription Agreement (12 september 2025) och Cloudflare DPA 6.4 sparade med datum. Om dashboarden erbjuder separat signering av DPA:n: gör det.
- [ ] **DPF-status** kontrollerad manuellt på dataprivacyframework.gov (deltagare 5666), datum antecknat i TIA:n.
- [ ] **Loggning av:** `[observability] enabled = false` i `wrangler.toml`, kontrollerat i Cloudflare-dashboarden (Workers → cortiq-geo → Settings/Observability). Ingen Logpush, ingen `wrangler tail` i drift.
- [ ] **Inga cookies:** `curl -si https://<ENDPOINT>/geo-check` och ett POST-anrop till `track-event` via Workern ger inget `Set-Cookie`.
- [ ] **TIA för Cloudflare** tillagd (förslag (c)), status draft → godkänd internt.
- [ ] **DPA 1.6** med texterna i (a), inklusive land i aggregatkategorierna.
- [ ] **Integritetspolicyn** uppdaterad enligt (b) och publicerad (build och FTP).
- [ ] **Varsel** skickat per e-post till alla kontoinnehavare minst 30 dagar före ikraftträdande, med 14 dagars invändningsrätt. Datum antecknat i runbook avsnitt 5. Eller: Workern bakom en uttrycklig opt-in per sajt.
- [ ] **Godkännande:** Daniel godkänner → `approved_internal`, datum och DPA-version i runbook avsnitt 5.3.

Rekommenderat, inte blockerande:

- [ ] Skicka tidszonen bara när geo-token saknas, eller sluta spara den när IP-landet finns (dataminimering).
- [ ] Kundtext vid bannerstyrning efter land: landet är en uppskattning från IP-adressen, vpn kan ge fel land.
- [ ] Mall för kundens intresseavvägning i aggregatläget: lägg till land som datakategori.
- [ ] Kontrollera att `GEO_SIGNING_KEY` bara finns som secret i Supabase och Cloudflare och att rotationen i runbook avsnitt 2 följs.
- [ ] Rätta en befintlig lucka oberoende av Workern: TIA:n har saknat Cloudflare sedan DPA 1.4.

---

## Extern rådgivning

Den här granskningen bygger på EU-rätt och svensk rätt. Följande ska till advokat i respektive land innan någon regel för landet lämnar `draft` – i linje med specens modell (`reviewed_counsel`):

| Område | Fråga | Varför extern | Prioritet |
|---|---|---|---|
| **USA (Kalifornien m.fl.)** | Behöver CortIQ:s DPA kontraktsvillkor för tjänsteleverantör enligt CCPA/CPRA-förordningarna för amerikanska kunder? Räknas land/delstat från IP som "precise geolocation" (känslig uppgift)? Gäller andra delstaters lagar om universella opt-out-signaler? | CortIQ:s DPA är bara byggd för GDPR. Delstatsrätten är inte kontrollerad mot primärkälla här. Cloudflares DPA 3.3 lovar bara att inte "sell"/"share". | Hög när första amerikanska kund finns |
| **Storbritannien** | Räcker CortIQ:s GDPR-baserade DPA för brittiska kunder (UK GDPR, Data (Use and Access) Act 2025)? Behövs UK Addendum eller UK-tillägget till DPF i kedjan CortIQ → Cloudflare? | Cloudflares DPA har UK Addendum mot CortIQ, men CortIQ:s eget avtal med brittiska kunder saknar brittisk överföringsmekanism. Inte kontrollerat. | Medel |
| **Kanada / Québec** | Är IP-baserad provinsbestämning en funktion som "lokaliserar" en person enligt Québecs lag om skydd av personuppgifter i privat sektor (Law 25, bland annat avsnitt 8.1 om teknik som identifierar, lokaliserar eller profilerar)? Krävs konsekvensbedömning före överföring utanför Québec (avsnitt 17)? PIPEDA: implicit eller uttryckligt samtycke? | Legisquebec gick inte att läsa i dag (HTTP 403). Lagtexten är **inte kontrollerad**. Provinsnivå ligger nära gränsen. | Hög för Québec-regeln |
| **Brasilien** | Överföring från brasiliansk personuppgiftsansvarig till Cloudflare USA: krävs ANPD:s standardklausuler (Resolução CD/ANPD nº 19, 23 augusti 2024, med tolv månaders övergångstid från publiceringen) i CortIQ:s avtal och i kedjan till Cloudflare? Cloudflares DPA nämner inte LGPD. | Hänvisningen till resolutionen bygger på sökträffar från gov.br, inte på läst lagtext. Cloudflares DPA har bara ett avsnitt om Global CBPR. | Medel–hög när första brasilianska kund finns |
| **EU – DPF** | Om EU-domstolen ogiltigförklarar DPF i C-703/25 P: räcker SCC plus TIA för Cloudflare? | Domen kan ändra läget snabbt. CortIQ har redan SCC som primär grund, så risken är begränsad. | Bevaka |

Extern advokat behövs också om en kund invänder mot underbiträdet och kräver avtalsändring, eller vid tillsynsärende eller tvist.

---

## Källor

**Kontrollerade mot primärkälla i dag (18 november 2026):**
- GDPR artikel 28.2, officiell svensk text, CELEX 32016R0679 (Publikationsbyrån/Cellar).
- Lag (2022:482) om elektronisk kommunikation, 9 kap. 28 §, konsoliderad till och med SFS 2026:1681 (data.riksdagen.se, sfs-2022-482).
- EDPB Guidelines 2/2023 on Technical Scope of Art. 5(3) ePrivacy Directive, version 2.0 (antagen 7 oktober 2024), punkt 54–56 (edpb.europa.eu, PDF).
- Cloudflare Data Processing Addendum, version 6.4, gäller från 3 april 2026 – klausul 2.3–2.4, 3.3, 4.4, 6.2 a–c, 8.1, bilaga 1 (cloudflare.com/cloudflare-customer-dpa).
- Cloudflare Self-Serve Subscription Agreement, senast uppdaterad 12 september 2025 – inledning, avsnitt 1, 2.5.3, 2.5.5, 2.6 och 6.1 (cloudflare.com/terms).
- Cloudflare-dokumentation om Workers Logs (developers.cloudflare.com) – standardläge oklart, tre dagars lagring på gratisplanen.
- CortIQ:s DPA 1.5, villkor avsnitt 12, Privacy.tsx 5B/5C, TIA 14 oktober 2026 och koden i Workern och de delade modulerna (läst i repot).

**Inte kontrollerade mot primärkälla – får inte användas i publicerad text utan kontroll:**
- Cloudflares DPF-status (deltagare 5666, nästa certifiering 15 september 2027): bara via sökträff och Cloudflares egen DPA. Sidan på dataprivacyframework.gov renderas med JavaScript och kunde inte läsas.
- Status för C-703/25 P (Latombe): bara andrahandskällor. Curia kunde inte läsas.
- Québec Law 25 avsnitt 8.1 och 17, CCPA 1798.140 ("precise geolocation", "service provider"): HTTP 403 från legisquebec och leginfo.
- ANPD Resolução nº 19/2024: bara sökträffar från gov.br.
