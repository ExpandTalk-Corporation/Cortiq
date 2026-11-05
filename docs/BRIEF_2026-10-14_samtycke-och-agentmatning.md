# Brief: samtycke och agentmätning i Cortiq (2026-10-14)

Skriven från SentriSK-sessionen när Cortiq skulle installeras på sentrisk.se. Underlag: juristgranskning
2026-10-14 (LEK 2022:482 9 kap. 28 §, EDPB riktlinjer 2/2023 v2.0, PTS dnr 22-11377) och en genomläsning
av `public/spa-tracking.js` v5.4.3.

## Juristens slutsats

1. **Säkerhets-/botlagret kräver samtycke.** `startSecurityLayer()` körs före samtycke (rad ~1191) och
   läser `hardwareConcurrency` och skärmstorlek, laddar en canary-pixel, lägger in en honeypot-länk,
   skriver `sessionStorage._ciq_adp` och skickar en beacon med en hash av UA/hårdvara/skärm. Allt detta är
   lagring i eller åtkomst till terminalutrustning (EDPB 2/2023 p. 33, 43, 50–51). Inget undantag passar:
   ingen besökare har begärt att bli mätt som bot, och åtkomsten sker på alla besökare innan
   bot-bedömningen. Att data bara skickas för bottar ändrar inte det. Kommentaren "subject to the
   operator's own legal assessment" lägger risken på kunden, och det gäller varje Cortiq-kund.
2. **Bot-/agentmätning utan samtycke ska göras på serversidan**: User-Agent i HTTP-förfrågan, IP,
   referrer, sökväg, `robots.txt`-träffar och en honeypot-URL som bara finns i HTML. Det är passivt mottagna
   uppgifter och faller i regel utanför 9:28. Bygg ingen per-besökare-hash av header-fält (EDPB p. 43).
   Serverloggarna är personuppgifter: berättigat intresse, kort lagringstid, redovisas i policyn.
3. **IP-matchning mot företag** (cortiq-sync i SentriSK läser `visit.ip_address`) är profilering för
   marknadsföring. Grunda den på samtycke och nämn ändamålet i bannern. Spara inte IP rått: trunkera eller
   hasha efter matchningen, kort lagringstid.
4. **Bannern**: neka och godkänn i samma vy och lika framträdande, ingen förkryssning, återkallelse lika
   lätt som samtycke (permanent länk i sidfoten). Förnya samtycket var 12:e månad (förslag, inte lagkrav).

## Produktpoängen

De flesta AI-crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) kör inte JavaScript. Ett botlager
i webbläsaren missar därför merparten av det Cortiq säger sig mäta. Serversidig mätning är både laglig utan
samtycke och mer träffsäker. Det är kärnan i "GA4 för agent-webben".

## Att göra, i ordning

1. **Hela skriptet väntar på samtycke som standard**, även botlagret (`initialize()` → flytta
   `startSecurityLayer()` bakom analyssamtycket).
2. **Serversidig agentmätning** som huvudväg för AI-agenter: edge-funktion/proxy eller WordPress-hook som
   loggar UA-header, robots.txt-träffar och honeypot-URL utan att läsa terminalutrustning.
3. **IP**: trunkera eller hasha efter företagsmatchning; sätt lagringstid.
4. **Installationsguiden**: `INTEGRATION-GUIDE.md` rad 26–27 och 77–78 (och README) visar
   `data-site-id`/`data-api-key`, men trackern läser bara `window.cortiqConfig` (spa-tracking.js rad 23).
   En kund som följer guiden mäter ingenting. Officiell snippet finns i
   `src/components/dashboard/OnboardingWizard.tsx:78-89`.
5. **`console.log` i produktion**: spa-tracking.js rad 261 (besöksprofil) och 353.
6. **Verifiera att raderingsjobbet körs i prod**: `cleanup_old_tracking_data()` (365 dagar som standard)
   och cron `gdpr-data-cleanup`. SentriSK:s integritetspolicy säger nu 12 månader för Cortiq-data.
7. **Personuppgiftsbiträdesavtal och underbiträdeslista** för Cortiqs kunder: Cortiq behandlar deras
   besöksdata.

## Så installeras Cortiq på sentrisk.se (redan byggt i SentriSK, ej deployat)

- `src/lib/consent.ts`: samtycke i Cortiqs format (`site_cookie_consent` = `{analytics, marketing:false,
  expiresAt}`), 12 månader, `siteConsentUpdated` vid varje val.
- `src/lib/cortiq.ts`: laddar `https://cortiq.se/spa-tracking.js` FÖRST efter analyssamtycke, med
  `cookieless: true`, `excludePaths: '/embed/'`, `excludeIframes: true`. Kräver `VITE_CORTIQ_SITE_ID` och
  `VITE_CORTIQ_API_KEY` i bygget; utan dem visas ingen banner.
- En Cortiq-sajt för sentrisk.se behöver skapas.
